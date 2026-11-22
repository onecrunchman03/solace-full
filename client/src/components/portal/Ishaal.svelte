<script lang="ts">
  // ISHAAL, the ring game (games.ts; the rules are src/portal/ishaal-rules.ts,
  // pinned in shenai — learning them is reading). Three tables: the game the
  // hall kept, stopped at Paelu's move; the hall's old players; and boards
  // between the living. No English: whose move it is shows as a stone.
  import Glyph from "../../portal/Glyph.svelte";
  import GlyphText from "../../portal/GlyphText.svelte";
  import { STATUS_STROKES } from "../../portal/status-strokes";
  import { portal, ishaalDo } from "../../lib/portal.svelte";
  import { replay, moves, sideToMove, verdict, RINGS, SPOKES, type Move, type Side, type Stone } from "../../../../src/portal/ishaal-rules";

  let { sounds }: { sounds: Record<number, string> } = $props();

  type Tab = "kept" | "old" | "live";
  let tab = $state<Tab>("kept");
  let liveId = $state<number | null>(null);
  let picked = $state<number | null>(null);
  let scrub = $state<number | null>(null);

  const g = $derived(portal.ishaal);
  const live = $derived(g?.live.find((x) => x.id === liveId) ?? null);

  /** The board in front of the reader, the side they move, and whether it is their move now. */
  const table = $derived.by((): { list: Move[]; you: Side | null; can: boolean; done: string | null } | null => {
    if (!g) return null;
    if (tab === "kept") {
      const base = g.recorded.moves.slice(0, scrub ?? g.recorded.moves.length);
      if (g.recorded.mine && scrub === null) return { list: [...base, g.recorded.mine], you: null, can: false, done: null };
      return { list: base, you: scrub === null ? "even" : null, can: scrub === null && !g.recorded.mine, done: null };
    }
    if (tab === "old") {
      if (!g.bot) return null;
      return { list: g.bot.moves, you: g.bot.you, can: !g.bot.done && sideToMove(g.bot.moves.length) === g.bot.you, done: g.bot.done };
    }
    if (!live) return null;
    const v = live.status === "done" ? live.winner ?? "none" : null;
    return { list: live.moves, you: live.you, can: live.status === "live" && !!live.you && sideToMove(live.moves.length) === live.you, done: v };
  });
  const stones = $derived(table ? replay(table.list) ?? [] : []);
  const toMove = $derived(table ? sideToMove(table.list.length) : "odd");
  const legal = $derived(table?.can ? moves(stones as Stone[], toMove) : []);
  const targets = $derived(picked === null ? [] : legal.filter((m) => m.stone.n === picked));
  const outcome = $derived(table?.done ?? (table ? verdict(stones as Stone[], table.list.length) : null));

  // Geometry: ring 1 (the edge) outermost, ring 8 (the long ring) at the middle.
  const C = 200;
  const R = (ring: number) => 26 + (RINGS - ring) * 22;
  const pt = (ring: number, spoke: number) => {
    const a = (spoke / SPOKES) * Math.PI * 2 - Math.PI / 2;
    return { x: C + Math.cos(a) * R(ring), y: C + Math.sin(a) * R(ring) };
  };

  function clickStone(st: Stone) {
    if (!table?.can || st.side !== toMove) return;
    picked = picked === st.n ? null : st.n;
  }
  async function moveTo(ring: number, spoke: number) {
    if (picked === null) return;
    const move = { n: picked, ring, spoke };
    picked = null;
    if (tab === "kept") await ishaalDo("paelu", { move });
    else if (tab === "old") await ishaalDo("move", { move });
    else if (live) await ishaalDo("play", { id: live.id, move });
  }
  function setTab(t: Tab) { tab = t; picked = null; scrub = null; }
</script>

