<script lang="ts">
  // NAA'SHENAI — the hall behind the stone, laid out like Solace on purpose
  // (PORTAL.md: "your own house, emptied"): rooms on the left, the room in
  // the middle, the roster on the right. No English in the chrome — the
  // first hour must explain nothing. Click a mark to claim its sound; click a
  // word to claim its meaning; shift-click a mark inside a word for the mark.
  import { onMount } from "svelte";
  import Glyph from "../../portal/Glyph.svelte";
  import GlyphText from "../../portal/GlyphText.svelte";
  import Survey from "./Survey.svelte";
  import Ishaal from "./Ishaal.svelte";
  import Bench from "./Bench.svelte";
  import VoiceRoom from "./VoiceRoom.svelte";
  import { STATUS_STROKES, COUNT_MARK } from "../../portal/status-strokes";
  import { relicImg } from "../../backrooms/reliccatalog";
  import { portal, loadPortal, openRoom, openProfile, openWall, openSurvey, openIshaal, openBench, openVoice, guessGlyph, guessNotation, guessWord, sendPost, react, NOTATION_BASE, type PortalPick } from "../../lib/portal.svelte";

  const SIGNS = ["ren", "ta'an", "ahel", "eeth", "sehu", "onn"];
  const SEP = { GAP: -1, SEAM: -2, CLITIC: -3, STOP: -4 };

  let claim = $state("");
  let reactFor = $state<string | null>(null);
  let pinOpen = $state(false);
  /** On a phone the rooms and the roster are drawers over the pane. */
  let drawer = $state<"rooms" | "roster" | null>(null);
  let scroller = $state<HTMLDivElement | null>(null);

  onMount(() => { void loadPortal(); });

  // Sounds only ever grow, so the union is always right — the room's copy goes stale while the survey is open.
  const sounds = $derived({ ...(portal.room?.sounds ?? {}), ...(portal.overview?.sounds ?? {}) });
  const lit = $derived((portal.overview?.cracked ?? 0) / (portal.overview?.glyphCount ?? 34));
  const keyboard = $derived(Object.keys(sounds).map(Number).sort((a, b) => (sounds[a] < sounds[b] ? -1 : 1)));
  const posts = $derived(portal.room ? portal.room.posts.slice(Math.max(0, portal.room.posts.length - portal.show)) : []);
  const rooms = $derived(portal.overview?.rooms ?? []);
  const currentRow = $derived(rooms.find((r) => r.id === portal.roomId));

  // Land at the newest post when a room opens.
  $effect(() => { void portal.room?.id; void portal.room?.posts.length; queueMicrotask(() => scroller?.scrollTo({ top: scroller.scrollHeight })); });

  function pickGlyph(id: number, e: MouseEvent) { claim = ""; portal.verdict = null; portal.left = null; portal.pick = { kind: "glyph", id, x: e.clientX, y: e.clientY }; }
  /** The glyph ids of one piece of one word, split exactly as GlyphText splits. */
  function pieceGlyphs(tokens: number[], word: number, piece: number): number[] {
    let w = 0, p = 0, has = false; const out: number[] = [];
    for (const t of tokens) {
      if (t >= 0) { if (w === word && p === piece) out.push(t); has = true; }
      else if (t === SEP.SEAM || t === SEP.CLITIC) { if (has) p++; }
      else { if (has) w++; p = 0; has = false; }
      if (w > word) break;
    }
    return out;
  }
  function pickWord(target: string, tokens: number[], glosses: (string | null)[], word: number, piece: number, e: MouseEvent) {
    claim = ""; portal.verdict = null; portal.left = null;
    portal.pick = { kind: "word", target, word, piece, gloss: glosses[word] ?? null, glyphs: pieceGlyphs(tokens, word, piece), x: e.clientX, y: e.clientY };
  }
  function submitClaim(p: PortalPick) {
    const v = claim.trim();
    if (!v) return;
    if (p.kind === "glyph") void guessGlyph(p.id, v); else void guessWord(p.target, p.word, p.piece, v);
  }
  function popStyle(p: PortalPick) {
    const x = Math.min(p.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 280);
    const y = Math.min(p.y + 14, (typeof window !== "undefined" ? window.innerHeight : 800) - 220);
    return `left:${Math.max(8, x)}px;top:${Math.max(8, y)}px`;
  }
  const typeKey = (t: number) => (portal.compose = [...portal.compose, t]);
