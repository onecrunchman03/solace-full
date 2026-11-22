<script lang="ts">
  // SOLACE SURVIVORZ — THE CONTROL ROOM, Admin Panel → Survivorz → Show (Josh, Nov 3 2026: "i dont want it to
  // load the show in the show tab … make the show tab its own dedicated UI with plenty of easy to use options
  // for orchestrating the show"). No 3D here: to watch, the Survivorz page in Solace (or its pop-out).
  // Josh's rules for it (the 20 questions, Nov 3):
  //   · a REAL (numbered) show is the AI's alone: the testing levers (speed, jumps, the body levers,
  //     spawning) are only offered on a test run; a real show keeps start/stop/pause and the broadcast;
  //   · levers that change a real show ask first; on a test run they act at once.
  // THE LAYOUT (Nov 12 2026 — Josh: "more polished UI and easier navigation and settings"): the STRIP stays on
  // screen wherever the page is scrolled — what's running, the stream, the AI, the levers used most (Go now,
  // Pause, Stop) and what the last press did — and under it five SECTIONS instead of one long page:
  //   Run (start one, or the live picture and its levers) · Cast · Stream · History · Diagnostics.
  // The Run section stays mounted while another is open (its live picture keeps its socket and its log).
  // Everything is read off the panel's one reading (panel.svelte.ts).
  import { onDestroy, onMount } from "svelte";
  import { sessionHeaders } from "../assets";
  import { ask } from "../../lib/confirm.svelte";
  import { MAP_ID, SITE_9, useMap } from "../show/site";
  import { mmss, panel, type RunStatus } from "./panel.svelte";
  import LivePicture from "./LivePicture.svelte";
  import Lineup from "./Lineup.svelte";
  import CastRoster from "./CastRoster.svelte";
  import RunHistory from "./RunHistory.svelte";
  import StreamAdmin from "./StreamAdmin.svelte";
  import Diagnostics from "./Diagnostics.svelte";

  interface MapWire { id: string; name: string; blurb: string; objectives: string[]; minutes: number; maxCast: number; building?: boolean }
  interface CharWire { id: string; name: string; tag: string; status: "cast" | "bench" }
  interface Choice { id: string; name: string; n?: number }

  const post = (path: string, body: unknown) =>
    fetch(path, { method: "POST", headers: { ...sessionHeaders(), "content-type": "application/json" }, body: JSON.stringify(body) });
  const get = (path: string) => fetch(path, { headers: sessionHeaders() });

  const run = $derived(panel.run);
  const ai = $derived(panel.minds);
  interface MapChoices { starts: Choice[]; part: Choice[]; note: Choice[] }
  let setup = $state<{ maps: MapWire[]; characters: CharWire[]; stream: boolean; choices: MapChoices & { countdown: number[] }; byMap: Record<string, MapChoices> } | null>(null);
  let busy = $state(false);
  let err = $state("");
  let note = $state("");

  // ---- the sections (the open one is remembered on this browser) ----
  type Section = "run" | "cast" | "stream" | "history" | "diag";
  const SECTIONS: [Section, string][] = [["run", "Run"], ["cast", "Cast"], ["stream", "Stream"], ["history", "History"], ["diag", "Diagnostics"]];
  const KEY = "solace_survivorz_section";
  let section = $state<Section>((() => { try { const v = localStorage.getItem(KEY) as Section | null; return v && SECTIONS.some(([s]) => s === v) ? v : "run"; } catch { return "run"; } })());
  let scroller = $state<HTMLDivElement | null>(null);
  const toTop = (): void => { scroller?.scrollTo({ top: 0 }); };
  function open(s: Section): void {
    section = s; toTop();
    try { localStorage.setItem(KEY, s); } catch { /* storage off */ }
  }

  // ---- the picks for the next run ----
  let pickMap = $state("");
  let pickCast = $state<string[]>([]);
  const chosenMap = $derived(setup?.maps.find((m) => m.id === pickMap) ?? null);
  /** the PICKED map's rooms and hiding places (not the last run's map's) */
  const ch = $derived<MapChoices>(setup?.byMap[pickMap] ?? setup?.choices ?? { starts: [], part: [], note: [] });
  const castOk = $derived(!!chosenMap && pickCast.length >= 1 && pickCast.length <= chosenMap.maxCast);
  const charName = (id: string): string => setup?.characters.find((c) => c.id === id)?.name ?? id;
  const mapName = (id: string | null | undefined): string => setup?.maps.find((m) => m.id === id)?.name ?? id ?? "—";
  // ---- the run setup's picks (stage 3): a start room each, the part's and the note's spots ("" = the roll) ----
  let pickStarts = $state<Record<string, string>>({});
  let pickPart = $state("");
  let pickNote = $state("");
  // (a start place holds as many as the map gives it: `n`, one where the map doesn't say)
  const takenRooms = (who: string): Set<string> => {
    const count = new Map<string, number>();
    for (const [w, r] of Object.entries(pickStarts)) if (w !== who && r && pickCast.includes(w)) count.set(r, (count.get(r) ?? 0) + 1);
    return new Set([...count].filter(([r, c]) => c >= (ch.starts.find((x) => x.id === r)?.n ?? 1)).map(([r]) => r));
  };
  /** the picks for who's actually starting (a pick for somebody who left the lineup is dropped) */
  const setupPick = (): Record<string, unknown> => {
    const starts = Object.fromEntries(Object.entries(pickStarts).filter(([w, r]) => r && pickCast.includes(w)));
    return { ...(Object.keys(starts).length ? { starts } : {}), ...(pickPart ? { partSpot: pickPart } : {}), ...(pickNote ? { noteSpot: pickNote } : {}) };
  };
  const anyPicked = $derived(Object.entries(pickStarts).some(([w, r]) => r && pickCast.includes(w)) || !!pickPart || !!pickNote);
  let historyTick = $state(0);

  // ---- the testing levers' picks ----
  // (the room names are the running map's: the status says which, show/site.ts useMap)
  let mapKey = $state(MAP_ID);
  $effect(() => { const m = run?.map; if (m) { useMap(m); if (MAP_ID !== mapKey) mapKey = MAP_ID; } });
  const ROOM_NAME = $derived.by(() => { void mapKey; return new Map(SITE_9.rooms.map((r) => [r.id, r.name])); });
  const SPOT_ROOM = $derived.by(() => { void mapKey; return new Map(SITE_9.rooms.flatMap((r) => r.spots.map((sp) => [sp.id, r.name] as const))); });
  const ROOMS = $derived.by(() => { void mapKey; return SITE_9.rooms.filter((r) => r.id !== "tunnel").map((r) => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name)); });
  const JUMPS: [string, string][] = [["part", "Radio part found"], ["code", "Code found"], ["sealed", "Door sealed"], ["fixed", "Radio fixed"], ["called", "Call made"], ["clear", "Bunker clear"]];
  let jumpTo = $state("sealed");
  const isBunker = $derived(mapKey === "bunker");
  let spawnN = $state(3);
  let spawnRoom = $state("");
  let clearRoom = $state("");
  let showMin = $state(60);
  let startDead = $state<number | null>(null);
  // WALK THE MAP (Josh, Nov 13 2026): the admin's own body in a private run on the picked map, with every action a
  // survivor has there. The standard for every map. The picture is the show's own page in its walk mode.
  let walkOpen = $state(false);
  let walkAs = $state("");
  // (a fighter by default: the first of the cast is a doctor with a knife, and the dead are real)
  const walkDefault = $derived((setup?.characters.find((c) => c.id === "rick") ?? setup?.characters[0])?.id ?? "");
  let walkDead = $state<"map" | "none">("map");
  async function walkMap(): Promise<void> {
    if (!chosenMap) { say(false, "pick a map"); return; }
    const who = walkAs || walkDefault;
    if (await lever("walk", { map: chosenMap.id, ...(who ? { who } : {}), ...(walkDead === "none" ? { zombies: 0 } : {}) })) walkOpen = true;
  }
  async function endWalk(): Promise<void> {
    walkOpen = false;
    if (run?.running && run.walk) { await lever("stop", {}, "Walk ended."); void loadSetup(); }
  }
  // THE COUNTDOWN a real show waits on its card before the clock starts (Josh: "let me set the wait time for the
  // stream to start") — minutes, from the server's own list; null until the setup says the default
  let countdownMin = $state<number | null>(null);
  const cdLabel = (m: number): string => (m === 0 ? "None" : m === 1 ? "1 minute" : `${m} minutes`);
  const TRICKLE: [number, string][] = [[0, "Off"], [0.5, "Slow"], [1, "Normal"], [2, "Fast"], [4, "Flood"]];

  // ---- reading ----
  async function loadSetup(): Promise<void> {
    try {
      const r = await get("/api/admin/survivorz/setup");
      if (!r.ok) return;
      const j = await r.json();
      setup = { maps: j.maps, characters: j.characters, stream: j.stream === true, choices: { starts: [], part: [], note: [], countdown: [0, 1, 2, 5, 10, 15], ...(j.choices ?? {}) }, byMap: j.choicesByMap ?? {} };
      if (!pickMap) pickMap = j.defaults?.map ?? j.maps[0]?.id ?? "";
      if (countdownMin === null) countdownMin = Number.isFinite(j.countdownDefault) ? j.countdownDefault : 5;
    } catch { /* the start card says it can't start without a setup */ }
  }
  let stopWatch: (() => void) | null = null;
  let noteTimer = 0;
  onMount(() => { stopWatch = panel.watch(); void loadSetup(); });
  onDestroy(() => { stopWatch?.(); window.clearTimeout(noteTimer); });

  // a real show asks first; a test run acts at once (Josh's rule)
  const real = $derived(!!run?.running && !run.test);
  async function sure(title: string, body: string): Promise<boolean> {
    return !real || (await ask({ title, body, danger: true }));
  }
  const ERR: Record<string, string> = {
    not_test: "only a test run can do that", bad_zombies: "the dead at the start: 0 to 60", bad_text: "say a little more (3 to 300 letters)", test_run: "a test run can't go on air", busy: "already jumping",
    bad_countdown: "that countdown isn't one of the choices", bad_cast: "that cast doesn't fit the map", bad_starts: "two survivors can't wake in the same room", bad_spot: "that hiding place isn't on this map", bad_map: "that map can't be run yet", bad_who: "that survivor can't be walked as", bad_jump: "that jump isn't on this map (1 to 120 minutes, or one of the bunker's objectives)", no_stream_rig: "no stream rig on this server",
    refused: "that didn't take (no room there, or nothing to do)",
    already_running: "a run is already going", not_running: "no run is going", no_countdown: "the countdown is over", bad_wait: "1 to 15 minutes", no_world: "this server can't run the show", failed: "the server couldn't do that — see Diagnostics",
  };
  function say(ok: boolean, text: string): void {
    err = ok ? "" : text; note = ok ? text : "";
    window.clearTimeout(noteTimer);
    // what a press did stays up a while, then clears (a refusal stays until the next press)
    if (ok && text) noteTimer = window.setTimeout(() => { note = ""; }, 6000);
  }
  async function act(path: string, body: unknown, done?: string): Promise<boolean> {
    if (busy) return false;
    busy = true; err = ""; note = "";
    try {
      const r = await post(path, body);
      const j = await r.json().catch(() => null);
      if (!r.ok) { say(false, ERR[j?.error] ?? j?.error ?? `refused (${r.status})`); return false; }
      const st = (j?.running !== undefined ? j : j?.status?.running !== undefined ? j.status : null) as RunStatus | null;
      if (st) panel.setRun(st);
      if (done) say(true, done);
      return true;
    } catch (e) { say(false, String((e as Error)?.message ?? e)); return false; }
    finally { busy = false; void panel.refresh(); }
  }
  const lever = (op: string, extra: Record<string, unknown> = {}, done?: string) => act("/api/admin/survivorz/show", { op, ...extra }, done);

  async function start(op: "start" | "test", stream = false): Promise<void> {
    if (!castOk || !chosenMap) { say(false, "pick a map and at least one survivor"); return; }
    const cd = countdownMin ?? 5;
    if (op === "start" && !(await ask({
      title: stream ? "Start the show and stream it?" : "Start the show?",
      body: `Run #${(run?.lastRunNo ?? 0) + 1} on ${chosenMap.name} with ${pickCast.map(charName).join(", ")}. ${cd ? `A ${cd}-minute countdown first.` : "No countdown: it starts at once."}${stream ? ` It goes live on YouTube as ${cd ? "the countdown starts" : "it starts"}.` : ""}`,
    }))) return;
    await lever(op, { map: chosenMap.id, cast: [...pickCast], ...setupPick(), ...(stream ? { stream: true } : {}), ...(op === "start" ? { countdown: cd } : {}), ...(op === "test" && startDead !== null ? { zombies: startDead } : {}) }, op === "test" ? "Test run started." : "Show started.");
    toTop();   // (the live picture is at the top; the page was down at the Start buttons)
  }
  async function stop(): Promise<void> {
    if (!(await sure("Stop the show?", panel.stream?.want ? "Watchers are told it's off air, and the YouTube stream ends." : "Watchers are told it's off air."))) return;
    if (await lever("stop", {}, "Stopped.")) { void loadSetup(); historyTick++; }
  }
  async function restart(same: boolean): Promise<void> {
    if (!(await sure(same ? "Restart from the same start?" : "Restart with a new start?", "The running world is thrown away and the survivors' memories start fresh."))) return;
    await lever("reset", same ? { same: true } : {}, same ? "Restarted from the same start." : "Restarted with a new start.");
    historyTick++;
  }
  async function pause(on: boolean): Promise<void> {
    if (on && !(await sure("Pause the show?", "The clock stops on every screen until you resume."))) return;
    await lever(on ? "pause" : "resume", {}, on ? "Paused." : "Resumed.");
  }
  const worldAct = (op: string, extra: Record<string, unknown>, done: string) => act("/api/admin/survivorz/act", { op, ...extra }, done);
  async function clearDead(): Promise<void> {
    await worldAct("clear", clearRoom ? { room: clearRoom } : {}, clearRoom ? `Cleared ${ROOM_NAME.get(clearRoom)}.` : "Every one of the dead put down.");
  }
  async function setNoHold(on: boolean): Promise<void> {
    if (on === !!run?.noHold) return;
    if (on && !(await sure("Carry on when the AI drops?", "A real show won't hold behind the Technical difficulties card: the survivors decide by code until the engine is back."))) return;
    await act("/api/admin/survivorz/nohold", { on }, on ? "The show carries on with code if the AI drops." : "The show holds if the AI drops.");
  }
  let lengthRun = "";
  $effect(() => { const key = `${run?.seed}:${run?.dials?.showMin}`; if (run?.dials && key !== lengthRun) { lengthRun = key; showMin = run.dials.showMin; } });
  async function spawn(): Promise<void> {
    await act("/api/admin/survivorz/spawn", { n: spawnN, ...(spawnRoom ? { room: spawnRoom } : {}) }, `${spawnN} more in ${spawnRoom ? ROOM_NAME.get(spawnRoom) : isBunker ? "the bunker" : "the grounds"}.`);
  }
  async function setAi(on: boolean): Promise<void> {
    if (!on && !(await sure("Turn the survivors' AI off?", "They carry on deciding by code."))) return;
    await act("/api/admin/survivorz/talk", { on }, on ? "The AI decides." : "Code decides.");
  }
  async function setOnAir(on: boolean): Promise<void> {
    if (!on && !(await sure("Take it off air?", "Members watching in Solace are told it's off air."))) return;
    await lever(on ? "onair" : "offair", {}, on ? "On air in Solace." : "Off air.");
  }

  const aiOn = $derived(panel.talkOn === true);
  const aiTone = $derived(!aiOn ? "" : panel.engineUp ? "good" : "warn");
