<script lang="ts">
  // SOLACE SURVIVORZ — THE CONTROL ROOM's LIVE PICTURE (stage 2; docs/survivorz/CONTROL-ROOM.md): the clock and
  // the objectives, a card per survivor, a top-down map with every body on it, and an event log — all read off
  // the ordinary watch socket (live.ts), the same frames the show draws from. No 3D.
  // The per-survivor levers are a TEST RUN's alone (Josh: "a real show is the AI's alone"); `act` runs them.
  import { onDestroy, onMount } from "svelte";
  import { connectLive, type LiveFeed, type LiveFrame } from "../live";
  import { MAP_ID, ROOMS as SITE_ROOMS, SITE_9, brandInPlay, useMap } from "../show/site";
  import { doingOf } from "../show/overlay";
  import type { BodyState, Goals, SurvivorVitals } from "../../../../src/survivorz/sim/wire";

  let { test, busy, charName, act }: {
    test: boolean;
    busy: boolean;
    charName: (id: string) => string;
    act: (path: string, body: unknown, done?: string) => Promise<boolean>;
  } = $props();

  // ---- the feed: bodies kept in a plain map, drawn on a 2 Hz beat (the socket runs at ~10 Hz) ----
  interface Body { id: string; kind: "survivor" | "zombie"; who?: string; x: number; z: number; pose: string; room: string | null; hp: number; hpMax: number; vitals?: SurvivorVitals; why?: string; escaped?: boolean; turned?: string; held?: string | null }
  const bodies = new Map<string, Body>();
  let goals = $state<Goals | null>(null);
  let clock = $state(0);
  let run = "";
  let ver = $state(0);
  let connected = $state(false);
  interface LogLine { t: number; text: string; kind: "ev" | "decide" | "say" | "goal" | "think" }
  let log = $state<LogLine[]>([]);
  let logSay = $state(false);
  let dirty = false;

  const fromState = (b: BodyState): Body => ({
    id: b.id, kind: b.kind, who: b.who, x: b.pos[0], z: b.pos[2], pose: b.pose, room: b.room, hp: b.hp, hpMax: b.hpMax,
    vitals: b.vitals, why: b.why, escaped: b.escaped, turned: b.turned, held: b.held,
  });
  /** THE MAP IN PLAY (the snapshot names it: show/site.ts useMap): the plan, the room names and the title are its own */
  let mapKey = $state(MAP_ID);
  const ROOM_NAME = $derived.by(() => { void mapKey; return new Map(SITE_9.rooms.map((r) => [r.id, r.name])); });
  const nameOf = (id: string | undefined | null): string => !id ? "someone" : id.startsWith("s:") ? charName(id.slice(2)) : id.startsWith("z:") ? "one of the dead" : charName(id);

  // the events worth a line in the log (the rest are sounds and effects)
  const EV: Record<string, (e: Record<string, unknown>) => string> = {
    "survivor.down": (e) => `${nameOf(e.victim as string ?? e.by as string)} is down`,
    "survivor.dead": (e) => `${nameOf(e.victim as string ?? e.by as string)} died`,
    "survivor.bitten": (e) => `${nameOf(e.victim as string ?? e.by as string)} was bitten`,
    "survivor.revived": (e) => `${nameOf(e.by as string)} got ${nameOf(e.victim as string)} back up`,
    "survivor.turned": (e) => `${nameOf(e.victim as string ?? e.by as string)} turned`,
    "survivor.grabbed": (e) => `${nameOf(e.victim as string)} was grabbed`,
    "survivor.steal": (e) => `${nameOf(e.by as string)} stole from ${nameOf(e.victim as string)}`,
    "survivor.give": (e) => `${nameOf(e.by as string)} gave to ${nameOf(e.victim as string)}`,
    "survivor.meet": (e) => `${nameOf(e.by as string)} met ${nameOf(e.victim as string)}`,
    "infection.known": (e) => `the group knows ${nameOf(e.victim as string ?? e.by as string)} is infected`,
    "zombie.arrived": () => MAP_ID === "bunker" ? "one of the dead came in from the tunnel" : "one of the dead came onto the grounds",
    // GLENRIDGE HALL's (sim/scenarios/glenridge.ts)
    "door.bolted": (e) => `${nameOf(e.by as string)} bolted the front door`,
    "planks.taken": (e) => `${nameOf(e.by as string)} took planks from the coal store`,
    "window.boarded": (e) => `${nameOf(e.by as string)} boarded a window`,
    "window.broken": () => "the dead broke a window's boards off",
    "house.clear": () => "the house is clear",
    "crests.seen": (e) => `${nameOf(e.by as string)} saw the four sockets in the chimneypiece`,
    "crest.found": (e) => `${nameOf(e.by as string)} found a crest`,
    "crest.set": (e) => `${nameOf(e.by as string)} set a crest (${e.n ?? "?"} of 4)`,
    "secret.open": () => "the hearth stone sank: the way down is open",
    "key.found": (e) => `${nameOf(e.by as string)} found the butler's key`,
    "ledger.read": (e) => `${nameOf(e.by as string)} read the ledger`,
    "secret.read": (e) => `${nameOf(e.by as string)} read the journals: the secret is out`,
    "power.cut": () => "the lights went out",
    "power.on": (e) => `${nameOf(e.by as string)} got the lights back on`,
    "keys.found": (e) => `${nameOf(e.by as string)} found the car keys`,
    "fuel.taken": (e) => `${nameOf(e.by as string)} took a can of fuel`,
    "car.fueled": (e) => `${nameOf(e.by as string)} fuelled the car`,
    "car.in": (e) => `${nameOf(e.by as string)} got in the car`,
    "car.away": () => "the car drove out",
    "zombie.death": (e) => `${nameOf(e.by as string)} put one down`,
    "part.found": (e) => `${nameOf(e.by as string)} found the radio part`,
    "note.read": (e) => `${nameOf(e.by as string)} read the code`,
    "keycard.found": (e) => `${nameOf(e.by as string)} found a keycard`,
    "crank.start": (e) => `${nameOf(e.by as string)} started on the blast door`,
    "door.sealed": (e) => `${nameOf(e.by as string)} sealed the blast door`,
    "radio.fixed": (e) => `${nameOf(e.by as string)} fixed the radio`,
    "radio.call": (e) => `${nameOf(e.by as string)} called for rescue`,
    "bunker.clear": () => "the bunker is clear",
    "alarm.start": () => "the alarm went off",
    "show.over": () => "the show is over",
  };
  function push(line: LogLine): void {
    log = [line, ...log].slice(0, 150);
  }

  function onFrame(f: LiveFrame): void {
    if (f.type === "snap") {
      useMap(f.map);
      if (MAP_ID !== mapKey) mapKey = MAP_ID;
      if (f.run && f.run !== run) { run = f.run; log = []; }
      bodies.clear();
      for (const b of f.bodies) bodies.set(b.id, fromState(b));
      if (f.goals) goals = f.goals;
      clock = f.t; dirty = true;
    } else if (f.type === "tick") {
      clock = f.t;
      for (const tb of f.b) {
        const b = bodies.get(tb.id);
        if (!b) continue;
        b.x = tb.p[0]; b.z = tb.p[2];
        if (tb.pose) b.pose = tb.pose;
        if (tb.hp !== undefined) b.hp = tb.hp;
        if (tb.room !== undefined) b.room = tb.room;
        if (tb.vitals) b.vitals = tb.vitals;
        if (tb.why !== undefined) b.why = tb.why;
        if (tb.held !== undefined) b.held = tb.held;
      }
      if (f.goals) goals = f.goals;
      dirty = true;
    } else if (f.type === "spawn") { bodies.set(f.body.id, fromState(f.body)); dirty = true; }
    else if (f.type === "gone") { bodies.delete(f.id); dirty = true; }
    else if (f.type === "ev") {
      const say = EV[f.event];
      if (say) push({ t: f.t, text: say(f as unknown as Record<string, unknown>), kind: "ev" });
    } else if (f.type === "decide") push({ t: f.t, text: `${nameOf(f.by)} decided to ${f.did}${f.reason ? ` — ${f.reason}` : ""}`, kind: "decide" });
    else if (f.type === "goal") push({ t: f.t, text: `${nameOf(f.by)}'s goal: ${f.text}`, kind: "goal" });
    else if (f.type === "say") push({ t: f.t, text: `${nameOf(f.by)}: "${f.text}"`, kind: "say" });
  }

  let feed: LiveFeed | null = null;
  let beat = 0;
  onMount(() => {
    feed = connectLive(onFrame, (c) => { connected = c; });
    beat = window.setInterval(() => { if (dirty) { dirty = false; ver++; } }, 500);
  });
  onDestroy(() => { feed?.close(); window.clearInterval(beat); });

  // ---- what's drawn ----
  const all = $derived.by(() => { void ver; return [...bodies.values()]; });
  const survivors = $derived(all.filter((b) => b.kind === "survivor").sort((a, b) => (a.who ?? "").localeCompare(b.who ?? "")));
  const dead = $derived(all.filter((b) => b.kind === "zombie" && b.pose !== "dead"));
  const insideNow = $derived(dead.filter((z) => z.room && z.room !== "tunnel").length);
  const deadInRoom = $derived.by(() => { const m = new Map<string, number>(); for (const z of dead) if (z.room) m.set(z.room, (m.get(z.room) ?? 0) + 1); return m; });

  // the map's frame, from the rooms (x right, z down)
  // (a house: its ground floor and its grounds, each room to its outline; the bunker: every room, as boxes)
  const plan = $derived.by(() => {
    void mapKey;
    const house = MAP_ID !== "bunker";
    const rooms = house ? SITE_ROOMS.filter((r) => r.floor === 1) : SITE_ROOMS;
    const X0 = Math.min(...rooms.map((r) => r.x0)), X1 = Math.max(...rooms.map((r) => r.x1));
    const Z0 = Math.min(...rooms.map((r) => r.z0)), Z1 = Math.max(...rooms.map((r) => r.z1));
    const PAD = 1;
    return {
      title: house ? brandInPlay().title : "The bunker",
      viewBox: `${X0 - PAD} ${Z0 - PAD} ${X1 - X0 + PAD * 2} ${Z1 - Z0 + PAD * 2}`,
      rooms: rooms.map((r) => ({ id: r.id, name: ROOM_NAME.get(r.id) ?? r.id, x: r.x0, z: r.z0, w: r.x1 - r.x0, h: r.z1 - r.z0, out: !!r.outdoor,
        pts: r.poly ? r.poly.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ") : "" })),
    };
  });

  const stateOf = (b: Body): "dead" | "down" | "out" | "ok" =>
    b.pose === "dead" || (b.hp <= 0 && b.pose !== "down") || b.turned ? "dead" : b.escaped ? "out" : b.pose === "down" ? "down" : "ok";
  const STATE_LABEL = { dead: "dead", down: "down", out: "got out", ok: "" } as const;

  // ---- the clock and the objectives ----
  function mmss(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
  }
  const left = $derived(goals ? goals.endsAt - clock : 0);
  const objectives = $derived.by(() => {
    const g = goals;
    if (!g) return [];
    // (a map whose objectives are its own: the server's rows, in its words)
    if (g.rows) return g.rows.map((x) => ({ label: x.label, done: !!x.done, detail: x.done ? (x.by ? `by ${nameOf(x.by)}` : "") : x.note ?? "" }));
    const r = g.radio;
    return [
      { label: "Seal the blast door", done: !!g.door.sealed, detail: g.door.sealed ? `by ${nameOf(g.door.by)}` : g.door.crank > 0 ? `${Math.round(g.door.crank * 100)}% cranked` : "" },
      { label: "Clear the bunker", done: !!g.clear, detail: g.clear ? `last one by ${nameOf(g.clearBy)}` : `${insideNow} of the dead inside` },
      { label: "Find the radio part", done: !!r.part, detail: r.part ? `by ${nameOf(r.partBy)}` : "" },
      { label: "Find the code", done: !!r.code, detail: r.code ? `by ${nameOf(r.codeBy)}` : "" },
      { label: "Fix the radio", done: !!r.fixed, detail: r.fixed ? `by ${nameOf(r.fixedBy)}` : r.repair > 0 ? `${Math.round(r.repair * 100)}%` : "" },
      { label: "Call for rescue", done: !!r.called, detail: r.called ? `by ${nameOf(r.by)}` : "" },
    ];
  });
  const ENDING: Record<string, string> = { rescued: "Rescued", escaped: "Escaped", survived: "Survived", wiped: "Everyone died", timeout: "Out of time" };

  // ---- the per-survivor levers (a test run's) ----
  const ITEMS: [string, string][] = [["medkit", "Medkit"], ["bandage", "Bandage"], ["food", "Food"], ["water", "Water"], ["ammo", "Pistol rounds"], ["ammoR", "Rifle rounds"], ["pistol", "Pistol"], ["rifle", "Rifle"], ["axe", "Axe"], ["crowbar", "Crowbar"], ["knife", "Knife"], ["battery", "Battery"], ["backpack-large", "Large backpack"]];
  const MOVE_ROOMS = $derived.by(() => { void mapKey; return SITE_9.rooms.filter((r) => r.id !== "tunnel").map((r) => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name)); });
  let open = $state<string | null>(null);
  let giveItem = $state("medkit");
  let moveRoom = $state("");
  let nudgeKind = $state<"thought" | "goal">("thought");
  let nudgeText = $state("");
  const body = (who: string, op: string) => act("/api/admin/survivorz/body", { op, id: `s:${who}`, ...(op === "infect" ? { hours: 0 } : {}) }, `${charName(who)}: ${op === "infect" ? "bitten" : op === "down" ? "down" : op === "revive" ? "revived" : "killed"}.`);
  const lever = (who: string, op: string, extra: Record<string, unknown>, done: string) => act("/api/admin/survivorz/act", { op, id: `s:${who}`, ...extra }, done);
  async function nudge(who: string): Promise<void> {
    const text = nudgeText.trim();
    if (text.length < 3) return;
    if (await lever(who, "nudge", { kind: nudgeKind, text }, `${charName(who)} has a new ${nudgeKind}.`)) nudgeText = "";
  }
</script>

<section class="lp">
  <!-- THE CLOCK AND THE OBJECTIVES -->
  <div class="card goals">
    <h3>The clock {#if !connected}<span class="tag off">reconnecting…</span>{/if}</h3>
    {#if goals}
      <div class="clock">{goals.ending ? ENDING[goals.ending] : mmss(left)}<small>{goals.ending ? "" : "left"}</small></div>
      <ul class="obj">
        {#each objectives as o (o.label)}
          <li class:done={o.done}><span class="tick">{o.done ? "✓" : "○"}</span>{o.label}{#if o.detail}<small> · {o.detail}</small>{/if}</li>
        {/each}
      </ul>
    {:else}<p class="hint">Waiting for the show…</p>{/if}
  </div>

  <!-- THE MAP -->
  <div class="card map">
    <h3>{plan.title} <small>{survivors.filter((s) => stateOf(s) === "ok" || stateOf(s) === "down").length} alive · {dead.length} of the dead</small></h3>
    <svg viewBox={plan.viewBox} preserveAspectRatio="xMidYMid meet">
      {#each plan.rooms as r (r.id)}
        {@const n = deadInRoom.get(r.id) ?? 0}
        {#if r.pts}<polygon points={r.pts} class="room" class:out={r.out} class:hot={n > 0} />{:else}<rect x={r.x} y={r.z} width={r.w} height={r.h} class="room" class:hot={n > 0} />{/if}
        {#if !r.out && r.w > 4 && r.h > 3}<text x={r.x + 0.4} y={r.z + 1.1} class="rname">{r.name}</text>{/if}
      {/each}
      {#each dead as z (z.id)}<circle cx={z.x} cy={z.z} r="0.35" class="z" />{/each}
      {#each survivors as s (s.id)}
        {@const st = stateOf(s)}
        {#if st !== "out"}
          <g class="s {st}" class:sel={open === s.who} role="button" tabindex="-1" onclick={() => (open = s.who ?? null)} onkeydown={() => {}}>
            <circle cx={s.x} cy={s.z} r="0.6" />
            <text x={s.x + 0.85} y={s.z + 0.35} class="sname">{charName(s.who ?? "")}</text>
          </g>
        {/if}
      {/each}
    </svg>
  </div>

  <!-- THE SURVIVORS -->
  <div class="cards">
    {#each survivors as s (s.id)}
      {@const who = s.who ?? ""}
      {@const st = stateOf(s)}
      {@const v = s.vitals}
      <div class="sv {st}" class:sel={open === who}>
        <button class="head" onclick={() => (open = open === who ? null : who)}>
          <b>{charName(who)}</b>
          {#if STATE_LABEL[st]}<span class="pill {st}">{STATE_LABEL[st]}</span>{/if}
          {#if v?.bitten}<span class="pill bit">bitten</span>{/if}
          {#if v?.bleeding}<span class="pill down">bleeding</span>{/if}
          <span class="room">{ROOM_NAME.get(s.room ?? "") ?? "between rooms"}</span>
        </button>
        {#if st !== "dead" && st !== "out"}
          <div class="hp"><i style="width: {Math.round((s.hp / Math.max(1, s.hpMax)) * 100)}%"></i></div>
          <div class="facts">
            <span>{doingOf({ pose: s.pose, vitals: v } as Parameters<typeof doingOf>[0]) || v?.job || s.why || "—"}</span>
            {#if v}<span>hunger {Math.round(v.hunger * 100)}%</span><span>tired {Math.round(v.tired * 100)}%</span><span>morale {Math.round(v.morale)}</span>{/if}
            {#if v?.inv}<span>{v.inv.gun ? `${v.inv.gun} (${v.inv.rounds ?? 0})` : v.inv.melee}</span>{#if v.inv.medkit || v.inv.bandage}<span>{v.inv.medkit} medkit · {v.inv.bandage} bandage</span>{/if}{/if}
            {#if v?.kills}<span>{v.kills} put down</span>{/if}
          </div>
          {#if test && open === who}
            <div class="levers">
              <div class="row">
                <button disabled={busy} onclick={() => lever(who, "heal", {}, `${charName(who)} healed.`)}>Heal</button>
                {#if st === "down"}<button disabled={busy} onclick={() => body(who, "revive")}>Revive</button>{:else}<button disabled={busy} onclick={() => body(who, "down")}>Down</button>{/if}
                <button disabled={busy} onclick={() => body(who, "infect")}>Bite</button>
                <button class="danger" disabled={busy} onclick={() => body(who, "kill")}>Kill</button>
              </div>
              <div class="row">
                <select bind:value={giveItem}>{#each ITEMS as [id, label] (id)}<option value={id}>{label}</option>{/each}</select>
                <button disabled={busy} onclick={() => lever(who, "give", { item: giveItem }, `Gave ${charName(who)} ${ITEMS.find((i) => i[0] === giveItem)?.[1]}.`)}>Give</button>
              </div>
              <div class="row">
                <select bind:value={moveRoom}><option value="">— a room —</option>{#each MOVE_ROOMS as r (r.id)}<option value={r.id}>{r.name}</option>{/each}</select>
                <button disabled={busy || !moveRoom || st === "down"} onclick={() => lever(who, "move", { room: moveRoom }, `${charName(who)} moved to ${ROOM_NAME.get(moveRoom)}.`)}>Move</button>
              </div>
              <div class="row">
                <select bind:value={nudgeKind}><option value="thought">A thought</option><option value="goal">A goal</option></select>
                <input maxlength="300" placeholder={nudgeKind === "goal" ? (mapKey === "bunker" ? "Get the radio working before anyone else does" : "Find the crests before anyone else does") : "Somebody here is lying to me"} bind:value={nudgeText} onkeydown={(e) => { if (e.key === "Enter") void nudge(who); }} />
                <button disabled={busy || nudgeText.trim().length < 3} onclick={() => nudge(who)}>Nudge</button>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    {/each}
  </div>

  <!-- THE LOG -->
  <div class="card log">
    <h3>What happened <label class="say"><input type="checkbox" bind:checked={logSay} /> what they said</label></h3>
    <ol>
      {#each log.filter((l) => logSay || l.kind !== "say") as l, i (i + ":" + l.t)}
        <li class={l.kind}><time>{goals ? mmss(l.t - goals.startedAt) : ""}</time>{l.text}</li>
      {:else}<li class="hint">Nothing yet.</li>{/each}
    </ol>
  </div>
</section>

<style>
  .lp { display: grid; grid-template-columns: minmax(240px, 300px) 1fr; gap: 14px; grid-column: 1 / -1; }
  .card { border: 1px solid var(--line); background: var(--panel-2); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  h3 { margin: 0; font-size: 0.95rem; letter-spacing: 0.04em; display: flex; align-items: center; gap: 8px; }
  h3 small { color: var(--ink-soft); font-weight: 500; letter-spacing: 0; }
  .tag { font-size: 0.68rem; font-weight: 700; padding: 2px 7px; border-radius: 999px; }
  .tag.off { background: rgba(255, 120, 80, 0.16); color: #ff9a6a; }
  .hint { margin: 0; color: var(--ink-soft); font-size: 0.84rem; }
  .clock { font-size: 2.2rem; font-weight: 800; font-variant-numeric: tabular-nums; display: flex; align-items: baseline; gap: 8px; }
  .clock small { font-size: 0.85rem; color: var(--ink-soft); font-weight: 500; }
  .obj { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; font-size: 0.88rem; }
  .obj li { color: var(--ink-soft); }
  .obj li.done { color: var(--ok, #6fbf73); }
  .obj .tick { display: inline-block; width: 1.3em; }
  .obj small { color: var(--ink-soft); }
  .map svg { width: 100%; height: 340px; background: rgba(0, 0, 0, 0.25); border-radius: 8px; }
  .room { fill: rgba(255, 255, 255, 0.04); stroke: rgba(255, 255, 255, 0.22); stroke-width: 0.08; }
  .room.hot { fill: rgba(255, 70, 60, 0.1); }
  .room.out { fill: rgba(255, 255, 255, 0.012); stroke: rgba(255, 255, 255, 0.08); }
  .rname { font-size: 0.9px; fill: rgba(255, 255, 255, 0.4); }
  .z { fill: #e2483d; }
  .s circle { fill: #6fbf73; stroke: #0b0b0b; stroke-width: 0.12; cursor: pointer; }
  .s.down circle { fill: #e0a34a; }
  .s.dead circle { fill: #777; }
  .s.sel circle { stroke: #fff; stroke-width: 0.22; }
  .sname { font-size: 1.15px; fill: #fff; font-weight: 700; pointer-events: none; }
  .cards { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
  .sv { border: 1px solid var(--line); background: var(--panel-2); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 7px; }
  .sv.sel { border-color: var(--accent); }
  .sv.dead, .sv.out { opacity: 0.55; }
  .head { all: unset; cursor: pointer; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .head .room { margin-left: auto; color: var(--ink-soft); font-size: 0.8rem; }
  .pill { font-size: 0.68rem; font-weight: 700; padding: 1px 7px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em; }
  .pill.dead { background: rgba(160, 160, 160, 0.2); color: #bbb; }
  .pill.down { background: rgba(224, 163, 74, 0.18); color: #e0a34a; }
  .pill.out { background: rgba(111, 191, 115, 0.18); color: #6fbf73; }
  .pill.bit { background: rgba(226, 72, 61, 0.18); color: #ff6b61; }
  .hp { height: 5px; border-radius: 3px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
  .hp i { display: block; height: 100%; background: #6fbf73; }
  .sv.down .hp i { background: #e0a34a; }
  .facts { display: flex; flex-wrap: wrap; gap: 4px; }
  .facts span { font-size: 0.74rem; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--line); color: var(--ink-soft); }
  .levers { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--line); padding-top: 8px; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .row input { flex: 1; min-width: 120px; }
  button { background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 6px 11px; font: inherit; font-size: 0.84rem; cursor: pointer; }
  button:hover:not(:disabled) { border-color: var(--accent); }
  button:disabled { opacity: 0.45; cursor: default; }
  button.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 50%, transparent); }
  select, input { background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 6px 9px; font: inherit; font-size: 0.84rem; }
  .log { grid-column: 1 / -1; }
  .log .say { margin-left: auto; font-size: 0.78rem; font-weight: 500; color: var(--ink-soft); display: flex; gap: 5px; align-items: center; letter-spacing: 0; }
  .log ol { list-style: none; margin: 0; padding: 0; max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; font-size: 0.84rem; }
  .log li { display: flex; gap: 10px; }
  .log time { color: var(--ink-soft); font-variant-numeric: tabular-nums; min-width: 3.6em; }
  .log li.decide { color: #a9c7ff; }
  .log li.goal { color: #e0c34a; }
  .log li.say { color: var(--ink-soft); font-style: italic; }
  @media (max-width: 900px) { .lp { grid-template-columns: 1fr; } }
</style>
