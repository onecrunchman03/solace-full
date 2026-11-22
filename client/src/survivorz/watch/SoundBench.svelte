<script lang="ts">
  // SOLACE SURVIVORZ — the SOUND ENGINE bench (Admin Panel → Survivorz → Assets → Sound engine). Everything
  // the engine does, heard without a run: a sound placed around the camera (with walls and the room's
  // echo), every game event's cue, footsteps at each pace, the PA through the ceiling speakers, and the
  // score run by hand the way the director will run it. The rooms are the bunker's (show/site.ts).
  import { onDestroy } from "svelte";
  import { SoundEngine, type Emitter, type Vec3 } from "../audio/engine";
  import { CUES } from "../audio/cues";
  import { CAST_ORDER } from "../show/overlay";
  import { ACOUSTIC, ROOM_ACOUSTIC, STEP_RATE, type PaceId, type RoomPreset, type Surface } from "../audio/rules";
  import { STING, type Level } from "../audio/music-rules";
  import { ROOMS } from "../show/site";

  let engine = $state<SoundEngine | null>(null);
  let error = $state<string | null>(null);
  let starting = $state(false);

  async function start() {
    starting = true;
    error = null;
    try {
      const e = await SoundEngine.create();
      if (destroyed) { e.dispose(); return; }
      e.setOcclusion(() => walls);
      e.setListener([0, 1.6, 0], 0, listenerRoom, zoneOfRoom(listenerRoom));
      engine = e;
      ids = e.ids().sort();
      groups = [...new Set(ids.map((id) => e.groupOf(id)))].sort();
      draw();
    } catch (err) {
      error = err instanceof Error ? err.message : "failed";
    } finally {
      starting = false;
    }
  }

  let ids = $state<string[]>([]);
  let groups = $state<string[]>([]);
  let group = $state("guns");
  let sound = $state("gun-pistol-shot");
  const groupIds = $derived(ids.filter((id) => engine?.groupOf(id) === group));
  $effect(() => { if (groupIds.length && !groupIds.includes(sound)) sound = groupIds[0]; });

  // ---- the pad: a 40 m square seen from above, the camera in the middle facing up ----
  const SIZE = 340, SPAN = 40;
  let canvas = $state<HTMLCanvasElement | null>(null);
  let src = $state<Vec3>([6, 1.2, -8]);
  let walls = $state(0);
  let orbit = $state(false);
  let loopEm: Emitter | null = null;
  let looping = $state(false);
  const toPx = (m: number) => SIZE / 2 + (m / SPAN) * SIZE;

  function draw() {
    const c = canvas?.getContext("2d");
    if (!c) return;
    c.clearRect(0, 0, SIZE, SIZE);
    c.strokeStyle = "rgba(127,127,127,0.25)";
    for (let m = -20; m <= 20; m += 5) {
      c.beginPath(); c.moveTo(toPx(m), 0); c.lineTo(toPx(m), SIZE); c.stroke();
      c.beginPath(); c.moveTo(0, toPx(m)); c.lineTo(SIZE, toPx(m)); c.stroke();
    }
    // the camera, facing up (-z)
    c.fillStyle = "#3b82f6";
    c.beginPath(); c.moveTo(toPx(0), toPx(-1.6)); c.lineTo(toPx(-1), toPx(1)); c.lineTo(toPx(1), toPx(1)); c.closePath(); c.fill();
    // the source
    c.fillStyle = "#e0573c";
    c.beginPath(); c.arc(toPx(src[0]), toPx(src[2]), 6, 0, Math.PI * 2); c.fill();
    if (walls > 0) {
      c.strokeStyle = "rgba(224,87,60,0.6)"; c.setLineDash([4, 4]);
      c.beginPath(); c.moveTo(toPx(0), toPx(0)); c.lineTo(toPx(src[0]), toPx(src[2])); c.stroke(); c.setLineDash([]);
    }
    c.fillStyle = "rgba(127,127,127,0.9)";
    c.font = "11px system-ui";
    c.fillText(`${Math.hypot(src[0], src[2]).toFixed(1)} m · ${walls} wall${walls === 1 ? "" : "s"}`, 8, SIZE - 8);
  }
  $effect(() => { void src; void walls; draw(); });

  function placeAt(ev: MouseEvent) {
    const r = (ev.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width - 0.5) * SPAN;
    const z = ((ev.clientY - r.top) / r.height - 0.5) * SPAN;
    src = [x, 1.2, z];
    loopEm?.setPosition(src);
  }

  // orbiting the source round the camera, to hear it pan
  let orbitTimer: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    if (orbitTimer) clearInterval(orbitTimer);
    orbitTimer = null;
    if (!orbit) return;
    let a = Math.atan2(src[2], src[0]);
    const r = Math.max(3, Math.hypot(src[0], src[2]));
    orbitTimer = setInterval(() => {
      a += 0.06;
      src = [Math.cos(a) * r, 1.2, Math.sin(a) * r];
      loopEm?.setPosition(src);
    }, 80);
    return () => { if (orbitTimer) clearInterval(orbitTimer); };
  });

  function playHere() { void engine?.play(sound, { at: src }); }
  async function toggleLoop() {
    if (loopEm) { loopEm.stop(); loopEm = null; looping = false; return; }
    loopEm = (await engine?.loop(sound, { at: src })) ?? null;
    looping = !!loopEm;
  }

  // ---- the room the camera is in ----
  const rooms = ROOMS.map((r) => ({ id: r.id, name: r.room.name })).sort((a, b) => a.name.localeCompare(b.name));
  let listenerRoom = $state(rooms.find((r) => r.id === "generator")?.id ?? rooms[0]?.id ?? "");
  // the bunker is one set, so every room's zone is the same one the show passes (show/scene.ts)
  function zoneOfRoom(r: string): string | null { return ROOMS.find((x) => x.id === r)?.zone ?? null; }
  $effect(() => { engine?.setListener([0, 1.6, 0], 0, listenerRoom, zoneOfRoom(listenerRoom)); });
  const preset = $derived<RoomPreset>(ROOM_ACOUSTIC[listenerRoom] ?? "concrete");

  // ---- cues ----
  const events = Object.keys(CUES).sort();
  let event = $state("door.broken");
  let material = $state("wood");
  let kind = $state("door");
  // (the bunker has no power to cut: every cue fires with the lights on)
  const on = true;
  let who = $state("rick");
  function fireCue() { engine?.cue(event, { material, kind, on, who }, src); }

  // ---- footsteps ----
  let surface = $state<Surface>("concrete");
  let pace = $state<PaceId>("walk");
  let walking = $state(false);
  let stepTimer: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    if (stepTimer) clearInterval(stepTimer);
    stepTimer = null;
    if (!walking || !engine) return;
    stepTimer = setInterval(() => engine?.step(surface, pace, src), 1000 / STEP_RATE[pace]);
    return () => { if (stepTimer) clearInterval(stepTimer); };
  });

  // ---- the score ----
  let scoreOn = $state(false);
  let threat = $state(0);
  let fighting = $state(false);
  let night = $state(false);
  let level = $state<Level>("calm");
  let pin = $state<string>("");
  let muted = $state(false);
  let talking = $state(false);
  let stingId = $state("sting-contact");
  let scoreTimer: ReturnType<typeof setInterval> | null = null;
  async function startScore() {
    if (!engine) return;
    await engine.score.start();
    scoreOn = true;
    scoreTimer = setInterval(() => {
      engine?.score.update({ threat, fighting, zone: zoneOfRoom(listenerRoom), room: listenerRoom, night });
      level = engine?.score.level() ?? "calm";
    }, 250);
  }
  $effect(() => { if (scoreOn) engine?.score.pin(pin ? (pin as Level) : null); });
  $effect(() => { if (scoreOn) engine?.score.setMuted(muted); });
  function setTalking(v: boolean) {
    if (v === talking) return;
    talking = v;
    engine?.duck(v);
  }

  // ---- the PA (the bunker's breach announcements, through the ceiling speakers) ----
  const recIds = $derived(ids.filter((id) => /^pa-/.test(id)));
  let rec = $state("");
  $effect(() => { if (recIds.length && !recIds.includes(rec)) rec = recIds[0]; });

  let destroyed = false;
  onDestroy(() => {
    destroyed = true;
    if (scoreTimer) clearInterval(scoreTimer);
    if (stepTimer) clearInterval(stepTimer);
    if (orbitTimer) clearInterval(orbitTimer);
    engine?.dispose();
  });
