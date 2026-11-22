<script lang="ts">
  // PANDORA'S BOX (Josh, Sep 2026 — PANDORA.md): the endgame page. The box
  // on its dais, three keyholes, three squares for the keys; drag a held
  // key to its keyhole (or tap it) and it snaps in; three in and the box
  // wears the aura; click it and the lid lifts on the light, and the
  // choices are offered in that light. The server records the opening and
  // the choice in ONE call (openBox), so a lid lifted and abandoned records
  // nothing. The ledger under the box is the monument.
  import { onMount, onDestroy } from "svelte";
  import { session } from "../lib/session.svelte";
  import { pandora, loadPandora, insertKey, openBox } from "../lib/pandora.svelte";
  import type { PandoraKeyId } from "../lib/api";
  import { playSfx } from "../lib/sfx";
  import { openProfile } from "../lib/nav.svelte";
  import Avatar from "./Avatar.svelte";

  onMount(() => {
    void loadPandora();
  });

  const st = $derived(pandora.state);
  const keys = $derived(st?.keys ?? []);
  const inserted = $derived(keys.filter((k) => k.inserted).length);
  const allIn = $derived(inserted === 3);
  const opened = $derived(st?.opened ?? null);
  const isHouse = $derived(!!session.user?.isAdmin);
  const ledger = $derived(st?.ledger ?? []);
  const choices = $derived(st?.choices ?? []);
  // The once-ever choices all gone — the Stone is never "gone" (repeatable).
  const allTaken = $derived(choices.length > 0 && choices.filter((c) => c.once).every((c) => c.taken));

  // ---- the lid: lifted locally on the click, recorded on the choice ----
  let lifting = $state(false);
  let lit = $state(false); // the light is up, the choices are showing
  let picking = $state<string | null>(null);

  // The lid's fanfare is a timer and this view is lazy-mounted — leaving the
  // page inside the 1.4s used to play a legendary party over the chat.
  let lidTimer: ReturnType<typeof setTimeout> | null = null;
  onDestroy(() => {
    if (lidTimer) clearTimeout(lidTimer);
  });

  function clickBox(): void {
    if (!st?.canOpen || lifting || lit) return;
    lifting = true;
    playSfx("mystery-open", 0.8);
    if (lidTimer) clearTimeout(lidTimer);
    lidTimer = setTimeout(() => {
      lidTimer = null;
      lit = true;
      playSfx("wheel-legendary-party", 0.5);
    }, 1400);
  }
  function closeLid(): void {
    if (lidTimer) clearTimeout(lidTimer);
    lidTimer = null;
    lit = false;
    lifting = false;
    picking = null;
  }
  async function choose(id: string | null): Promise<void> {
    if (pandora.busy) return;
    picking = id ?? "hope";
    const r = await openBox(id);
    picking = null;
    if (r.ok) {
      playSfx("lottery-win", 0.7);
      lifting = false;
      lit = false;
    }
  }

  // ---- the keys: drag to the keyhole, or tap ----
  // Keyhole targets are absolutely placed over the SVG's keyholes (the
  // same fractions the drawing uses), so a drop is a rect test against
  // the matching target.
  const HOLE_X: Record<PandoraKeyId, number> = { prismatic: 0.32, brass: 0.5, rusted: 0.68 };
  let holeEls = $state<Record<string, HTMLElement | null>>({});
  let dragging = $state<PandoraKeyId | null>(null);
  let dx = $state(0);
  let dy = $state(0);
  let over = $state<PandoraKeyId | null>(null);
  let startX = 0, startY = 0;

  function onKeyDown(e: PointerEvent, key: PandoraKeyId): void {
    const k = keys.find((x) => x.key === key);
    if (!k?.held || k.inserted || pandora.busy) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging = key;
    startX = e.clientX;
    startY = e.clientY;
    dx = 0;
    dy = 0;
  }
  function onKeyMove(e: PointerEvent): void {
    if (!dragging) return;
    dx = e.clientX - startX;
    dy = e.clientY - startY;
    over = hitHole(e.clientX, e.clientY, dragging);
  }
  async function onKeyUp(e: PointerEvent): Promise<void> {
    if (!dragging) return;
    const key = dragging;
    const hit = hitHole(e.clientX, e.clientY, key);
    const moved = Math.hypot(dx, dy) > 6;
    dragging = null;
    over = null;
    dx = 0;
    dy = 0;
    // A drop on its own keyhole, or a plain tap: set it.
    if (hit === key || !moved) {
      if (await insertKey(key)) playSfx("chip-place", 0.9);
    }
  }
  /** The hole under the pointer — but ONLY the one that would actually take
   *  `want`. A hole that lights up and then silently refuses the drop is a lie
   *  about the rules (Sep 2026 review). */
  function hitHole(x: number, y: number, want?: PandoraKeyId | null): PandoraKeyId | null {
    for (const key of ["prismatic", "brass", "rusted"] as PandoraKeyId[]) {
      if (want && key !== want) continue;
      const el = holeEls[key];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const pad = 22;
      if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return key;
    }
    return null;
  }

  const fmtDate = (at: number): string =>
    new Date(at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const choiceName = (id: string | null): string =>
    id ? (choices.find((c) => c.id === id)?.name ?? id) : "left hope in the box";
  const pct = (a: number, b: number): number => (b ? Math.min(100, Math.floor((a / b) * 100)) : 0);
</script>

<div class="hall">
  <div class="temple">
    <header class="head">
      <div class="kicker">THE END OF THE ROAD</div>
      <h1>Pandora's Box</h1>
      <p class="sub">Three keys. One lid. One choice — the ones that change Solace for everyone are taken once, ever.</p>
    </header>

    {#if pandora.error}<p class="err">{pandora.error}</p>{/if}

    <!-- ---- THE BOX ---- -->
    <section class="stage" class:aura={allIn && !opened && !isHouse} class:open={lifting || !!opened}>
      <div class="glow"></div>
      <div class="light" class:on={lit || !!opened}></div>
      <button
        class="box"
        onclick={clickBox}
        disabled={!st?.canOpen || lifting || lit}
        title={opened ? "Opened." : allIn ? "Open it." : "Three keys first."}
        aria-label="Pandora's Box"
      >
        <svg viewBox="0 0 600 380" class="chest" aria-hidden="true">
          <defs>
            <!-- obsidian: a deep violet-black with a cool sheen from the upper left -->
            <linearGradient id="pb-body" x1="0" y1="0" x2="0.3" y2="1">
              <stop offset="0" stop-color="#3a2a52" /><stop offset="0.35" stop-color="#1c1428" /><stop offset="0.8" stop-color="#0d0914" /><stop offset="1" stop-color="#07050b" />
            </linearGradient>
            <linearGradient id="pb-lidtop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#5a4478" /><stop offset="1" stop-color="#2a1e3c" />
            </linearGradient>
            <linearGradient id="pb-lidfront" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#2e2142" /><stop offset="1" stop-color="#140e1e" />
            </linearGradient>
            <linearGradient id="pb-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#fff3b8" /><stop offset="0.3" stop-color="#e9be48" /><stop offset="0.65" stop-color="#a8781c" /><stop offset="1" stop-color="#5e400c" />
            </linearGradient>
            <linearGradient id="pb-goldv" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#6a4a10" /><stop offset="0.35" stop-color="#f3d27a" /><stop offset="0.6" stop-color="#c8962c" /><stop offset="1" stop-color="#5a3c0a" />
            </linearGradient>
            <radialGradient id="pb-plate" cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stop-color="#fff1b0" /><stop offset="0.5" stop-color="#d4a12c" /><stop offset="1" stop-color="#6e4a10" />
            </radialGradient>
            <radialGradient id="pb-hole" cx="0.5" cy="0.4" r="0.6">
              <stop offset="0" stop-color="#000" /><stop offset="0.7" stop-color="#050308" /><stop offset="1" stop-color="#2a1d10" />
            </radialGradient>
            <linearGradient id="pb-stone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#4a4058" /><stop offset="1" stop-color="#221c2c" />
            </linearGradient>
            <linearGradient id="pb-stone2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#3a3246" /><stop offset="1" stop-color="#181320" />
            </linearGradient>
            <linearGradient id="pb-sheen" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#fff" stop-opacity="0.16" /><stop offset="0.35" stop-color="#fff" stop-opacity="0.03" /><stop offset="1" stop-color="#fff" stop-opacity="0" />
            </linearGradient>
            <radialGradient id="pb-dais" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stop-color="rgba(120,80,200,0.5)" /><stop offset="1" stop-color="rgba(0,0,0,0)" />
            </radialGradient>
            <pattern id="pb-meander" width="24" height="12" patternUnits="userSpaceOnUse">
              <path d="M0 10h4V2h8v8h4V2h8" fill="none" stroke="#f0cc62" stroke-width="1.5" />
              <path d="M6 6h4M18 6h4" stroke="#f0cc62" stroke-width="1.5" />
            </pattern>
            <!-- the grain of the stone: a fine noise laid over the obsidian at low opacity -->
            <filter id="pb-grain" x="0" y="0" width="1" height="1">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
              <feColorMatrix type="matrix" values="0 0 0 0 0.6  0 0 0 0 0.5  0 0 0 0 0.8  0 0 0 0.22 0" />
            </filter>
            <filter id="pb-soft" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          <!-- THE DAIS: two marble steps, the box's shadow pooled on the top one -->
          <ellipse cx="300" cy="352" rx="270" ry="22" fill="url(#pb-dais)" />
          <path d="M40 336h520l-18 26H58z" fill="url(#pb-stone2)" />
          <path d="M40 336h520v-5H40z" fill="#5a4f6a" />
          <path d="M78 318h444l-14 18H92z" fill="url(#pb-stone)" />
          <path d="M78 318h444v-4H78z" fill="#6a5f7c" />
          <ellipse cx="300" cy="320" rx="200" ry="10" fill="#000" opacity="0.55" filter="url(#pb-soft)" />

          <!-- FEET -->
          <path d="M126 312h26v10h-30z" fill="url(#pb-gold)" /><path d="M448 312h26l4 10h-30z" fill="url(#pb-gold)" />

          <!-- THE BODY: obsidian, grained, with a sheen falling from the upper left -->
          <rect x="120" y="176" width="360" height="140" rx="6" fill="url(#pb-body)" />
          <rect x="120" y="176" width="360" height="140" rx="6" filter="url(#pb-grain)" opacity="0.6" />
          <rect x="120" y="176" width="360" height="140" rx="6" fill="url(#pb-sheen)" />
          <rect x="121" y="177" width="358" height="138" rx="5.5" fill="none" stroke="#6b5490" stroke-width="1" opacity="0.7" />
          <rect x="120" y="176" width="360" height="140" rx="6" fill="none" stroke="#000" stroke-width="1.5" opacity="0.6" />

          <!-- GOLD BANDS with the meander, top and bottom, riveted -->
          <rect x="120" y="180" width="360" height="16" fill="url(#pb-gold)" />
          <rect x="120" y="182" width="360" height="12" fill="url(#pb-meander)" opacity="0.9" />
          <rect x="120" y="296" width="360" height="16" fill="url(#pb-gold)" />
          <rect x="120" y="298" width="360" height="12" fill="url(#pb-meander)" opacity="0.9" />
          <!-- CORNER STRAPS with rivets -->
          <rect x="126" y="196" width="18" height="100" fill="url(#pb-goldv)" />
          <rect x="456" y="196" width="18" height="100" fill="url(#pb-goldv)" />
          {#each [206, 230, 254, 278] as ry (ry)}
            <circle cx="135" cy={ry} r="2.6" fill="#7a5410" /><circle cx="134.4" cy={ry - 0.6} r="1.6" fill="#ffe9a8" />
            <circle cx="465" cy={ry} r="2.6" fill="#7a5410" /><circle cx="464.4" cy={ry - 0.6} r="1.6" fill="#ffe9a8" />
          {/each}
          <!-- CORNER CAPS -->
          <path d="M120 176h30v10h-20v20h-10z" fill="url(#pb-gold)" /><path d="M450 176h30v30h-10v-20h-20z" fill="url(#pb-gold)" />
          <path d="M120 316h30v-10h-20v-20h-10z" fill="url(#pb-gold)" /><path d="M450 316h30v-30h-10v20h-20z" fill="url(#pb-gold)" />

          <!-- THE THREE LOCKS: escutcheon plates, screws, real keyholes -->
          {#each [0.32, 0.5, 0.68] as fx, i (i)}
            {@const cx = 120 + 360 * fx}
            <ellipse cx={cx} cy="246" rx="34" ry="38" fill="#000" opacity="0.45" filter="url(#pb-soft)" />
            <path d="M{cx} 208c19 0 30 12 30 30 0 20-14 34-30 40-16-6-30-20-30-40 0-18 11-30 30-30z" fill="url(#pb-plate)" stroke="#5a3c0a" stroke-width="1.5" />
            <path d="M{cx} 213c15 0 25 10 25 25 0 17-12 29-25 34-13-5-25-17-25-34 0-15 10-25 25-25z" fill="none" stroke="#fff3b8" stroke-width="0.8" opacity="0.55" />
            <circle cx={cx - 20} cy="228" r="2.4" fill="#6e4a10" /><path d="M{cx - 21.6} 226.4l3.2 3.2" stroke="#ffe9a8" stroke-width="0.8" />
            <circle cx={cx + 20} cy="228" r="2.4" fill="#6e4a10" /><path d="M{cx + 18.4} 229.6l3.2-3.2" stroke="#ffe9a8" stroke-width="0.8" />
            <circle cx={cx} cy="270" r="2.4" fill="#6e4a10" /><path d="M{cx - 1.6} 268.4l3.2 3.2" stroke="#ffe9a8" stroke-width="0.8" />
            <!-- the keyhole: a round throat and a tapered slot, dark inside -->
            <circle cx={cx} cy="236" r="7.5" fill="url(#pb-hole)" />
            <path d="M{cx - 4.5} 240h9l4 19h-17z" fill="url(#pb-hole)" />
            <path d="M{cx - 7.5} 236a7.5 7.5 0 0 1 15 0" fill="none" stroke="#3a2a10" stroke-width="1" />
            <path d="M{cx - 4.5} 240h9l4 19" fill="none" stroke="#5a4020" stroke-width="0.8" opacity="0.7" />
          {/each}

          <!-- THE LID: a top face in perspective, a front face, the band, hinges, the clasp -->
          <g class="lid">
            <path d="M136 108h328l24 32H112z" fill="url(#pb-lidtop)" />
            <path d="M136 108h328l24 32H112z" filter="url(#pb-grain)" opacity="0.5" />
            <path d="M112 140h376v36H112z" fill="url(#pb-lidfront)" />
            <path d="M112 140h376v36H112z" filter="url(#pb-grain)" opacity="0.5" />
            <path d="M136 108h328l24 32H112z" fill="url(#pb-sheen)" />
            <path d="M136 108h328" stroke="#8a6cb0" stroke-width="1.2" opacity="0.8" />
            <path d="M112 140h376" stroke="#6b5490" stroke-width="1" opacity="0.8" />
            <rect x="112" y="148" width="376" height="16" fill="url(#pb-gold)" />
            <rect x="112" y="150" width="376" height="12" fill="url(#pb-meander)" opacity="0.9" />
            <rect x="112" y="170" width="376" height="6" fill="url(#pb-gold)" />
            <rect x="112" y="176" width="376" height="2" fill="#000" opacity="0.7" />
            <!-- hinges, on the top edge -->
            <rect x="170" y="104" width="34" height="9" rx="3" fill="url(#pb-gold)" /><circle cx="187" cy="108.5" r="2" fill="#5a3c0a" />
            <rect x="396" y="104" width="34" height="9" rx="3" fill="url(#pb-gold)" /><circle cx="413" cy="108.5" r="2" fill="#5a3c0a" />
            <!-- the clasp -->
            <path d="M282 164h36v14a18 12 0 0 1-36 0z" fill="url(#pb-plate)" stroke="#5a3c0a" stroke-width="1.2" />
            <circle cx="300" cy="172" r="3" fill="#2a1a08" />
          </g>
        </svg>
        <!-- the keys, IN their locks: the shaft goes into the throat, the bow stands proud -->
        {#each keys as k (k.key)}
          <div
            class="hole {k.key}"
            class:over={over === k.key}
            class:set={k.inserted}
            style="left:{(120 + 360 * HOLE_X[k.key]) / 6}%"
            bind:this={holeEls[k.key]}
          >
            {#if k.inserted}
              <svg viewBox="0 0 60 80" class="setkey {k.key}" aria-hidden="true">
                <defs>
                  <linearGradient id="pk-set-{k.key}" x1="0" y1="0" x2="1" y2="1">
                    {#if k.key === "prismatic"}
                      <stop offset="0" stop-color="#ff7ac6" /><stop offset="0.4" stop-color="#7fe6ec" /><stop offset="0.75" stop-color="#ffd35c" /><stop offset="1" stop-color="#b48cf0" />
                    {:else if k.key === "brass"}
                      <stop offset="0" stop-color="#fff1b0" /><stop offset="0.5" stop-color="#d9a628" /><stop offset="1" stop-color="#7a5210" />
                    {:else}
                      <stop offset="0" stop-color="#c8763a" /><stop offset="0.5" stop-color="#8a4420" /><stop offset="1" stop-color="#4a2210" />
                    {/if}
                  </linearGradient>
                </defs>
                <!-- the shaft's end, in the throat; the shank; the bow, facing us -->
                <ellipse cx="30" cy="27" rx="6.5" ry="5" fill="url(#pk-set-{k.key})" stroke="rgba(0,0,0,0.6)" stroke-width="1" />
                <ellipse cx="30" cy="27" rx="3" ry="2.2" fill="rgba(0,0,0,0.55)" />
                <rect x="26" y="29" width="8" height="12" rx="2" fill="url(#pk-set-{k.key})" stroke="rgba(0,0,0,0.5)" stroke-width="0.8" />
                {#if k.key === "prismatic"}
                  <path d="M30 40c-9 0-14 6-14 12s5 12 14 12 14-6 14-12-5-12-14-12zm0 5c5 0 8 3 8 7s-3 7-8 7-8-3-8-7 3-7 8-7z" fill="url(#pk-set-prismatic)" stroke="rgba(0,0,0,0.6)" stroke-width="1" />
                  <circle cx="30" cy="52" r="3" fill="rgba(255,255,255,0.35)" />
                {:else if k.key === "brass"}
                  <path d="M30 40c-10 0-15 6-15 13 0 8 6 13 15 13s15-5 15-13c0-7-5-13-15-13zm0 5.5c6 0 9 3 9 7.5s-3 7.5-9 7.5-9-3-9-7.5 3-7.5 9-7.5z" fill="url(#pk-set-brass)" stroke="rgba(0,0,0,0.6)" stroke-width="1" />
                  <path d="M21 47c3-4 6-5 9-5" stroke="rgba(255,255,255,0.45)" stroke-width="1.4" fill="none" />
                {:else}
                  <path d="M30 40c-9 0-14 5-15 11-1 8 5 14 15 14 9 0 15-5 15-13 0-7-6-12-15-12zm1 5c5 0 8 3 8 7-1 5-4 7-9 7-5 0-8-3-8-7 1-5 4-7 9-7z" fill="url(#pk-set-rusted)" stroke="rgba(0,0,0,0.6)" stroke-width="1" />
                  <path d="M22 44l3 2M37 58l-2-3M18 52l2 1" stroke="rgba(0,0,0,0.45)" stroke-width="1.2" />
                {/if}
                <ellipse cx="30" cy="60" rx="14" ry="4" fill="#000" opacity="0.35" />
              </svg>
            {/if}
          </div>
        {/each}
      </button>

      {#if opened}
        <div class="opened-line">
          You opened it on <b>{fmtDate(opened.at)}</b> and <b>{opened.choice ? `chose ${choiceName(opened.choice)}` : "left hope in the box"}</b>. The Pandoran is in your locker.
        </div>
      {:else if isHouse}
        <div class="opened-line muted">The house keeps the box. It holds no key.</div>
      {:else if allIn}
        <div class="opened-line lit-line">All three keys are set. <b>Click the box.</b></div>
      {/if}
    </section>

    <!-- ---- THE KEYS ---- -->
    {#if !opened}
      <section class="keys">
        {#each keys as k (k.key)}
          {@const fill = k.key === "prismatic" ? "url(#pk-prism)" : "currentColor"}
          <div class="square" class:held={k.held} class:inserted={k.inserted}>
            {#if k.held && !k.inserted}
              <div
                class="keyimg {k.key}"
                class:dragging={dragging === k.key}
                style={dragging === k.key ? `transform: translate(${dx}px, ${dy}px) rotate(-8deg)` : ""}
                onpointerdown={(e) => onKeyDown(e, k.key)}
                onpointermove={onKeyMove}
                onpointerup={onKeyUp}
                onpointercancel={onKeyUp}
                role="button"
                tabindex="0"
                onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void insertKey(k.key); } }}
                title="Drag to its keyhole, or tap to set it"
              >
                <svg viewBox="0 0 120 48" aria-hidden="true">
                  {#if k.key === "prismatic"}
                    <defs>
                      <linearGradient id="pk-prism" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stop-color="#ff7ac6" /><stop offset="0.35" stop-color="#7fe6ec" /><stop offset="0.7" stop-color="#ffd35c" /><stop offset="1" stop-color="#b48cf0" />
                      </linearGradient>
                    </defs>
                  {/if}
                  <circle cx="22" cy="24" r="18" fill={fill} stroke="rgba(0,0,0,0.55)" stroke-width="2" />
                  <circle cx="22" cy="24" r="7" fill="rgba(0,0,0,0.65)" />
                  <rect x="38" y="20" width="72" height="9" fill={fill} />
                  <rect x="88" y="29" width="8" height="12" fill={fill} /><rect x="102" y="29" width="8" height="16" fill={fill} />
                  <path d="M40 22h64" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" />
                </svg>
              </div>
            {:else if k.inserted}
              <div class="setnote">Set in the box</div>
            {:else}
              <div class="empty">?</div>
            {/if}
            <div class="kname">{k.name}</div>
            <div class="krule">{k.rule}</div>
            {#if st}
              <div class="prog">
                {#if k.key === "prismatic"}
                  <span class="bar"><span class="fill prismatic" style="width:{pct(st.progress.vipTier, st.progress.vipMax)}%"></span></span>
                  <small>VIP Tier {st.progress.vipTier} / {st.progress.vipMax}</small>
                {:else if k.key === "brass"}
                  <span class="bar"><span class="fill brass" style="width:{pct(st.progress.badges.earned, st.progress.badges.total)}%"></span></span>
                  <small>{st.progress.badges.earned} / {st.progress.badges.total} achievements</small>
                {:else}
                  <span class="bar"><span class="fill rusted" style="width:{pct(st.progress.relics.owned, st.progress.relics.total)}%"></span></span>
                  <small>{st.progress.relics.owned} / {st.progress.relics.total} relics · {st.progress.levels.built} of {st.progress.levels.total} levels built</small>
                  <span class="levels">
                    {#each st.progress.levels.perLevel as lv, i (i)}
                      <span class="lvl" title="Level {i}: {lv.owned} / {lv.total}"><span class="lfill" style="width:{pct(lv.owned, lv.total)}%"></span></span>
                    {/each}
                    {#each Array(Math.max(0, st.progress.levels.total - st.progress.levels.perLevel.length)) as _, i (i)}
                      <span class="lvl unbuilt" title="not built yet"></span>
                    {/each}
                  </span>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </section>
    {/if}

    <!-- ---- THE CHOICES, in the light ---- -->
    {#if lit && !opened}
      <div class="veil">
        <div class="offer">
          <div class="kicker">THE LID IS UP</div>
          <h2>Choose one. Once.</h2>
          <p class="sub">The choices that change Solace for everyone can be taken once in the history of this house. The Stone can be taken by anyone who reaches it. The Pandoran is yours whatever you choose.</p>
          <div class="cards">
            {#each choices as c (c.id)}
              <button class="card" class:taken={c.taken} class:stone={!c.once} disabled={c.taken || pandora.busy} onclick={() => choose(c.id)}>
                {#if !c.once}
                  <img class="stonepic" src="/emoji/abyss/stone.png" alt="" draggable="false" />
                {/if}
                <div class="cname">{c.name}</div>
                <div class="cdesc">{c.desc}</div>
                {#if c.taken && c.takenBy}
                  <div class="engraved">taken by <b>{c.takenBy.name}</b> · {fmtDate(c.takenBy.at)}</div>
                {:else if picking === c.id}
                  <div class="engraved">…</div>
                {:else if !c.once}
                  <div class="engraved">{c.takers === 0 ? "untouched" : c.takers === 1 ? "one has reached for it" : `${c.takers} have reached for it`}</div>
                {/if}
              </button>
            {/each}
          </div>
          {#if pandora.error}<p class="err veilerr">{pandora.error}</p>{/if}
          <div class="hope">
            <button class="btn hopebtn" class:only={allTaken} class:quiet={!allTaken} disabled={pandora.busy} onclick={() => choose(null)}>
              {allTaken ? "The box is empty. Leave hope in it." : "Take nothing. Leave hope in the box."}
            </button>
            <button class="btn quiet" disabled={pandora.busy} onclick={closeLid}>Close the lid for now</button>
          </div>
        </div>
      </div>
    {/if}

    <!-- ---- THE LEDGER ---- -->
    <section class="ledger">
      <div class="kicker">THE LEDGER</div>
      {#if ledger.length === 0}
        <p class="muted">Nobody has opened it. The first name here will be the first in the history of this house.</p>
      {:else}
        <ol>
          {#each ledger as o, i (o.id)}
            <li class:first={i === 0}>
              <button class="who" onclick={() => openProfile(o.user.id)}>
                <Avatar name={o.user.displayName} id={o.user.id} avatar={o.user.avatar} size={28} border={o.user.cosmetics?.border} />
                <span class="wname">{o.user.displayName}</span>
              </button>
              <span class="what">{o.choice ? `chose ${choiceName(o.choice)}` : "left hope in the box"}</span>
              <span class="when">{fmtDate(o.at)}</span>
              {#if i === 0}<span class="firsttag">THE FIRST</span>{/if}
            </li>
          {/each}
        </ol>
      {/if}
    </section>
  </div>
</div>

<style>
  .hall {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    background:
      radial-gradient(1.5px 1.5px at 10% 8%, rgba(230, 220, 255, 0.55), transparent 100%),
      radial-gradient(1px 1px at 28% 16%, rgba(230, 220, 255, 0.4), transparent 100%),
      radial-gradient(1.5px 1.5px at 52% 5%, rgba(230, 220, 255, 0.4), transparent 100%),
      radial-gradient(1px 1px at 72% 12%, rgba(230, 220, 255, 0.45), transparent 100%),
      radial-gradient(1px 1px at 88% 7%, rgba(230, 220, 255, 0.35), transparent 100%),
      radial-gradient(900px 420px at 50% -10%, rgba(120, 70, 200, 0.22), transparent 60%),
      linear-gradient(180deg, #0a0714 0%, #110b1e 50%, #08060f 100%);
    color: #efe3c8;
  }
  .temple { max-width: 1040px; margin: 0 auto; padding: 22px 20px 40px; display: flex; flex-direction: column; gap: 22px; }
  .head { text-align: center; }
  .kicker { font-size: 0.68rem; letter-spacing: 0.32em; color: #b48cf0; text-transform: uppercase; }
  h1 { margin: 4px 0 6px; font-family: Georgia, "Times New Roman", serif; font-size: 2rem; letter-spacing: 0.12em; color: #f2d27a; text-shadow: 0 0 18px rgba(242, 210, 122, 0.35); }
  h2 { margin: 4px 0 6px; font-family: Georgia, "Times New Roman", serif; font-size: 1.5rem; color: #f2d27a; }
  .sub { margin: 0; color: rgba(239, 227, 200, 0.7); font-size: 0.9rem; }
  .muted { color: rgba(239, 227, 200, 0.55); margin: 0; }
  .err { color: #ff9c9c; text-align: center; margin: 0; }
  /* An error raised while the lid is up must sit ON the veil, not under it. */
  .veilerr { margin: 0 0 10px; font-size: 0.85rem; }
  /* The aura, the prism sweep and the key's slide-in stand down for anyone
     who asked for a still page (the house rule the theme layer follows). */
  @media (prefers-reduced-motion: reduce) {
    .stage.aura .light,
    .keyimg,
    .setkey,
    .pk-prism-anim {
      animation: none !important;
    }
  }

  /* ---- the stage ---- */
  .stage { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 10px 0 0; }
  .box { position: relative; width: min(600px, 100%); background: none; border: 0; padding: 0; cursor: default; color: inherit; }
  .box:not(:disabled) { cursor: pointer; }
  .chest { width: 100%; height: auto; display: block; filter: drop-shadow(0 18px 24px rgba(0, 0, 0, 0.6)); transition: filter 0.6s ease; }
  .lid { transform-origin: 300px 176px; transition: transform 1.4s cubic-bezier(0.2, 0.7, 0.2, 1); }
  .stage.open .lid { transform: translateY(-64px) scaleY(0.5); }
  .glow { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 1s ease; }
  .stage.aura .glow {
    opacity: 1;
    background: radial-gradient(360px 200px at 50% 55%, rgba(242, 210, 122, 0.35), rgba(160, 90, 240, 0.18) 55%, transparent 75%);
    animation: breathe 2.6s ease-in-out infinite;
  }
  .stage.aura .chest { filter: drop-shadow(0 0 22px rgba(242, 210, 122, 0.7)) drop-shadow(0 0 60px rgba(160, 90, 240, 0.55)); }
  @keyframes breathe { 0%, 100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.06); opacity: 1; } }
  .light { position: absolute; left: 50%; top: 42%; width: 10px; height: 10px; transform: translate(-50%, -50%); border-radius: 50%; pointer-events: none; opacity: 0; background: rgba(255, 244, 200, 0.95); }
  .light.on {
    opacity: 1;
    box-shadow: 0 0 120px 80px rgba(255, 244, 200, 0.9), 0 0 300px 160px rgba(242, 210, 122, 0.5), 0 0 600px 260px rgba(180, 120, 255, 0.35);
    animation: burst 1.2s ease-out;
  }
  @keyframes burst { from { box-shadow: 0 0 0 0 rgba(255, 244, 200, 0); } }
  .hole {
    position: absolute; top: 62%; width: 12%; height: 24%; transform: translate(-50%, -50%);
    border-radius: 50%; border: 2px dashed transparent; transition: border-color 0.2s, background 0.2s;
  }
  .hole.over { border-color: rgba(242, 210, 122, 0.9); background: rgba(242, 210, 122, 0.12); }
  /* the set key: its throat end sits on the keyhole (27/80 of the target's
     height, the keyhole's centre), the bow stands proud below it; it slides
     IN along its own axis, then turns a quarter and settles */
  .setkey { position: absolute; left: 50%; top: 50%; width: 112%; height: auto; transform: translate(-50%, -34%); filter: drop-shadow(0 3px 3px rgba(0, 0, 0, 0.75)); transform-origin: 50% 34%; animation: keyin 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
  @keyframes keyin {
    0% { transform: translate(-50%, -34%) translateY(46px) scale(1.5); opacity: 0; }
    45% { transform: translate(-50%, -34%) translateY(0) scale(1); opacity: 1; }
    70% { transform: translate(-50%, -34%) rotate(-28deg); }
    100% { transform: translate(-50%, -34%) rotate(0deg); }
  }
  .opened-line { font-size: 0.9rem; text-align: center; color: rgba(239, 227, 200, 0.85); }
  .opened-line b { color: #f2d27a; }
  .lit-line { color: #f2d27a; animation: breathe 2.6s ease-in-out infinite; }

  /* ---- the keys ---- */
  .keys { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
  .square {
    position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 14px 12px 12px; border-radius: 14px; min-height: 200px;
    border: 1px solid rgba(180, 140, 240, 0.18); background: rgba(0, 0, 0, 0.32);
    box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.5);
  }
  .square.held { border-color: rgba(242, 210, 122, 0.45); }
  .square.inserted { opacity: 0.75; }
  .empty { width: 120px; height: 56px; display: grid; place-items: center; font-size: 1.6rem; color: rgba(239, 227, 200, 0.2); border: 1px dashed rgba(239, 227, 200, 0.15); border-radius: 10px; }
  .setnote { width: 120px; height: 56px; display: grid; place-items: center; font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(242, 210, 122, 0.7); }
  .keyimg { width: 120px; height: 56px; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.7)); transition: transform 0.25s ease; }
  .keyimg.dragging { cursor: grabbing; transition: none; z-index: 5; position: relative; }
  .keyimg svg { width: 100%; height: 100%; display: block; }
  .keyimg:not(.dragging):hover { transform: translateY(-3px) rotate(-3deg); }
  .prismatic { color: #d29cff; }
  .brass { color: #d9a628; }
  .rusted { color: #9a4a22; }
  .keyimg.prismatic svg { animation: prism 6s ease-in-out infinite alternate; }
  @keyframes prism { to { filter: hue-rotate(60deg) brightness(1.15); } }
  .kname { font-family: Georgia, serif; letter-spacing: 0.08em; color: #f2d27a; font-size: 0.95rem; }
  .krule { font-size: 0.74rem; color: rgba(239, 227, 200, 0.6); text-align: center; line-height: 1.35; }
  .prog { width: 100%; display: flex; flex-direction: column; gap: 4px; align-items: stretch; margin-top: auto; }
  .prog small { font-size: 0.68rem; color: rgba(239, 227, 200, 0.6); text-align: center; }
  .bar { height: 7px; border-radius: 999px; background: rgba(0, 0, 0, 0.55); overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.06); }
  .fill { display: block; height: 100%; border-radius: 999px; transition: width 0.6s ease; }
  .fill.prismatic { background: linear-gradient(90deg, #ff7ac6, #7fe6ec, #ffd35c); }
  .fill.brass { background: linear-gradient(90deg, #7a5210, #d9a628, #fff1b0); }
  .fill.rusted { background: linear-gradient(90deg, #4a2210, #9a4a22, #d1af2e); }
  .levels { display: flex; gap: 3px; }
  .lvl { flex: 1; height: 4px; border-radius: 999px; background: rgba(0, 0, 0, 0.55); overflow: hidden; }
  .lvl.unbuilt { background: repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.08) 0 2px, transparent 2px 4px); }
  .lfill { display: block; height: 100%; background: #d1af2e; }

  /* ---- the choices in the light ---- */
  .veil { position: fixed; inset: 0; z-index: var(--z-modal, 10000); display: grid; place-items: center; padding: 16px;
    background: radial-gradient(60% 60% at 50% 40%, rgba(255, 244, 200, 0.22), rgba(6, 4, 12, 0.92) 70%); }
  .offer { max-width: 900px; width: 100%; text-align: center; display: flex; flex-direction: column; gap: 14px; max-height: 100%; overflow-y: auto;
    padding: 20px; border-radius: 18px; border: 1px solid rgba(242, 210, 122, 0.4); background: rgba(10, 6, 20, 0.85); box-shadow: 0 0 80px rgba(242, 210, 122, 0.25); }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
  .card { text-align: left; padding: 14px; border-radius: 12px; border: 1px solid rgba(242, 210, 122, 0.4); background: rgba(0, 0, 0, 0.4); color: inherit; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; display: flex; flex-direction: column; gap: 6px; }
  .card:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 0 24px rgba(242, 210, 122, 0.35); }
  .card.taken { opacity: 0.55; cursor: default; border-style: dashed; }
  .card.stone { border-color: rgba(155, 92, 255, 0.5); background: radial-gradient(120% 80% at 50% 0%, rgba(80, 30, 150, 0.35), rgba(0, 0, 0, 0.45) 60%); align-items: center; text-align: center; }
  .card.stone:not(:disabled):hover { box-shadow: 0 0 28px rgba(150, 80, 255, 0.45); }
  .card.stone .cname { color: #d9c2ff; }
  .stonepic { width: 84px; height: 84px; object-fit: contain; filter: drop-shadow(0 0 10px rgba(150, 80, 255, 0.6)); animation: stonebreathe 3.6s ease-in-out infinite; }
  @keyframes stonebreathe { 0%, 100% { filter: drop-shadow(0 0 8px rgba(140, 70, 255, 0.45)); } 50% { filter: drop-shadow(0 0 20px rgba(170, 100, 255, 0.85)); } }
  .cname { font-family: Georgia, serif; font-size: 1.05rem; color: #f2d27a; }
  .cdesc { font-size: 0.82rem; color: rgba(239, 227, 200, 0.8); line-height: 1.4; }
  .engraved { font-size: 0.72rem; letter-spacing: 0.06em; color: rgba(239, 227, 200, 0.6); margin-top: auto; }
  .engraved b { color: #f2d27a; }
  .hope { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  .btn { border-radius: 999px; padding: 8px 16px; border: 1px solid rgba(242, 210, 122, 0.5); background: rgba(242, 210, 122, 0.12); color: #f2d27a; cursor: pointer; font-size: 0.85rem; }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .btn.quiet { border-color: rgba(239, 227, 200, 0.25); color: rgba(239, 227, 200, 0.7); background: transparent; }
  .hopebtn.only { background: rgba(242, 210, 122, 0.3); }

  /* ---- the ledger ---- */
  .ledger { padding: 14px 16px; border-radius: 14px; border: 1px solid rgba(180, 140, 240, 0.18); background: rgba(0, 0, 0, 0.3); display: flex; flex-direction: column; gap: 8px; }
  .ledger ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .ledger li { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 10px; border-radius: 10px; background: rgba(255, 255, 255, 0.03); font-size: 0.86rem; }
  .ledger li.first { border: 1px solid rgba(242, 210, 122, 0.45); background: rgba(242, 210, 122, 0.06); }
  .who { display: inline-flex; align-items: center; gap: 8px; background: none; border: 0; color: inherit; cursor: pointer; padding: 0; }
  .wname { font-weight: 700; color: #f2d27a; }
  .what { color: rgba(239, 227, 200, 0.85); }
  .when { margin-left: auto; color: rgba(239, 227, 200, 0.5); font-size: 0.76rem; }
  .firsttag { font-size: 0.62rem; letter-spacing: 0.18em; color: #0a0714; background: #f2d27a; padding: 2px 8px; border-radius: 999px; font-weight: 800; }

  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .keys { grid-template-columns: 1fr; }
    .temple { padding: 16px 12px 32px; }
    h1 { font-size: 1.5rem; }
  }
</style>
