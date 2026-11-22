<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import backSvg from "../lib/wheel-back.svg?raw";
  import discSvg from "../lib/wheel-disc.svg?raw";
  import frontSvg from "../lib/wheel-front.svg?raw";
  import * as audio from "../lib/wheel-audio";
  import { playSfx } from "../lib/sfx";
  import { wheel, loadWheel, loadBoards, loadCatalog, doSpin, dismissReveal, SPIN_MS } from "../lib/wheel.svelte";
  import Terminated from "./Terminated.svelte";

  const CHASE_DUR = 2.2;
  const STEP = 360 / 32;
  // MUST match src/wheel.ts WHEEL_SLOTS (and the generated wheel-disc.svg).
  const SLOTS = [
    "mystery", "common", "blank", "common", "rare", "blank", "common", "blank",
    "legendary", "common", "blank", "common", "rare", "blank", "common", "blank",
    "death", "common", "blank", "common", "rare", "blank", "common", "blank",
    "talisman", "common", "blank", "common", "rare", "blank", "common", "blank",
  ];
  const TIER_COLOR: Record<string, string> = {
    common: "#7cae5f", rare: "#9d63d2", legendary: "#f39620", mythic: "#ff5db1", talisman: "#42c1c4",
  };
  const GALLERY_TIERS = ["talisman", "mythic", "legendary", "rare", "common"];
  const BOARD_TIERS = ["mythic", "legendary", "rare", "common"];
  const TALISMAN_IMG = "/emoji/special/talisman.png";

  let soundOn = $state(true);
  let now = $state(Date.now());
  let timer: ReturnType<typeof setInterval>;
  let blankTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    loadWheel();
    loadCatalog();
    loadBoards();
    timer = setInterval(() => (now = Date.now()), 1000);
  });
  onDestroy(() => {
    clearInterval(timer);
    clearTimeout(blankTimer);
  });

  function toggleSound() {
    soundOn = !soundOn;
    audio.setEnabled(soundOn);
    if (soundOn) audio.ensureAudio();
  }
  function spinClick() {
    if (wheel.spinning || wheel.dead || wheel.spins.total <= 0) return;
    if (soundOn) audio.ensureAudio(); // unlock on the gesture — playback waits
    doSpin();
  }

  // The ratchet starts when the DISC starts (rotation lands with the server
  // response), not at the click — otherwise the audio leads the picture by a
  // network round-trip and every clack is early.
  let heardRotation = wheel.rotation;
  $effect(() => {
    if (wheel.rotation !== heardRotation) {
      heardRotation = wheel.rotation;
      if (soundOn && wheel.spinning) audio.playSpin(SPIN_MS);
    }
  });

  function fmtCountdown(ms: number): string {
    if (ms <= 0) return "0:00:00";
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  const resetIn = $derived(fmtCountdown(wheel.nextReset - now));

  function pt(r: number, deg: number): [number, number] {
    const a = ((deg - 90) * Math.PI) / 180;
    return [350 + r * Math.cos(a), 350 + r * Math.sin(a)];
  }

  // Marquee bulbs in travel order.
  function buildBulbs() {
    const b: { x: number; y: number }[] = [];
    const nTop = 11, nSide = 3, x0 = 4, x1 = 96, y0 = 14, y1 = 86;
    for (let i = 0; i <= nTop; i++) b.push({ x: x0 + ((x1 - x0) * i) / nTop, y: y0 });
    for (let i = 1; i <= nSide; i++) b.push({ x: x1, y: y0 + ((y1 - y0) * i) / (nSide + 1) });
    for (let i = nTop; i >= 0; i--) b.push({ x: x0 + ((x1 - x0) * i) / nTop, y: y1 });
    for (let i = nSide; i >= 1; i--) b.push({ x: x0, y: y0 + ((y1 - y0) * i) / (nSide + 1) });
    return b;
  }
  const bulbs = buildBulbs();

  // A representative prize per segment, drawn onto the wheel.
  type Prize = { left: number; top: number; rot: number; href?: string; text?: string };
  const prizes = $derived.by((): (Prize | null)[] => {
    const cat = wheel.catalog;
    const ctr: Record<string, number> = { common: 0, rare: 0, legendary: 0 };
    return SLOTS.map((tier, i): Prize | null => {
      const ang = (i + 0.5) * STEP;
      const [x, y] = pt(300 * 0.72, ang); // 32 slots — roomier than the old 52 ring
      const base: Prize = { left: (x / 700) * 100, top: (y / 700) * 100, rot: ang };
      if (tier === "blank") return null;
      if (tier === "death") return { ...base, text: "💀" };
      if (tier === "mystery") return { ...base, text: "🎁" };
      if (tier === "talisman") return { ...base, href: TALISMAN_IMG };
      const list = cat[tier] ?? [];
      if (!list.length) return null;
      // Advance the representative counter unconditionally so overriding the
      // landed slot doesn't reshuffle every other slot's sample.
      const repFile = list[ctr[tier]++ % list.length].file;
      const file = wheel.awarded?.slot === i ? wheel.awarded.file : repFile;
      return { ...base, href: `/emoji/${file}` };
    });
  });

  const owned = $derived(new Set(wheel.inventory.map((e) => e.code)));
  const r = $derived(wheel.reveal);

  let playedReveal: unknown = null;
  $effect(() => {
    const rv = wheel.reveal;
    if (rv && rv !== playedReveal) {
      playedReveal = rv;
      if (rv.type === "blank") {
        // Blanks use the small non-blocking popup (not the full-screen modal), so
        // auto-dismiss it and play the sad trombone. SPIN stays live underneath.
        // A reaper-blink blank gets the whoosh-and-heartbeat instead — you
        // almost died; the trombone would undersell it.
        if (soundOn) {
          if (rv.reaperMissed) playSfx("wheel-reaper", 0.9, audio.playWomp);
          else audio.playWomp();
        }
        clearTimeout(blankTimer);
        blankTimer = setTimeout(() => { if (wheel.reveal === rv) dismissReveal(); }, 2600);
      } else if (soundOn) {
        if (rv.type === "mystery_spins") {
          playSfx("mystery-open", 0.8, () => audio.playWin("mythic"));
        } else if (rv.type === "emoji") audio.playWin(rv.tier ?? "common");
        else if (rv.type === "talisman" || rv.type === "death_survived") audio.playWin("talisman");
      }
    }
  });

  // Death routes to the Terminated cinematic (not the reveal modal), so ring its
  // toll the moment the wheel marks us dead.
  let deathPlayed = false;
  $effect(() => {
    if (wheel.dead && !deathPlayed) {
      deathPlayed = true;
      if (soundOn) audio.playDeath();
    }
  });

  function ago(t: number): string {
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }
  const ownedIn = (tier: string) => (wheel.catalog[tier] ?? []).filter((e) => owned.has(e.code)).length;
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && r && dismissReveal()} />

