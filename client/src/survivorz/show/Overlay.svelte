<script lang="ts">
  // SOLACE SURVIVORZ: THE BUNKER — THE BROADCAST GRAPHICS (BUNKER.md, step 4). There's no narrator, so the screen
  // says it: the hour's countdown and the four goals (the count of the dead inside the clear), the corner bug and
  // the minimap (survivors, the blast door, the radio, the armory — never a zombie), the cast cards (health, what
  // they're doing, the BITTEN mark, kills, thought, goal), a banner as each goal is done, the in-memoriam card with
  // how and where, the followed survivor's pockets, and the cards that take the whole screen: the countdown before
  // a show, the title as the clock starts, "Technical difficulties", the end, and the recap.
  //
  // HTML over the canvas, theme-independent (a broadcast looks the same in every theme), sized in container
  // units so it reads at 1080p and still fits the admin panel's smaller stage. Everything comes from
  // DirectorRun.broadcast(), read on this component's own 4 Hz timer — never from the frame loop. (The names over
  // heads are show/tags.ts, positioned every frame outside Svelte.)
  import { onDestroy, onMount } from "svelte";
  import type { Broadcast, DirectorRun } from "./direct";
  import { MAP_ID, ROOMS as SITE_ROOMS, SITE_9, brandInPlay, placeOf, zoneBox } from "./site";

  // `pick` makes the cast strip a picker: a card follows that survivor, the same card again hands back
  let { run, pick, picked = "" }: { run: DirectorRun | null; pick?: (id: string | null) => void; picked?: string } = $props();
  let b = $state<Broadcast | null>(null);
  let timer = 0;
  /** the map in play (show/site.ts useMap): the minimap and the titles are its own */
  let mapId = $state(MAP_ID);

  onMount(() => {
    const read = () => { if (MAP_ID !== mapId) mapId = MAP_ID; if (run) b = run.broadcast(); };
    read();
    timer = window.setInterval(read, 250);
  });
  onDestroy(() => window.clearInterval(timer));

  // ---- THE MINIMAP: the bunker's rooms as they stand, drawn once ----
  type Mini = { vb: { x: number; y: number; w: number; h: number }; rects: { id: string; x: number; y: number; w: number; h: number; hall: boolean }[]; polys: { id: string; pts: string; hall: boolean }[]; marks: { key: string; x: number; z: number; label: string; goal?: string }[]; brand: string; title: string; sub: string; house: boolean };
  const mini: Mini = $derived.by(() => {
    const brand = brandInPlay();
    if (mapId === "bunker") {
      const box = zoneBox("bunker"), PAD = 2;
      const centreOf = (id: string): [number, number] | null => {
        const r = SITE_9.rooms.find((x) => x.id === id);
        return r ? [r.rect.x + r.rect.w / 2, r.rect.y + r.rect.h / 2] : null;
      };
      const blast = placeOf("blast")?.centre;
      return {
        vb: { x: box.min[0] - PAD, y: box.min[2] - PAD, w: box.max[0] - box.min[0] + PAD * 2, h: box.max[2] - box.min[2] + PAD * 2 },
        rects: SITE_9.rooms.map((r) => ({ id: r.id, ...r.rect, hall: r.kind === "corridor" })), polys: [],
        marks: [
          ...(blast ? [{ key: "door", x: blast[0], z: blast[2], label: "DOOR" }] : []),
          ...[["radio", "RADIO"], ["armory", "ARMORY"]].flatMap(([id, label]) => { const c = centreOf(id); return c ? [{ key: id, x: c[0], z: c[1], label }] : []; }),
        ],
        ...brand, house: false,
      };
    }
    // A HOUSE: its ground floor, room by room to its outline, and a margin of the grounds round it
    const ground = SITE_ROOMS.filter((r) => !r.outdoor && r.floor === 1 && r.poly);
    // (framed on the house itself: an outbuilding far down the drive — the garage — is drawn but doesn't set the
    // scale, or the house is a thumbnail. A body out at the gate sits on the frame's edge.)
    const main = ground.filter((r) => r.id !== "garage");
    const xs = main.flatMap((r) => [r.x0, r.x1]), zs = main.flatMap((r) => [r.z0, r.z1]), PAD = 9;
    const x0 = Math.min(...xs) - PAD, x1 = Math.max(...xs) + PAD, z0 = Math.min(...zs) - PAD, z1 = Math.max(...zs) + PAD;
    const front = placeOf("front-door")?.centre;
    return {
      vb: { x: x0, y: z0, w: x1 - x0, h: z1 - z0 }, rects: [],
      polys: ground.map((r) => ({ id: r.id, pts: r.poly!.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" "), hall: r.room.kind === "corridor" })),
      marks: [
        ...(front ? [{ key: "door", x: front[0], z: front[2], label: "DOOR", goal: "bolt" }] : []),
      ],
      ...brand, house: true,
    };
  });
  const clampX = (x: number) => Math.max(mini.vb.x + 1.4, Math.min(mini.vb.x + mini.vb.w - 1.4, x));
  const clampZ = (z: number) => Math.max(mini.vb.y + 1.4, Math.min(mini.vb.y + mini.vb.h - 1.4, z));
  const markOn = (m: Mini["marks"][number]): boolean => {
    const g = b?.goals;
    if (!g) return false;
    if (m.goal) return !!g.rows?.find((r) => r.id === m.goal)?.done;
    return m.key === "door" ? !!g.door.sealed : m.key === "radio" ? !!g.radio.called : false;
  };
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  /** the last ten minutes of the hour go red */
  const lowClock = (r: string | null) => { if (!r) return false; const [h, m] = r.split(":").map(Number); return h === 0 && m < 10; };
