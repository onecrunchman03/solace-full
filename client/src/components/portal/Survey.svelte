<script lang="ts">
  // THE SURVEY — the Yulenai outer survey's mirror in the hall (games.md, "1.
  // The survey"). The sky of Ilumaar: six galaxies and, past the edge, the
  // Near Dark. Point it at a galaxy and its pulsars beat; match each beat to
  // the catalogue, whose periods are octal NUMERAL glyphs nobody can read at
  // first. Matching a whole galaxy reads one numeral for everyone. The
  // timeline scrubs the survey's window: the galaxies never change (their
  // light is far slower than the window). Once all six are charted, the fold
  // weather can be laid over the sky. No English, anywhere.
  import { onDestroy } from "svelte";
  import Glyph from "../../portal/Glyph.svelte";
  import GlyphText from "../../portal/GlyphText.svelte";
  import { portal, chartGalaxy } from "../../lib/portal.svelte";
  import { sfxContext, sfxOut } from "../../lib/sfx";
  import type { PortalSurveyGalaxy } from "../../lib/api";

  const W = 1000, H = 600;
  const TICK_MS = 260;
  const STRIP = 48;
  const COLORS = ["#8fd3ff", "#f0a86b", "#9be08a", "#e48ad8", "#f2e27a", "#b49bff"];

  let { sounds = {} }: { sounds?: Record<number, string> } = $props();

  const s = $derived(portal.survey);
  let pick = $state<string | null>(null); // a galaxy id, or "dark"
  let sel = $state<string | null>(null); // a source id
  let pairs = $state<Record<string, Record<string, string>>>({}); // galaxy → source → entry
  let listen = $state<string | null>(null);
  let gain = $state(0.7);
  let scrub = $state(0);
  let overlay = $state(false);
  let verdict = $state<"right" | "wrong" | null>(null);
  let tick = $state(0);

  const galaxy = $derived(s?.galaxies.find((g) => g.id === pick) ?? null);
  const mine = $derived(galaxy ? (galaxy.match ?? pairs[galaxy.id] ?? {}) : {});
  const full = $derived(!!galaxy && galaxy.sources.every((src) => mine[src.id]));
  const turn = $derived(s ? (scrub >= s.turns.length - 1 ? s.window : scrub) : 0);
  const center = (g: { x: number; y: number }) => ({ cx: g.x * W, cy: g.y * H });

  // A fixed starfield (a hash, so it never shimmers between renders).
  const stars = Array.from({ length: 220 }, (_, i) => {
    const h = (n: number) => { const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x); };
    return { x: h(1) * W, y: h(2) * H, r: 0.4 + h(3) * 1.1, o: 0.15 + h(4) * 0.5 };
  });
  const noise = (row: number, i: number, t: number) => { const x = Math.sin(row * 91.3 + i * 17.7 + t * 3.1) * 9137.13; return x - Math.floor(x); };

  // One clock for every lamp.
  let raf = 0;
  const loop = () => {
    const t = Math.floor(performance.now() / TICK_MS);
    if (t !== tick) { tick = t; beat(t); }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  onDestroy(() => cancelAnimationFrame(raf));

  const on = (period: number, phase: number, i: number) => period > 0 && ((i - phase) % period + period) % period === 0;
  /** Play the listened source's beat. */
  function beat(t: number) {
    if (!listen || !galaxy) return;
    const src = galaxy.sources.find((x) => x.id === listen);
    if (!src || !on(src.period, src.phase, t % STRIP)) return;
    const c = sfxContext(), out = sfxOut();
    if (!c || !out) return;
    const f = 220 * Math.pow(2, (24 - src.period) / 12);
    const click = (at: number) => {
      const o = c.createOscillator(), gn = c.createGain();
      o.type = "sine"; o.frequency.value = f;
      gn.gain.setValueAtTime(0, at); gn.gain.linearRampToValueAtTime(0.16 * gain, at + 0.005); gn.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      o.connect(gn).connect(out); o.start(at); o.stop(at + 0.1);
    };
    click(c.currentTime);
    if (src.kind === "hiccup") click(c.currentTime + 0.07);
  }

  function choose(id: string) { pick = id; sel = null; listen = null; verdict = null; }
  function pickSource(id: string) { sel = id; }
  function pickEntry(g: PortalSurveyGalaxy, eid: string) {
    if (g.charted) return;
    const cur = { ...(pairs[g.id] ?? {}) };
    const holder = Object.keys(cur).find((k) => cur[k] === eid);
    if (!sel) { if (holder) delete cur[holder]; pairs = { ...pairs, [g.id]: cur }; return; }
    if (holder) delete cur[holder];
    cur[sel] = eid;
    pairs = { ...pairs, [g.id]: cur };
    sel = g.sources.find((x) => !cur[x.id])?.id ?? null;
  }
  async function submit() {
    if (!galaxy || !full) return;
    const r = await chartGalaxy(galaxy.id, mine);
    verdict = r === true ? "right" : r === false ? "wrong" : null;
    if (r === false) setTimeout(() => (verdict = null), 900);
  }
  const colorOf = (g: PortalSurveyGalaxy, sid: string) => COLORS[g.sources.findIndex((x) => x.id === sid) % COLORS.length];
  const holderOf = (eid: string) => Object.keys(mine).find((k) => mine[k] === eid) ?? null;

  /** How much of a link is left at a turn: whole before it starts, gone after. */
  const left = (from: number, to: number) => (turn <= from ? 1 : turn >= to ? 0 : 1 - (turn - from) / (to - from));
  const knot = $derived(s?.weather ? Math.max(0, Math.min(1, (turn - s.weather.knot.from) / (s.weather.knot.to - s.weather.knot.from))) : 0);
</script>

{#if s}
  <div class="survey">
    <div class="sky">
      <svg viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <radialGradient id="sv-core"><stop offset="0" stop-color="#fff6e0" stop-opacity="0.95" /><stop offset="0.35" stop-color="#bba8ff" stop-opacity="0.45" /><stop offset="1" stop-color="#3a2a70" stop-opacity="0" /></radialGradient>
          <radialGradient id="sv-dark"><stop offset="0" stop-color="#000" stop-opacity="0.9" /><stop offset="1" stop-color="#000" stop-opacity="0" /></radialGradient>
        </defs>
        {#each stars as st, i (i)}<circle cx={st.x} cy={st.y} r={st.r} fill="#cfd6ff" opacity={st.o} />{/each}

        <!-- the Near Dark, past the cluster's edge -->
        <path class="edge" d="M 905 0 Q 870 300 905 600" />
        <rect class="dark" class:on={pick === "dark"} x="905" y="0" width="95" height="600" onclick={() => choose("dark")} role="presentation" />

        {#if overlay && s.weather}
          {@const th = s.galaxies.find((g) => g.id === s.weather?.knot.galaxy)}
          {#each s.weather.links as l (l.a)}
            {@const a = s.galaxies.find((g) => g.id === l.a)!}
            {@const b = s.galaxies.find((g) => g.id === l.b)!}
            {@const k = left(l.from, l.to)}
            <line class="link" x1={center(a).cx} y1={center(a).cy} x2={center(b).cx} y2={center(b).cy}
              stroke-width={1 + k * 9} opacity={0.12 + k * 0.6} stroke-dasharray={k === 0 ? "3 9" : "none"} />
          {/each}
          {#if th && knot > 0}<circle class="knot" cx={center(th).cx} cy={center(th).cy} r={th.r * W * (0.6 + knot * 0.9)} opacity={0.2 + knot * 0.6} />{/if}
        {/if}

        {#each s.galaxies as g (g.id)}
          {@const c = center(g)}
          <g class="gal" class:on={pick === g.id} class:charted={g.charted} transform="translate({c.cx} {c.cy})" onclick={() => choose(g.id)} role="presentation">
            <g transform="rotate({g.tilt})">
              <ellipse rx={g.r * W} ry={g.r * W * 0.42} class="halo" />
              <ellipse rx={g.r * W * 0.7} ry={g.r * W * 0.28} class="arm" />
              <ellipse rx={g.r * W * 0.42} ry={g.r * W * 0.17} class="arm" />
              <ellipse rx={g.r * W * 0.5} ry={g.r * W * 0.5} fill="url(#sv-core)" />
            </g>
            {#each g.sources as src (src.id)}
              {@const p = on(src.period, src.phase, tick % STRIP)}
              <circle cx={(src.x - 0.5) * g.r * W * 1.4} cy={(src.y - 0.5) * g.r * W * 0.7} r={p ? 2.6 : 1.2} class="psr" class:beat={p} />
            {/each}
            {#if g.charted}<circle r={g.r * W * 1.12} class="ring" />{/if}
            <foreignObject x="-90" y={g.r * W * 0.62} width="180" height="34">
              <div class="nmw"><button class="nm" class:on={pick === g.id} onclick={(e) => { e.stopPropagation(); choose(g.id); }}><GlyphText tokens={g.name} {sounds} size={11} /></button></div>
            </foreignObject>
          </g>
        {/each}
      </svg>
    </div>

    <div class="scrub">
      <input type="range" min="0" max={s.turns.length - 1} step="1" bind:value={scrub} aria-label="◷" />
      <span class="stamp"><GlyphText tokens={s.turns[scrub] ?? []} {sounds} size={8} /></span>
      {#if s.weather}<button class="ov" class:on={overlay} onclick={() => (overlay = !overlay)} aria-label="≋">≋</button>{/if}
      <label class="gain" aria-label="◐"><span>◐</span><input type="range" min="0.1" max="1" step="0.05" bind:value={gain} /></label>
    </div>

    <div class="inst">
      {#if pick === "dark"}
        <div class="rows">
          {#each Array(5) as _, r (r)}
            <div class="row">
              <span class="lamp"></span>
              <span class="strip">{#each Array(STRIP) as _, i (i)}<i style="opacity:{0.06 + noise(r, i, tick) * 0.22 * gain}"></i>{/each}</span>
            </div>
          {/each}
        </div>
      {:else if galaxy}
        <header class="ih">
          <GlyphText tokens={galaxy.name} {sounds} size={16} showSounds />
          {#if galaxy.charted}<span class="done">◉</span>
          {:else}
            <span class="tries">{#each Array(s.left) as _, i (i)}<i></i>{/each}</span>
            <button class="go" class:right={verdict === "right"} class:wrong={verdict === "wrong"} disabled={!full || portal.busy || s.left === 0} onclick={submit} aria-label="◎">◎</button>
          {/if}
        </header>
        <div class="split">
          <div class="rows">
            {#each galaxy.sources as src, si (src.id)}
              {@const cur = tick % STRIP}
              <div class="row" class:sel={sel === src.id} class:paired={!!mine[src.id]} style="--c:{COLORS[si % COLORS.length]}">
                <button class="lamp" class:beat={on(src.period, src.phase, cur)} class:listen={listen === src.id} style="opacity:{0.35 + gain * 0.65}"
                  onclick={() => (listen = listen === src.id ? null : src.id)} aria-label="∿"></button>
                <button class="strip" onclick={() => pickSource(src.id)} aria-label="▤">
                  {#each Array(STRIP) as _, i (i)}
                    <i class:p={on(src.period, src.phase, i)} class:stutter={src.kind === "hiccup" && on(src.period, src.phase, i)} class:cur={i === cur}></i>
                  {/each}
                </button>
                <span class="sw"></span>
              </div>
            {/each}
          </div>
          <div class="cat">
            {#each galaxy.catalogue as e (e.id)}
              {@const h = holderOf(e.id)}
              <button class="entry" class:held={!!h} style={h ? `--c:${colorOf(galaxy, h)}` : ""} onclick={() => pickEntry(galaxy, e.id)}>
                <span class="sw"></span>
                {#if e.period}{#each e.period as gl, i (i)}<Glyph id={gl} lit={gl in sounds} sound={sounds[gl] ?? null} size={22} />{/each}{/if}
                {#if e.mark === "pause"}<svg class="mk" viewBox="0 0 20 20"><path d="M7 4v12M13 4v12" /></svg>{/if}
                {#if e.mark === "stutter"}<svg class="mk" viewBox="0 0 20 20"><path d="M1 14h4l2-9 2 9 1.5-6 1.5 6h7" /></svg>{/if}
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <div class="idle"></div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .survey { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(220px, 1fr) auto minmax(0, auto); flex: 1; min-height: 0; min-width: 0; background: #030208; container-type: inline-size; }
  .sky { position: relative; min-height: 0; min-width: 0; overflow: hidden; }
  .sky svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .edge { fill: none; stroke: #2a2440; stroke-width: 1.5; stroke-dasharray: 4 8; }
  .dark { fill: url(#sv-dark); cursor: pointer; opacity: 0.9; }
  .dark:hover, .dark.on { fill: rgba(60, 40, 120, 0.12); }
  .gal { cursor: pointer; }
  .halo { fill: rgba(120, 100, 220, 0.07); stroke: rgba(150, 130, 240, 0.18); stroke-width: 1; }
  .arm { fill: none; stroke: rgba(190, 175, 255, 0.28); stroke-width: 1.2; }
  .gal:hover .halo, .gal.on .halo { fill: rgba(140, 120, 240, 0.14); stroke: rgba(180, 160, 255, 0.45); }
  .gal.charted .arm { stroke: rgba(143, 211, 255, 0.5); }
  .psr { fill: #cfe2ff; opacity: 0.55; }
  .psr.beat { fill: #ffffff; opacity: 1; }
  .ring { fill: none; stroke: #8fd3ff; stroke-width: 1.2; opacity: 0.55; stroke-dasharray: 2 5; }
  .link { stroke: #6fd0ff; stroke-linecap: round; }
  .knot { fill: none; stroke: #b17aff; stroke-width: 2; stroke-dasharray: 1 6; }
  .nmw { display: flex; justify-content: center; }
  .nm { padding: 1px 4px; border: 0; border-radius: 4px; background: rgba(5, 4, 12, 0.6); color: inherit; cursor: pointer; opacity: 0.7; }
  .nm.on, .nm:hover { opacity: 1; }
  .scrub { display: flex; align-items: center; gap: 12px; padding: 6px 14px; border-top: 1px solid var(--p-line); border-bottom: 1px solid var(--p-line); background: var(--p-panel); }
  .scrub > input { flex: 1; min-width: 120px; accent-color: #8a72e0; }
  .stamp { opacity: 0.6; white-space: nowrap; overflow: hidden; max-width: 46%; }
  /* A narrow pane: the stamp gets its own line, whole. */
  @container (max-width: 560px) {
    .scrub { flex-wrap: wrap; row-gap: 4px; }
    .stamp { order: 3; flex-basis: 100%; max-width: 100%; }
  }
  .ov { border: 1px solid var(--p-line); border-radius: 6px; background: #0a0814; color: var(--p-dim); font-size: 16px; padding: 0 8px; cursor: pointer; }
  .ov.on { color: #6fd0ff; border-color: #2c5a72; }
  .gain { display: flex; align-items: center; gap: 4px; color: var(--p-dim); }
  .gain input { width: 70px; accent-color: #8a72e0; }
  .inst { min-height: 0; max-height: 46vh; overflow-y: auto; overscroll-behavior: contain; padding: 10px 14px 14px; }
  .ih { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .done { color: #8fd3ff; margin-left: auto; font-size: 18px; }
  .tries { display: flex; gap: 4px; margin-left: auto; }
  .tries i { width: 6px; height: 6px; border-radius: 50%; background: #6b55b8; }
  .go { min-width: 40px; min-height: 30px; border: 1px solid #3b2a6b; border-radius: 6px; background: #1a1430; color: #d9ccff; font-size: 16px; cursor: pointer; }
  .go:disabled { opacity: 0.35; cursor: default; }
  .go.right { border-color: #8fd3ff; color: #8fd3ff; }
  .go.wrong { animation: shake 0.4s; border-color: #a04a6a; }
  @keyframes shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
  .split { display: grid; grid-template-columns: minmax(0, 1fr) 190px; gap: 16px; align-items: start; }
  .rows { display: grid; gap: 6px; }
  .row { display: flex; align-items: center; gap: 8px; padding: 3px 6px; border-radius: 6px; border: 1px solid transparent; }
  .row.sel { border-color: var(--c); background: rgba(120, 100, 200, 0.06); }
  .lamp { flex: none; width: 14px; height: 14px; padding: 0; border-radius: 50%; border: 1px solid #2c2448; background: #120f20; cursor: pointer; }
  .lamp.beat { background: var(--c, #cfe2ff); box-shadow: 0 0 10px var(--c, #cfe2ff); }
  .lamp.listen { outline: 1px dashed var(--c); outline-offset: 2px; }
  .strip { display: grid; grid-template-columns: repeat(48, 1fr); gap: 2px; flex: 1; min-width: 0; padding: 0; border: 0; background: transparent; cursor: pointer; }
  .strip i { display: block; height: 14px; border-radius: 2px; background: #6a5f9a; opacity: 0.18; }
  .strip i.p { background: var(--c, #cfe2ff); opacity: 0.9; }
  .strip i.stutter { background: linear-gradient(90deg, var(--c) 0 38%, transparent 38% 62%, var(--c) 62%); }
  .strip i.cur { outline: 1px solid rgba(255, 255, 255, 0.55); }
  .sw { flex: none; width: 10px; height: 10px; border-radius: 3px; background: transparent; border: 1px solid #2c2448; }
  .row.paired .sw { background: var(--c); border-color: var(--c); }
  .cat { display: grid; gap: 6px; }
  .entry { display: flex; align-items: center; gap: 4px; min-height: 40px; padding: 4px 10px; border: 1px solid var(--p-line); border-radius: 8px; background: #08070f; color: inherit; cursor: pointer; }
  .entry:hover { border-color: #3b2a6b; }
  .entry.held { border-color: var(--c); }
  .entry.held .sw { background: var(--c); border-color: var(--c); }
  .mk { width: 22px; height: 22px; fill: none; stroke: var(--p-lit); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .idle { min-height: 60px; }
</style>