{#if g}
  <div class="ish">
    <header>
      <button class:on={tab === "kept"} onclick={() => setTab("kept")} aria-label="◫"><Glyph parts={STATUS_STROKES[5]} size={18} /></button>
      <button class:on={tab === "old"} onclick={() => setTab("old")} aria-label="◎"><Glyph parts={STATUS_STROKES[1]} size={18} /></button>
      <button class:on={tab === "live"} onclick={() => setTab("live")} aria-label="◉"><Glyph parts={STATUS_STROKES[2]} size={18} /></button>
    </header>

    <div class="body">
      <div class="side">
        {#if tab === "kept"}
          <div class="pair">
            <span class="who odd"><i></i><GlyphText tokens={g.recorded.names.odd} {sounds} size={12} /></span>
            <span class="who even"><i></i><GlyphText tokens={g.recorded.names.even} {sounds} size={12} /></span>
            <span class="who even then"><i></i><GlyphText tokens={g.recorded.names.paelu} {sounds} size={12} /></span>
          </div>
          <input class="scrub" type="range" min="0" max={g.recorded.ply} value={scrub ?? g.recorded.ply}
            oninput={(e) => { const v = +(e.currentTarget as HTMLInputElement).value; scrub = v >= g.recorded.ply ? null : v; picked = null; }} />
          {#if g.recorded.mine && scrub === null}
            <!-- your move is filed; the other side never answers -->
            <div class="waiting"><span class="who odd"><i></i><GlyphText tokens={g.recorded.names.odd} {sounds} size={12} /></span><span class="dots"><b></b><b></b><b></b></span></div>
          {/if}
        {:else if tab === "old"}
          {#each g.opponents as o (o.id)}
            <button class="opp" class:beaten={o.beaten} class:on={g.bot?.opp === o.id} onclick={() => ishaalDo("start", { opp: o.id })}>
              <i class={o.side}></i><GlyphText tokens={o.name} {sounds} size={13} />
              {#if o.beaten}<Glyph parts={STATUS_STROKES[7]} lit size={14} />{/if}
            </button>
          {/each}
          {#if g.bot}<button class="leave" onclick={() => ishaalDo("leave")} aria-label="✕">✕</button>{/if}
        {:else}
          <button class="opp new" onclick={async () => { const r = await ishaalDo("open"); if (r?.id) liveId = r.id; }} aria-label="+">＋</button>
          {#each g.live as l (l.id)}
            <button class="opp" class:on={l.id === liveId} onclick={() => { liveId = l.id; picked = null; }}>
              <span class="who odd"><i></i>{#if l.odd}<GlyphText tokens={l.odd} {sounds} size={11} />{:else}<span class="empty"></span>{/if}</span>
              <span class="who even"><i></i>{#if l.even}<GlyphText tokens={l.even} {sounds} size={11} />{/if}</span>
              {#if l.status === "done"}<Glyph parts={STATUS_STROKES[5]} size={12} />{/if}
            </button>
          {/each}
          {#if live}
            {#if live.status === "open" && !live.you}<button class="act" onclick={() => ishaalDo("join", { id: live.id })} aria-label="◉">◉</button>{/if}
            {#if live.status !== "done" && live.you}<button class="leave" onclick={() => ishaalDo("resign", { id: live.id })} aria-label="✕">✕</button>{/if}
          {/if}
        {/if}
      </div>

      <div class="boardwrap">
        {#if table}
          <svg class="board" viewBox="0 0 400 400" role="presentation">
            {#each Array(RINGS) as _, i (i)}
              <circle class="ringline" class:long={i + 1 === RINGS} cx={C} cy={C} r={R(i + 1)} />
            {/each}
            {#each Array(SPOKES) as _, s (s)}
              {@const a = pt(1, s)}{@const b = pt(RINGS, s)}
              <line class="spoke" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            {/each}
            {#each targets as t (t.ring * 8 + t.spoke)}
              {@const p = pt(t.ring, t.spoke)}
              <circle class="target" class:takes={t.takes.length > 0} cx={p.x} cy={p.y} r="8" onclick={() => moveTo(t.ring, t.spoke)} role="presentation" />
            {/each}
            {#each stones.filter((x) => !x.taken) as st (st.side + st.n)}
              {@const p = pt(st.ring, st.spoke)}
              <circle class="stone {st.side}" class:picked={picked === st.n && st.side === toMove} class:mover={table.can && st.side === toMove}
                cx={p.x} cy={p.y} r="10" onclick={() => clickStone(st as Stone)} role="presentation" />
            {/each}
          </svg>
          <div class="state">
            {#if outcome}
              <span class="turn {outcome === 'none' ? '' : outcome}"><i></i></span><Glyph parts={STATUS_STROKES[outcome === table.you ? 7 : outcome === "none" ? 6 : 8]} lit size={20} />
            {:else}
              <span class="turn {toMove}" class:yours={table.can}><i></i></span>
            {/if}
          </div>
        {:else}
          <div class="empty-board"><svg viewBox="0 0 400 400"><circle class="ringline" cx="200" cy="200" r="180" /><circle class="ringline long" cx="200" cy="200" r="26" /></svg></div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .ish { display: flex; flex-direction: column; flex: 1; min-height: 0; container-type: inline-size; }
  header { display: flex; gap: 6px; padding: 10px 16px; border-bottom: 1px solid var(--p-line); }
  header button { display: grid; place-items: center; width: 40px; height: 34px; border: 1px solid var(--p-line); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
  header button.on { background: rgba(140, 110, 220, 0.16); border-color: #3b2a6b; }
  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 200px minmax(0, 1fr); }
  .side { padding: 12px; border-right: 1px solid var(--p-line); overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
  .pair { display: grid; gap: 6px; }
  .who { display: flex; align-items: center; gap: 6px; }
  .who i, .opp > i, .turn i { width: 12px; height: 12px; border-radius: 50%; flex: none; }
  .who.odd i, .opp > i.odd, .turn.odd i { background: #8a6bd8; }
  .who.even i, .opp > i.even, .turn.even i { background: #cfd8ff; }
  .who.then { opacity: 0.6; padding-left: 10px; }
  .scrub { width: 100%; accent-color: #8a6bd8; margin-top: 8px; }
  .waiting { display: flex; align-items: center; gap: 8px; margin-top: 10px; opacity: 0.8; }
  .dots { display: inline-flex; gap: 4px; }
  .dots b { width: 5px; height: 5px; border-radius: 50%; background: #8a6bd8; animation: wait 2.4s infinite; opacity: 0.2; }
  .dots b:nth-child(2) { animation-delay: 0.8s; }
  .dots b:nth-child(3) { animation-delay: 1.6s; }
  @keyframes wait { 0%, 100% { opacity: 0.15; } 40% { opacity: 0.8; } }
  .opp { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border: 1px solid var(--p-line); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; text-align: left; flex-wrap: wrap; }
  .opp.on { background: rgba(140, 110, 220, 0.14); border-color: #3b2a6b; }
  .opp.beaten { border-color: #2e5b6b; }
  .opp.new { justify-content: center; font-size: 16px; color: var(--p-dim); }
  .empty { display: inline-block; width: 30px; height: 1px; background: var(--p-line); }
  .leave, .act { align-self: flex-start; min-width: 40px; height: 32px; border: 1px solid var(--p-line); border-radius: 6px; background: transparent; color: var(--p-dim); cursor: pointer; }
  .act { color: var(--p-lit); }
  .boardwrap { display: grid; place-items: center; padding: 12px; min-height: 0; position: relative; }
  .board, .empty-board svg { width: min(100%, 520px); height: auto; max-height: 100%; aspect-ratio: 1; }
  .ringline { fill: none; stroke: #2a2445; stroke-width: 1.2; }
  .ringline.long { stroke: #5a4a96; stroke-width: 2; }
  .spoke { stroke: #2a2445; stroke-width: 1.2; }
  .stone { stroke: #05040a; stroke-width: 2; transition: cx 0.25s, cy 0.25s; }
  .stone.even { fill: #cfd8ff; }
  .stone.odd { fill: #8a6bd8; }
  .stone.mover { cursor: pointer; }
  .stone.mover:hover { stroke: #8fd3ff; }
  .stone.picked { stroke: #8fd3ff; stroke-width: 3; }
  .target { fill: rgba(143, 211, 255, 0.15); stroke: #8fd3ff; stroke-width: 1; stroke-dasharray: 2 2; cursor: pointer; }
  .target.takes { stroke: #ff9b8f; fill: rgba(255, 155, 143, 0.15); }
  .state { position: absolute; top: 14px; right: 18px; display: flex; align-items: center; gap: 8px; }
  .turn i { display: block; width: 16px; height: 16px; }
  .turn.yours i { box-shadow: 0 0 0 3px rgba(143, 211, 255, 0.4); animation: yours 1.6s infinite; }
  @keyframes yours { 50% { box-shadow: 0 0 0 6px rgba(143, 211, 255, 0.1); } }
  /* A narrow pane (a phone, or the hall with its roster open): the tables over the board. */
  @container (max-width: 680px) {
    .body { grid-template-columns: 1fr; grid-template-rows: max-content minmax(0, 1fr); }
    .side { border-right: 0; border-bottom: 1px solid var(--p-line); flex-direction: row; flex-wrap: wrap; align-items: center; overflow: visible; }
    .boardwrap { overflow: hidden; }
    .opp { width: auto; }
    .pair { display: flex; flex-wrap: wrap; gap: 10px; }
    .scrub { flex-basis: 100%; }
  }
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    header button, .leave, .act { min-width: 44px; min-height: 44px; }
    .opp { min-height: 44px; }
  }
</style>