</script>

<div class="cr" bind:this={scroller}>
  <!-- THE STRIP: what's happening, and the levers used most — on screen wherever the page is scrolled -->
  <div class="top">
  <section class="strip" class:live={run?.running && !run.paused && !run.held} class:test={run?.test} class:held={run?.held}>
    <div class="what">
      <div class="big">{panel.runLabel}</div>
      <div class="state">{panel.runState}</div>
    </div>
    <div class="facts">
      {#if run?.running}
        <span>{mapName(run.map)}</span>
        {#if run.cast?.length}<span title={run.cast.map(charName).join(" · ")}>{run.cast.length} survivor{run.cast.length === 1 ? "" : "s"}</span>{/if}
        {#if run.test && run.speed > 1}<span>{run.speed}× speed</span>{/if}
        <span class:air={run.onAir}>{run.onAir ? `ON AIR · ${run.members} watching` : "off air"}</span>
      {/if}
      {#if panel.stream?.configured}<button class="fact" class:yt={panel.live} class:warn={panel.stream.want && !panel.live} onclick={() => open("stream")}>{panel.rigLabel}</button>{/if}
      <span class={aiTone}>AI: {!aiOn ? "off" : panel.engineUp ? "up" : "down"}{aiOn && ai?.share.pct != null ? ` · ${ai.share.pct}%` : ""}</span>
      {#if panel.red.length}<button class="fact bad" onclick={() => open("diag")}>{panel.red.length} check{panel.red.length === 1 ? "" : "s"} red</button>{/if}
    </div>
    <div class="quick">
      {#if run?.running}
        {#if run.countdown > 0}
          <button class="go" disabled={busy} onclick={() => lever("go", {}, "Started.")}>Go now</button>
          <button disabled={busy} onclick={() => lever("wait", { minutes: 1 }, "One more minute.")} title="Add a minute to the countdown">+1 min</button>
        {/if}
        {#if !run.paused}<button disabled={busy} onclick={() => pause(true)}>Pause</button>
        {:else}<button class="go" disabled={busy} onclick={() => pause(false)}>Resume</button>{/if}
        <button class="danger" disabled={busy} onclick={stop}>Stop</button>
      {:else if run && section !== "run"}
        <button class="go" onclick={() => open("run")}>Start a run…</button>
      {/if}
    </div>
    {#if err}<p class="err" role="alert">{err}</p>{:else if note}<p class="ok" role="status">{note}</p>
    {:else if panel.offline}<p class="err" role="alert">The server isn't answering. Trying again…</p>{/if}
  </section>

  <nav class="sections" aria-label="Control room">
    {#each SECTIONS as [id, label] (id)}
      <button class:active={section === id} onclick={() => open(id)}>
        {label}
        {#if id === "stream" && panel.live}<i class="dot yt"></i>{:else if id === "diag" && panel.red.length}<i class="dot bad"></i>{:else if id === "run" && run?.running}<i class="dot" class:test={run.test}></i>{/if}
      </button>
    {/each}
  </nav>
  </div>

  <!-- RUN (kept mounted: the live picture's socket and its log outlive a look at another section) -->
  <div class="grid" class:gone={section !== "run"}>
    {#if !run}
      <section class="card wide"><p class="hint">{panel.offline ? "The server isn't answering." : "Loading…"}</p></section>
    {:else if !run.running}
      <!-- START A RUN -->
      <section class="card wide">
        <h3>Start a run</h3>
        {#if !setup}<p class="hint">Loading the maps and the cast…</p>{:else}
          <div class="lbl">Map</div>
          <div class="chips">
            {#each setup.maps as m (m.id)}
              <button class="chip" class:on={pickMap === m.id} disabled={m.building} onclick={() => { if (pickMap !== m.id) { pickStarts = {}; pickPart = ""; pickNote = ""; } pickMap = m.id; pickCast = pickCast.slice(0, m.maxCast); }}>
                <b>{m.name}</b><small>{m.building ? "being built" : `${m.minutes} min · up to ${m.maxCast}`}</small>
              </button>
            {/each}
          </div>
          {#if chosenMap}<p class="hint">{chosenMap.blurb}</p>{/if}
          <div class="lbl">The lineup <button class="link" onclick={() => open("cast")}>who's in the show →</button></div>
          <Lineup characters={setup.characters} seats={chosenMap?.maxCast ?? 6} onCast={(c) => (pickCast = c)} />

          <details class="picks" open={anyPicked}>
            <summary>Run setup <span class="hint">{anyPicked ? "some picked" : "all random"}</span></summary>
            <div class="pickgrid">
              {#each pickCast as who (who)}
                {@const taken = takenRooms(who)}
                <label>{charName(who)} wakes in
                  <select value={pickStarts[who] ?? ""} onchange={(e) => (pickStarts = { ...pickStarts, [who]: (e.currentTarget as HTMLSelectElement).value })}>
                    <option value="">a random room</option>
                    {#each ch.starts as r (r.id)}<option value={r.id} disabled={taken.has(r.id)}>{r.name}</option>{/each}
                  </select>
                </label>
              {/each}
              {#if ch.part.length}
                <label>The radio part is in
                  <select bind:value={pickPart}>
                    <option value="">a random spot</option>
                    {#each ch.part as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
                  </select>
                </label>
              {/if}
              {#if ch.note.length}
                <label>The code is in
                  <select bind:value={pickNote}>
                    <option value="">a random spot</option>
                    {#each ch.note as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
                  </select>
                </label>
              {/if}
            </div>
            {#if anyPicked}<button class="mini" onclick={() => { pickStarts = {}; pickPart = ""; pickNote = ""; }}>All random</button>{/if}
          </details>
          <div class="two">
            <div>
              <div class="lbl">The countdown <span class="tag show">show</span></div>
              <div class="row">
                <select value={String(countdownMin ?? 5)} onchange={(e) => (countdownMin = Number((e.currentTarget as HTMLSelectElement).value))}>
                  {#each setup.choices.countdown as m (m)}<option value={String(m)}>{cdLabel(m)}</option>{/each}
                </select>
                <span class="hint">on its card before the clock starts</span>
              </div>
            </div>
            <div>
              <div class="lbl">The dead at the start <span class="tag">test run</span></div>
              <div class="row">
                <input type="number" min="0" max="60" placeholder="20" value={startDead ?? ""} oninput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; startDead = v === "" ? null : Math.max(0, Math.min(60, Math.round(Number(v)))); }} />
                <span class="hint">{startDead === null ? "as the map says" : "a show always starts as the map says"}</span>
              </div>
            </div>
          </div>
          <div class="row starts">
            {#if setup.stream}<button class="go big" disabled={busy || !castOk} onclick={() => start("start", true)}>▶ Start show + stream to YouTube</button>{/if}
            <button class="go" disabled={busy || !castOk} onclick={() => start("start")}>Start show</button>
            <button disabled={busy || !castOk} onclick={() => start("test")}>Test run</button>
          </div>
          <p class="hint">A show is numbered and starts with the countdown. A test run starts at once, isn't numbered, can't go on air, and has the testing levers.</p>

          <div class="walkcard">
            <div class="lbl">Walk the map</div>
            <div class="row">
              <label>as <select value={walkAs || walkDefault} onchange={(e) => (walkAs = (e.currentTarget as HTMLSelectElement).value)}>{#each setup.characters as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select></label>
              <label>the dead <select bind:value={walkDead}><option value="map">as the map has them</option><option value="none">none</option></select></label>
              <button class="go" disabled={busy || !chosenMap} onclick={walkMap}>🚶 Walk {chosenMap?.name ?? "the map"}</button>
            </div>
            <p class="hint">You are put in the map as one survivor and walk it yourself: doors, stairs, searching, fighting and every objective, by the same rules the survivors play by. Only you see it.</p>
          </div>
        {/if}
      </section>
    {:else}
      {#if run.walk && !walkOpen}
        <section class="card wide">
          <h3>You are walking {mapName(run.map)}</h3>
          <div class="row"><button class="go" onclick={() => (walkOpen = true)}>🚶 Go back in</button><button disabled={busy} onclick={endWalk}>End the walk</button></div>
        </section>
      {/if}
      <LivePicture test={run.test} {busy} {charName} {act} />

      <!-- THE RUN -->
      <section class="card">
        <h3>Run</h3>
        <div class="row">
          <button disabled={busy} onclick={() => restart(true)}>↺ Same start</button>
          <button disabled={busy} onclick={() => restart(false)}>↺ New start</button>
          <button disabled={busy} onclick={() => lever("save", {}, "Saved.")} title="Write the running world to disk now">Save now</button>
        </div>
        {#if run.setup}
          <p class="hint">
            Starts: {run.setup.starts.map((s) => `${charName(s.who)} in ${ROOM_NAME.get(s.room) ?? s.room}`).join(", ")}.
            {#if run.setup.partSpot || run.setup.noteSpot}The radio part is in {SPOT_ROOM.get(run.setup.partSpot) ?? "?"}, the code in {SPOT_ROOM.get(run.setup.noteSpot) ?? "?"}.{/if}
            {run.setup.zombies} dead, {run.setup.inside} inside. Seed {run.setup.seed}.
          </p>
        {/if}
      </section>

      {#if run.test}
        <!-- TIMING (a test run only) -->
        <section class="card">
          <h3>Timing <span class="tag">test run</span></h3>
          <div class="lbl">Speed</div>
          <div class="seg">
            {#each [1, 2, 4, 8] as x (x)}<button disabled={busy} class:on={run.speed === x} onclick={() => lever("speed", { speed: x })}>{x}×</button>{/each}
          </div>
          <div class="lbl">Jump ahead</div>
          <div class="row">
            <button disabled={busy || !!run.jumping} onclick={() => lever("jump", { minutes: 5 }, "Jumping 5 minutes…")}>+5 min</button>
            <button disabled={busy || !!run.jumping} onclick={() => lever("jump", { minutes: 15 }, "Jumping 15 minutes…")}>+15 min</button>
          </div>
          {#if isBunker}
            <div class="row">
              <select bind:value={jumpTo}>{#each JUMPS as [id, label] (id)}<option value={id}>{label}</option>{/each}</select>
              <button disabled={busy || !!run.jumping} onclick={() => lever("jump", { objective: jumpTo }, "Jumping…")}>Jump to it</button>
            </div>
          {/if}
          {#if run.jumping}<p class="hint">Jumping to {run.jumping.to}…</p>{/if}
          <div class="lbl">Show length</div>
          <div class="row">
            <input type="number" min="5" max="180" bind:value={showMin} /> <span class="hint">minutes</span>
            <button disabled={busy || showMin === run.dials?.showMin} onclick={() => worldAct("length", { minutes: showMin }, `The show runs ${showMin} minutes.`)}>Set</button>
          </div>
        </section>

        <!-- ZOMBIES (a test run only) -->
        <section class="card">
          <h3>Zombies <span class="tag">test run</span></h3>
          <div class="row">
            <input type="number" min="1" max="10" bind:value={spawnN} />
            <select bind:value={spawnRoom}>
              <option value="">{isBunker ? "anywhere (the breach)" : "anywhere (the grounds)"}</option>
              {#each ROOMS as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
            </select>
            <button disabled={busy || !(spawnN >= 1 && spawnN <= 10)} onclick={spawn}>Spawn</button>
          </div>
          <div class="row">
            <select bind:value={clearRoom}>
              <option value="">all of them</option>
              {#each ROOMS as r (r.id)}<option value={r.id}>in {r.name}</option>{/each}
            </select>
            <button class="danger" disabled={busy} onclick={clearDead}>Put them down</button>
          </div>
          <div class="lbl">{isBunker ? "More from the tunnel" : "More onto the grounds"}</div>
          <div class="seg">
            {#each TRICKLE as [x, label] (x)}<button disabled={busy} class:on={run.dials?.trickle === x} onclick={() => worldAct("trickle", { rate: x }, `${isBunker ? "The tunnel" : "The grounds"}: ${label.toLowerCase()}.`)}>{label}</button>{/each}
          </div>
          {#if run.dials?.startZombies != null}<p class="hint">Started with {run.dials.startZombies} of the dead.</p>{/if}
        </section>
      {:else}
        <section class="card">
          <h3>A real show</h3>
          <p class="hint">A numbered show is the AI's alone: speed, jumps and the survivor and zombie levers are only on test runs.</p>
        </section>
      {/if}
    {/if}

    <!-- THE AI -->
    <section class="card">
      <h3>Survivor AI</h3>
      <p class="line {aiTone}">{panel.aiLabel}</p>
      {#if aiOn && ai?.share.pct != null}<p class="hint">The AI made {ai.share.pct}% of their choices in the last hour ({ai.decided} decided).</p>{/if}
      {#if aiOn && !panel.engineUp && real}<p class="hint">{run?.noHold ? "The survivors decide by code until the engine is back." : "A real show holds behind the Technical difficulties card until the engine is back."}</p>{/if}
      <div class="lbl">Who decides</div>
      <div class="seg">
        <button disabled={busy || panel.talkOn === null} class:on={aiOn} onclick={() => { if (!aiOn) void setAi(true); }}>The AI</button>
        <button disabled={busy || panel.talkOn === null} class:on={panel.talkOn === false} onclick={() => { if (aiOn) void setAi(false); }}>Code</button>
      </div>
      <div class="lbl">If the AI drops on a real show</div>
      <div class="seg">
        <button disabled={busy || !run} class:on={!!run && !run.noHold} onclick={() => setNoHold(false)}>Hold</button>
        <button disabled={busy || !run} class:on={!!run?.noHold} onclick={() => setNoHold(true)}>Carry on with code</button>
      </div>
    </section>

    <!-- ON AIR IN SOLACE -->
    <section class="card">
      <h3>On air in Solace</h3>
      {#if run?.running && !run.test}
        <p class="line" class:good={run.onAir}>{run.onAir ? `On air · ${run.members} watching` : "Off air — only you can watch"}</p>
        <div class="seg">
          <button disabled={busy} class:on={run.onAir} onclick={() => { if (!run.onAir) void setOnAir(true); }}>On air</button>
          <button disabled={busy} class:on={!run.onAir} onclick={() => { if (run.onAir) void setOnAir(false); }}>Off air</button>
        </div>
      {:else}
        <p class="hint">{run?.running ? "A test run never goes on air. Only you can watch it, on the Survivorz page." : "Once a show is running, this puts it on the Survivorz page for members."}</p>
      {/if}
    </section>
  </div>

  {#if section === "cast"}
    <section class="card">
      <h3>The cast</h3>
      <CastRoster onchange={() => void loadSetup()} />
    </section>
  {:else if section === "stream"}
    <StreamAdmin embedded />
  {:else if section === "history"}
    <section class="card">
      <h3>Run history</h3>
      <RunHistory {charName} {mapName} refresh={historyTick} />
    </section>
  {:else if section === "diag"}
    <Diagnostics {busy} {lever} />
  {/if}
</div>

{#if walkOpen}
  <!-- WALK THE MAP: the show's own page over everything, its keys driving your body (lazy: the 3D page is its own chunk) -->
  <div class="walkview">
    {#await import("../show/Show.svelte")}
      <div class="walkwait"><span>Loading the map…</span></div>
    {:then m}
      <m.default watch walk onExit={endWalk} />
    {:catch}
      <div class="walkwait">
        <span>The map view didn't load. Refresh the page and go back in.</span>
        <button onclick={() => (walkOpen = false)}>Back</button>
      </div>
    {/await}
  </div>
{/if}

<style>
  .cr { display: flex; flex-direction: column; gap: 12px; flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 20px; }
  .top { position: sticky; top: 0; z-index: 5; display: flex; flex-direction: column; gap: 8px; background: var(--bg, var(--panel)); padding-bottom: 6px; margin-bottom: -6px; }
  .strip { border: 1px solid var(--line); background: var(--panel-2); border-radius: 12px; padding: 12px 16px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 6px 18px; box-shadow: 0 6px 14px -10px rgba(0, 0, 0, 0.7); }
  .strip.live { border-color: color-mix(in srgb, var(--ok, #6fbf73) 55%, var(--line)); }
  .strip.test { border-color: rgba(224, 195, 74, 0.55); }
  .strip.held { border-color: rgba(255, 120, 80, 0.7); }
  .what { display: flex; align-items: baseline; gap: 12px; white-space: nowrap; }
  .big { font-size: 1.4rem; font-weight: 800; letter-spacing: 0.02em; }
  .state { color: var(--ink-soft); font-size: 0.98rem; font-variant-numeric: tabular-nums; }
  .strip.live .state { color: var(--ok, #6fbf73); }
  .strip.held .state { color: #ff9a6a; }
  .facts { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
  .facts span, .fact { font: inherit; font-size: 0.78rem; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--line); color: var(--ink-soft); background: var(--panel); white-space: nowrap; }
  .fact { cursor: pointer; }
  .facts .air, .fact.yt { color: #ff4d42; border-color: rgba(255, 77, 66, 0.5); font-weight: 700; }
  .facts .good { color: var(--ok, #6fbf73); border-color: color-mix(in srgb, var(--ok, #6fbf73) 45%, transparent); }
  .facts .warn, .fact.warn { color: #e0a34a; border-color: rgba(224, 163, 74, 0.5); }
  .fact.bad { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 55%, transparent); font-weight: 700; }
  .quick { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .strip .err, .strip .ok { grid-column: 1 / -1; margin: 2px 0 0; font-size: 0.88rem; }
  .err { color: var(--danger); } .ok { color: var(--ok, #6fbf73); }
  .sections { display: flex; gap: 4px; flex-wrap: wrap; align-self: flex-start; background: var(--panel-2); border: 1px solid var(--line); border-radius: 9px; padding: 3px; }
  .sections button { background: transparent; border: 0; border-radius: 6px; padding: 6px 14px; color: var(--ink-soft); display: flex; align-items: center; gap: 6px; }
  .sections button:hover { color: var(--ink); }
  .sections button.active { background: var(--panel); color: var(--accent); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ok, #6fbf73); }
  .dot.test { background: #e0c34a; } .dot.yt { background: #ff4d42; } .dot.bad { background: var(--danger); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; align-items: start; }
  .grid.gone { display: none; }
  .card { border: 1px solid var(--line); background: var(--panel-2); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .card.wide { grid-column: 1 / -1; }
  h3 { margin: 0; font-size: 0.95rem; letter-spacing: 0.04em; display: flex; align-items: center; gap: 8px; }
  .tag { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; background: rgba(224, 195, 74, 0.14); color: #e0c34a; }
  .tag.show { background: color-mix(in srgb, var(--ok, #6fbf73) 16%, transparent); color: var(--ok, #6fbf73); }
  .lbl { font-size: 0.78rem; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.06em; display: flex; gap: 6px; align-items: center; }
  .hint { margin: 0; color: var(--ink-soft); font-size: 0.84rem; line-height: 1.4; }
  .line { margin: 0; font-weight: 600; }
  .line.good { color: var(--ok, #6fbf73); } .line.warn { color: #e0a34a; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .row.starts { padding-top: 4px; border-top: 1px solid var(--line); margin-top: 2px; padding-top: 12px; }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px 24px; }
  .two > div { display: flex; flex-direction: column; gap: 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  button { background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 8px 14px; font: inherit; font-size: 0.88rem; cursor: pointer; }
  button:hover:not(:disabled) { border-color: var(--accent); }
  button:disabled { opacity: 0.45; cursor: default; }
  button.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--panel)); }
  button.go { background: color-mix(in srgb, var(--ok, #6fbf73) 22%, var(--panel)); border-color: color-mix(in srgb, var(--ok, #6fbf73) 55%, transparent); }
  button.big { font-weight: 800; padding: 10px 18px; }
  button.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 50%, transparent); }
  button.link { background: none; border: 0; padding: 0; color: var(--accent); font-size: 0.76rem; text-transform: none; letter-spacing: 0; }
  .chip { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 7px 12px; }
  .chip small { color: var(--ink-soft); font-size: 0.74rem; }
  .chip.on { background: color-mix(in srgb, var(--accent) 16%, var(--panel)); }
  .picks { border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; }
  .picks summary { cursor: pointer; font-size: 0.86rem; font-weight: 600; display: flex; gap: 8px; align-items: baseline; }
  .pickgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; margin-top: 6px; }
  .pickgrid label { display: flex; flex-direction: column; gap: 3px; font-size: 0.8rem; color: var(--ink-soft); }
  button.mini { align-self: flex-start; padding: 4px 10px; font-size: 0.78rem; }
  .seg { display: flex; flex-wrap: wrap; gap: 4px; }
  select, input { background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; font: inherit; font-size: 0.88rem; }
  input[type="number"] { width: 70px; }
  @media (max-width: 760px) {
    .strip { grid-template-columns: 1fr; }
    .quick { justify-content: flex-start; }
  }
  .walkcard { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
  .walkcard label { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-soft); font-size: 0.85rem; }
  .walkview { position: fixed; inset: 0; z-index: var(--z-modal, 10000); background: #000; }
  .walkwait { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 12px; align-items: center; justify-content: center; color: #e8e6e1; }
  .walkwait button { padding: 8px 16px; border-radius: 8px; border: 1px solid #555; background: #222; color: inherit; cursor: pointer; min-height: 40px; }
</style>