</script>

{#if b}
  <div class="ov">
    {#if !(b.recapCard || b.end || b.countdown !== null)}
    <div class="bug"><span class="live">● LIVE</span><span class="brand">SOLACE SURVIVORZ: <b>{mini.brand}</b></span></div>

    {#if b.goals}
      <!-- THE CHECKLIST + THE CLOCK (BUNKER.md: the zombie count inside, and the hour counting down) -->
      <div class="obj">
        <div class="clk"><span class="t" class:low={!b.goals.over && lowClock(b.remaining)}>{b.remaining}</span><span class="l">{b.goals.over ? "OVER" : "LEFT"}</span></div>
        {#each b.objectives as o (o.key)}
          <div class="o" class:done={o.done}>
            <span class="box">{o.done ? "✓" : ""}</span>
            <span class="lab">{o.label}</span>
            {#if o.detail}<span class="det" class:count={o.key === "clear" && !o.done}>{o.detail}</span>{/if}
          </div>
        {/each}
      </div>
    {/if}

    <!-- THE MINIMAP: survivors, the blast door, the radio, the armory; the dead never -->
    <svg class="map" viewBox={`${mini.vb.x} ${mini.vb.y} ${mini.vb.w} ${mini.vb.h}`} preserveAspectRatio="xMidYMid meet">
      {#each mini.rects as r (r.id)}<rect x={r.x} y={r.y} width={r.w} height={r.h} class:hall={r.hall} />{/each}
      {#each mini.polys as r (r.id)}<polygon points={r.pts} class:hall={r.hall} />{/each}
      {#each mini.marks as m (m.key)}
        <g class={`mk ${m.key}`} class:on={markOn(m)}>
          <rect x={m.x - 1.1} y={m.z - 1.1} width="2.2" height="2.2" rx="0.4" /><text x={m.x} y={m.z - 1.8}>{m.label}</text>
        </g>
      {/each}
      {#each b.map as d (d.who)}
        {#if d.dead}<text class="x" x={clampX(d.x)} y={clampZ(d.z) + 0.7}>×</text>{:else}<circle cx={clampX(d.x)} cy={clampZ(d.z)} r="1.25" fill={d.colour} />{/if}
      {/each}
    </svg>
    {/if}

    {#if b.recap}
      {#key b.recap.key}
        <div class="recap"><div class="rh">{b.recap.title}</div><div class="rb">{b.recap.text}</div></div>
      {/key}
    {/if}

    {#if b.banner}
      {#key b.banner.key}
        <div class="ban"><div class="bt">{b.banner.title}</div>{#if b.banner.sub}<div class="bs">{b.banner.sub}</div>{/if}</div>
      {/key}
    {/if}

    {#if b.card}
      {#key b.card.who}
        <div class="third">
          <div class="bar"></div>
          <div class="txt"><div class="nm">{b.card.name}</div>{#if b.card.tag}<div class="tag">{b.card.tag}</div>{/if}</div>
        </div>
      {/key}
    {/if}

    {#if b.decided}
      {#key b.decided.key}
        <div class="dec">
          <div class="dh">{b.decided.name.split(" ")[0].toUpperCase()} DECIDED</div>
          <div class="dd">{b.decided.did}</div>
          {#if b.decided.reason}<div class="dw">“{b.decided.reason}”</div>{/if}
        </div>
      {/key}
    {/if}

    {#if b.followed}
      <!-- the followed survivor's pockets -->
      <div class="inv" style:--c={b.followed.colour}>
        <div class="ih">{b.followed.name.split(" ")[0].toUpperCase()} IS CARRYING</div>
        <div class="ik">{#each b.followed.kit as k, i (i)}<span>{k}</span>{:else}<em>nothing</em>{/each}</div>
      </div>
    {/if}

    {#if b.subs.length}
      <div class="subs">
        {#each b.subs as l (l.key)}
          <div class="sub"><span class="who">{l.name.split(" ")[0]}</span>{l.text}</div>
        {/each}
      </div>
    {/if}

    {#if b.memoriam}
      {#key b.memoriam.who}
        <div class="mem" style:--c={b.memoriam.colour}>
          <div class="mh">IN MEMORIAM</div>
          <div class="mn">{b.memoriam.name}</div>
          <div class="md">{b.memoriam.line}{#if b.memoriam.time} · {b.memoriam.time}{/if}</div>
        </div>
      {/key}
    {/if}

    {#if !b.recapCard}
      <div class="strip" class:picker={!!pick} style:--n={Math.max(6, b.rows.length)}>
        {#each b.rows as r (r.id)}
          <svelte:element this={pick ? "button" : "div"} role={pick ? "button" : "group"} class="s" class:dead={r.dead} class:picked={picked === r.id} class:onair={!picked && b.onAir.target === r.id && b.mode === "director"}
            style:--c={r.colour}
            title={[pick ? (picked === r.id ? "Back to the director's cut" : `Watch ${r.name}`) : "", r.thought ?? "", r.goal ? `Goal: ${r.goal}` : ""].filter(Boolean).join(" — ") || undefined}
            onclick={() => pick?.(picked === r.id ? null : r.id)}>
            <div class="top"><span class="n">{r.dead && !r.escaped ? "† " : ""}{r.name.split(" ")[0]}</span>
              {#if r.escaped}<em class="m out">OUT</em>{/if}
              {#if r.down}<em class="m down">DOWN</em>{/if}
              {#if r.bitten && !r.infected}<em class="m bit">BITTEN</em>{/if}
              {#if r.infected}<em class="m inf">INFECTED</em>{/if}
              {#if r.bleeding}<em class="m bleed">BLEEDING</em>{/if}
            </div>
            <div class="hp"><b class:low={r.hp < 35} style:width={`${r.hp}%`}></b></div>
            <div class="row2"><span class="doing">{r.doing}</span><span class="k" title="Zombies put down">{r.kills} {r.kills === 1 ? "KILL" : "KILLS"}</span></div>
            {#if !r.dead}
              <div class="thought">{#key r.thoughtAt}<span>{r.thought ?? ""}</span>{/key}</div>
              <div class="goal">{#if r.goal}<b>GOAL</b> {r.goal}{/if}</div>
            {/if}
          </svelte:element>
        {/each}
      </div>
    {/if}

    <!-- ---- the cards that take the screen ---- -->
    {#if b.countdown !== null}
      <div class="full count">
        <div class="ft">SOLACE SURVIVORZ</div>
        <div class="fs">{mini.brand}</div>
        <div class="cd">{mm(b.countdown)}</div>
        <div class="cl">{mini.title} · the show starts soon</div>
      </div>
    {:else if b.title}
      <div class="full title">
        <div class="ft">SOLACE SURVIVORZ</div>
        <div class="fs">{mini.brand}</div>
        <div class="cl">{mini.title} · {mini.house ? "survive until the clock runs out" : "one hour to get rescued"}</div>
      </div>
    {/if}

    {#if b.end}
      <div class={`full end ${b.end.kind}`}>
        <div class="et">{b.end.title}</div>
        {#if b.end.sub}<div class="es">{b.end.sub}</div>{/if}
        {#if b.end.time}<div class="cl">{b.end.time}</div>{/if}
      </div>
    {/if}

    {#if b.recapCard}
      <div class="full rc">
        <div class="rct">{b.recapCard.title}{#if b.recapCard.time} <span>· {b.recapCard.time}</span>{/if}</div>
        <div class="cols">
          <div>
            <h3>SURVIVED</h3>
            {#each b.recapCard.survived as p (p.name)}<div class="pr" style:--c={p.colour}><b>{p.name}</b><span>{p.kills} {p.kills === 1 ? "kill" : "kills"}</span></div>{:else}<div class="none">nobody</div>{/each}
            <h3>DIED</h3>
            {#each b.recapCard.died as p (p.name)}<div class="pr dead" style:--c={p.colour}><b>{p.name}</b><span>{p.line} · {p.time} · {p.kills} {p.kills === 1 ? "kill" : "kills"}</span></div>{:else}<div class="none">nobody</div>{/each}
          </div>
          <div>
            <h3>OBJECTIVES</h3>
            {#each b.recapCard.objectives as o (o.label)}<div class="or" class:done={o.done}><span class="box">{o.done ? "✓" : "✗"}</span><b>{o.label}</b><span>{o.detail}</span></div>{/each}
          </div>
        </div>
      </div>
    {/if}

    {#if b.hold}
      <div class="full hold">
        <div class="ht">TECHNICAL DIFFICULTIES</div>
        <div class="cl">Please stand by. The show is paused and will carry on shortly.</div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .ov { position: absolute; inset: 0; pointer-events: none; container-type: size; color: #f1f3f4;
    font-family: "Inter", "Segoe UI", system-ui, sans-serif; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7); }
  .bug { position: absolute; top: 2.4cqh; right: 2.2cqw; display: flex; gap: 0.9cqh; align-items: center; font-size: 1.45cqh; letter-spacing: 0.12em; font-weight: 700; }
  .live { color: #ff3b30; }
  .brand { color: #e6e6e6; opacity: 0.9; }
  .brand b { color: #e8b04a; }

  /* the checklist */
  .obj { position: absolute; top: 2.2cqh; left: 2.2cqw; width: min(27cqw, 52cqh); background: rgba(8, 9, 10, 0.72); border-left: 0.5cqh solid #e8b04a; padding: 1cqh 1.3cqh 1.1cqh; }
  .clk { display: flex; align-items: baseline; gap: 1cqh; margin-bottom: 0.7cqh; }
  .clk .t { font-size: 3.6cqh; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
  .clk .t.low { color: #ff6b4a; }
  .clk .l { font-size: 1.15cqh; font-weight: 800; letter-spacing: 0.14em; opacity: 0.7; }
  .o { display: grid; grid-template-columns: 1.9cqh 1fr; column-gap: 0.8cqh; align-items: center; font-size: 1.65cqh; line-height: 1.5; margin-bottom: 0.25cqh; }
  .o .lab { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .o .box { width: 1.5cqh; height: 1.5cqh; border: 0.18cqh solid rgba(255, 255, 255, 0.55); border-radius: 0.25cqh; font-size: 1.25cqh; line-height: 1.35cqh; text-align: center; color: #111; font-weight: 900; }
  .o.done .box { background: #e8b04a; border-color: #e8b04a; }
  .o.done .lab { opacity: 0.6; }
  .o .det { grid-column: 2; font-size: 1.3cqh; line-height: 1.25; opacity: 0.8; font-variant-numeric: tabular-nums; white-space: nowrap; margin-top: -0.15cqh; }
  .o .det.count { color: #ff8a6a; font-weight: 800; opacity: 1; }
  .o.done .det { color: #e8b04a; opacity: 0.95; }

  /* the minimap */
  .map { position: absolute; top: 5.4cqh; right: 2.2cqw; width: min(19cqw, 34cqh); height: min(16cqw, 28cqh); background: rgba(8, 9, 10, 0.62); border-radius: 0.6cqh; padding: 0.6cqh; }
  .map rect { fill: rgba(255, 255, 255, 0.07); stroke: rgba(255, 255, 255, 0.28); stroke-width: 0.18; }
  .map rect.hall { fill: rgba(255, 255, 255, 0.03); }
  .map polygon { fill: rgba(255, 255, 255, 0.07); stroke: rgba(255, 255, 255, 0.28); stroke-width: 0.18; }
  .map polygon.hall { fill: rgba(255, 255, 255, 0.03); }
  .map .mk rect { fill: rgba(232, 176, 74, 0.25); stroke: #e8b04a; stroke-width: 0.25; }
  .map .mk.door rect { fill: rgba(255, 80, 60, 0.3); stroke: #ff5a44; }
  .map .mk.on rect { fill: #6fd1a0; stroke: #6fd1a0; }
  .map text { font-size: 1.6px; fill: #e9edf0; text-anchor: middle; font-weight: 800; letter-spacing: 0.08em; paint-order: stroke; stroke: rgba(0, 0, 0, 0.7); stroke-width: 0.35; }
  .map circle { stroke: #000; stroke-width: 0.3; }
  .map text.x { font-size: 2.6px; fill: #8b9298; }

  .recap { position: absolute; top: 36cqh; right: 2.2cqw; width: min(28cqw, 54cqh); background: rgba(8, 9, 10, 0.8);
    border-right: 0.55cqh solid #e8b04a; padding: 1cqh 1.5cqh 1.15cqh; text-align: right; animation: slideR 0.6s ease-out both; }
  .recap .rh { font-size: 1.35cqh; font-weight: 800; letter-spacing: 0.16em; color: #e8b04a; }
  .recap .rb { font-size: 1.85cqh; line-height: 1.4; margin-top: 0.45cqh; color: #eef1f3; }

  .ban { position: absolute; left: 50%; top: 24%; transform: translate(-50%, -50%); text-align: center; animation: pop 0.5s ease-out both; }
  .ban .bt { font-size: 6.4cqh; font-weight: 900; letter-spacing: 0.18em; color: #f3d48a; text-shadow: 0 0.4cqh 2cqh rgba(0, 0, 0, 0.85); }
  .ban .bs { font-size: 2.3cqh; letter-spacing: 0.1em; opacity: 0.92; margin-top: 0.4cqh; font-variant-numeric: tabular-nums; }
  @keyframes pop { from { opacity: 0; transform: translate(-50%, -50%) scale(0.92); } to { opacity: 1; transform: translate(-50%, -50%); } }

  .third { position: absolute; left: 2.2cqw; bottom: 21cqh; display: flex; align-items: stretch; gap: 1cqh; animation: slide 0.45s ease-out both; }
  .third .bar { width: 0.55cqh; background: #e8b04a; }
  .third .txt { background: rgba(8, 9, 10, 0.78); padding: 0.9cqh 1.6cqh 1cqh; }
  .third .nm { font-size: 3.1cqh; font-weight: 800; letter-spacing: 0.03em; }
  .third .tag { font-size: 1.7cqh; opacity: 0.8; margin-top: 0.2cqh; }
  @keyframes slide { from { transform: translateX(-3cqw); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes slideR { from { opacity: 0; transform: translateX(2cqw); } to { opacity: 1; transform: none; } }

  .dec { position: absolute; right: 2.2cqw; top: 52cqh; max-width: min(26cqw, 50cqh); background: rgba(8, 9, 10, 0.8);
    border-right: 0.55cqh solid #6fd1a0; padding: 0.8cqh 1.4cqh 0.9cqh; text-align: right; animation: slideR 0.4s ease-out both; }
  .dec .dh { font-size: 1.3cqh; font-weight: 800; letter-spacing: 0.16em; color: #6fd1a0; }
  .dec .dd { font-size: 2.1cqh; font-weight: 700; margin-top: 0.3cqh; line-height: 1.25; }
  .dec .dw { font-size: 1.75cqh; font-style: italic; opacity: 0.88; margin-top: 0.35cqh; line-height: 1.35; }

  .inv { position: absolute; right: 2.2cqw; bottom: 21cqh; max-width: 30cqw; background: rgba(8, 9, 10, 0.78); border-top: 0.35cqh solid var(--c); padding: 0.8cqh 1.2cqh 0.9cqh; animation: slideR 0.35s ease-out both; }
  .inv .ih { font-size: 1.25cqh; font-weight: 800; letter-spacing: 0.14em; color: var(--c); }
  .inv .ik { display: flex; flex-wrap: wrap; gap: 0.5cqh; margin-top: 0.5cqh; font-size: 1.55cqh; }
  .inv .ik span { background: rgba(255, 255, 255, 0.09); padding: 0.1cqh 0.6cqh; border-radius: 0.3cqh; }
  .inv em { opacity: 0.6; }

  .subs { position: absolute; left: 50%; bottom: 25.5cqh; transform: translateX(-50%); width: min(60cqw, 112cqh); display: flex; flex-direction: column; align-items: center; gap: 0.7cqh; }
  .sub { background: rgba(6, 7, 8, 0.74); padding: 0.6cqh 1.4cqh 0.7cqh; font-size: 2.3cqh; line-height: 1.3; text-align: center; border-radius: 0.4cqh; animation: fade 0.25s ease-out both; }
  .sub .who { color: #e8b04a; font-weight: 800; margin-right: 0.7cqh; letter-spacing: 0.03em; }

  .mem { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); text-align: center; background: rgba(0, 0, 0, 0.84);
    border-top: 0.25cqh solid var(--c); border-bottom: 1px solid rgba(255, 255, 255, 0.25); padding: 2.2cqh 5cqh; animation: fade 1.2s ease-out both;
    font-family: Georgia, "Times New Roman", serif; }
  .mh { font-size: 1.6cqh; letter-spacing: 0.4em; opacity: 0.7; }
  .mn { font-size: 5cqh; margin: 0.6cqh 0; }
  .md { font-size: 2cqh; opacity: 0.85; }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }

  .strip { position: absolute; left: 2.2cqw; right: 2.2cqw; bottom: 2.4cqh; align-items: end; display: grid; grid-template-columns: repeat(var(--n, 6), minmax(0, 1fr)); gap: 0.8cqw; }
  .s { background: rgba(8, 9, 10, 0.74); border-top: 0.4cqh solid var(--c); padding: 0.8cqh 1cqh 0.9cqh; min-width: 0; }
  .s.onair { box-shadow: inset 0 0 0 0.15cqh rgba(255, 255, 255, 0.35); }
  .strip.picker .s { pointer-events: auto; cursor: pointer; transition: background 0.15s; font: inherit; color: inherit; text-align: left; border: 0; border-top: 0.4cqh solid var(--c); }
  .strip.picker .s:hover { background: rgba(28, 30, 33, 0.85); }
  .s.picked { background: rgba(14, 26, 38, 0.88); box-shadow: inset 0 0 0 0.18cqh #4fb3ff; }
  .s.dead { opacity: 0.45; }
  .top { display: flex; align-items: center; gap: 0.6cqh; min-width: 0; overflow: hidden; white-space: nowrap; }
  .n { font-size: 2cqh; font-weight: 700; color: var(--c); }
  .row2 { display: flex; align-items: baseline; gap: 0.6cqh; min-width: 0; }
  .row2 .doing { flex: 1; min-width: 0; }
  .k { flex: none; font-size: 1.1cqh; font-weight: 800; letter-spacing: 0.08em; opacity: 0.75; font-variant-numeric: tabular-nums; }
  .m { font-style: normal; font-size: 1.05cqh; font-weight: 800; letter-spacing: 0.08em; padding: 0.15cqh 0.5cqh; border-radius: 0.3cqh; }
  .m.down { background: #ff3b30; color: #fff; }
  .m.bleed { background: #8e1b1b; color: #fff; }
  .m.bit { background: #b8321f; color: #fff; animation: throb 1.6s ease-in-out infinite; }
  .m.inf { background: #4f7d25; color: #fff; }
  .m.out { background: #e8b04a; color: #111; }
  @keyframes throb { 50% { opacity: 0.6; } }
  .hp { height: 0.7cqh; background: rgba(255, 255, 255, 0.12); margin: 0.6cqh 0 0.5cqh; }
  .hp b { display: block; height: 100%; background: #6fcf6f; transition: width 0.4s; }
  .hp b.low { background: #e85a4a; }
  .doing { font-size: 1.45cqh; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .thought { font-size: 1.3cqh; line-height: 1.35; height: 1.35em; margin-top: 0.25cqh; font-style: italic; color: #dfe6ec; opacity: 0.9;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .thought span { animation: fade 0.6s ease-out both; }
  .goal { font-size: 1.15cqh; line-height: 1.35; height: 1.35em; margin-top: 0.1cqh; color: #cfe9dc; opacity: 0.82;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .goal b { color: #6fd1a0; font-weight: 800; letter-spacing: 0.1em; font-size: 0.9em; margin-right: 0.3em; }

  /* the whole-screen cards */
  .full { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; animation: fade 0.8s ease-out both; }
  .ft { font-size: 3cqh; font-weight: 800; letter-spacing: 0.5em; color: #d8dde1; }
  .fs { font-size: 11cqh; font-weight: 900; letter-spacing: 0.12em; color: #e8b04a; line-height: 1; margin: 1cqh 0 2cqh; }
  .cl { font-size: 2.1cqh; letter-spacing: 0.12em; opacity: 0.85; }
  .count { background: radial-gradient(ellipse at center, #1a1612 0%, #050505 75%); }
  .count .cd { font-size: 9cqh; font-weight: 800; font-variant-numeric: tabular-nums; margin-bottom: 1.5cqh; }
  .title { background: linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.35)); }
  .end { background: rgba(0, 0, 0, 0.62); }
  .end .et { font-size: 10cqh; font-weight: 900; letter-spacing: 0.16em; }
  .end.rescued .et { color: #6fd1a0; }
  .end.escaped .et { color: #6fd1a0; }
  .end.wiped .et { color: #ff5a44; }
  .end.timeout .et { color: #e8b04a; }
  .end .es { font-size: 3cqh; letter-spacing: 0.08em; margin: 1cqh 0 1.6cqh; }
  .rc { background: rgba(4, 5, 6, 0.9); justify-content: flex-start; padding-top: 8cqh; }
  .rct { font-size: 5cqh; font-weight: 900; letter-spacing: 0.14em; color: #e8b04a; }
  .rct span { color: #d8dde1; font-weight: 700; font-size: 3cqh; letter-spacing: 0.06em; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 6cqw; margin-top: 4cqh; width: min(84cqw, 160cqh); text-align: left; }
  .cols h3 { margin: 2cqh 0 1cqh; font-size: 1.6cqh; letter-spacing: 0.3em; color: #9aa3aa; }
  .pr { display: flex; flex-direction: column; border-left: 0.45cqh solid var(--c); padding: 0.3cqh 1.2cqh; margin-bottom: 1cqh; }
  .pr b { font-size: 2.4cqh; }
  .pr span { font-size: 1.6cqh; opacity: 0.8; }
  .pr.dead b { opacity: 0.75; }
  .none { font-size: 1.8cqh; opacity: 0.55; }
  .or { display: grid; grid-template-columns: 2.6cqh auto 1fr; gap: 1cqh; align-items: baseline; font-size: 2cqh; margin-bottom: 1cqh; }
  .or .box { color: #ff6b4a; font-weight: 900; }
  .or.done .box { color: #6fd1a0; }
  .or span:last-child { font-size: 1.6cqh; opacity: 0.8; text-align: right; font-variant-numeric: tabular-nums; }
  .hold { background: rgba(0, 0, 0, 0.7); backdrop-filter: grayscale(1); }
  .hold .ht { font-size: 6cqh; font-weight: 900; letter-spacing: 0.22em; color: #f1f3f4; margin-bottom: 1.6cqh; }
</style>