<div class="wof-layout">
  <div class="wof-main">
    <div class="marquee">
      <div class="mq-text"><span class="mq-l1">WHEEL OF</span><span class="mq-l2">FORTUNE</span></div>
      <span class="mq-star mq-star-l">★</span>
      <span class="mq-star mq-star-r">★</span>
      {#each bulbs as b, i}
        <span class="mq-bulb" style="left:{b.x}%; top:{b.y}%; animation-delay:{((i / bulbs.length) * CHASE_DUR).toFixed(3)}s"></span>
      {/each}
    </div>

    <div class="wheel">
      <div class="layer">{@html backSvg}</div>
      <div class="layer disc" style="transform: rotate({wheel.rotation}deg); transition-duration: {SPIN_MS}ms">
        {@html discSvg}
        <div class="prizes">
          {#each prizes as p}
            {#if p}
              <div class="prize" style="left:{p.left}%; top:{p.top}%; transform: translate(-50%,-50%) rotate({p.rot}deg)">
                {#if p.href}<img src={p.href} alt="" />{:else}<span class="prize-ico">{p.text}</span>{/if}
              </div>
            {/if}
          {/each}
        </div>
      </div>
      <div class="layer">{@html frontSvg}</div>
    </div>

    <div class="controls">
      {#if r && r.type === "blank"}
        <div class="blank-pop" class:grim={r.reaperMissed} role="status">
          {r.reaperMissed
            ? wheel.reaper.retired
              ? "💀 the reaper is retired. It only looks now."
              : wheel.hasTalisman
              ? "💀 the reaper looked at you… your talisman stared back."
              : wheel.reaper.graceLeft > 0
                ? "💀 the reaper looked at you… and blinked."
                : "💀 the reaper looked at you… and it is not blinking much longer."
            : r.bonusGranted ? "No prize — bonus spin! 🎉" : "No luck — spin again!"}
        </div>
      {/if}
      <button class="spin" onclick={spinClick} disabled={wheel.spinning || wheel.dead || wheel.spins.total <= 0}>
        {#if wheel.spinning}Spinning…{:else if wheel.dead}Dead{:else if wheel.spins.total <= 0}No spins{:else}SPIN{/if}
      </button>
      <div class="meta">
        <span class="spins">{wheel.spins.total} spin{wheel.spins.total === 1 ? "" : "s"}</span>
        <span class="owned">{wheel.owned} collected</span>
        {#if wheel.hasTalisman}<span class="tali"><img class="mini-tali" src={TALISMAN_IMG} alt="" /> talisman</span>{/if}
        <!-- THE REAPER'S PATIENCE. Unshielded, the wedge gets hungrier with
             every spin you take, and the whole point of the rework is that
             you can SEE it before it lands — so this is rules on the screen,
             not flavour. Hidden for the shielded and for the house. -->
        {#if wheel.reaper.retired}
          <span class="reaper" title="Somebody opened Pandora's Box and retired the reaper. The death wedge stays on the wheel as a memorial; it takes nobody now.">
            <span class="skull">💀</span><span class="rtext">the reaper is retired</span>
          </span>
        {:else if !wheel.hasTalisman && !wheel.reaper.immune}
          <span
            class="reaper"
            class:hungry={wheel.reaper.graceLeft === 0}
            title={wheel.reaper.graceLeft > 0
              ? `You're unshielded. The reaper is bored for another ${wheel.reaper.graceLeft} spins, then it starts paying attention. A talisman resets it.`
              : `You're unshielded and out of grace — the death wedge would take you ${Math.round(wheel.reaper.rate * 100)}% of the time. Find a talisman, or buy one at Sterling's.`}
          >
            <span class="skull">💀</span>
            {#if wheel.reaper.graceLeft > 0}
              <span class="rtext">{wheel.reaper.graceLeft} spins of grace</span>
            {:else}
              <span class="rtext">the reaper is watching — {Math.round(wheel.reaper.rate * 100)}%</span>
            {/if}
            <span class="rbar"><span
              class="rfill"
              style="width:{wheel.reaper.graceLeft > 0
                ? Math.round(((wheel.reaper.grace - wheel.reaper.graceLeft) / wheel.reaper.grace) * 100)
                : 100}%"
            ></span></span>
          </span>
        {/if}
      </div>
      <div class="subrow">
        <span class="reset">🕑 next spins in <b>{resetIn}</b></span>
        <button class="sound-btn" onclick={toggleSound} title={soundOn ? "Mute" : "Enable sound"}>{soundOn ? "🔊" : "🔇"}</button>
      </div>
      {#if wheel.error === "no_spins"}<p class="err">Out of spins — refills every 2 hours (aligned to 00:00 UTC).</p>{/if}
    </div>

    {#if r && r.type !== "blank"}
      <div class="reveal-scrim" onclick={(e) => { if (e.target === e.currentTarget) dismissReveal(); }} role="presentation">
        <div class="reveal" role="dialog" aria-modal="true">
          {#if r.type === "emoji" && r.emoji}
            <div class="tier-tag" style="color:{TIER_COLOR[r.tier ?? 'common']}">
              {r.mystery ? "🎁 the mystery box held a" : r.nearMiss ? "so close — the legendary slot spat out a" : r.downgraded ? "already maxed — got a" : "you won a"} {r.tier}
            </div>
            <img class="won" src={`/emoji/${r.emoji.file}`} alt={r.emoji.name} />
            <div class="won-name">{r.emoji.name}</div>
          {:else if r.type === "mystery_spins"}
            <div class="tier-tag" style="color:#ffd98f">🎁 mystery bonus</div>
            <div class="big-emoji">🎁</div>
            <div class="won-name">The box held <b>{r.spins} bonus spin{r.spins === 1 ? "" : "s"}</b> — already in your pocket.</div>
          {:else if r.type === "talisman"}
            <div class="tier-tag" style="color:{TIER_COLOR.talisman}">{r.mystery ? "🎁 mystery — " : ""}talisman</div>
            <img class="won" src={TALISMAN_IMG} alt="talisman" />
            <div class="won-name">{r.alreadyHad ? "already shielded — bonus spin!" : "a death-shield! it protects you once."}</div>
          {:else if r.type === "death_survived"}
            {#if r.immune}
              <div class="tier-tag" style="color:{TIER_COLOR.talisman}">the house doesn't die</div>
              <div class="big-emoji">🛡️</div>
              <div class="won-name">Death landed — but admins are immune. You walk away untouched.</div>
            {:else}
              <img class="won" src={TALISMAN_IMG} alt="talisman" />
              <div class="won-name">Death came — your talisman shattered and saved you.</div>
            {/if}
          {/if}
          <button class="close" onclick={dismissReveal}>Continue</button>
        </div>
      </div>
    {/if}

    {#if wheel.dead}
      <Terminated />
    {/if}

    <!-- Unlockables gallery -->
    <div class="gallery">
      <h3>Unlockables</h3>
      {#if Object.keys(wheel.catalog).length === 0}
        <p class="dim">Loading…</p>
      {:else}
        {#each GALLERY_TIERS as tier}
          {#if wheel.catalog[tier]?.length}
            <div class="tier-block">
              <div class="tier-head" style="color:{TIER_COLOR[tier]}">
                {tier} <span class="frac">{ownedIn(tier)} / {wheel.catalog[tier].length}</span>
              </div>
              <div class="grid">
                {#each wheel.catalog[tier] as e (e.code)}
                  {#if owned.has(e.code)}
                    <img class="cell have" style="border-color:{TIER_COLOR[tier]}66" src={`/emoji/${e.file}`} loading="lazy" alt={e.name} title={e.name} />
                  {:else}
                    <div class="cell locked" title="locked">?</div>
                  {/if}
                {/each}
              </div>
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  </div>

  <aside class="wof-side">
    <div class="card">
      <div class="card-head"><span class="live-dot"></span> Live</div>
      {#if wheel.feed.length === 0}
        <p class="dim sm">Quiet for now. Big wins and deaths show up here.</p>
      {:else}
        <ul class="feed">
          {#each wheel.feed as f (f.id)}
            <li class="feed-row">
              {#if f.kind === "win" && f.emoji}
                <img class="feed-emoji" src={`/emoji/${f.emoji.file}`} alt="" />
                <span class="feed-text"><b>{f.user.displayName}</b> won a <span style="color:{TIER_COLOR[f.tier ?? 'common']}">{f.tier}</span></span>
              {:else if f.kind === "talisman"}
                <img class="feed-emoji" src={TALISMAN_IMG} alt="" /><span class="feed-text"><b>{f.user.displayName}</b> found a talisman</span>
              {:else if f.kind === "death"}
                <span class="feed-ico">💀</span><span class="feed-text died"><b>{f.user.displayName}</b> has died</span>
              {:else if f.kind === "survived"}
                <img class="feed-emoji" src={TALISMAN_IMG} alt="" /><span class="feed-text"><b>{f.user.displayName}</b> cheated death</span>
              {/if}
              <span class="feed-ago">{ago(f.at)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="card">
      <div class="card-head">🏆 Top Collectors</div>
      {#each BOARD_TIERS as tier}
        <div class="tierboard">
          <div class="tb-head" style="color:{TIER_COLOR[tier]}">{tier}</div>
          {#if wheel.tierLeaders[tier]?.length}
            <ol class="tb-list">
              {#each wheel.tierLeaders[tier] as u, i (u.id)}
                <li>
                  <span class="rank">{i + 1}</span>
                  <span class="who">{u.displayName}{#if u.diedAt}<span class="dagger"> †</span>{/if}</span>
                  <span class="n" style="color:{TIER_COLOR[tier]}">{u.count}</span>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="dim sm none">— none yet —</p>
          {/if}
        </div>
      {/each}
    </div>

    <div class="card">
      <div class="card-head">💀 Graveyard</div>
      {#if wheel.deaths.length === 0}
        <p class="dim sm">No one has fallen… yet.</p>
      {:else}
        <ul class="grave">
          {#each wheel.deaths as d (d.id)}
            <li class="grave-row"><span class="stone">🪦</span> <b>{d.displayName}</b> <span class="feed-ago">{ago(d.diedAt)} ago</span></li>
          {/each}
        </ul>
      {/if}
    </div>
  </aside>
</div>

<style>
  /* The casino felt lives on the scroll container itself so it always fills the
     visible area at ANY scroll position (an absolutely-positioned backdrop only
     covers the first viewport and cuts off as you scroll the tall gallery). */
  .wof-layout {
    position: relative;
    height: 100%;
    overflow-y: auto;
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 20px;
    padding: 20px 16px 48px;
    background:
      radial-gradient(ellipse 105% 88% at 50% 40%, transparent 56%, rgba(0, 0, 0, 0.6) 100%),
      radial-gradient(ellipse 55% 42% at 50% 22%, rgba(230, 165, 85, 0.14), transparent 68%),
      repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.016) 0 1px, transparent 1px 20px),
      repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.016) 0 1px, transparent 1px 20px),
      radial-gradient(ellipse at 50% 30%, #12402f, #0b271d 55%, #05130d);
  }
  .wof-main,
  .wof-side { position: relative; z-index: 1; }
  .wof-main { display: flex; flex-direction: column; align-items: center; gap: 18px; min-width: 0; }

  /* ---- Marquee ---- */
  .marquee {
    position: relative;
    width: min(560px, 92%);
    aspect-ratio: 3.2 / 1;
    margin-top: 6px;
    border-radius: 18px;
    padding: 6px;
    background: linear-gradient(150deg, #f8e6ba, #b48747 45%, #63472a 70%, #dcb676);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 240, 200, 0.5);
  }
  .marquee::before {
    content: "";
    position: absolute;
    inset: 6px;
    border-radius: 13px;
    background: radial-gradient(ellipse at 50% 40%, #3c150e, #230f09 55%, #130705);
    box-shadow: inset 0 0 0 1.5px rgba(220, 182, 118, 0.4);
  }
  .mq-text {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    line-height: 0.98;
    z-index: 2;
    text-shadow: 0 2px 3px rgba(0, 0, 0, 0.6);
  }
  .mq-l1, .mq-l2 {
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 700;
    letter-spacing: 0.04em;
    background: linear-gradient(#fff0c4, #eab348 45%, #c8862c 75%, #9a641c);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .mq-l1 { font-size: clamp(20px, 5vw, 34px); }
  .mq-l2 { font-size: clamp(24px, 6vw, 42px); }
  .mq-star { position: absolute; top: 50%; transform: translateY(-50%); z-index: 2; font-size: clamp(14px, 3.4vw, 24px); color: #eab348; text-shadow: 0 0 6px rgba(234, 179, 72, 0.6); }
  .mq-star-l { left: 8%; }
  .mq-star-r { right: 8%; }
  .mq-bulb {
    position: absolute;
    width: clamp(7px, 1.6vw, 11px);
    height: clamp(7px, 1.6vw, 11px);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    background: radial-gradient(circle at 38% 32%, #fffdf2, #ffe0a0 45%, #8a5820);
    z-index: 3;
    animation: bulbchase 2.2s linear infinite;
  }
  @keyframes bulbchase {
    0%, 100% { opacity: 0.5; box-shadow: 0 0 3px rgba(255, 207, 138, 0.6); }
    7% { opacity: 1; box-shadow: 0 0 11px 3px rgba(255, 224, 160, 0.9); }
  }

  /* ---- Wheel ---- */
  .wheel { position: relative; width: min(500px, 100%); aspect-ratio: 1; filter: drop-shadow(0 12px 30px rgba(0, 0, 0, 0.55)); }
  .layer { position: absolute; inset: 0; }
  .disc {
    /* Duration is set inline from SPIN_MS (single source of truth); only the
       property + easing live here. */
    transition-property: transform;
    transition-timing-function: cubic-bezier(0.16, 0.62, 0.1, 1);
    transform-origin: 50% 50%;
    will-change: transform;
  }
  .prizes { position: absolute; inset: 0; pointer-events: none; }
  .prize { position: absolute; width: 4.2%; display: grid; place-items: center; }
  .prize img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5)); }
  .prize-ico { font-size: clamp(10px, 2.3vw, 16px); line-height: 1; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6)); }
  :global(.disc .leg-glow) { animation: legpulse 1.7s ease-in-out infinite; }
  :global(.disc .myst-glow) { animation: legpulse 2.3s ease-in-out infinite; }
  @keyframes legpulse {
    0%, 100% { opacity: 0.32; }
    50% { opacity: 0.72; }
  }

  /* ---- Controls ---- */
  .controls { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  /* Non-blocking "no luck" popup, centred above the SPIN button. Because it is
     NOT a full-screen scrim, the button stays clickable immediately. */
  .blank-pop {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    padding: 8px 16px;
    background: #17130f;
    border: 1px solid #4a3a24;
    border-radius: 999px;
    color: #ece4d8;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    z-index: 6;
    animation: blankpop 0.24s cubic-bezier(0.2, 1.2, 0.4, 1);
  }
  .blank-pop::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: #17130f;
  }
  @keyframes blankpop { from { opacity: 0; transform: translate(-50%, 7px); } }
  /* The reaper-blink near-miss: same non-blocking popup, but it looks the part. */
  .blank-pop.grim {
    background: #16090b;
    border-color: #7a2a22;
    color: #e8b4ac;
    box-shadow: 0 4px 24px rgba(122, 20, 12, 0.55);
  }
  .blank-pop.grim::after { border-top-color: #16090b; }
  .spin {
    font-family: Georgia, serif;
    font-weight: 700;
    letter-spacing: 0.08em;
    font-size: 20px;
    color: #3a1f06;
    padding: 12px 44px;
    border: none;
    border-radius: 999px;
    cursor: pointer;
    background: linear-gradient(#ffe6a8, #eab348 45%, #c8862c);
    box-shadow: 0 4px 14px rgba(210, 130, 40, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.6), inset 0 -2px 4px rgba(120, 70, 20, 0.4);
    transition: transform 0.08s ease, box-shadow 0.14s ease, filter 0.14s ease;
  }
  .spin:not(:disabled):hover {
    filter: brightness(1.06);
    box-shadow: 0 6px 22px rgba(233, 170, 60, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.7), inset 0 -2px 4px rgba(120, 70, 20, 0.4);
  }
  .spin:focus-visible { outline: 3px solid rgba(255, 233, 170, 0.85); outline-offset: 3px; }
  .spin:not(:disabled):active { transform: translateY(2px); }
  .spin:disabled { opacity: 0.5; cursor: default; filter: grayscale(0.3); }
  /* wraps because the reaper gauge can be the longest thing in the row */
  .meta { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 14px; font-size: 13px; color: #c9d3c9; }
  .meta .spins { color: #ffd98f; font-weight: 600; }
  .tali { color: #6fe0e3; display: inline-flex; align-items: center; gap: 3px; }
  .reaper {
    display: inline-flex; align-items: center; gap: 5px;
    color: #9aa3b2; font-variant-numeric: tabular-nums;
  }
  .reaper .skull { filter: grayscale(1) opacity(0.75); }
  .reaper .rbar {
    width: 46px; height: 4px; border-radius: 2px;
    background: rgba(255, 255, 255, 0.12); overflow: hidden;
  }
  .reaper .rfill { display: block; height: 100%; background: #6b7686; transition: width 0.3s ease; }
  .reaper.hungry { color: #e0766a; }
  .reaper.hungry .skull { filter: none; animation: reaperpulse 1.9s ease-in-out infinite; }
  .reaper.hungry .rfill { background: #d1483a; }
  @keyframes reaperpulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    .reaper.hungry .skull { animation: none; opacity: 1; }
  }
  .mini-tali { width: 15px; height: 15px; object-fit: contain; }
  .err { font-size: 12.5px; color: #9fb0a4; margin: 0; }
  .subrow { display: flex; align-items: center; gap: 12px; font-size: 12.5px; color: #a9b8ac; }
  .reset { display: inline-flex; align-items: center; gap: 4px; }
  .reset b { color: #ffd98f; font-variant-numeric: tabular-nums; font-weight: 600; }
  .sound-btn { background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(230, 190, 120, 0.2); color: #e6d8b8; width: 30px; height: 26px; border-radius: 7px; cursor: pointer; font-size: 13px; line-height: 1; }
  .sound-btn:hover { background: rgba(0, 0, 0, 0.5); }
  /* Touch: 30×26 is a thumbnail, not a button. Fires on a touch device OR a
     phone-width window — a touch laptop at desktop width wants this too, and
     a narrow desktop window is not harmed by a bigger button. */
  @media (hover: none), (max-width: 760px) { .sound-btn { width: 44px; height: 44px; font-size: 17px; } }

  /* ---- Reveal ---- */
  .reveal-scrim { position: fixed; inset: 0; background: rgba(10, 8, 6, 0.74); display: grid; place-items: center; z-index: 50; animation: fade 0.2s ease; }
  @keyframes fade { from { opacity: 0; } }
  .reveal { background: #17130f; border: 1px solid #4a3a24; border-radius: 16px; padding: 28px 34px; text-align: center; max-width: 360px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6); animation: pop 0.28s cubic-bezier(0.2, 1.2, 0.4, 1); }
  @keyframes pop { from { transform: scale(0.8); opacity: 0; } }
  .tier-tag { text-transform: uppercase; letter-spacing: 0.12em; font-size: 13px; font-weight: 700; margin-bottom: 12px; }
  .won { width: 132px; height: 132px; object-fit: contain; filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.5)); }
  .big-emoji { font-size: 92px; line-height: 1.1; }
  .won-name { margin-top: 10px; color: #ece4d8; font-size: 15px; }
  .close { margin-top: 18px; background: #eab348; color: #201203; border: none; border-radius: 999px; padding: 9px 26px; font-weight: 600; cursor: pointer; }

  /* ---- Gallery ---- */
  .gallery { width: 100%; margin-top: 6px; }
  .gallery h3 { color: #ece4d8; font-size: 15px; margin: 0 0 12px; }
  .dim { color: #8a9a8e; font-size: 13px; }
  .dim.sm { font-size: 12px; }
  .tier-block { margin-bottom: 18px; }
  .tier-head { text-transform: uppercase; letter-spacing: 0.1em; font-size: 12px; font-weight: 700; margin-bottom: 7px; display: flex; align-items: baseline; gap: 8px; }
  .frac { color: #9fb0a4; font-size: 11px; letter-spacing: 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); gap: 5px; }
  .cell { width: 100%; aspect-ratio: 1; object-fit: contain; padding: 4px; background: rgba(0, 0, 0, 0.28); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 7px; }
  .cell.locked { display: grid; place-items: center; color: rgba(255, 255, 255, 0.16); font-size: 13px; font-weight: 700; }
  .cell.have { background: rgba(0, 0, 0, 0.15); }

  /* ---- Sidebar ---- */
  .wof-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .card { background: rgba(12, 20, 15, 0.72); border: 1px solid rgba(230, 190, 120, 0.14); border-radius: 12px; padding: 12px 12px 10px; backdrop-filter: blur(2px); }
  .card-head { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #cbd6cb; margin-bottom: 10px; }
  /* Fixed felt-green — the casino floor is theme-independent (var(--ok) went
     Mondrian-blue under De Stijl). */
  .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #58d68d; box-shadow: 0 0 6px #58d68d; animation: blink 1.6s ease-in-out infinite; }
  @keyframes blink { 50% { opacity: 0.35; } }
  .feed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; }
  .feed-row { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: #dfe6df; }
  .feed-emoji { width: 22px; height: 22px; object-fit: contain; flex: none; }
  .feed-ico { font-size: 16px; width: 22px; text-align: center; flex: none; }
  .feed-text { flex: 1; min-width: 0; }
  .feed-text.died { color: #e0776a; }
  .feed-ago { color: #8a9a8e; font-size: 11px; flex: none; }
  .tierboard { margin-bottom: 8px; }
  .tb-head { text-transform: uppercase; letter-spacing: 0.08em; font-size: 10.5px; font-weight: 700; margin-bottom: 3px; }
  .tb-list { list-style: none; margin: 0 0 2px; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .tb-list li { display: flex; align-items: center; gap: 7px; font-size: 12px; color: #dfe6df; }
  .rank { color: #8a9a8e; width: 12px; text-align: right; font-variant-numeric: tabular-nums; }
  .who { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dagger { color: #e0776a; }
  .n { font-weight: 600; font-variant-numeric: tabular-nums; }
  .none { margin: 0 0 2px; }
  .grave { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .grave-row { font-size: 12.5px; color: #cbd6cb; display: flex; align-items: center; gap: 6px; }
  .stone { font-size: 15px; }

  @media (max-width: 860px) {
    .wof-layout { grid-template-columns: 1fr; }
  }

  /* THE STATS COME UNDER THE WHEEL, THE COLLECTION AFTER (Josh, Sep 2026:
     "put the stats for the wheel under the wheel then show the users
     inventory").

     Stacked, the two columns became two blocks — and the first of them ends
     with the unlockables gallery, which is 8,749px tall. So the live feed,
     the top collectors and the graveyard sat 9,482px down the page: present,
     and in practice unreachable. You spun the wheel and then scrolled past
     the entire catalogue of the game to find out what had happened.

     `display: contents` on the main column dissolves it, so its children and
     the side column become siblings of one flex container and `order` can
     interleave them: marquee, wheel, SPIN, the three stat cards, then the
     collection. The gallery keeps its place as the long tail it is, at the
     bottom, where scrolling into it is a deliberate act. */
  @media (max-width: 860px) {
    .wof-layout {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .wof-main {
      display: contents;
    }
    .marquee { order: 1; }
    .wheel { order: 2; }
    .controls { order: 3; }
    .wof-side { order: 4; }
    .gallery { order: 5; }
    /* `display: contents` takes the main column's own centring with it, so
       the pieces that relied on it say so themselves. */
    .wheel,
    .controls {
      align-self: center;
    }
  }
</style>