</script>

<div class="bench">
  {#if !engine}
    <div class="intro">
      <p>Hear the sound engine without a run: place a sound around the camera, add walls, change the room, fire any game event, walk on each surface, play the PA, and run the score by hand.</p>
      <button class="go" onclick={start} disabled={starting}>{starting ? "Loading…" : "Start the sound engine"}</button>
      {#if error}<p class="err">Couldn't start: {error}</p>{/if}
    </div>
  {:else}
    <section class="card">
      <h3>A sound in the world</h3>
      <div class="pad-row">
        <canvas bind:this={canvas} width={SIZE} height={SIZE} onclick={placeAt} aria-label="Click to place the sound around the camera"></canvas>
        <div class="controls">
          <label>Group <select bind:value={group}>{#each groups as g}<option>{g}</option>{/each}</select></label>
          <label>Sound <select bind:value={sound}>{#each groupIds as id}<option>{id}</option>{/each}</select></label>
          <div class="row"><button onclick={playHere}>▶ Play here</button><button onclick={toggleLoop}>{looping ? "■ Stop loop" : "⟳ Loop here"}</button></div>
          <label>Walls between <input type="range" min="0" max="4" step="1" bind:value={walls} /> {walls}</label>
          <label class="check"><input type="checkbox" bind:checked={orbit} /> Circle the camera</label>
          <label>The camera's room
            <select bind:value={listenerRoom}>{#each rooms as r (r.id)}<option value={r.id}>{r.name}</option>{/each}</select>
          </label>
          <p class="note">Echo: <b>{preset}</b> ({ACOUSTIC[preset].decayS}s). The zone's room tone plays under it.</p>
        </div>
      </div>
    </section>

    <section class="card">
      <h3>Game events</h3>
      <div class="row wrap">
        <label>Event <select bind:value={event}>{#each events as ev}<option>{ev}</option>{/each}</select></label>
        <label>Material <select bind:value={material}><option>wood</option><option>metal</option><option>glass</option></select></label>
        <label>Door kind <select bind:value={kind}><option>door</option><option>keycard</option><option>keypad</option><option>vault</option></select></label>
        <label>Survivor <select bind:value={who}>{#each CAST_ORDER as w}<option>{w}</option>{/each}</select></label>
        <button onclick={fireCue}>⚡ Fire at the sound's spot</button>
      </div>
    </section>

    <section class="card">
      <h3>Footsteps</h3>
      <div class="row wrap">
        <label>Surface <select bind:value={surface}>{#each ["concrete", "vinyl", "grating", "water", "vent"] as s}<option>{s}</option>{/each}</select></label>
        <label>Pace <select bind:value={pace}><option>walk</option><option>run</option><option>sneak</option></select></label>
        <button onclick={() => (walking = !walking)}>{walking ? "■ Stop" : "🚶 Walk"}</button>
      </div>
    </section>

    <section class="card">
      <h3>The PA</h3>
      {#if recIds.length}
        <div class="row wrap">
          <select bind:value={rec}>{#each recIds as id (id)}<option>{id}</option>{/each}</select>
          <button onclick={() => void engine?.play(rec)}>▶ Play</button>
        </div>
        <p class="note">Plays through the ceiling speakers in the camera's room, with the score and room tone under it.</p>
      {:else}
        <p class="note">No PA announcements in the sound set yet.</p>
      {/if}
    </section>

    <section class="card">
      <h3>The score</h3>
      {#if !scoreOn}
        <button onclick={startScore}>▶ Start the score</button>
      {:else}
        <div class="row wrap">
          <label>Threat on screen <input type="range" min="0" max="1" step="0.01" bind:value={threat} /> {threat.toFixed(2)}</label>
          <label class="check"><input type="checkbox" bind:checked={fighting} /> A fight</label>
          <label class="check"><input type="checkbox" bind:checked={night} /> Night</label>
        </div>
        <p class="level">Now: <b>{level}</b></p>
        <div class="row wrap">
          <button onclick={() => engine?.score.death()}>✝ A death</button>
          <select bind:value={stingId}>{#each Object.values(STING) as s}<option>{s}</option>{/each}</select>
          <button onclick={() => engine?.score.sting(stingId, 0)}>Fire sting</button>
          <label>Pin <select bind:value={pin}><option value="">no</option><option>calm</option><option>uneasy</option><option>suspense</option><option>combat</option><option>aftermath</option></select></label>
          <label class="check"><input type="checkbox" bind:checked={muted} /> Mute</label>
          <button onpointerdown={() => setTalking(true)} onpointerup={() => setTalking(false)} onpointerleave={() => setTalking(false)}>🗣 Hold: someone talking</button>
        </div>
        <p class="note">The score rises at once when the threat crosses a line and falls only after it has stayed low for a while. Ordinary changes wait for the next 4-second phrase; combat and a death don't.</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .bench { display: flex; flex-direction: column; gap: 14px; padding: 4px 0 24px; }
  .intro { max-width: 60ch; }
  .card { background: var(--panel, #1d1c19); border: 1px solid var(--line, #34312b); border-radius: 10px; padding: 12px 14px; }
  h3 { margin: 0 0 10px; font-size: 1rem; }
  .pad-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
  canvas { width: 340px; max-width: 100%; aspect-ratio: 1; border: 1px solid var(--line, #34312b); border-radius: 8px; cursor: crosshair; background: var(--bg, transparent); }
  .controls { display: flex; flex-direction: column; gap: 8px; min-width: 240px; flex: 1; }
  .row { display: flex; gap: 8px; align-items: center; }
  .wrap { flex-wrap: wrap; }
  label { display: flex; gap: 6px; align-items: center; font-size: 0.9rem; }
  label.check { gap: 4px; }
  select, button { font: inherit; }
  button { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--line, #34312b); background: var(--bg, transparent); color: inherit; cursor: pointer; }
  button.go { padding: 10px 16px; font-weight: 600; }
  .note { color: var(--ink-soft, #a39d91); font-size: 0.85rem; margin: 8px 0 0; }
  .level { margin: 8px 0; }
  .err { color: #e0573c; }
</style>
