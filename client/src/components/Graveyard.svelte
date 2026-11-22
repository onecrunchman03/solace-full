<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { session } from "../lib/session.svelte";
  import { chat } from "../lib/chat.svelte";
  import { emoji, lookupEmoji, refreshOwned } from "../lib/emoji.svelte";
  import { loadWallet } from "../lib/wallet.svelte";
  import { ask } from "../lib/confirm.svelte";
  import { graveyard, loadGraveyard, applyGraveRespect } from "../lib/graveyard.svelte";
  import EmojiPicker from "./EmojiPicker.svelte";

  let pickingFor = $state<number | null>(null); // deadUserId with the picker open
  let note = $state<string | null>(null);
  let raising = $state<number | null>(null); // deadUserId being paid for
  let now = $state(Date.now());

  onMount(() => {
    void loadGraveyard();
    // The fresh graves carry a countdown, and a grave that runs out mid-view
    // should stop offering a rescue nobody can still buy.
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  const graves = $derived(graveyard.graves);
  const loading = $derived(graveyard.loading);
  const lives = $derived(graveyard.lives);
  /** Tribute decay reads the SERVER's clock (skew measured at load). */
  const snow = $derived(now + graveyard.clockSkew);

  // Mirrors of the server's decay windows (src/mortality.ts) — cosmetic only;
  // the server prunes with its own copy.
  const CANDLE_MS = 24 * 3600_000;
  const FLOWERS_FRESH_MS = 24 * 3600_000;
  const FLOWERS_GONE_MS = 7 * 24 * 3600_000;

  type Trib = { kind: string; byUserId: number; at: number };
  const litCandles = (g: { tributes: Trib[] }): Trib[] =>
    g.tributes.filter((t) => t.kind === "candle" && snow - t.at < CANDLE_MS);
  const standingFlowers = (g: { tributes: Trib[] }): Trib[] =>
    g.tributes.filter((t) => t.kind === "flowers" && snow - t.at < FLOWERS_GONE_MS);
  const wilted = (t: Trib): boolean => snow - t.at >= FLOWERS_FRESH_MS;

  const CAUSE: Record<string, string> = {
    wheel: "taken by the Wheel",
    goblins: "the goblins collected",
    // a casino regular who finished a season last (SEASONS.md)
    season: "finished the season last",
  };

  /** Light a candle or leave flowers — silver burned, refusals free. */
  let tributing = $state(false);
  async function tribute(deadUserId: number, kind: "candle" | "flowers"): Promise<void> {
    if (tributing) return;
    tributing = true;
    const price = kind === "candle" ? graveyard.candlePrice : graveyard.flowersPrice;
    try {
      await api.graveTribute(deadUserId, kind);
      void loadWallet(); // the price burned from your purse
      // Our own broadcast frame also lands, but the socket may lag the tap —
      // the store dedupes nothing here, so let the frame be the writer.
    } catch (e) {
      const status = (e as { status?: number }).status;
      note =
        status === 402 ? `That costs ${price} silver — burned, like everything left here.`
        : status === 409 ? (kind === "candle" ? "Your candle there is still burning." : "Your flowers there are still standing.")
        : "That didn't go through.";
      setTimeout(() => (note = null), 3000);
    } finally {
      tributing = false;
    }
  }

  // ---- THE MEMORIAL: one account's whole story with death ----
  let memorialFor = $state<number | null>(null);
  let memorial = $state<Awaited<ReturnType<typeof api.graveMemorial>> | null>(null);
  let eulogyDraft = $state("");
  let eulogySaving = $state(false);

  async function openMemorial(userId: number): Promise<void> {
    memorialFor = userId;
    memorial = null;
    eulogyDraft = "";
    try {
      const m = await api.graveMemorial(userId);
      // A second stone clicked meanwhile wins (Oct 2026 review): a late answer
      // for the first used to show — and save a eulogy under — the wrong grave.
      if (memorialFor !== userId) return;
      memorial = m;
      const mine = m.eulogies.find((e) => e.byUserId === session.user?.id);
      if (mine) eulogyDraft = mine.text;
    } catch {
      if (memorialFor === userId) memorialFor = null;
    }
  }

  const memorialGrave = $derived(memorialFor != null ? graves.find((g) => g.user.id === memorialFor) ?? null : null);
  const isStaff = $derived(!!session.user && (session.user.isAdmin || session.user.role === "moderator"));

  async function saveEulogy(): Promise<void> {
    if (memorialFor == null || eulogySaving) return;
    const text = eulogyDraft.trim();
    if (!text) return;
    eulogySaving = true;
    try {
      await api.setGraveEulogy(memorialFor, text);
      memorial = await api.graveMemorial(memorialFor);
    } catch {
      note = "The stone refused the words.";
      setTimeout(() => (note = null), 2500);
    } finally {
      eulogySaving = false;
    }
  }

  async function removeEulogy(authorId: number): Promise<void> {
    if (memorialFor == null) return;
    try {
      await api.deleteGraveEulogy(memorialFor, authorId === session.user?.id ? undefined : authorId);
      memorial = await api.graveMemorial(memorialFor);
      if (authorId === session.user?.id) eulogyDraft = "";
    } catch { /* already gone */ }
  }

  const roman = (n: number): string => "I".repeat(Math.max(1, Math.min(n, 8)));

  /** The monuments grouped into family plots — one plot per account, its
   *  sealed lives stacked oldest-first. */
  const plots = $derived.by(() => {
    const byUser = new Map<number, typeof graveyard.lives>();
    for (const l of lives) (byUser.get(l.userId) ?? byUser.set(l.userId, []).get(l.userId)!).push(l);
    return [...byUser.entries()].map(([userId, ls]) => ({
      userId,
      lives: [...ls].sort((a, b) => a.generation - b.generation),
      latest: Math.max(...ls.map((l) => l.sealedAt)),
    })).sort((a, b) => b.latest - a.latest);
  });

  const nec = $derived(graveyard.necrology);

  /** A grave is still open if its deadline hasn't passed. Anything that died
   *  before the Wake shipped has no deadline at all and reads as sealed. */
  const freshLeft = (g: { user: { graveSealsAt?: number | null } }): number =>
    Math.max(0, (g.user.graveSealsAt ?? 0) - snow); // the server's clock, not the browser's

  const countdown = (ms: number): string => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h >= 1 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s % 60).padStart(2, "0")}s`;
  };

  /** Burn the price and stand somebody up. Nothing comes back to you for it —
   *  that's the point, and the button says so. */
  // The mythic raise (Oct 2026 review): the Wake tells the dead a friend can
  // sacrifice a mythic, and the server takes one, but no screen offered it.
  const myMythics = $derived(emoji.owned.filter((e) => e.tier === "mythic"));
  let mythicPick = $state("");

  async function raise(deadUserId: number, kind: "silver" | "mythic" = "silver"): Promise<void> {
    if (raising !== null) return;
    const code = kind === "mythic" ? mythicPick || myMythics[0]?.code : undefined;
    if (kind === "mythic") {
      if (!code) return;
      const ok = await ask({
        title: "Sacrifice a mythic?",
        body: `${lookupEmoji(code)?.name ?? code} is burned to raise them. It doesn't come back.`,
        confirm: "Burn it",
        danger: true,
      });
      if (!ok) return;
    }
    raising = deadUserId;
    try {
      await api.raiseGrave(deadUserId, kind, code);
      await loadGraveyard();
      void loadWallet();
      if (kind === "mythic") void refreshOwned();
      note = "They're back on their feet.";
    } catch (e) {
      const status = (e as { status?: number }).status;
      note = status === 402
        ? `You need ${graveyard.raisePrice.toLocaleString()} silver to raise the dead.`
        : status === 409
          ? "Too late — that grave has already closed."
          : "That didn't go through.";
    } finally {
      raising = null;
      setTimeout(() => (note = null), 3500);
    }
  }

  async function respect(deadUserId: number, code: string) {
    pickingFor = null;
    try {
      const { added } = await api.graveRespect(deadUserId, code);
      applyGraveRespect(deadUserId, session.user!.id, code, added);
    } catch {
      note = "You can only lay emoji you own.";
      setTimeout(() => (note = null), 2500);
    }
  }

  function name(id: number): string {
    return chat.members.find((m) => m.id === id)?.displayName ?? "someone";
  }
  function whoList(ids: number[]): string {
    return ids.map(name).join(", ");
  }

  function fmtDate(t: number): string {
    return new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  // Vary the stone shape + lean per grave, deterministically by user id.
  const SHAPES = ["arch", "cross", "obelisk", "slab"] as const;
  const shapeOf = (id: number) => SHAPES[id % SHAPES.length];
  const leanOf = (id: number) => ((id * 7) % 5) - 2; // -2..2 degrees
</script>

<div class="yard">
  <!-- The scene: a sky band in normal flow — moon, bats and the title above,
       with the tree + iron fence planted on a hill silhouette at the horizon.
       Everything scrolls together; nothing sticks or floats. -->
  <div class="sky" aria-hidden="false">
    <div class="stars s1" aria-hidden="true"></div>
    <div class="stars s2" aria-hidden="true"></div>
    <div class="moon" aria-hidden="true"><span class="crater c1"></span><span class="crater c2"></span><span class="crater c3"></span></div>
    <div class="bats" aria-hidden="true">🦇</div>
    {#each Array(7) as _, i}
      <span class="ember" style="--i:{i}" aria-hidden="true"></span>
    {/each}

    <header class="head">
      <h1>Graveyard</h1>
      <p>Here rest those the Wheel has taken. Lay what you own upon their stones.</p>
    </header>

    <!-- horizon: undulating ground the fence stands on, tree at the left -->
    <svg class="horizon" viewBox="0 0 1200 104" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="gy-hill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#06030b" />
          <stop offset="1" stop-color="#110a18" />
        </linearGradient>
      </defs>
      <rect x="0" y="34" width="1200" height="4" fill="#0a0710" />
      <rect x="0" y="56" width="1200" height="4" fill="#0a0710" />
      {#each Array(40) as _, i}
        <rect x={i * 30 + 6} y="20" width="3.5" height="52" fill="#0a0710" />
        <path d={`M${i * 30 + 7.75} 10 L${i * 30 + 12} 22 L${i * 30 + 3.5} 22 Z`} fill="#0a0710" />
      {/each}
      <path d="M0 76 Q150 64 300 73 Q450 82 600 72 Q750 63 900 76 Q1050 86 1200 70 L1200 104 L0 104 Z" fill="url(#gy-hill)" />
    </svg>
    <svg class="tree" viewBox="0 0 200 260" aria-hidden="true">
      <path d="M95 260 L95 150 Q60 130 55 90 Q80 110 92 118 L88 60 Q70 45 68 20 Q85 35 90 48 L98 10 L104 55 Q120 40 138 38 Q125 60 108 72 L104 120 Q130 105 150 110 Q130 130 108 140 L108 260 Z" fill="#07050a" />
    </svg>
  </div>

  <div class="fog f1" aria-hidden="true"></div>
  <div class="fog f2" aria-hidden="true"></div>

  <div class="content">
    {#if note}<div class="note">{note}</div>{/if}

    {#if loading}
      <p class="state">The fog is lifting…</p>
    {:else if graves.length === 0}
      <div class="empty">
        <div class="empty-stone">?</div>
        <p>No one has fallen… yet. The Wheel is patient.</p>
      </div>
    {:else}
      <div class="rows">
        {#each graves as g (g.user.id)}
          <div class="plot" class:open={freshLeft(g) > 0} style="--lean:{leanOf(g.user.id)}deg">
            <button
              class="stonebtn"
              title="Read the memorial"
              onclick={() => openMemorial(g.user.id)}
            >
              <div class="stone {shapeOf(g.user.id)} {g.user.cosmetics?.tombstone ?? ''}">
                {#if shapeOf(g.user.id) === "cross"}
                  <div class="cross-top"></div>
                {/if}
                <div class="engraving">
                  <span class="rip">R.I.P.</span>
                  <span class="dead-name">{g.user.displayName}{#if (g.user.generation ?? 1) > 1}&nbsp;{roman(g.user.generation ?? 1)}{/if}</span>
                  <span class="dates">✝ {fmtDate(g.diedAt)}</span>
                  {#if g.deathCause && CAUSE[g.deathCause]}
                    <span class="cause">{CAUSE[g.deathCause]}</span>
                  {/if}
                  {#if g.epitaph}
                    <span class="epitaph {g.user.cosmetics?.epitaph ?? ''}">“{g.epitaph}”</span>
                  {/if}
                  {#if g.buriedWith > 0}
                    <span class="buried">buried with {g.buriedWith} emoji</span>
                  {/if}
                </div>
              </div>
            </button>
            <!-- The graveside: standing candles + flowers, decaying on the
                 server's clock. A tended grave looks tended; a forgotten one
                 looks that too, and nobody had to write the copy. -->
            {#if litCandles(g).length || standingFlowers(g).length}
              <div class="graveside" aria-hidden="true">
                {#each litCandles(g) as c (c.byUserId + "-" + c.at)}
                  <span
                    class="candle"
                    style="--dx:{(((c.byUserId * 37 + c.at) % 26) - 13)}px; --fd:{(c.byUserId % 5) * 0.33}s"
                    title={`${name(c.byUserId)} lit a candle`}
                  >
                    <span class="cflame"></span>
                    <span class="cwax"></span>
                  </span>
                {/each}
                {#each standingFlowers(g) as f (f.byUserId + "-" + f.at)}
                  <span
                    class="flowers"
                    class:wilt={wilted(f)}
                    style="--dx:{(((f.byUserId * 53 + f.at) % 18) - 9)}px; --rot:{((f.byUserId * 29) % 22) - 11}deg"
                    title={`${name(f.byUserId)} left flowers`}
                  >{wilted(f) ? "🥀" : "💐"}</span>
                {/each}
              </div>
            {/if}
            <div class="mound"></div>

            {#if freshLeft(g) > 0}
              <!-- THE WAKE: the ground is still open. Whoever pays burns the
                   price outright — the person coming back gets nothing from
                   it, which is what keeps a rescue from being a coin faucet. -->
              <div class="wake">
                <span class="left">the ground is still open — {countdown(freshLeft(g))}</span>
                {#if session.user && session.user.id !== g.user.id}
                  <button
                    class="raise"
                    disabled={raising !== null}
                    onclick={() => raise(g.user.id)}
                    title="Burns {graveyard.raisePrice.toLocaleString()} of your silver. You get nothing back but them."
                  >
                    {raising === g.user.id ? "…" : `raise them · ${graveyard.raisePrice.toLocaleString()}🪙`}
                  </button>
                  {#if myMythics.length}
                    <span class="mythicraise">
                      or
                      <select bind:value={mythicPick} aria-label="Which mythic to sacrifice">
                        {#each myMythics as m (m.code)}<option value={m.code}>{m.name}</option>{/each}
                      </select>
                      <button class="raise" disabled={raising !== null} onclick={() => raise(g.user.id, "mythic")}>burn it</button>
                    </span>
                  {/if}
                {/if}
              </div>
            {/if}

            <div class="respects">
              {#each g.respects as r (r.code)}
                {@const e = lookupEmoji(r.code)}
                <button
                  class="tribute"
                  class:mine={session.user != null && r.userIds.includes(session.user.id)}
                  title={`${whoList(r.userIds)} paid respects`}
                  onclick={() => respect(g.user.id, r.code)}
                >
                  {#if e}<img src={`/emoji/${e.file}`} alt={e.name} />{:else}<span>❔</span>{/if}
                  <span class="n">{r.userIds.length}</span>
                </button>
              {/each}
              <span class="add-anchor">
                <button
                  class="tribute add"
                  title="Pay your respects with an emoji you own"
                  onclick={() => (pickingFor = pickingFor === g.user.id ? null : g.user.id)}
                >🙏</button>
                {#if pickingFor === g.user.id}
                  <EmojiPicker
                    placement="up"
                    align="left"
                    onpick={(code) => respect(g.user.id, code)}
                    onclose={() => (pickingFor = null)}
                  />
                {/if}
              </span>
              <button
                class="tribute buy"
                disabled={tributing}
                title="Light a candle — burns {graveyard.candlePrice} silver, and for a day, the grave"
                onclick={() => tribute(g.user.id, "candle")}
              >🕯️ {graveyard.candlePrice}</button>
              <button
                class="tribute buy"
                disabled={tributing}
                title="Leave flowers — {graveyard.flowersPrice} silver, burned. Fresh a day; gone in seven"
                onclick={() => tribute(g.user.id, "flowers")}
              >💐 {graveyard.flowersPrice}</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if plots.length}
      <!-- THE MONUMENTS: lives that ran out their wake, grouped into FAMILY
           PLOTS — one plot per account, its sealed lives stacked in order.
           The account walked out of each one generation older; a veteran on
           their third life owns a plot with two stones in it. -->
      <div class="monuments">
        <h3 class="sect"><span class="rule"></span><span class="sectname">⚱ THE MONUMENTS</span><span class="rule"></span></h3>
        <p class="mlede">
          Lives that sealed. Each one ended, and the same person walked out of it carrying
          their achievements, a quarter of their silver and the rarest tenth of their collection.
        </p>
        <div class="mrows">
          {#each plots as p (p.userId)}
            <button class="mplot" onclick={() => openMemorial(p.userId)} title="Read the memorial">
              <span class="mfamily">the line of {name(p.userId)}</span>
              {#each p.lives as l (l.generation)}
                <div class="mon">
                  <span class="mname">{name(l.userId)} {roman(l.generation)}{#if l.deathCause && CAUSE[l.deathCause]}<span class="mcause"> · {CAUSE[l.deathCause]}</span>{/if}</span>
                  <span class="mdates">{fmtDate(l.bornAt)} — {fmtDate(l.diedAt)}</span>
                  {#if l.epitaph}<span class="mep">“{l.epitaph}”</span>{/if}
                  <span class="mheld">
                    held {l.emojiCount} emoji and {l.coins.toLocaleString()} silver
                  </span>
                </div>
              {/each}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if !loading && (nec.deaths ?? 0) >= 0}
      <!-- THE NECROLOGY: the morbid ledger at the gate. Aggregates only. -->
      <div class="necrology">
        <h3 class="sect"><span class="rule"></span><span class="sectname">🕮 THE NECROLOGY</span><span class="rule"></span></h3>
        <div class="sign">
          <span class="signtop">DAYS SINCE LAST ACCIDENT</span>
          <span class="signnum">{nec.daysSinceLastDeath == null || nec.daysSinceLastDeath < 0 ? "∞" : nec.daysSinceLastDeath}</span>
        </div>
        <div class="necgrid">
          <div class="necrow"><span>souls taken</span><b>{nec.deaths ?? 0}</b></div>
          <div class="necrow"><span>by the Wheel</span><b>{nec.byWheel ?? 0}</b></div>
          <div class="necrow"><span>by the goblins</span><b>{nec.byGoblins ?? 0}</b></div>
          <div class="necrow"><span>raised by friends</span><b>{nec.raises ?? 0}</b></div>
          <div class="necrow"><span>bought themselves back</span><b>{nec.selfRevivals ?? 0}</b></div>
          <div class="necrow"><span>silver burned raising the dead</span><b>{(nec.silverBurnedRaising ?? 0).toLocaleString()}</b></div>
          <div class="necrow"><span>mythics burned raising the dead</span><b>{nec.mythicsBurnedRaising ?? 0}</b></div>
          <div class="necrow"><span>talismans that took the blow</span><b>{nec.talismanSaves ?? 0}</b></div>
          <div class="necrow"><span>times the reaper blinked</span><b>{nec.reaperBlinks ?? 0}</b></div>
          <div class="necrow"><span>oldest walking generation</span><b>{roman(nec.generationsWalking ?? 1)}</b></div>
        </div>
      </div>
    {/if}
  </div>

  {#if memorialFor != null}
    <!-- THE MEMORIAL: one account's whole story with death. Everything shown
         here is public — monuments carry their estates, raises broadcast. -->
    <div class="memscrim" onclick={() => (memorialFor = null)} onkeydown={(e) => e.key === "Escape" && (memorialFor = null)} role="button" tabindex="-1">
      <div class="mempanel" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1" onkeydown={() => {}}>
        <button class="memclose" onclick={() => (memorialFor = null)}>✕</button>
        <h3 class="memname">{name(memorialFor)}</h3>
        <div class="memrule" aria-hidden="true"><span></span>❦<span></span></div>
        {#if memorialGrave}
          <p class="memstate">
            ✝ {fmtDate(memorialGrave.diedAt)}{memorialGrave.deathCause && CAUSE[memorialGrave.deathCause] ? ` — ${CAUSE[memorialGrave.deathCause]}` : ""}
            · lies here still
          </p>
        {/if}
        {#if !memorial}
          <p class="memload">Reading the stone…</p>
        {:else}
          {#if memorial.lives.length}
            <h4>THE FAMILY PLOT</h4>
            {#each memorial.lives as l (l.generation)}
              <div class="memlife">
                <span class="memlifename">{name(l.userId)} {roman(l.generation)}{#if l.deathCause && CAUSE[l.deathCause]}<span class="mcause"> · {CAUSE[l.deathCause]}</span>{/if}</span>
                <span class="memdates">{fmtDate(l.bornAt)} — {fmtDate(l.diedAt)} · held {l.emojiCount} emoji and {l.coins.toLocaleString()} silver</span>
                {#if l.epitaph}<span class="memep">“{l.epitaph}”</span>{/if}
                {#if l.keptCodes.length}
                  <span class="memkept">
                    carried out:
                    {#each l.keptCodes as code (code)}
                      {@const e = lookupEmoji(code)}
                      {#if e}<img class="keptimg" src={`/emoji/${e.file}`} alt={e.name} title={e.name} />{/if}
                    {/each}
                  </span>
                {/if}
                {#if l.eulogies.length}
                  <div class="memeulogies carved">
                    {#each l.eulogies as eu (eu.byUserId)}
                      <p class="eulogy">“{eu.text}” <span class="eulby">— {name(eu.byUserId)}</span></p>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          {/if}
          {#if memorial.revivals.length}
            <h4>THE REVIVALS</h4>
            {#each memorial.revivals as r (r.at)}
              <p class="memrev">
                {#if r.kind === "self"}
                  bought themselves back — the whole purse and a third of the collection, burned
                {:else if r.kind === "mythic"}
                  raised by {r.byUserId != null ? name(r.byUserId) : "someone"} — a mythic burned
                {:else}
                  raised by {r.byUserId != null ? name(r.byUserId) : "someone"} — {(r.cost ?? 0).toLocaleString()} silver burned
                {/if}
                <span class="memrevdate">· {fmtDate(r.at)}</span>
              </p>
            {/each}
          {/if}
          {#if memorialGrave}
            <h4>EULOGIES</h4>
            {#each memorial.eulogies as eu (eu.byUserId)}
              <p class="eulogy">
                “{eu.text}” <span class="eulby">— {name(eu.byUserId)}</span>
                {#if eu.byUserId === session.user?.id || isStaff}
                  <button class="euldel" title="Remove" onclick={() => removeEulogy(eu.byUserId)}>✕</button>
                {/if}
              </p>
            {:else}
              <p class="memload">No one has spoken yet.</p>
            {/each}
            {#if session.user && session.user.id !== memorialFor}
              <div class="eulwrite">
                <textarea
                  rows="2"
                  maxlength={graveyard.maxEulogy}
                  placeholder="Say a few words…"
                  bind:value={eulogyDraft}
                ></textarea>
                <button class="eulsave" disabled={eulogySaving || !eulogyDraft.trim()} onclick={saveEulogy}>
                  {memorial.eulogies.some((e) => e.byUserId === session.user?.id) ? "Rewrite" : "Speak"}
                </button>
              </div>
            {/if}
          {/if}
          {#if !memorial.lives.length && !memorial.revivals.length && !memorialGrave}
            <p class="memload">This stone keeps its silence.</p>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  /* ---- THE WAKE: a grave that is still open ---- */
  .wake {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 6px;
  }
  .left {
    font-size: 0.72rem;
    color: #d99a5a;
    letter-spacing: 0.04em;
    font-variant-numeric: tabular-nums;
  }
  .mythicraise {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: 6px;
    font-size: 0.78rem;
    opacity: 0.9;
  }
  .mythicraise select {
    font: inherit;
    max-width: 9rem;
    background: rgba(0, 0, 0, 0.35);
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 2px 4px;
  }
  .raise {
    font: inherit;
    font-size: 0.76rem;
    cursor: pointer;
    padding: 5px 12px;
    border-radius: 999px;
    border: 1px solid #6a5330;
    background: rgba(40, 26, 14, 0.85);
    color: #e8c33c;
    white-space: nowrap;
  }
  .raise:hover:not(:disabled) {
    border-color: #e8c33c;
    background: rgba(60, 40, 18, 0.9);
  }
  .raise:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* ---- THE MONUMENTS: lives that sealed ---- */
  .monuments {
    position: relative;
    z-index: 2;
    margin: 30px auto 40px;
    padding: 0 20px;
    max-width: 900px;
  }
  .monuments h3 {
    margin: 0 0 4px;
    font-size: 0.74rem;
    letter-spacing: 0.24em;
    color: #8a7fa8;
  }
  .mlede {
    margin: 0 0 14px;
    font-size: 0.8rem;
    line-height: 1.5;
    color: #6d6485;
  }
  .mrows {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 10px;
  }
  .mon {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 11px 13px;
    border-radius: 8px;
    background: rgba(18, 13, 26, 0.75);
    border: 1px solid #2b2340;
  }
  .mname {
    font-weight: 700;
    color: #cfc6e4;
    font-size: 0.9rem;
  }
  .mdates {
    font-size: 0.72rem;
    color: #6d6485;
  }
  .mep {
    font-size: 0.78rem;
    font-style: italic;
    color: #9a8fb8;
  }
  .mheld {
    font-size: 0.72rem;
    color: #7d739a;
  }

  .yard {
    position: relative;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    /* Victorian night: deep violet-black, a red cast around the moon, and a
       faint scatter of stars high in the sky. */
    background:
      radial-gradient(1.5px 1.5px at 12% 6%, rgba(230, 220, 240, 0.5), transparent 100%),
      radial-gradient(1px 1px at 30% 12%, rgba(230, 220, 240, 0.4), transparent 100%),
      radial-gradient(1.5px 1.5px at 48% 4%, rgba(230, 220, 240, 0.35), transparent 100%),
      radial-gradient(1px 1px at 64% 9%, rgba(230, 220, 240, 0.45), transparent 100%),
      radial-gradient(900px 420px at 78% -6%, rgba(190, 30, 40, 0.28), transparent 60%),
      radial-gradient(circle at 50% 120%, #14101d 0%, transparent 60%),
      linear-gradient(180deg, #0c0812 0%, #120b18 45%, #0a0710 100%);
  }

  /* ---- The sky band: everything above ground lives here, in flow ---- */
  .sky {
    position: relative;
    height: 302px;
    min-height: 302px;
  }
  .horizon {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 104px;
    opacity: 0.95;
    pointer-events: none;
  }

  /* ---- Blood moon ---- */
  .moon {
    position: absolute;
    top: 34px;
    right: 8%;
    width: 130px;
    height: 130px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 38% 32%, #ff8d7a 0%, #e0453f 40%, #a01f26 75%, #6d1017 100%);
    box-shadow:
      0 0 60px 18px rgba(220, 60, 50, 0.35),
      0 0 140px 60px rgba(190, 40, 40, 0.15),
      inset -14px -12px 34px rgba(60, 6, 10, 0.7);
    z-index: 0;
  }
  .crater {
    position: absolute;
    border-radius: 50%;
    background: rgba(110, 20, 26, 0.55);
    box-shadow: inset 2px 2px 4px rgba(50, 5, 8, 0.8);
  }
  .crater.c1 { width: 26px; height: 26px; left: 24%; top: 52%; }
  .crater.c2 { width: 15px; height: 15px; left: 58%; top: 30%; }
  .crater.c3 { width: 11px; height: 11px; left: 66%; top: 62%; }
  .bats {
    position: absolute;
    top: 90px;
    right: 24%;
    font-size: 15px;
    filter: brightness(0.25);
    animation: flap 11s ease-in-out infinite;
    z-index: 0;
  }
  @keyframes flap {
    0%, 100% { transform: translate(0, 0); }
    30% { transform: translate(-70px, -16px); }
    60% { transform: translate(-140px, 8px); }
    80% { transform: translate(-60px, 22px); }
  }

  .tree {
    position: absolute;
    left: -12px;
    bottom: 24px;
    width: 175px;
    opacity: 0.95;
    pointer-events: none;
  }

  /* ---- Fog ---- */
  .fog {
    position: fixed;
    left: -20%;
    width: 140%;
    height: 180px;
    pointer-events: none;
    z-index: 3;
    background: radial-gradient(ellipse 60% 100% at 50% 100%, rgba(190, 180, 210, 0.09), transparent 70%);
    filter: blur(14px);
  }
  .fog.f1 { bottom: -30px; animation: drift-fog 26s ease-in-out infinite; }
  .fog.f2 { bottom: 40px; opacity: 0.6; animation: drift-fog 34s ease-in-out infinite reverse; }
  @keyframes drift-fog {
    0%, 100% { transform: translateX(-4%); }
    50% { transform: translateX(4%); }
  }

  /* ---- Content ---- */
  .content {
    position: relative;
    z-index: 1;
    max-width: 860px;
    margin: 0 auto;
    padding: 26px 24px 120px;
  }
  .head {
    position: absolute;
    left: 0;
    right: 0;
    top: clamp(48px, 9vh, 88px);
    text-align: center;
    padding: 0 24px;
  }
  .head h1 {
    margin: 0 0 8px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(30px, 5vw, 46px);
    letter-spacing: 0.12em;
    color: #cfc4d8;
    text-shadow: 0 0 24px rgba(190, 40, 40, 0.35), 0 2px 8px rgba(0, 0, 0, 0.8);
  }
  .head p {
    margin: 0;
    color: rgba(200, 188, 214, 0.55);
    font-style: italic;
    font-family: Georgia, serif;
    font-size: 0.95rem;
  }
  .note {
    text-align: center;
    color: #e0917a;
    font-size: 0.85rem;
    margin-bottom: 14px;
  }
  .state,
  .empty p {
    text-align: center;
    color: rgba(200, 188, 214, 0.5);
    font-style: italic;
    font-family: Georgia, serif;
  }
  .empty-stone {
    width: 90px;
    height: 110px;
    margin: 30px auto 16px;
    border-radius: 45px 45px 6px 6px;
    background: linear-gradient(165deg, #3a3542 0%, #262230 60%, #1b1824 100%);
    display: grid;
    place-items: center;
    color: rgba(200, 188, 214, 0.35);
    font-family: Georgia, serif;
    font-size: 2rem;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.6);
  }

  .rows {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 34px 26px;
    align-items: end;
  }

  /* ---- A plot: stone + mound + tributes ---- */
  .plot {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .stone {
    position: relative;
    width: 200px;
    min-height: 150px;
    padding: 18px 16px 20px;
    transform: rotate(var(--lean));
    background:
      radial-gradient(120% 60% at 50% 0%, rgba(255, 255, 255, 0.06), transparent 55%),
      repeating-linear-gradient(23deg, rgba(255, 255, 255, 0.015) 0 2px, transparent 2px 7px),
      linear-gradient(165deg, #46404f 0%, #322d3c 55%, #232030 100%);
    box-shadow:
      inset 0 2px 2px rgba(255, 255, 255, 0.08),
      inset 0 -8px 16px rgba(0, 0, 0, 0.45),
      0 14px 30px rgba(0, 0, 0, 0.65);
    display: grid;
    place-items: center;
  }
  .stone.arch { border-radius: 100px 100px 8px 8px; }
  .stone.slab { border-radius: 14px 14px 6px 6px; }
  .stone.obelisk {
    clip-path: polygon(50% 0%, 82% 14%, 82% 100%, 18% 100%, 18% 14%);
    border-radius: 0;
    min-height: 170px;
    /* The clip keeps only the middle 64% of the width — the engraving must
       live inside it, or long epitaphs are geometrically sliced (Josh, Aug
       2026: "the Epitaph text cuts off on the edges"). */
    padding: 34px 42px 20px;
  }
  /* …and inside the obelisk's narrow column, the inscription carves smaller
     rather than stacking the stone into a tower. */
  .stone.obelisk .epitaph {
    font-size: 0.72rem;
  }
  .stone.cross { border-radius: 10px 10px 6px 6px; margin-top: 34px; }
  /* ---- Emporium tombstone upgrades (class = item id) ---- */
  .stone.tomb-marble {
    background:
      radial-gradient(120% 60% at 50% 0%, rgba(255, 255, 255, 0.16), transparent 55%),
      repeating-linear-gradient(64deg, rgba(212, 175, 100, 0.12) 0 2px, transparent 2px 16px),
      linear-gradient(165deg, #d8d4cf 0%, #b8b2ac 55%, #948e88 100%);
    box-shadow:
      inset 0 2px 2px rgba(255, 255, 255, 0.4),
      inset 0 -8px 16px rgba(40, 36, 46, 0.35),
      0 14px 30px rgba(0, 0, 0, 0.65);
  }
  .stone.tomb-marble :global(.engraving),
  .stone.tomb-marble .engraving {
    color: #4c4650;
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
  }
  .stone.tomb-obsidian {
    background:
      radial-gradient(120% 60% at 50% 0%, rgba(255, 80, 70, 0.12), transparent 55%),
      linear-gradient(165deg, #17151d 0%, #0c0b12 60%, #060509 100%);
    box-shadow:
      inset 0 1px 1px rgba(255, 255, 255, 0.12),
      inset 0 0 22px rgba(190, 40, 40, 0.2),
      0 0 18px rgba(190, 40, 40, 0.25),
      0 14px 30px rgba(0, 0, 0, 0.7);
  }
  .stone.tomb-obsidian .engraving {
    color: #d99a92;
    text-shadow: 0 0 8px rgba(220, 80, 70, 0.4);
  }
  .stone.tomb-mausoleum {
    width: 230px;
    min-height: 185px;
    clip-path: polygon(0 22%, 50% 0, 100% 22%, 100% 100%, 0 100%);
    border-radius: 0;
    padding-top: 44px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.07), transparent 30%),
      repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.22) 0 2px, transparent 2px 26px),
      linear-gradient(165deg, #57506b 0%, #3b3549 60%, #29253a 100%);
  }
  .stone.tomb-cracked {
    transform: rotate(calc(var(--lean) + 3deg));
    background:
      linear-gradient(115deg, transparent 46%, rgba(8, 6, 12, 0.85) 47%, rgba(8, 6, 12, 0.85) 48.5%, transparent 49.5%),
      linear-gradient(28deg, transparent 62%, rgba(8, 6, 12, 0.7) 63%, rgba(8, 6, 12, 0.7) 64%, transparent 65%),
      radial-gradient(120% 60% at 50% 0%, rgba(255, 255, 255, 0.04), transparent 55%),
      linear-gradient(165deg, #3f3a46 0%, #2b2734 60%, #1e1b26 100%);
  }
  .stone.tomb-gilded {
    background:
      radial-gradient(120% 60% at 50% 0%, rgba(255, 220, 130, 0.12), transparent 55%),
      repeating-linear-gradient(64deg, rgba(234, 179, 72, 0.28) 0 1.5px, transparent 1.5px 21px),
      linear-gradient(165deg, #211d26 0%, #141118 60%, #0b0910 100%);
    box-shadow:
      inset 0 0 0 2px rgba(234, 179, 72, 0.4),
      0 0 16px rgba(234, 179, 72, 0.2),
      0 14px 30px rgba(0, 0, 0, 0.7);
  }
  .stone.tomb-gilded .engraving {
    color: #e8c87a;
    text-shadow: 0 0 8px rgba(234, 179, 72, 0.35);
  }
  .stone.tomb-monolith {
    width: 130px;
    min-height: 230px;
    border-radius: 2px;
    background: linear-gradient(172deg, #0c0c10 0%, #060608 55%, #020203 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.09),
      0 0 26px rgba(0, 0, 0, 0.9),
      0 14px 30px rgba(0, 0, 0, 0.8);
  }
  .stone.tomb-monolith .engraving {
    color: #6f6f7c;
  }
  .stone.tomb-iron {
    border-radius: 8px 8px 3px 3px;
    background:
      radial-gradient(4px 4px at 12% 12%, rgba(220, 225 ,235, 0.35) 40%, transparent 60%),
      radial-gradient(4px 4px at 88% 12%, rgba(220, 225, 235, 0.35) 40%, transparent 60%),
      radial-gradient(4px 4px at 12% 88%, rgba(220, 225, 235, 0.3) 40%, transparent 60%),
      radial-gradient(4px 4px at 88% 88%, rgba(220, 225, 235, 0.3) 40%, transparent 60%),
      radial-gradient(120% 50% at 55% 20%, rgba(150, 90, 40, 0.28), transparent 60%),
      linear-gradient(165deg, #3a3d44 0%, #24262c 55%, #16181c 100%);
    box-shadow:
      inset 0 0 0 3px rgba(120, 126, 138, 0.4),
      inset 0 2px 2px rgba(255, 255, 255, 0.14),
      0 14px 30px rgba(0, 0, 0, 0.7);
  }
  .stone.tomb-iron .engraving {
    color: #aeb4c0;
  }
  .stone.tomb-moss {
    background:
      radial-gradient(60% 30% at 25% 8%, rgba(90, 140, 70, 0.65), transparent 70%),
      radial-gradient(45% 24% at 80% 18%, rgba(70, 120, 60, 0.55), transparent 70%),
      radial-gradient(50% 20% at 50% 96%, rgba(80, 130, 65, 0.6), transparent 75%),
      linear-gradient(165deg, #4c5248 0%, #33382f 55%, #21251e 100%);
    box-shadow:
      inset 0 2px 2px rgba(200, 230, 180, 0.12),
      inset 0 -8px 16px rgba(20, 28, 16, 0.5),
      0 14px 30px rgba(0, 0, 0, 0.65);
  }
  .stone.tomb-moss .engraving {
    color: #b9c8a8;
  }
  .stone.tomb-crystal {
    /* The crystal's steep corner rounding leaves the top corners transparent —
       text needs to start below them or it reads as floating off the stone. */
    padding-top: 30px;
    padding-left: 24px;
    padding-right: 24px;
    border-radius: 42% 46% 6px 6px / 34% 38% 6px 6px;
    background:
      linear-gradient(155deg, rgba(240, 220, 255, 0.35) 0%, transparent 30%),
      linear-gradient(205deg, rgba(180, 120, 240, 0.4) 0%, transparent 40%),
      linear-gradient(165deg, #7a4bb0 0%, #4c2a78 55%, #2c1548 100%);
    box-shadow:
      inset 0 2px 3px rgba(255, 240, 255, 0.3),
      inset -6px 0 12px rgba(30, 10, 60, 0.5),
      0 0 18px 2px rgba(150, 90, 220, 0.35),
      0 14px 30px rgba(0, 0, 0, 0.65);
  }
  .stone.tomb-crystal .engraving {
    color: #e6d4ff;
  }
  .stone.tomb-rune {
    padding-top: 28px;
    padding-left: 22px;
    padding-right: 22px;
    border-radius: 46% 46% 10px 10px / 30% 30% 10px 10px;
    background:
      radial-gradient(3px 10px at 30% 34%, rgba(160, 200, 220, 0.5), transparent 70%),
      radial-gradient(3px 9px at 50% 30%, rgba(160, 200, 220, 0.45), transparent 70%),
      radial-gradient(3px 10px at 70% 35%, rgba(160, 200, 220, 0.5), transparent 70%),
      linear-gradient(165deg, #6d7268 0%, #4c5048 55%, #33362f 100%);
    box-shadow:
      inset 0 2px 2px rgba(230, 240, 235, 0.16),
      inset 0 -10px 18px rgba(20, 24, 18, 0.45),
      0 14px 30px rgba(0, 0, 0, 0.65);
  }
  .stone.tomb-rune .engraving {
    color: #c2d4cd;
  }
  .stone.tomb-neon {
    border-radius: 10px 10px 4px 4px;
    background:
      linear-gradient(165deg, #262030 0%, #171220 55%, #0c0a14 100%);
    box-shadow:
      inset 0 0 0 2px rgba(255, 100, 190, 0.65),
      inset 0 0 14px rgba(255, 100, 190, 0.28),
      0 0 20px 3px rgba(255, 100, 190, 0.35),
      0 14px 30px rgba(0, 0, 0, 0.7);
  }
  .stone.tomb-neon .engraving {
    color: #ff9ed4;
    text-shadow: 0 0 8px rgba(255, 110, 190, 0.6);
  }

  .cross-top {
    position: absolute;
    top: -34px;
    left: 50%;
    transform: translateX(-50%);
    width: 64px;
    height: 40px;
    background: linear-gradient(165deg, #46404f, #322d3c);
    clip-path: polygon(38% 0, 62% 0, 62% 35%, 100% 35%, 100% 65%, 62% 65%, 62% 100%, 38% 100%, 38% 65%, 0 65%, 0 35%, 38% 35%);
  }
  .engraving {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    text-align: center;
    font-family: Georgia, "Times New Roman", serif;
    color: #b6aec4;
    text-shadow: 0 -1px 0 rgba(0, 0, 0, 0.7), 0 1px 0 rgba(255, 255, 255, 0.06);
  }
  .rip {
    font-size: 0.66rem;
    letter-spacing: 0.42em;
    opacity: 0.6;
  }
  .dead-name {
    font-size: 1.12rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    overflow-wrap: anywhere;
  }
  .dates {
    font-size: 0.72rem;
    opacity: 0.7;
  }
  .epitaph {
    margin-top: 5px;
    font-style: italic;
    font-size: 0.78rem;
    line-height: 1.45;
    opacity: 0.85;
    overflow-wrap: anywhere;
  }
  .buried {
    margin-top: 4px;
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.45;
  }
  .mound {
    width: 230px;
    height: 26px;
    margin-top: -6px;
    border-radius: 50% 50% 8px 8px / 100% 100% 8px 8px;
    background: linear-gradient(180deg, #1d1626 0%, #120d1a 80%);
    box-shadow: inset 0 4px 8px rgba(0, 0, 0, 0.5);
  }

  /* ---- Respects ---- */
  .respects {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin-top: 10px;
    min-height: 30px;
  }
  .tribute {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: rgba(24, 18, 32, 0.85);
    border: 1px solid rgba(182, 174, 196, 0.22);
    border-radius: 999px;
    color: #b6aec4;
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
  }
  .tribute img {
    width: 17px;
    height: 17px;
    object-fit: contain;
  }
  .tribute .n {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .tribute:hover {
    border-color: rgba(220, 90, 80, 0.55);
  }
  .tribute.mine {
    border-color: rgba(220, 90, 80, 0.7);
    background: rgba(90, 26, 30, 0.45);
  }
  .tribute.add {
    font-size: 0.85rem;
    padding: 2px 9px;
  }
  .add-anchor {
    position: relative;
    display: inline-flex;
  }

  /* ---- Graveyard v2 ---- */
  .stonebtn {
    all: unset;
    cursor: pointer;
    display: block;
  }
  .stonebtn .stone {
    transition: transform 0.35s ease, box-shadow 0.35s ease;
  }
  .stonebtn:hover .stone {
    transform: rotate(var(--lean)) translateY(-3px);
    box-shadow:
      inset 0 2px 2px rgba(255, 255, 255, 0.08),
      inset 0 -8px 16px rgba(0, 0, 0, 0.45),
      0 0 18px rgba(190, 40, 40, 0.28),
      0 18px 34px rgba(0, 0, 0, 0.65);
  }
  .stonebtn:focus-visible .stone {
    outline: 1px solid rgba(220, 90, 80, 0.6);
  }
  .cause {
    font-size: 0.64rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #c96a5a;
    opacity: 0.85;
  }

  /* ---- The graveside: candles + flowers standing IN the earth ---- */
  .graveside {
    position: relative;
    z-index: 2;
    display: flex;
    gap: 4px;
    align-items: flex-end;
    justify-content: center;
    margin: 0 0 -17px; /* feet in the mound, not floating over it */
    min-height: 24px;
  }
  .candle {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    transform: translateX(var(--dx, 0px));
    width: 12px;
  }
  /* the halo: a soft warm pool of light that breathes */
  .candle::before {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -4px;
    width: 44px;
    height: 34px;
    margin-left: -22px;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(255, 176, 84, 0.34), rgba(255, 150, 60, 0.1) 60%, transparent);
    animation: halo 3.1s ease-in-out infinite;
    animation-delay: var(--fd, 0s);
    pointer-events: none;
  }
  .cwax {
    width: 7px;
    height: 13px;
    border-radius: 2.5px 2.5px 1.5px 1.5px;
    background: linear-gradient(180deg, #f2e7cf 0%, #d9c9a8 55%, #b3a382 100%);
    box-shadow:
      inset -1.5px 0 2px rgba(90, 70, 40, 0.5),
      0 1px 2px rgba(0, 0, 0, 0.6);
  }
  /* a drip down one side */
  .cwax::after {
    content: "";
    position: absolute;
    left: 2px;
    top: 12px;
    width: 2px;
    height: 5px;
    border-radius: 1px 1px 2px 2px;
    background: #e8dcc0;
  }
  .cflame {
    position: relative;
    width: 6px;
    height: 10px;
    margin-bottom: 1px;
    border-radius: 50% 50% 50% 50% / 62% 62% 38% 38%;
    background: radial-gradient(circle at 50% 72%, #fff4c8 0%, #ffca5e 45%, #ff8e2a 78%, rgba(255, 100, 30, 0) 100%);
    transform-origin: 50% 90%;
    animation: flick 0.9s ease-in-out infinite;
    animation-delay: var(--fd, 0s);
  }
  /* the blue heart of the flame */
  .cflame::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: 0.5px;
    width: 3px;
    height: 4px;
    margin-left: -1.5px;
    border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
    background: radial-gradient(circle at 50% 80%, rgba(120, 170, 255, 0.75), transparent 75%);
  }
  @keyframes flick {
    0%, 100% { transform: scaleY(1) translateX(0); opacity: 1; }
    26% { transform: scaleY(0.86) translateX(0.5px); opacity: 0.9; }
    52% { transform: scaleY(1.1) translateX(-0.5px); opacity: 1; }
    76% { transform: scaleY(0.93) translateX(0.3px); opacity: 0.94; }
  }
  @keyframes halo {
    0%, 100% { opacity: 0.85; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.12); }
  }
  .flowers {
    display: inline-block;
    font-size: 1rem;
    transform: translate(var(--dx, 0px), 3px) rotate(var(--rot, 0deg));
    text-shadow: 0 2px 3px rgba(0, 0, 0, 0.6);
  }
  .flowers.wilt {
    filter: saturate(0.3) brightness(0.8) sepia(0.25);
    transform: translate(var(--dx, 0px), 5px) rotate(calc(var(--rot, 0deg) + 10deg));
  }

  /* ---- A living sky: twinkle + embers on the night air ---- */
  .stars {
    position: absolute;
    inset: 0 0 40% 0;
    pointer-events: none;
    z-index: 0;
  }
  .stars.s1 {
    background:
      radial-gradient(1.6px 1.6px at 8% 30%, rgba(235, 225, 245, 0.8), transparent 100%),
      radial-gradient(1.2px 1.2px at 22% 64%, rgba(235, 225, 245, 0.7), transparent 100%),
      radial-gradient(1.4px 1.4px at 41% 22%, rgba(235, 225, 245, 0.75), transparent 100%),
      radial-gradient(1.1px 1.1px at 57% 48%, rgba(235, 225, 245, 0.6), transparent 100%),
      radial-gradient(1.5px 1.5px at 87% 58%, rgba(235, 225, 245, 0.7), transparent 100%);
    animation: twinkle 7s ease-in-out infinite;
  }
  .stars.s2 {
    background:
      radial-gradient(1.3px 1.3px at 15% 46%, rgba(235, 225, 245, 0.7), transparent 100%),
      radial-gradient(1.1px 1.1px at 33% 38%, rgba(235, 225, 245, 0.65), transparent 100%),
      radial-gradient(1.5px 1.5px at 50% 66%, rgba(235, 225, 245, 0.7), transparent 100%),
      radial-gradient(1.2px 1.2px at 68% 26%, rgba(235, 225, 245, 0.6), transparent 100%),
      radial-gradient(1.2px 1.2px at 94% 34%, rgba(235, 225, 245, 0.65), transparent 100%);
    animation: twinkle 9s ease-in-out infinite reverse;
  }
  @keyframes twinkle {
    0%, 100% { opacity: 0.35; }
    50% { opacity: 1; }
  }
  .ember {
    position: absolute;
    bottom: 30px;
    left: calc(8% + var(--i) * 13%);
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 168, 92, 0.9), rgba(220, 90, 40, 0.4) 70%, transparent);
    opacity: 0;
    animation: rise calc(9s + var(--i) * 2.3s) linear infinite;
    animation-delay: calc(var(--i) * -3.7s);
    pointer-events: none;
    z-index: 0;
  }
  @keyframes rise {
    0% { transform: translate(0, 0); opacity: 0; }
    12% { opacity: 0.85; }
    55% { opacity: 0.5; }
    100% { transform: translate(26px, -210px); opacity: 0; }
  }

  /* ---- THE OPEN GRAVE: a lantern-warm pool around a wake ---- */
  .plot {
    position: relative;
  }
  .plot.open::before {
    content: "";
    position: absolute;
    left: 50%;
    top: 8%;
    width: 300px;
    height: 260px;
    margin-left: -150px;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(255, 166, 74, 0.13), rgba(255, 150, 60, 0.05) 55%, transparent);
    animation: halo 4.4s ease-in-out infinite;
    pointer-events: none;
  }
  .plot.open .mound {
    background: linear-gradient(180deg, #221527 0%, #140c1b 80%);
    box-shadow:
      inset 0 4px 8px rgba(0, 0, 0, 0.7),
      inset 0 0 0 1px rgba(120, 80, 40, 0.25);
  }

  /* ---- The ground owns the plots: soil shadow + grass tufts ---- */
  .mound::before,
  .mound::after {
    content: "";
    position: absolute;
    bottom: 20px;
    width: 26px;
    height: 9px;
    background: #17241466;
    background: linear-gradient(180deg, #243020 0%, #141c11 100%);
    clip-path: polygon(0 100%, 12% 30%, 22% 100%, 34% 8%, 46% 100%, 58% 26%, 68% 100%, 80% 0%, 90% 100%, 100% 42%, 100% 100%);
    opacity: 0.85;
  }
  .mound { position: relative; overflow: visible; }
  .mound::before { left: -8px; transform: rotate(-4deg); }
  .mound::after { right: -8px; transform: rotate(4deg) scaleX(-1); }

  /* ---- The moon breathes, slowly ---- */
  .moon::after {
    content: "";
    position: absolute;
    inset: -46px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(230, 70, 55, 0.18), transparent 70%);
    animation: moonbreath 11s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes moonbreath {
    0%, 100% { opacity: 0.55; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.06); }
  }

  /* ---- Ornamental section headers ---- */
  .sect {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 0 10px !important;
  }
  .sectname {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 0.78rem;
    letter-spacing: 0.26em;
    color: #9b8fbc;
    white-space: nowrap;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  }
  .sect .rule {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(155, 143, 188, 0.4), transparent);
  }

  /* ---- The wake, dressed as a lantern notice ---- */
  .wake .left {
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid rgba(217, 154, 90, 0.35);
    background: rgba(40, 26, 14, 0.55);
  }

  /* ---- Monuments as stone tablets ---- */
  .mplot {
    background:
      radial-gradient(120% 40% at 50% 0%, rgba(255, 255, 255, 0.045), transparent 60%),
      repeating-linear-gradient(23deg, rgba(255, 255, 255, 0.012) 0 2px, transparent 2px 8px),
      linear-gradient(172deg, #241d33 0%, #17111f 70%, #120d1a 100%);
    border: 1px solid #322a49;
    border-radius: 10px 10px 7px 7px;
    box-shadow:
      inset 0 1px 1px rgba(255, 255, 255, 0.06),
      inset 0 -10px 18px rgba(0, 0, 0, 0.35),
      0 10px 22px rgba(0, 0, 0, 0.5);
    transition: transform 0.3s ease, border-color 0.3s ease;
  }
  .mplot:hover {
    border-color: #4b3f6a;
    transform: translateY(-2px);
  }
  .mfamily {
    font-family: Georgia, serif;
    text-align: center;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(155, 143, 188, 0.18);
  }
  .mplot .mname { font-family: Georgia, serif; }

  /* ---- The Necrology as a carved plaque ---- */
  .necrow {
    font-family: Georgia, serif;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 45%),
      rgba(18, 13, 26, 0.7);
    border: 1px solid #2a2140;
    box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.04), inset 0 -4px 8px rgba(0, 0, 0, 0.3);
  }
  .necrow span { font-style: italic; }
  .necrow b {
    color: #d9c9a0;
    text-shadow: 0 0 8px rgba(217, 176, 106, 0.2);
  }

  /* ---- Memorial ornaments ---- */
  .memrule {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #6a5d8c;
    font-size: 0.8rem;
    margin: 2px 0 8px;
  }
  .memrule span {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(155, 143, 188, 0.35), transparent);
  }
  .mempanel {
    background:
      radial-gradient(120% 30% at 50% 0%, rgba(255, 255, 255, 0.03), transparent 60%),
      repeating-linear-gradient(23deg, rgba(255, 255, 255, 0.008) 0 2px, transparent 2px 9px),
      linear-gradient(180deg, #181022 0%, #0f0a17 100%);
    border-top: 2px solid rgba(155, 143, 188, 0.35);
  }
  .memname {
    font-size: 1.35rem;
    letter-spacing: 0.08em;
    text-align: center;
  }
  .memstate { text-align: center; }
  .mempanel h4 {
    font-family: Georgia, serif;
    letter-spacing: 0.24em;
  }
  .eulogy {
    padding-left: 10px;
    border-left: 2px solid rgba(155, 143, 188, 0.25);
  }
  .tribute.buy {
    color: #d9b06a;
    border-color: rgba(217, 176, 106, 0.35);
  }
  .tribute.buy:hover:not(:disabled) {
    border-color: rgba(232, 195, 60, 0.7);
  }
  .tribute.buy:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Family plots */
  .mplot {
    all: unset;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 11px 13px;
    border-radius: 8px;
    background: rgba(18, 13, 26, 0.75);
    border: 1px solid #2b2340;
  }
  .mplot:hover {
    border-color: #4b3f6a;
  }
  .mplot .mon {
    padding: 0;
    border: 0;
    background: none;
  }
  .mplot .mon + .mon {
    border-top: 1px dashed #2b2340;
    padding-top: 8px;
  }
  .mfamily {
    font-size: 0.66rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #8a7fa8;
  }
  .mcause {
    font-weight: 400;
    font-size: 0.72rem;
    color: #c96a5a;
  }

  /* The Necrology */
  .necrology {
    position: relative;
    z-index: 2;
    margin: 34px auto 40px;
    padding: 0 20px;
    max-width: 900px;
  }
  .necrology h3 {
    margin: 0 0 12px;
    font-size: 0.74rem;
    letter-spacing: 0.24em;
    color: #8a7fa8;
  }
  .sign {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: max-content;
    margin: 0 auto 16px;
    padding: 10px 22px 12px;
    border-radius: 6px;
    background: linear-gradient(165deg, #3a3320 0%, #262112 70%);
    border: 2px solid #6a5330;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.6);
    font-family: Georgia, serif;
  }
  .signtop {
    font-size: 0.62rem;
    letter-spacing: 0.22em;
    color: #d9b06a;
  }
  .signnum {
    font-size: 2rem;
    font-weight: 700;
    color: #e8c33c;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 12px rgba(232, 195, 60, 0.35);
  }
  .necgrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 6px 18px;
  }
  .necrow {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 10px;
    border-radius: 6px;
    background: rgba(18, 13, 26, 0.6);
    border: 1px solid #241d36;
    font-size: 0.78rem;
    color: #9a8fb8;
  }
  .necrow b {
    color: #cfc6e4;
    font-variant-numeric: tabular-nums;
  }

  /* The Memorial panel */
  .memscrim {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: rgba(5, 3, 9, 0.72);
    display: grid;
    place-items: center;
    padding: 20px;
    backdrop-filter: blur(3px);
  }
  .mempanel {
    position: relative;
    width: min(560px, 100%);
    max-height: min(78dvh, 640px);
    overflow-y: auto;
    padding: 22px 24px 24px;
    border-radius: 12px;
    background: linear-gradient(180deg, #171021 0%, #0f0a17 100%);
    border: 1px solid #34294d;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8);
    color: #b6aec4;
  }
  .memclose {
    position: absolute;
    top: 10px;
    right: 12px;
    font: inherit;
    background: none;
    border: 0;
    color: #6d6485;
    cursor: pointer;
    font-size: 1rem;
  }
  .memclose:hover { color: #cfc6e4; }
  .memname {
    margin: 0 0 2px;
    font-family: Georgia, serif;
    letter-spacing: 0.06em;
    color: #cfc6e4;
  }
  .memstate {
    margin: 0 0 10px;
    font-size: 0.78rem;
    color: #c96a5a;
    font-style: italic;
  }
  .mempanel h4 {
    margin: 16px 0 6px;
    font-size: 0.66rem;
    letter-spacing: 0.22em;
    color: #8a7fa8;
  }
  .memload {
    font-style: italic;
    color: #6d6485;
    font-size: 0.82rem;
  }
  .memlife {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 9px 11px;
    border-radius: 8px;
    background: rgba(18, 13, 26, 0.6);
    border: 1px solid #241d36;
    margin-bottom: 6px;
  }
  .memlifename { font-weight: 700; color: #cfc6e4; font-size: 0.86rem; }
  .memdates { font-size: 0.72rem; color: #6d6485; }
  .memep { font-size: 0.78rem; font-style: italic; color: #9a8fb8; }
  .memkept {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.7rem;
    color: #7d739a;
  }
  .keptimg { width: 18px; height: 18px; object-fit: contain; }
  .memeulogies.carved {
    margin-top: 4px;
    padding-top: 6px;
    border-top: 1px dashed #2b2340;
  }
  .eulogy {
    margin: 4px 0;
    font-size: 0.8rem;
    line-height: 1.45;
    font-style: italic;
    color: #a99fc2;
    overflow-wrap: anywhere;
  }
  .eulby { font-style: normal; font-size: 0.72rem; color: #6d6485; }
  .euldel {
    font: inherit;
    font-size: 0.7rem;
    background: none;
    border: 0;
    color: #6d6485;
    cursor: pointer;
    padding: 0 4px;
  }
  .euldel:hover { color: #e0917a; }
  .memrev {
    margin: 3px 0;
    font-size: 0.8rem;
    color: #9a8fb8;
  }
  .memrevdate { font-size: 0.72rem; color: #6d6485; }
  .eulwrite {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    margin-top: 8px;
  }
  .eulwrite textarea {
    flex: 1;
    font: inherit;
    font-size: 16px;
    resize: vertical;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(10, 7, 16, 0.8);
    border: 1px solid #34294d;
    color: #cfc6e4;
  }
  .eulwrite textarea:focus {
    outline: none;
    border-color: #5a4a85;
  }
  .eulsave {
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid #6a5330;
    background: rgba(40, 26, 14, 0.85);
    color: #e8c33c;
    white-space: nowrap;
  }
  .eulsave:hover:not(:disabled) { border-color: #e8c33c; }
  .eulsave:disabled { opacity: 0.5; cursor: default; }

  @media (max-width: 700px) {
    .mempanel { padding: 18px 16px 20px; }
    .necgrid { grid-template-columns: 1fr; }
  }
  @media (max-width: 520px) {
    /* the blood moon steps back so the title owns the sky */
    .moon { width: 88px; height: 88px; top: 22px; right: 4%; }
    .bats { right: 32%; top: 74px; }
    /* …and the tree stops leaning over the inscription */
    .tree { left: -46px; width: 120px; opacity: 0.7; }
  }
</style>