</script>

<div class="hallbox">
<div class="hall" style="--lit:{lit}" onclick={(e) => { if (!(e.target as HTMLElement).closest(".pop, .g.click, .w")) portal.pick = null; }} role="presentation">
  <aside class="rooms" class:open={drawer === "rooms"} onclick={(e) => { if ((e.target as HTMLElement).closest(".room")) drawer = null; }} role="presentation">
    <div class="clock" title="">
      {#if portal.overview}<GlyphText tokens={portal.overview.now} {sounds} size={9} />{/if}
    </div>
    <button class="wallbtn" onclick={openWall} aria-label="▦">
      <span class="bar"><i style="width:{lit * 100}%"></i></span>
      <span class="grid">{#each Array(12) as _, i (i)}<b class:on={i < Math.round(lit * 12)}></b>{/each}</span>
    </button>
    <div class="instruments">
      <button class="room tool survey" class:on={portal.pane === "survey"} onclick={openSurvey} aria-label="◌">
        <span class="rn"><svg class="dish" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15a8 8 0 0 0 11 -11z" /><path d="M10 10l6 -6" /><circle cx="17" cy="3" r="1.3" /><path d="M8 17l-2 4h6l-2 -4" /></svg><span class="beats"><i></i><i></i><i></i></span></span>
      </button>
      <button class="room tool" class:on={portal.pane === "ishaal"} onclick={openIshaal} aria-label="◎">
        <svg class="ring" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="3" /><path d="M12 2v20M2 12h20" /><circle class="st" cx="12" cy="5.5" r="1.6" /><circle class="st b" cx="18.5" cy="12" r="1.6" /></svg>
      </button>
      <button class="room tool" class:on={portal.pane === "bench"} onclick={openBench} aria-label="◍">
        <svg class="fold" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" /></svg>
      </button>
    </div>
    {#each rooms as r (r.id)}
      <button class="room" class:on={r.kind === "voice" ? portal.pane === "voice" && portal.voiceRoom === r.id : portal.pane === "room" && r.id === portal.roomId}
        class:dead={r.kind === "voice"} class:opened={r.kind === "last" && r.open} onclick={() => (r.kind === "voice" ? openVoice(r.id) : openRoom(r.id))}>
        <span class="rn">
          {#if r.kind === "last"}<Glyph parts={COUNT_MARK} size={20} />
          {:else if r.name}<GlyphText tokens={r.name} {sounds} size={15} />{/if}
          {#if r.kind === "voice"}<span class="wave">∿</span>{/if}
        </span>
        {#if (r.kind === "text" && !portal.read.has(r.id)) || r.ghost}<span class="pip">{r.ghost ? "1" : "99+"}</span>{/if}
        {#if r.last}<span class="last"><GlyphText tokens={r.last.slice(0, 8)} {sounds} size={7} /></span>{/if}
      </button>
    {/each}
  </aside>

  <section class="pane">
    <div class="phonebar">
      <button class="rb" class:on={drawer === "rooms"} onclick={() => (drawer = drawer === "rooms" ? null : "rooms")} aria-label="rooms"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" /></svg></button>
      <span class="ph-lit"><i style="width:{lit * 100}%"></i></span>
      <button class:on={drawer === "roster"} onclick={() => (drawer = drawer === "roster" ? null : "roster")} aria-label="roster"><Glyph parts={STATUS_STROKES[1]} size={18} /></button>
    </div>
    {#if drawer}<div class="shade" onclick={() => (drawer = null)} role="presentation"></div>{/if}
    {#if portal.pane === "survey" && portal.survey}
      <Survey {sounds} />
    {:else if portal.pane === "ishaal"}
      <Ishaal {sounds} />
    {:else if portal.pane === "bench"}
      <Bench {sounds} />
    {:else if portal.pane === "voice" && portal.voiceRoom}
      <VoiceRoom room={portal.voiceRoom} name={rooms.find((r) => r.id === portal.voiceRoom)?.name ?? []} {sounds} />
    {:else}
    <header class="top">
      {#if currentRow?.kind === "last"}<Glyph parts={COUNT_MARK} size={24} />
      {:else if currentRow?.name}<GlyphText tokens={currentRow.name} {sounds} size={20} showSounds />{/if}
      {#if portal.room?.pinned?.length}<button class="pinbtn" class:on={pinOpen} onclick={() => (pinOpen = !pinOpen)}>◆</button>{/if}
    </header>

    {#if pinOpen && portal.room?.pinned?.length}
      <div class="pinned">
        {#each portal.room.pinned as pin (pin.key)}
          <div class="doc">
            <GlyphText tokens={pin.tokens} glosses={pin.glosses} {sounds} size={16} showSounds notation={portal.room.notation}
              onglyph={pickGlyph} onword={(w, p, e) => pickWord(pin.key, pin.tokens, pin.glosses, w, p, e)} />
            {#if pin.en}<p class="en">{pin.en}</p>{/if}
          </div>
        {/each}
      </div>
    {/if}

    <div class="scroll" bind:this={scroller}>
      {#if portal.room?.kind === "last" && portal.room.locked}
        <div class="sealed"><Glyph parts={COUNT_MARK} size={96} /></div>
      {:else if portal.room}
        {#if portal.room.posts.length > portal.show}
          <button class="more" onclick={() => (portal.show += 30)}>◇ ◇ ◇</button>
        {/if}
        {#each posts as p (p.key)}
          <article class="post" class:draft={p.draft} class:mine={p.mine} class:ghost={p.ghost} class:last={portal.room.kind === "last"}>
            <div class="meta">
              {#if p.sign !== undefined}<Glyph parts={STATUS_STROKES[p.sign]} lit size={18} />{/if}
              {#if p.author}<span class="who"><GlyphText tokens={p.author} {sounds} size={14} showSounds /></span>{/if}
              <span class="stamp"><GlyphText tokens={p.stamp} {sounds} size={8} /></span>
              {#if p.draft}<span class="draftmark"><Glyph parts={STATUS_STROKES[5]} size={12} /></span>{/if}
            </div>
            <div class="body">
              <GlyphText tokens={p.tokens} glosses={p.glosses} {sounds} size={19} showSounds notation={portal.room.notation}
                corrupt={portal.room.glitch?.key === p.key ? portal.room.glitch.word : null}
                onglyph={pickGlyph} onword={p.key.startsWith("l:") ? null : (w, pc, e) => pickWord(p.key, p.tokens, p.glosses, w, pc, e)} />
            </div>
            {#if p.en}<p class="en">{p.en}</p>{/if}
            {#if p.reacts && portal.room.kind !== "last"}
              <div class="reacts">
                {#each p.reacts as r (r.sign)}
                  <button class="rx" class:mine={r.mine} onclick={() => react(p.key, SIGNS[r.sign])}>
                    <GlyphText tokens={portal.overview?.signs[r.sign] ?? []} {sounds} size={11} /><span class="n">{r.n.toString(8)}</span>
                  </button>
                {/each}
                <button class="rx add" onclick={() => (reactFor = reactFor === p.key ? null : p.key)}>＋</button>
                {#if reactFor === p.key}
                  <span class="signs">
                    {#each SIGNS as s, i (s)}
                      <button class="rx" onclick={() => { reactFor = null; void react(p.key, s); }}><GlyphText tokens={portal.overview?.signs[i] ?? []} {sounds} size={11} /></button>
                    {/each}
                  </span>
                {/if}
              </div>
            {/if}
          </article>
        {/each}
      {/if}
    </div>

    {#if portal.room?.kind === "text"}
      <div class="composer">
        <div class="line">
          {#each portal.compose as t, i (i)}
            {#if t >= 0}<Glyph id={t} lit sound={sounds[t]} size={18} />
            {:else if t === SEP.GAP}<span class="sp"></span>
            {:else if t === SEP.SEAM}<span class="k">◆</span>
            {:else if t === SEP.CLITIC}<span class="k">‒</span>
            {:else}<span class="k">‖</span>{/if}
          {/each}
          <span class="caret"></span>
        </div>
        <div class="keys">
          {#each keyboard as g (g)}<button class="key" onclick={() => typeKey(g)}><Glyph id={g} lit sound={sounds[g]} size={16} /></button>{/each}
          <button class="key sym" onclick={() => typeKey(SEP.GAP)}>␣</button>
          <button class="key sym" onclick={() => typeKey(SEP.SEAM)}>◆</button>
          <button class="key sym" onclick={() => typeKey(SEP.CLITIC)}>‒</button>
          <button class="key sym" onclick={() => typeKey(SEP.STOP)}>‖</button>
          <button class="key sym" onclick={() => (portal.compose = portal.compose.slice(0, -1))}>⌫</button>
          <button class="key send" disabled={!portal.compose.length || portal.busy} onclick={sendPost}>➤</button>
        </div>
      </div>
    {/if}
    {/if}
  </section>

  <aside class="roster" class:open={drawer === "roster"}>
    {#each portal.roster as m (m.key)}
      <button class="member" class:you={m.you} onclick={() => openProfile(m.key)}>
        <span class="dot" class:online={m.online}></span>
        <span class="nm"><GlyphText tokens={m.name} {sounds} size={13} /></span>
        {#if m.mark === "ENTRY-X"}<Glyph parts={STATUS_STROKES[8]} size={12} />{/if}
      </button>
    {/each}
  </aside>

  {#if portal.pick}
    {@const p = portal.pick}
    <div class="pop" style={popStyle(p)}>
      {#if p.kind === "glyph" && p.id >= NOTATION_BASE}
        <!-- a notation mark: name the script glyph it stands for -->
        <div class="big"><Glyph id={p.id} size={54} /></div>
        <div class="choose">
          {#each Array(34) as _, g (g)}<Glyph id={g} lit={g in sounds} sound={sounds[g] ?? null} size={20} onclick={() => guessNotation(p.id - NOTATION_BASE, g)} />{/each}
        </div>
      {:else if p.kind === "glyph"}
        <div class="big"><Glyph id={p.id} lit={p.id in sounds} size={54} /></div>
        {#if p.id in sounds}<div class="snd">{sounds[p.id]}</div>
        {:else}
          <form onsubmit={(e) => { e.preventDefault(); submitClaim(p); }}>
            <input bind:value={claim} maxlength="2" autocomplete="off" spellcheck="false" />
            <button disabled={portal.busy}>?</button>
          </form>
        {/if}
      {:else}
        <div class="piece">{#each p.glyphs as g, i (i)}<Glyph id={g} lit={g in sounds} sound={sounds[g] ?? null} size={34} onclick={(e) => pickGlyph(g, e)} />{/each}</div>
        {#if p.gloss}<div class="gloss">{p.gloss}</div>
        {:else}
          <form onsubmit={(e) => { e.preventDefault(); submitClaim(p); }}>
            <input bind:value={claim} maxlength="60" autocomplete="off" spellcheck="false" />
            <button disabled={portal.busy}>?</button>
          </form>
        {/if}
      {/if}
      {#if portal.verdict !== null}<div class="verdict" class:right={portal.verdict}>{portal.verdict ? "◉" : "○"}</div>{/if}
      {#if portal.left !== null}<div class="tries">{#each Array(Math.max(0, portal.left)) as _, i (i)}<i></i>{/each}</div>{/if}
    </div>
  {/if}

  {#if portal.profile}
    {@const pr = portal.profile}
    <div class="scrim" onclick={() => (portal.profile = null)} role="presentation">
      <div class="card" onclick={(e) => e.stopPropagation()} role="presentation">
        <div class="head">
          <GlyphText tokens={pr.name} {sounds} size={24} showSounds />
          {#if pr.mark === "ENTRY-X"}<Glyph parts={STATUS_STROKES[8]} lit size={22} />{/if}
        </div>
        <div class="row"><Glyph parts={STATUS_STROKES[2]} size={14} /><GlyphText tokens={pr.keystone} {sounds} size={12} /></div>
        <div class="row"><Glyph parts={STATUS_STROKES[5]} size={14} /><GlyphText tokens={pr.joined} {sounds} size={9} /></div>
        <div class="row"><Glyph parts={STATUS_STROKES[3]} size={14} /><GlyphText tokens={pr.seen} {sounds} size={9} /></div>
        {#if pr.status}<div class="status"><GlyphText tokens={pr.status.tokens} glosses={pr.status.glosses} {sounds} size={15} showSounds />{#if pr.status.en}<p class="en">{pr.status.en}</p>{/if}</div>{/if}
        {#if pr.bio && pr.bio.tokens.length}
          <div class="bio">
            <GlyphText tokens={pr.bio.tokens} glosses={pr.bio.glosses} {sounds} size={17} showSounds onglyph={pickGlyph}
              onword={(w, pc, e) => pickWord(pr.key, pr.bio?.tokens ?? [], pr.bio?.glosses ?? [], w, pc, e)} />
            {#if pr.bio.en}<p class="en">{pr.bio.en}</p>{/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if portal.wall}
    <div class="scrim" onclick={() => (portal.wall = null)} role="presentation">
      <div class="card wall" onclick={(e) => e.stopPropagation()} role="presentation">
        {#each portal.wall as c (c.glyph)}
          <div class="cell" class:read={c.sound !== null}>
            <Glyph id={c.glyph} lit={c.sound !== null} sound={c.sound} size={30} />
            {#if c.sound !== null}
              <span class="src">
                {#if c.source === "stone"}<img src="/emoji/abyss/stone.png" alt="" draggable="false" />
                {:else if c.source === "relic" && c.relic && relicImg(c.relic)}<img src={relicImg(c.relic)} alt="" draggable="false" />
                {:else if c.source === "sterling"}<svg class="hat" viewBox="0 0 24 24" aria-hidden="true"><path class="crown" d="M7.5 2.5h9v8.5h-9z" /><path class="band" d="M7.5 8.5h9" /><path class="crown" d="M3 11h18" /><circle class="lens" cx="8.6" cy="16.5" r="3" /><circle class="lens" cx="15.4" cy="16.5" r="3" /><path class="crown" d="M11.6 16.5h0.8" /></svg>
                {:else if c.source === "survey"}<svg class="dish" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15a8 8 0 0 0 11 -11z" /><path d="M10 10l6 -6" /><circle cx="17" cy="3" r="1.3" /><path d="M8 17l-2 4h6l-2 -4" /></svg>
                {:else if c.source === "deduction"}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12 Q12 3 22 12 Q12 21 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                {/if}
              </span>
              {#if c.galaxy}<span class="by"><GlyphText tokens={c.galaxy} {sounds} size={8} /></span>{/if}
              {#if c.who}<span class="by"><GlyphText tokens={c.who} {sounds} size={9} /></span>{/if}
            {/if}
          </div>
        {/each}
        {#if portal.notation}
          <div class="nrule"></div>
          {#each portal.notation as c (c.mark)}
            <div class="cell nota" class:read={c.glyph !== null}>
              <Glyph id={NOTATION_BASE + c.mark} size={26} />
              {#if c.glyph !== null}
                <Glyph id={c.glyph} lit={c.glyph in sounds} sound={sounds[c.glyph] ?? null} size={18} />
                {#if c.who}<span class="by"><GlyphText tokens={c.who} {sounds} size={9} /></span>{/if}
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}

  {#if portal.flash !== null}<div class="flash"><Glyph parts={STATUS_STROKES[portal.flash]} lit size={110} /></div>{/if}
</div>
</div>

<style>
  .hall {
    --p-bg: #07060d;
    --p-panel: #0d0b17;
    --p-line: #1d1a2c;
    --p-dim: color-mix(in srgb, #4a4560 calc(100% - var(--lit) * 60%), #9b93c4);
    --p-lit: #c9ecff;
    --p-snd: #8fd3ff;
    position: relative;
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr) 220px;
    height: 100%;
    background: radial-gradient(120% 90% at 50% 0%, rgba(80, 50, 140, calc(0.10 + var(--lit) * 0.12)), transparent 60%), var(--p-bg);
    color: #b9b2d6;
    overflow: hidden;
    user-select: none;
  }
  .rooms, .roster { background: var(--p-panel); border-right: 1px solid var(--p-line); overflow-y: auto; overscroll-behavior: contain; padding: 10px 8px; }
  .roster { border-right: 0; border-left: 1px solid var(--p-line); }
  .clock { padding: 4px 6px 10px; opacity: 0.6; overflow: hidden; }
  .room { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 2px 6px; width: 100%; padding: 6px 8px; margin: 1px 0; border: 0; border-radius: 6px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
  .room:hover { background: rgba(140, 110, 220, 0.08); }
  .room.on { background: rgba(140, 110, 220, 0.16); }
  .room.dead { opacity: 0.55; }
  .rn { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; }
  .wave { color: var(--p-dim); }
  .pip { font: 600 10px/1 system-ui; padding: 2px 5px; border-radius: 8px; background: #3b2a6b; color: #d9ccff; }
  .last { grid-column: 1 / -1; opacity: 0.5; overflow: hidden; }
  .pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .top { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--p-line); min-height: 52px; }
  .pinbtn { margin-left: auto; border: 0; background: transparent; color: var(--p-dim); font-size: 16px; cursor: pointer; }
  .pinbtn.on { color: var(--p-lit); }
  .pinned { max-height: 40%; overflow-y: auto; padding: 10px 18px; border-bottom: 1px solid var(--p-line); background: rgba(20, 16, 34, 0.6); }
  .doc + .doc { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--p-line); }
  .scroll { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 12px 18px 18px; }
  .more { display: block; margin: 0 auto 10px; border: 0; background: transparent; color: var(--p-dim); letter-spacing: 6px; cursor: pointer; }
  .post { padding: 8px 6px 10px; border-radius: 6px; }
  .post:hover { background: rgba(120, 100, 200, 0.04); }
  .post.draft { opacity: 0.7; border-left: 2px solid #3b2a6b; padding-left: 10px; }
  .post.mine .who :global(.g) { --p-lit: #e8d6ff; }
  .meta { display: flex; align-items: center; gap: 10px; margin-bottom: 2px; }
  .stamp { opacity: 0.45; }
  .draftmark { opacity: 0.6; }
  .body { padding-left: 2px; }
  .en { margin: 6px 0 0; font: italic 15px/1.5 Georgia, "Times New Roman", serif; color: #d8d2ee; white-space: pre-wrap; user-select: text; }
  .reacts { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 4px; }
  .rx { display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px; border: 1px solid var(--p-line); border-radius: 10px; background: rgba(30, 24, 52, 0.6); color: inherit; cursor: pointer; }
  .rx.mine { border-color: #6b55b8; }
  .rx .n { font: 10px/1 ui-monospace, monospace; color: var(--p-dim); }
  .rx.add { opacity: 0; transition: opacity 0.15s; font-size: 11px; }
  .post:hover .rx.add { opacity: 0.7; }
  .signs { display: inline-flex; gap: 3px; }
  .sealed { display: grid; place-items: center; height: 100%; min-height: 240px; opacity: 0.35; }
  .composer { border-top: 1px solid var(--p-line); padding: 8px 14px 10px; background: var(--p-panel); }
  .line { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; min-height: 30px; padding: 4px 8px; border-radius: 6px; background: #05040a; }
  .line .sp { width: 10px; }
  .line .k { color: var(--p-dim); font-size: 11px; }
  .caret { width: 1px; height: 18px; background: var(--p-lit); animation: blink 1s steps(2) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .keys { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .key { display: inline-grid; place-items: center; min-width: 30px; min-height: 34px; padding: 2px 4px; border: 1px solid var(--p-line); border-radius: 6px; background: #120f20; color: inherit; cursor: pointer; }
  .key.sym { color: var(--p-dim); font-size: 13px; }
  .key.send { color: var(--p-lit); }
  .key:disabled { opacity: 0.35; cursor: default; }
  .member { display: flex; align-items: center; gap: 6px; width: 100%; padding: 4px 6px; border: 0; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; text-align: left; }
  .member:hover { background: rgba(140, 110, 220, 0.08); }
  .member.you { background: rgba(140, 110, 220, 0.12); }
  .nm { flex: 1; min-width: 0; overflow: hidden; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #2a2640; flex: none; }
  .dot.online { background: #67e0b0; box-shadow: 0 0 6px #67e0b0; }
  .pop { position: fixed; z-index: 30; width: 260px; padding: 12px; border: 1px solid #3b2a6b; border-radius: 10px; background: #0e0b1a; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6); }
  .big { display: grid; place-items: center; padding: 4px 0 8px; }
  .piece { display: flex; justify-content: center; flex-wrap: wrap; gap: 4px; padding: 2px 0 10px; }
  .snd, .gloss { text-align: center; font: 600 18px/1.3 ui-monospace, monospace; color: var(--p-snd); }
  .gloss { font: italic 16px/1.4 Georgia, serif; color: #d8d2ee; }
  form { display: flex; gap: 6px; }
  input { flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid var(--p-line); border-radius: 6px; background: #05040a; color: #e6e0ff; font: 15px ui-monospace, monospace; }
  form button { padding: 0 12px; border: 1px solid #3b2a6b; border-radius: 6px; background: #1a1430; color: #d9ccff; cursor: pointer; }
  .verdict { text-align: center; margin-top: 8px; font-size: 18px; color: #6b5f8e; }
  .verdict.right { color: #8fd3ff; }
  .tries { display: flex; justify-content: center; gap: 4px; margin-top: 6px; }
  .tries i { width: 6px; height: 6px; border-radius: 50%; background: #6b55b8; }
  .scrim { position: absolute; inset: 0; z-index: 25; display: grid; place-items: center; background: rgba(3, 2, 8, 0.72); }
  .card { width: min(520px, 92%); max-height: 80%; overflow-y: auto; padding: 18px 20px; border: 1px solid #2c2448; border-radius: 12px; background: #0c0a16; }
  .head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  .row { display: flex; align-items: center; gap: 8px; opacity: 0.75; margin: 2px 0; }
  .status, .bio { margin-top: 12px; }
  .wallbtn { display: grid; gap: 4px; width: 100%; margin: 0 0 10px; padding: 6px 8px; border: 1px solid var(--p-line); border-radius: 6px; background: #0a0814; cursor: pointer; }
  .wallbtn:hover { border-color: #3b2a6b; }
  .wallbtn .bar { display: block; height: 3px; border-radius: 2px; background: #1a1630; overflow: hidden; }
  .wallbtn .bar i { display: block; height: 100%; background: linear-gradient(90deg, #6b55b8, #8fd3ff); }
  .wallbtn .grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 3px; }
  .wallbtn .grid b { height: 5px; border-radius: 1px; background: #1d1a2c; }
  .wallbtn .grid b.on { background: #8fd3ff; box-shadow: 0 0 4px rgba(143, 211, 255, 0.6); }
  .card.wall { width: min(760px, 94%); display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 8px; }
  .cell { display: grid; justify-items: center; align-content: start; gap: 4px; min-height: 96px; padding: 8px 4px; border: 1px solid var(--p-line); border-radius: 8px; background: #08070f; }
  .cell.read { border-color: #2e2652; background: radial-gradient(closest-side, rgba(110, 160, 255, 0.08), transparent), #0b0916; }
  .src { display: grid; place-items: center; width: 22px; height: 22px; }
  .src img { width: 22px; height: 22px; object-fit: contain; }
  .src svg { width: 18px; height: 18px; fill: none; stroke: #8f86b8; stroke-width: 1.6; }
  .src svg.hat { width: 20px; height: 20px; }
  .src svg.hat .crown, .src svg.hat .band { stroke: #c8894f; stroke-width: 1.8; }
  .src svg.hat .band { stroke: #e2b07c; }
  .src svg.hat .lens { stroke: #6fe4f0; stroke-width: 1.6; fill: rgba(111, 228, 240, 0.18); }
  .by { max-width: 100%; overflow: hidden; opacity: 0.8; }
  .src svg.dish { stroke: #8fd3ff; }
  .instruments { display: flex; gap: 4px; margin-bottom: 8px; }
  .room.tool { display: grid; place-items: center; grid-template-columns: 1fr; padding: 6px 4px; border: 1px solid var(--p-line); }
  .room.tool svg.ring, .room.tool svg.fold { width: 18px; height: 18px; fill: none; stroke: #b49cff; stroke-width: 1.4; }
  .room.tool svg.ring .st { fill: #cfd8ff; stroke: none; }
  .room.tool svg.ring .st.b { fill: #8a6bd8; }
  .room.opened { color: #e8dcff; }
  .post.ghost { background: linear-gradient(90deg, rgba(143, 211, 255, 0.07), transparent 60%); }
  .post.last .body { filter: drop-shadow(0 0 6px rgba(160, 130, 255, 0.25)); }
  .choose { display: grid; grid-template-columns: repeat(9, 1fr); gap: 3px; justify-items: center; }
  .nrule { grid-column: 1 / -1; height: 1px; margin: 6px 0; background: var(--p-line); }
  .cell.nota { min-height: 80px; }
  .room.survey svg.dish { width: 18px; height: 18px; fill: none; stroke: #8fd3ff; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .beats { display: inline-flex; gap: 3px; align-items: center; }
  .beats i { width: 4px; height: 4px; border-radius: 50%; background: #8fd3ff; opacity: 0.25; animation: pulse 1.56s infinite; }
  .beats i:nth-child(2) { animation-delay: 0.26s; }
  .beats i:nth-child(3) { animation-delay: 0.78s; }
  @keyframes pulse { 0%, 30% { opacity: 0.9; } 31%, 100% { opacity: 0.2; } }
  .flash { position: absolute; inset: 0; z-index: 40; display: grid; place-items: center; pointer-events: none; animation: fade 1.4s ease-out forwards; }
  @keyframes fade { from { opacity: 0.9; } to { opacity: 0; } }
  .hallbox { height: 100%; container-type: inline-size; }
  .phonebar, .shade { display: none; }
  /* Not room for three columns: the roster slides over the pane from the right. */
  @container (max-width: 1040px) {
    .hall { grid-template-columns: 200px minmax(0, 1fr); }
    .roster { position: absolute; top: 0; bottom: 0; right: 0; z-index: 20; width: min(78%, 280px); transform: translateX(102%); transition: transform 0.2s ease; }
    .roster.open { transform: none; box-shadow: 0 0 40px rgba(0, 0, 0, 0.6); }
    .phonebar { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-bottom: 1px solid var(--p-line); background: var(--p-panel); }
    .phonebar .rb { display: none; }
    .phonebar button { display: grid; place-items: center; width: 40px; height: 36px; border: 1px solid var(--p-line); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
    .phonebar button.on { border-color: #3b2a6b; background: rgba(140, 110, 220, 0.16); }
    .phonebar svg { width: 20px; height: 20px; fill: none; stroke: #b9b2d6; stroke-width: 1.8; stroke-linecap: round; }
    .ph-lit { flex: 1; height: 3px; border-radius: 2px; background: #1a1630; overflow: hidden; }
    .ph-lit i { display: block; height: 100%; background: linear-gradient(90deg, #6b55b8, #8fd3ff); }
    .shade { display: block; position: absolute; inset: 0; z-index: 15; background: rgba(3, 2, 8, 0.5); }
  }
  /* THE PHONE (or any narrow hall): the pane is everything; rooms slide in from the left too. */
  @container (max-width: 700px) {
    .hall { grid-template-columns: minmax(0, 1fr); }
    .rooms { position: absolute; top: 0; bottom: 0; left: 0; z-index: 20; width: min(78%, 280px); transform: translateX(-102%); transition: transform 0.2s ease; }
    .rooms.open { transform: none; box-shadow: 0 0 40px rgba(0, 0, 0, 0.6); }
    .phonebar .rb { display: grid; }
    .scroll { padding: 10px 12px 14px; }
  }
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .phonebar button { width: 44px; height: 44px; }
    .key { min-width: 44px; min-height: 44px; }
    .pop { width: min(300px, calc(100vw - 16px)); }
  }
</style>
