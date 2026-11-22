<script lang="ts">
  // SOLACE SURVIVORZ — the show (Admin Panel → Survivorz → Show). The scene is
  // ./scene.ts; its frames come from the mock feed (./mockfeed.ts) or the live socket
  // (../live.ts). The panel reads the scene on its own slow timer — nothing here is written from
  // the scene's frame loop (CLAUDE.md: $state stays out of the rAF loop).
  import { onDestroy, onMount } from "svelte";
  import { ShowScene, STREAM_RENDER, type ShowStats, type ShowStatus } from "./scene";
  import { MockFeed } from "./mockfeed";
  import { connectLive, type LiveFeed } from "../live";
  import type { SiteZone } from "./site";
  import { sessionHeaders } from "../assets";
  import { ask } from "../../lib/confirm.svelte";
  import { DirectorRun, type CamMode } from "./direct";
  import Overlay from "./Overlay.svelte";
  import { NameTags } from "./tags";
  import { reportNote } from "../../lib/errorreport";
  import { MAP_ID, SITE_9, useMap } from "./site";
  import { WalkControl, type WalkFrame, type WalkState } from "./walk";

  // `watch` = a member's seat (the Casino page's ON AIR band): the live feed and the director's cut
  // and nothing else — no panel, no levers, no other cameras. The admin's tab keeps everything.
  // `stream` = the YouTube rig's page (`/#survivorz-stream`, ./StreamView.svelte): `watch` with nothing
  // on screen but the show, and the sound started without a click (Edge runs with the autoplay flag).
  // `walk` = WALK THE MAP (./walk.ts): a watcher's page whose keys drive the admin's own body in a private run.
  let { watch = false, stream = false, walk = false, onExit, onPopout }: { watch?: boolean; stream?: boolean; walk?: boolean; onExit?: () => void; onPopout?: () => void } = $props();
  let walkCtl: WalkControl | null = null;
  let walkState = $state<WalkState | null>(null);
  /** the walk's own frames go to the hands, everything else to the picture */
  function feedFrame(f: Parameters<ShowScene["apply"]>[0] | WalkFrame): void {
    if ((f as WalkFrame).type === "walk") { walkCtl?.frame(f as WalkFrame); return; }
    scene?.apply(f as Parameters<ShowScene["apply"]>[0]);
  }

  let host: HTMLDivElement;
  let dipEl: HTMLDivElement;
  let tagsEl: HTMLDivElement;
  let tags: NameTags | null = null;
  let scene: ShowScene | null = null;
  let dirRun = $state<DirectorRun | null>(null);
  let camMode = $state<CamMode>("director");
  let onAir = $state<{ target: string | null; shot: string; reason: string; pending: string | null } | null>(null);
  let status = $state<ShowStatus>({ phase: "starting", frac: 0 });
  let source = $state<"mock" | "live" | "off">("live");
  let liveState = $state("");
  let soundOn = $state(false);
  let stats = $state<ShowStats | null>(null);
  let cast = $state<{ id: string; label: string; kind: string }[]>([]);
  let follow = $state("");
  let vit = $state<ReturnType<ShowScene["vitals"]>>(null);
  let power = $state<Record<string, boolean>>({});
  let mock: MockFeed | null = null;
  let live: LiveFeed | null = null;
  let resize: ResizeObserver | null = null;
  let timer = 0;
  let fast = 0;
  let runTimer = 0;

  // ---- the show's levers (src/routes/survivorz-show.ts) — the admin's alone, every press audited.
  interface RunSetup { seed: number; starts: { who: string; room: string }[]; partSpot: string; noteSpot: string; zombies: number; inside: number }
  interface ShowStatusWire {
    running: boolean; paused: boolean; onAir: boolean; watchers: number; members: number; ticks: number; tickMs: number; seed: number | null;
    t: number | null; test: boolean; runNo: number | null; lastRunNo: number; speed: number; jumping: { to: string; from: number } | null; held: boolean; setup: RunSetup | null;
    countdown: number; map: string | null; cast: string[];
  }
  // THE RUN'S PICKS (Josh, Nov 3 2026: "a level selector … i pick the character i want to load and then
  // press a button to start it all with a stream on youtube"): GET /api/admin/survivorz/setup
  interface ShowMapWire { id: string; name: string; blurb: string; objectives: string[]; minutes: number; maxCast: number; building?: boolean }
  interface CharWire { id: string; name: string; tag: string; status: "cast" | "bench" }
  let setup = $state<{ maps: ShowMapWire[]; characters: CharWire[]; stream: boolean } | null>(null);
  let pickMap = $state("");
  let pickCast = $state<string[]>([]);
  const chosenMap = $derived(setup?.maps.find((m) => m.id === pickMap) ?? null);
  const castOk = $derived(!!chosenMap && pickCast.length >= 1 && pickCast.length <= chosenMap.maxCast);
  const charName = (id: string) => setup?.characters.find((c) => c.id === id)?.name ?? id;
  const mapName = (id: string | null | undefined) => setup?.maps.find((m) => m.id === id)?.name ?? id ?? "—";
  async function loadSetup(): Promise<void> {
    try {
      const r = await fetch("/api/admin/survivorz/setup", { headers: sessionHeaders() });
      if (!r.ok) return;
      const j = await r.json();
      setup = { maps: j.maps, characters: j.characters, stream: j.stream === true };
      if (!pickMap) pickMap = j.defaults?.map ?? j.maps[0]?.id ?? "";
      if (!pickCast.length) pickCast = [...(j.defaults?.cast ?? [])];
    } catch { /* the panel says it can't start without a setup */ }
  }
  function toggleCast(id: string): void {
    if (pickCast.includes(id)) pickCast = pickCast.filter((x) => x !== id);
    else if (chosenMap && pickCast.length < chosenMap.maxCast) pickCast = [...pickCast, id];
  }
  // THE STREAM RIG'S GO-LIVE SWITCH (src/survivorz/stream.ts): is it wanted, and is the rig live
  let rig = $state<{ configured: boolean; want: boolean; live: boolean; idle: boolean; stale: boolean } | null>(null);
  async function pollRig(): Promise<void> {
    if (watch) return;
    try {
      const r = await fetch("/api/admin/survivorz/stream", { headers: sessionHeaders() });
      if (!r.ok) return;
      const v = await r.json();
      const b = v.beat as { rtmp?: string; idle?: boolean } | null;
      const stale = v.age == null || v.age > v.staleMs;
      rig = { configured: !!v.configured, want: !!v.want, stale, idle: !stale && !!b?.idle, live: !stale && !!b && !b.idle && (b.rtmp === "up" || b.rtmp === "backup") };
    } catch { /* next poll */ }
  }
  async function setStream(on: boolean): Promise<void> {
    if (leverBusy) return;
    if (!on && !(await ask({ title: "Stop streaming to YouTube?", body: "The run keeps going in Solace. The YouTube broadcast ends.", danger: true }))) return;
    leverBusy = true; leverErr = "";
    try {
      const r = await fetch("/api/admin/survivorz/stream/want", { method: "POST", headers: { ...sessionHeaders(), "content-type": "application/json" }, body: JSON.stringify({ on }) });
      if (!r.ok) leverErr = (await r.json().catch(() => null))?.error ?? `refused (${r.status})`;
    } catch (e) { leverErr = String((e as Error)?.message ?? e); }
    leverBusy = false;
    void pollRig();
  }
  const rigLabel = $derived(
    !rig?.configured ? "No stream rig on this server" :
    rig.live ? "● Live on YouTube" :
    rig.want ? (rig.stale ? "Wanted, but the rig is offline" : "Going live…") :
    rig.stale ? "Rig offline" : "Rig standing by",
  );
  // the panel's sections: open or folded (remembered on this browser)
  type Sec = "camera" | "world" | "ai" | "display";
  let folded = $state<Record<Sec, boolean>>((() => {
    try { const v = JSON.parse(localStorage.getItem("solace_survivorz_panel") ?? "null"); if (v && typeof v === "object") return { camera: false, world: true, ai: true, display: true, ...v }; } catch { /* storage off */ }
    return { camera: false, world: true, ai: true, display: true };
  })());
  function fold(k: Sec): void {
    folded = { ...folded, [k]: !folded[k] };
    try { localStorage.setItem("solace_survivorz_panel", JSON.stringify(folded)); } catch { /* storage off */ }
  }
  // the bunker's rooms, for the spawn lever and the run setup's names
  /** THE MAP IN PLAY (show/site.ts useMap): the scene is built for one map; a snapshot that names another has the
   *  page build a new one (boot, below). Remembered on this machine, so the next visit starts on the right map. */
  let mapId = $state(MAP_ID);
  let wantMap: string | null = null;
  const ROOM_NAME = $derived.by(() => { void mapId; return new Map(SITE_9.rooms.map((r) => [r.id, r.name])); });
  const SPOT_ROOM = $derived.by(() => { void mapId; return new Map(SITE_9.rooms.flatMap((r) => r.spots.map((sp) => [sp.id, r.name] as const))); });
  const SPAWN_ROOMS = $derived.by(() => { void mapId; return SITE_9.rooms.filter((r) => r.id !== "tunnel").map((r) => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name)); });
  const JUMPS: [string, string][] = [["part", "Radio part found"], ["code", "Code found"], ["sealed", "Door sealed"], ["fixed", "Radio fixed"], ["called", "Call made"], ["clear", "Bunker clear"]];
  let spawnRoom = $state("");
  let spawnN = $state(1);
  let jumpTo = $state("sealed");
  let run = $state<ShowStatusWire | null>(null);
  let leverErr = $state("");
  let leverBusy = $state(false);
  let panelOpen = $state(true);
  async function pollRun(): Promise<void> {
    if (watch) return;   // the levers' status is the admin's alone
    try {
      const r = await fetch("/api/admin/survivorz/show", { headers: sessionHeaders() });
      if (r.ok) run = await r.json();
    } catch { /* the next poll tries again */ }
  }
  // THE SURVIVORS' VOICES (src/routes/survivorz-talk.ts): off by default; the admin's switch.
  let talkOn = $state<boolean | null>(null);
  // THE AI'S SHARE (phase 4): of every choice in the last hour, how many the AI made — held to 90%
  let aiShare = $state<{ ai: number; code: number; pct: number | null; active: boolean; decided: number } | null>(null);
  async function pollTalk(): Promise<void> {
    if (watch) return;
    try {
      const r = await fetch("/api/admin/survivorz/talk", { headers: sessionHeaders() });
      if (r.ok) {
        const j = await r.json();
        talkOn = j.on === true;
        const m = j.minds;
        aiShare = m?.share ? { ...m.share, active: m.active === true, decided: m.decided ?? 0 } : null;
      }
    } catch { /* next poll */ }
  }
  async function setTalk(on: boolean): Promise<void> {
    if (leverBusy) return;
    leverBusy = true; leverErr = "";
    try {
      const r = await fetch("/api/admin/survivorz/talk", { method: "POST", headers: { ...sessionHeaders(), "content-type": "application/json" }, body: JSON.stringify({ on }) });
      const j = await r.json().catch(() => null);
      if (r.ok) talkOn = j?.on === true; else leverErr = j?.error ?? `refused (${r.status})`;
    } catch (e) { leverErr = String((e as Error)?.message ?? e); }
    leverBusy = false;
  }
  async function lever(op: string, extra: Record<string, unknown> = {}): Promise<void> {
    if (leverBusy) return;
    if (op === "reset" && !(await ask({ title: extra.same ? "Restart with the same start?" : "Restart with a new start?", body: extra.same ? "Throws the running world away and starts again from the same starting positions and hiding places. The survivors' memories start fresh." : "Throws the running world away and starts again with new starting positions and hiding places. The survivors' memories start fresh.", danger: true }))) return;
    if (op === "stop" && !(await ask({ title: "Stop the run?", body: rig?.want ? "Every watcher is told the show is off air, and the YouTube stream ends." : "Every watcher is told the show is off air.", danger: true }))) return;
    if (op === "start" || op === "test") {
      if (!castOk || !chosenMap) { leverErr = "pick a map and at least one survivor"; return; }
      const who = pickCast.map(charName).join(", ");
      const streamed = extra.stream === true;
      if (op === "start" && !(await ask({
        title: streamed ? "Start the show and stream it?" : "Start the show?",
        body: `Run #${(run?.lastRunNo ?? 0) + 1} on ${chosenMap.name} with ${who}. ${streamed ? "It goes live on YouTube as the countdown starts." : "It can go on air in Solace."}`,
      }))) return;
      extra = { ...extra, map: chosenMap.id, cast: [...pickCast] };
    }
    leverBusy = true; leverErr = "";
    try {
      const r = await fetch("/api/admin/survivorz/show", { method: "POST", headers: { ...sessionHeaders(), "content-type": "application/json" }, body: JSON.stringify({ op, ...extra }) });
      const j = await r.json().catch(() => null);
      if (r.ok) { run = j; if (op === "stop") void loadSetup(); }
      else leverErr = j?.error === "not_test" ? "only a test run can do that" : j?.error === "test_run" ? "a test run can't go on air" : j?.error === "busy" ? "already jumping"
        : j?.error === "bad_cast" ? "that cast doesn't fit the map" : j?.error === "bad_map" ? "that map can't be run yet" : j?.error === "no_stream_rig" ? "no stream rig on this server" : j?.error ?? `refused (${r.status})`;
      void pollRig();
    } catch (e) { leverErr = String((e as Error)?.message ?? e); }
    leverBusy = false;
  }

  async function spawn(): Promise<void> {
    if (leverBusy) return;
    leverBusy = true; leverErr = "";
    try {
      const r = await fetch("/api/admin/survivorz/spawn", { method: "POST", headers: { ...sessionHeaders(), "content-type": "application/json" }, body: JSON.stringify({ n: spawnN, ...(spawnRoom ? { room: spawnRoom } : {}) }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) leverErr = j?.error === "refused" ? "no room for them there (too close to somebody)" : j?.error ?? `refused (${r.status})`;
    } catch (e) { leverErr = String((e as Error)?.message ?? e); }
    leverBusy = false;
  }

  // THE BODY LEVERS (Oct 30 2026): the followed body put down, brought back, killed, or bitten (a real bite:
  // they turn in 40 minutes unless they die first)
  async function bodyLever(op: string): Promise<void> {
    if (leverBusy || !follow) return;
    if (op === "kill" && !(await ask({ title: "Kill them?", body: "Permanent, for this run.", danger: true }))) return;
    if (op === "infect" && !(await ask({ title: "Bite them?", body: "They're infected and turn in 40 minutes.", danger: true }))) return;
    leverBusy = true; leverErr = "";
    try {
      const r = await fetch("/api/admin/survivorz/body", { method: "POST", headers: { ...sessionHeaders(), "content-type": "application/json" }, body: JSON.stringify({ op, id: follow, ...(op === "infect" ? { hours: 0 } : {}) }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) leverErr = j?.error ?? `refused (${r.status})`;
    } catch (e) { leverErr = String((e as Error)?.message ?? e); }
    leverBusy = false;
  }

  function setSource(s: "mock" | "live" | "off"): void {
    mock?.stop(); mock = null;
    live?.close(); live = null;
    liveState = "";
    source = s;
    if (!scene) return;
    if (s === "mock") {
      mock = new MockFeed();
      mock.onFrame = (f) => scene?.apply(f);
      mock.start();
    } else if (s === "live") {
      live = connectLive((f) => feedFrame(f), (up, why) => (liveState = up ? "connected" : why === "off_air" ? "off air" : "reconnecting…"));
      if (walk && scene && !walkCtl) {
        // the hands: keys to the server, the server's list of what can be done here back
        // (the camera is asked for each time: a map switch builds a new scene, and the keys must steer by ITS camera)
        walkCtl = new WalkControl(() => scene?.camera ?? null, (o) => live?.send(o) ?? false);
        walkCtl.onChange = (st) => {
          const first = !walkState || walkState.you !== st.you;
          walkState = st;
          // the camera goes with the body, and stays with it (the director leaves it alone in follow)
          if (first && st.you) void pickFollow(st.you);
        };
      }
    }
  }

  // A FAILED LOAD TRIES AGAIN BY ITSELF (an asset 5xx at boot — the watchdog relaunching the browser
  // during a deploy — used to leave "failed" on screen for good): the scene is thrown away and built
  // again after a backoff, 10 s doubling to 2 min. (A lost GPU context is the scene's own business:
  // it reloads the page, show/scene.ts.)
  let bootTimer = 0;
  let bootWait = 10_000;
  function boot(): void {
    // the YouTube page renders exactly its 1920x1080 at 60 fps (STREAM_RENDER); the admin tab keeps a
    // sharp picture on a scaled display
    // A WATCHER renders exactly like the stream page (1:1 pixels, 60 fps): in the desktop app the stream page
    // drew and the scaled signed-in view showed a black picture under a live overlay (Nov 3 2026). The admin's
    // full Show view keeps the sharp scaled picture.
    try { useMap(wantMap ?? localStorage.getItem("sz_map")); } catch { useMap(wantMap); }
    mapId = MAP_ID;
    const s = new ShowScene(host, watch ? { render: STREAM_RENDER } : {});
    // the show is on another map than this scene was built for: this one goes, and one for that map is built
    s.onMapChange = (id) => {
      if (scene !== s) return;
      wantMap = id;
      try { localStorage.setItem("sz_map", id); } catch { /* kept in wantMap for this visit */ }
      window.clearTimeout(bootTimer);
      resize?.disconnect(); resize = null;
      live?.close(); live = null;
      s.dispose();
      scene = null;
      status = { phase: "starting", frac: 0 };
      boot();
    };
    s.onFrameError = (msg, stack) => { drawError = msg; reportNote(`[survivorz] the show can't draw: ${msg}`, stack ?? ""); };
    scene = s;
    // the director is fed from the scene's one door in, so it exists before any frame does
    const r = new DirectorRun(s);
    r.setDip(dipEl);
    r.setMode(camMode);
    dirRun = r;
    // THE NAMES OVER HEADS (show/tags.ts): drawn after every frame from the camera that drew it
    tags?.clear();
    tags = new NameTags(tagsEl, s, (a, b) => r.geo.sees(a, b));
    s.afterFrame = () => tags?.update();
    (window as unknown as { __showDir?: DirectorRun }).__showDir = r;   // the director's review hook
    (window as unknown as { __show?: ShowScene }).__show = s;   // the review hook (like the casino's __cas)
    s.onStatus = (x) => (status = { ...x });
    s.fit();
    resize = new ResizeObserver(() => scene?.fit());
    resize.observe(host);
    // THE FEED OPENS WITH THE PAGE (Nov 3 2026): its snapshot arrives while the scene is still loading, so the
    // cast's bodies download alongside the bunker and the curtain waits for them (scene.ts load). It used to
    // open only once the scene was up, so the cast was dressed AFTER "ready" — the survivors walked on as
    // name tags with no body for as long as their files took. Once the scene is up the feed is opened again,
    // for a snapshot that's current (the scene let the load's events go, scene.ts hold).
    if (source === "live") setSource(source);
    // (sound that was on stays on: a scene built for another map, or after a failed load, has a new sound engine)
    s.load().then(() => { if (scene === s) { bootWait = 10_000; setSource(source); if (soundOn) void s.startSound().catch(() => {}); } }).catch((e) => {
      if (scene !== s) return;
      status = { phase: "failed", frac: 0, error: `${String(e?.message ?? e)} — trying again in ${Math.round(bootWait / 1000)} s` };
      bootTimer = window.setTimeout(() => {
        if (scene !== s) return;
        resize?.disconnect(); resize = null;
        s.dispose();
        scene = null;
        boot();
      }, bootWait);
      bootWait = Math.min(120_000, bootWait * 2);
    });
  }

  /** the first error a frame threw (scene.onFrameError): said on screen, so a black picture isn't a mystery */
  let drawError = $state("");
  // THE DIAGNOSTICS BOX (Shift+D, Nov 3 2026: a black picture in the desktop app nobody here could reproduce):
  // what the 3D view is really doing — frames, draws, the zones drawn, the camera, the GPU
  let diag = $state<string[] | null>(null);
  let diagTimer = 0;
  function diagLines(): string[] {
    const s = scene;
    if (!s) return ["no scene"];
    const st = s.stats();
    const gl = s.renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "?";
    const c = s.renderer.domElement, p = s.camera.position, f = s.cam.focus;
    const n = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : String(v));
    return [
      `phase ${status.phase}${status.error ? ` (${status.error})` : ""} · source ${source} · ${liveState}`,
      `fps ${st.fps.toFixed(0)} · ${st.frameMs.toFixed(1)} ms · frames in ${st.frames} · draws ${st.draws} · tris ${st.tris} · lights ${st.lights}`,
      `zones [${st.zones.join(",")}] ${st.zoneGpuMB.toFixed(0)} MB · bodies ${st.bodies} drawn ${st.drawn} · textures ${st.textures} programs ${st.programs}`,
      `canvas ${c.width}x${c.height} css ${c.clientWidth}x${c.clientHeight} · ratio ${s.renderer.getPixelRatio()} · dpr ${window.devicePixelRatio} · lost ${gl.isContextLost()}`,
      `camera ${n(p.x)},${n(p.y)},${n(p.z)} → ${n(f.x)},${n(f.y)},${n(f.z)} · mode ${camMode} · follow ${s.cam.follow ?? "-"}`,
      `zone load ${s.zones?.loading ? `${s.zones.loading.id}: ${s.zones.loading.step} (${Math.round((performance.now() - s.zones.loading.at) / 1000)} s, ${Math.round((performance.now() - s.zones.loading.since) / 1000)} s in all)` : "idle"} · last error ${s.zones?.lastError || "none"}`,
      `power ${JSON.stringify(s.power)}`,
      `load ${s.loadLog.map(([t, w]) => `${(t / 1000).toFixed(1)} ${w}`).join(" · ")}`,
      `gpu ${gpu}`,
      `ua ${navigator.userAgent.slice(0, 120)}`,
    ];
  }
  function onDiagKey(e: KeyboardEvent): void {
    // (never while walking the map: Shift+D there is a sprint to the right)
    if (walk || e.repeat) return;
    if (!(e.shiftKey && (e.key === "D" || e.key === "d"))) return;
    if ((e.target as HTMLElement | null)?.closest?.("input, textarea")) return;
    if (diag) { diag = null; window.clearInterval(diagTimer); return; }
    diag = diagLines();
    diagTimer = window.setInterval(() => { try { diag = diagLines(); } catch (err) { diag = [String(err)]; } }, 1000);
  }
  onMount(() => {
    window.addEventListener("keydown", onDiagKey);
    boot();
    timer = window.setInterval(() => {
      if (!scene) return;
      stats = scene.stats();
      cast = scene.cast();
      power = { ...scene.power };
      if (dirRun) onAir = dirRun.broadcast().onAir;
      // WALK THE MAP: the camera belongs to your body. (The first word of who you are can come before the scene
      // has that body, and a fresh snapshot rebuilds the cast: asked again until the camera has it.)
      if (walk && walkState?.you && scene.cam.follow !== walkState.you && scene.actors?.get(walkState.you)) void pickFollow(walkState.you);
    }, 1000);
    fast = window.setInterval(() => { if (scene && follow) vit = scene.vitals(follow); }, 250);
    pollRun();
    pollTalk();
    if (!watch) { void loadSetup(); void pollRig(); }
    runTimer = window.setInterval(() => { if (source === "live") { pollRun(); pollTalk(); pollRig(); } }, 3000);
  });

  onDestroy(() => {
    window.removeEventListener("keydown", onDiagKey);
    window.clearInterval(diagTimer);
    window.clearTimeout(bootTimer);
    window.clearInterval(timer);
    window.clearInterval(fast);
    window.clearInterval(runTimer);
    resize?.disconnect();
    mock?.stop();
    walkCtl?.dispose(); walkCtl = null;
    live?.close();
    scene?.dispose();
    scene = null;
    tags?.clear(); tags = null;
    delete (window as unknown as { __show?: ShowScene }).__show;
    delete (window as unknown as { __showDir?: DirectorRun }).__showDir;
  });

  function setCamMode(m: CamMode): void {
    camMode = m;
    dirRun?.setMode(m);
    if (m === "director") { follow = ""; vit = null; }
    if (m === "free") { follow = ""; vit = null; scene?.followBody(null); }
    if (m === "follow" && !follow && cast[0]) void pickFollow(cast[0].id);
  }

  async function pickFollow(id: string): Promise<void> {
    if (!id) { setCamMode("free"); return; }
    if (camMode !== "follow") { camMode = "follow"; dirRun?.setMode("follow"); }
    follow = id;
    const s = scene;
    if (!s) return;
    // the body's zone loaded first (a cut into an unloaded zone is a void for seconds)
    const a = id ? s.actors?.get(id) : undefined;
    if (a) await s.prepare(a.pos);
    if (scene !== s || follow !== id) return;
    s.followBody(id || null);
    vit = id ? s.vitals(id) : null;
  }

  async function sound(): Promise<void> {
    if (!scene || soundOn) return;
    await scene.startSound();
    soundOn = true;
  }

  // THE STREAM PAGE: sound on as soon as the scene is ready (nobody is there to click)
  $effect(() => { if (stream && status.phase === "ready" && !soundOn) void sound(); });

  const pct = (x: number | undefined) => `${Math.round((x ?? 0) * 100)}%`;
</script>

<div class="show" class:watch>
  <div class="stage" bind:this={host}></div>
  <div class="tags" bind:this={tagsEl}></div>
  <div class="dip" bind:this={dipEl}></div>
  {#if drawError}<div class="drawerr">The picture can't draw here: {drawError}</div>{/if}
  {#if diag}<pre class="diag">{diag.join("\n")}</pre>{/if}
  {#if status.phase === "ready"}<Overlay run={dirRun} pick={(id) => (id ? void pickFollow(id) : setCamMode("director"))} picked={camMode === "follow" ? follow : ""} />{/if}
  {#if status.phase !== "ready"}
    <div class="loading">
      {#if status.error}<p class="err">{status.error}</p>{:else}<p>Loading {status.phase}…</p><div class="bar"><span style:width={`${Math.round(status.frac * 100)}%`}></span></div>{/if}
    </div>
  {/if}
  {#if stream}
    <!-- the stream page: no controls on screen, ever -->
  {:else if walk}
    <div class="watchbar">
      <span class="live">● WALKING THE MAP</span>
      {#if liveState && liveState !== "connected"}<em>{liveState}</em>{/if}
      <button onclick={sound} disabled={soundOn}>{soundOn ? "🔊 Sound on" : "🔈 Turn sound on"}</button>
      <button onclick={() => onExit?.()} title="Ends this walk and closes the view">✕ End the walk</button>
    </div>
    <div class="walk">
      {#if walkState?.you}
        {#if walkState.busy}
          <div class="wbusy"><span>{walkState.busy.label}</span><div class="wbar"><b style:width={`${Math.round(Math.max(0, Math.min(1, walkState.busy.frac)) * 100)}%`}></b></div><small>X to stop</small></div>
        {/if}
        {#if walkState.note}<div class="wnote">{walkState.note}</div>{/if}
        {#if walkState.actions.length}
          <div class="wacts">
            {#each walkState.actions.slice(0, 9) as a, i (a.id)}
              <button onclick={() => walkCtl?.doId(a.id)}><kbd>{i + 1}</kbd>{a.label}</button>
            {/each}
          </div>
        {/if}
        <div class="wkeys">WASD move · Shift sprint · Z walk · C crouch · Space strike or shoot · 1-9 or E do · X stop · drag to look</div>
      {:else}
        <div class="wkeys">Waiting for your body…</div>
      {/if}
    </div>
  {:else if watch}
    <div class="watchbar">
      <span class="live">● LIVE</span>
      {#if camMode === "follow" && follow}<button onclick={() => setCamMode("director")}>⟲ Director's cut</button>{/if}
      {#if liveState && liveState !== "connected"}<em>{liveState}</em>{/if}
      <button onclick={sound} disabled={soundOn}>{soundOn ? "🔊 Sound on" : "🔈 Turn sound on"}</button>
      {#if onPopout}<button onclick={() => onPopout?.()} title="Watch in its own window">⧉ Pop out</button>{/if}
      <button onclick={() => onExit?.()}>✕ Leave</button>
    </div>
  {:else}
  {#if !panelOpen}<button class="reopen" onclick={() => (panelOpen = true)}>Panel ▸</button>{/if}
  <div class="panel" class:hidden={!panelOpen}>
    <div class="phead">
      <b>Control room</b>
      <button class="hide" onclick={() => (panelOpen = false)} title="Hide the panel (the broadcast alone)">◂</button>
    </div>

    {#if source !== "live"}
      <div class="card warnbox">The panel is showing the {source === "mock" ? "mock feed" : "feed switched off"} — the run's controls are under Display.</div>
    {:else if !run?.running}
      <!-- NEW RUN: the map, who's in it, and the button that starts it all -->
      <section class="card">
        <h4>Map</h4>
        {#if !setup}<p class="small">Loading…</p>{/if}
        <div class="maps">
          {#each setup?.maps ?? [] as m (m.id)}
            <button class="map" class:on={pickMap === m.id} disabled={m.building} onclick={() => { pickMap = m.id; pickCast = pickCast.slice(0, m.maxCast); }}>
              <b>{m.name}</b>
              <span>{m.blurb}</span>
              <em>{m.building ? "Still being built" : `${m.minutes} min · up to ${m.maxCast} survivors`}</em>
              {#if pickMap === m.id}<ol>{#each m.objectives as o (o)}<li>{o}</li>{/each}</ol>{/if}
            </button>
          {/each}
        </div>
      </section>
      <section class="card">
        <h4>Survivors <span class="count" class:bad={!castOk}>{pickCast.length}{chosenMap ? ` of ${chosenMap.maxCast}` : ""}</span></h4>
        <div class="cast">
          {#each setup?.characters ?? [] as c (c.id)}
            {@const on = pickCast.includes(c.id)}
            <button class="who" class:on disabled={!on && !!chosenMap && pickCast.length >= chosenMap.maxCast} onclick={() => toggleCast(c.id)} title={c.tag}>
              <i>{on ? "✓" : ""}</i><b>{c.name}</b>{#if c.status === "bench"}<em>bench</em>{/if}
            </button>
          {/each}
        </div>
      </section>
      <section class="card start">
        {#if setup?.stream}
          <button class="big" disabled={leverBusy || !castOk} onclick={() => lever("start", { stream: true })}>▶ Start show + stream to YouTube</button>
          <p class="small">{rigLabel}{rig?.stale && rig.configured ? " — start the Solace Survivorz Stream task on the workstation" : ""}</p>
        {/if}
        <div class="row">
          <button class="go" disabled={leverBusy || !castOk} onclick={() => lever("start")}>Start show</button>
          <button disabled={leverBusy || !castOk} onclick={() => lever("test")}>Test run</button>
        </div>
        <p class="small">A show is numbered, counts down first (5 minutes unless the control room picks another) and can go on air. A test run is neither, and can be sped up.</p>
      </section>
    {:else}
      <!-- THE RUN -->
      <section class="card runcard" class:test={run.test}>
        <div class="runhead">
          <b>{run.test ? "TEST RUN" : `RUN #${run.runNo}`}</b>
          {#if run.onAir}<span class="air">ON AIR</span>{/if}
          {#if rig?.live}<span class="yt">● YOUTUBE</span>{/if}
        </div>
        <div class="state">{run.countdown > 0 ? `Starts in ${Math.ceil(run.countdown / 1000)} s` : run.held ? "Holding — the AI engine is down" : run.paused ? "Paused" : run.jumping ? `Jumping to ${run.jumping.to}…` : "Running"}{run.test && run.speed > 1 ? ` · ${run.speed}×` : ""}</div>
        <div class="small">{mapName(run.map)} · {(run.cast.length ? run.cast : []).map(charName).join(", ") || "the cast"}</div>
        <div class="small">{run.watchers} watching ({run.members} members) · tick {run.tickMs} ms</div>
        <div class="row">
          {#if run.countdown > 0}<button class="go" disabled={leverBusy} onclick={() => lever("go")}>Go now</button>{/if}
          {#if !run.paused}<button disabled={leverBusy} onclick={() => lever("pause")}>Pause</button>{:else}<button class="go" disabled={leverBusy} onclick={() => lever("resume")}>Resume</button>{/if}
          <button class="danger" disabled={leverBusy} onclick={() => lever("stop")}>Stop</button>
        </div>
        {#if !run.test}
          <div class="row">
            <button disabled={leverBusy} class:on={run.onAir} onclick={() => lever(run?.onAir ? "offair" : "onair")}>{run.onAir ? "Take off air in Solace" : "Put on air in Solace"}</button>
          </div>
          {#if rig?.configured}
            <div class="row">
              {#if rig.want}<button disabled={leverBusy} class="on" onclick={() => setStream(false)}>Stop YouTube stream</button>{:else}<button disabled={leverBusy} onclick={() => setStream(true)}>Stream to YouTube</button>{/if}
              <span class="small">{rigLabel}</span>
            </div>
          {/if}
        {/if}
        <div class="row">
          <span class="lab">Restart</span>
          <button class="restart" disabled={leverBusy} onclick={() => lever("reset", { same: true })}>↺ Same start</button>
          <button class="restart" disabled={leverBusy} onclick={() => lever("reset")}>↺ New start</button>
        </div>
        {#if run.test}
          <div class="row">
            <span class="lab">Speed</span>
            {#each [1, 2, 4, 8] as x (x)}<button disabled={leverBusy} class:on={run.speed === x} onclick={() => lever("speed", { speed: x })}>{x}×</button>{/each}
          </div>
          <div class="row">
            <span class="lab">Jump</span>
            <button disabled={leverBusy || !!run.jumping} onclick={() => lever("jump", { minutes: 5 })}>+5 min</button>
            <button disabled={leverBusy || !!run.jumping} onclick={() => lever("jump", { minutes: 15 })}>+15 min</button>
          </div>
          <div class="row">
            <select bind:value={jumpTo}>{#each JUMPS as [id, label] (id)}<option value={id}>{label}</option>{/each}</select>
            <button disabled={leverBusy || !!run.jumping} onclick={() => lever("jump", { objective: jumpTo })}>Jump to it</button>
          </div>
        {/if}
      </section>
    {/if}
    {#if leverErr}<div class="card errbox">{leverErr}</div>{/if}

    <!-- THE CAMERA -->
    <section class="card">
      <button class="sechead" onclick={() => fold("camera")}><h4>Camera</h4><span>{folded.camera ? "▸" : "▾"}</span></button>
      {#if !folded.camera}
        <div class="seg">
          <button class:on={camMode === "director"} onclick={() => setCamMode("director")}>Director</button>
          <button class:on={camMode === "follow"} onclick={() => setCamMode("follow")}>Follow</button>
          <button class:on={camMode === "free"} onclick={() => setCamMode("free")}>Free</button>
        </div>
        {#if camMode === "director" && onAir}
          <div class="small">On screen: {onAir.target ?? "—"} · {onAir.shot}{onAir.reason ? ` · ${onAir.reason}` : ""}{onAir.pending ? ` · waiting on ${onAir.pending}'s room` : ""}</div>
        {/if}
        <select value={follow} onchange={(e) => pickFollow((e.currentTarget as HTMLSelectElement).value)}>
          <option value="">Follow somebody…</option>
          {#each cast as c (c.id)}<option value={c.id}>{c.label}</option>{/each}
        </select>
        {#if follow && vit}
          <div class="vitals">
            <div><b>{follow}</b> · {vit.pose} · {vit.room ?? "—"}{#if vit.why} · {vit.why}{/if}</div>
            <div class="meter"><span>Health</span><i><b style:width={pct(vit.hp / Math.max(1, vit.hpMax))}></b></i>{vit.hp}/{vit.hpMax}</div>
            {#if vit.v}
              <div class="meter"><span>Stamina</span><i><b style:width={pct(vit.v.stamina)}></b></i>{pct(vit.v.stamina)}</div>
              <div class="meter"><span>Morale</span><i><b style:width={pct(vit.v.morale / 100)}></b></i>{Math.round(vit.v.morale)}</div>
              <div class="small">{vit.v.infected ? "infected · " : ""}{vit.v.bleeding ? `bleeding ${vit.v.bleeding} · ` : ""}doing: {vit.v.job}</div>
            {/if}
            <div class="small">holding {vit.held ?? "nothing"} · {vit.speed} m/s</div>
          </div>
          {#if run?.running && source === "live"}
            <div class="row">
              <span class="lab">Them</span>
              <button disabled={leverBusy} onclick={() => bodyLever("down")}>Down</button>
              <button disabled={leverBusy} onclick={() => bodyLever("revive")}>Revive</button>
              {#if follow.startsWith("s:")}<button disabled={leverBusy} onclick={() => bodyLever("infect")}>Bite</button>{/if}
              <button class="danger" disabled={leverBusy} onclick={() => bodyLever("kill")}>Kill</button>
            </div>
          {/if}
        {/if}
      {/if}
    </section>

    {#if source === "live" && run?.running}
      <!-- THE WORLD -->
      <section class="card">
        <button class="sechead" onclick={() => fold("world")}><h4>The dead &amp; the setup</h4><span>{folded.world ? "▸" : "▾"}</span></button>
        {#if !folded.world}
          <div class="row">
            <span class="lab">Spawn</span>
            <select bind:value={spawnN} class="n">{#each [1, 3, 5] as n (n)}<option value={n}>{n}</option>{/each}</select>
            <select bind:value={spawnRoom}><option value="">anywhere</option>{#each SPAWN_ROOMS as r (r.id)}<option value={r.id}>{r.name}</option>{/each}</select>
            <button disabled={leverBusy} onclick={spawn}>Spawn</button>
          </div>
          {#if run.setup}
            <div class="kv">
              {#each run.setup.starts as st (st.who)}<span>{charName(st.who)}</span><b>{ROOM_NAME.get(st.room) ?? st.room}</b>{/each}
              <span>Radio part</span><b>{SPOT_ROOM.get(run.setup.partSpot) ?? run.setup.partSpot}</b>
              <span>Code note</span><b>{SPOT_ROOM.get(run.setup.noteSpot) ?? run.setup.noteSpot}</b>
              <span>The dead</span><b>{run.setup.inside} inside · {run.setup.zombies} in all</b>
              <span>Seed</span><b>{run.setup.seed}</b>
            </div>
          {/if}
        {/if}
      </section>
    {/if}

    {#if source === "live"}
      <!-- THE SURVIVORS' MINDS -->
      <section class="card">
        <button class="sechead" onclick={() => fold("ai")}><h4>Survivor AI <span class="tag" class:ok={talkOn}>{talkOn === null ? "…" : talkOn ? "on" : "off"}</span></h4><span>{folded.ai ? "▸" : "▾"}</span></button>
        {#if !folded.ai}
          <div class="row">
            <button disabled={leverBusy || talkOn === null} class:on={talkOn} onclick={() => setTalk(!talkOn)}>{talkOn ? "Turn the AI off" : "Turn the AI on"}</button>
          </div>
          {#if aiShare}
            <div class="small" class:warn={aiShare.pct !== null && aiShare.pct < 90}>
              {aiShare.pct === null ? "No choices made in the last hour" : `The AI made ${aiShare.pct}% of choices in the last hour`}{aiShare.active ? "" : " · the AI is off or unreachable, so code is choosing"} · {aiShare.decided} shown on screen
            </div>
          {/if}
        {/if}
      </section>
    {/if}

    <!-- DISPLAY: sound, the feed, the numbers -->
    <section class="card">
      <button class="sechead" onclick={() => fold("display")}><h4>Display</h4><span>{folded.display ? "▸" : "▾"}</span></button>
      {#if !folded.display}
        <button onclick={sound} disabled={soundOn}>{soundOn ? "🔊 Sound on" : "🔈 Turn sound on"}</button>
        <div class="row">
          <span class="lab">Feed</span>
          <div class="seg">
            <button class:on={source === "live"} onclick={() => setSource("live")}>Live</button>
            <button class:on={source === "mock"} onclick={() => setSource("mock")} title="A toy world, to check the screen without a run">Mock</button>
            <button class:on={source === "off"} onclick={() => setSource("off")}>Off</button>
          </div>
        </div>
        {#if liveState && liveState !== "connected"}<div class="small warn">{liveState}</div>{/if}
        {#if stats}
          <p class="small">{stats.fps} fps · {stats.frameMs} ms · {stats.draws} draws · {(stats.tris / 1000).toFixed(0)}k tris · {stats.lights} lights</p>
          <p class="small">bodies {stats.drawn}/{stats.bodies} · heap {stats.heapMB ?? "?"} MB · fx {stats.fx.particles ?? 0} particles</p>
        {/if}
        <p class="small">Free camera: drag to orbit, scroll, WASD/QE to slide (click the view first)</p>
      {/if}
    </section>
  </div>
  {/if}
</div>

<style>
  .show { position: relative; flex: 1; min-height: 0; display: flex; }
  .stage { flex: 1; min-height: 520px; background: #000; border-radius: 8px; overflow: hidden; outline: none; }
  .stage :global(canvas) { display: block; width: 100%; height: 100%; outline: none; }
  /* the director's dips go through this black (show/direct.ts writes its opacity) */
  .dip { position: absolute; inset: 0; background: #000; opacity: 0; pointer-events: none; border-radius: 8px; }
  .diag { position: absolute; left: 2.2%; top: 34%; z-index: 6; margin: 0; padding: 10px 12px; max-width: 60%; white-space: pre-wrap; background: rgba(0, 0, 0, 0.82); color: #9fe29f; font: 12px/1.45 ui-monospace, Consolas, monospace; border: 1px solid #2c4; border-radius: 6px; user-select: text; }
  .drawerr { position: absolute; left: 50%; top: 45%; transform: translateX(-50%); max-width: 70%; padding: 10px 16px; border-radius: 8px; background: rgba(120, 20, 20, 0.85); color: #fff; font-size: 0.9rem; z-index: 5; pointer-events: none; }
  /* the names over heads (show/tags.ts writes these elements; they aren't Svelte's, so the rules are global) */
  .tags { position: absolute; inset: 0; pointer-events: none; overflow: hidden; container-type: size; }
  .tags :global(.ntag) { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; align-items: center; gap: 0.35cqh; transition: opacity 0.2s;
    font: 700 1.7cqh/1 "Inter", "Segoe UI", system-ui, sans-serif; color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9); will-change: transform; white-space: nowrap; }
  .tags :global(.ntag .nn) { color: var(--c); letter-spacing: 0.03em; }
  .tags :global(.ntag i) { display: block; width: 4.2cqh; height: 0.45cqh; background: rgba(0, 0, 0, 0.55); outline: 1px solid rgba(255, 255, 255, 0.25); }
  .tags :global(.ntag b) { display: block; height: 100%; background: #6fcf6f; }
  .tags :global(.ntag b.low) { background: #e85a4a; }
  .loading { position: absolute; inset: 0; display: grid; place-content: center; gap: 8px; color: #cfd6dc; pointer-events: none; }
  .loading p { margin: 0; text-align: center; }
  .bar { width: 260px; height: 4px; background: #222; border-radius: 2px; overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--accent); }
  .err { color: var(--danger); }
  .panel {
    z-index: 2;
    position: absolute; top: 10px; left: 10px; width: 320px; display: flex; flex-direction: column; gap: 8px; max-height: calc(100% - 20px); overflow-y: auto;
    background: rgba(10, 12, 14, 0.86); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 10px; color: #dfe5ea; font-size: 0.82rem;
    backdrop-filter: blur(6px); scrollbar-width: thin;
  }
  .phead { display: flex; align-items: center; justify-content: space-between; padding: 0 2px; }
  .phead b { letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.72rem; color: #9aa4ac; }
  .card { display: flex; flex-direction: column; gap: 7px; background: rgba(255, 255, 255, 0.035); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 9px; }
  .card h4 { margin: 0; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: #b9c2c9; display: flex; align-items: center; gap: 6px; }
  .sechead { display: flex; align-items: center; justify-content: space-between; background: none; border: 0; padding: 0; width: 100%; color: #8d979f; }
  .sechead:hover h4 { color: #fff; }
  .count { margin-left: auto; font-weight: 600; color: #8d979f; letter-spacing: 0; }
  .count.bad { color: #e0a34a; }
  .tag { font-size: 0.66rem; padding: 1px 6px; border-radius: 999px; border: 1px solid #444b52; color: #8d979f; letter-spacing: 0.04em; }
  .tag.ok { color: #8fd694; border-color: #3b8e4a; }
  .maps { display: flex; flex-direction: column; gap: 6px; }
  .map { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; text-align: left; padding: 8px 9px; border-radius: 7px; }
  .map b { font-size: 0.86rem; }
  .map span { color: #9aa4ac; font-size: 0.76rem; line-height: 1.3; }
  .map em { font-style: normal; color: #7c868e; font-size: 0.72rem; }
  .map ol { margin: 4px 0 0; padding-left: 18px; color: #c7cfd5; font-size: 0.76rem; }
  .map.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, #1c2024); }
  .cast { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
  .who { display: flex; align-items: center; gap: 6px; text-align: left; padding: 6px 7px; }
  .who i { width: 15px; height: 15px; flex: none; border-radius: 4px; border: 1px solid #4a525a; font-style: normal; font-size: 0.7rem; display: grid; place-items: center; color: #10140f; }
  .who.on { border-color: var(--accent); }
  .who.on i { background: var(--accent); border-color: var(--accent); }
  .who b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who em { margin-left: auto; font-style: normal; font-size: 0.66rem; color: #e0c34a; }
  .start .big { padding: 10px; font-weight: 700; font-size: 0.88rem; border-color: #b33a30; background: linear-gradient(#a8352c, #8a2a22); color: #fff; }
  .start .big:hover:not(:disabled) { filter: brightness(1.12); }
  .runcard .state { font-size: 0.95rem; font-weight: 600; }
  .runcard.test { border-color: rgba(224, 195, 74, 0.35); }
  .yt { color: #ff4d42; font-weight: 800; letter-spacing: 0.08em; font-size: 0.72rem; }
  .lab { color: #8d979f; min-width: 52px; }
  .seg { display: flex; gap: 0; }
  .seg button { border-radius: 0; flex: 1; }
  .seg button:first-child { border-radius: 6px 0 0 6px; }
  .seg button:last-child { border-radius: 0 6px 6px 0; }
  .seg button + button { border-left: 0; }
  .kv { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; font-size: 0.76rem; }
  .kv span { color: #8d979f; }
  .kv b { font-weight: 500; color: #dfe5ea; }
  .warnbox { color: #e0c34a; font-size: 0.78rem; }
  .errbox { color: #f0a69d; border-color: rgba(232, 90, 74, 0.4); }
  button.danger { border-color: #8e3b33; color: #f0b3aa; }
  button:hover:not(:disabled) { border-color: #4f5860; }
  .row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  button { background: #1c2024; color: #dfe5ea; border: 1px solid #333a40; border-radius: 6px; padding: 4px 8px; font: inherit; cursor: pointer; }
  button.on { border-color: var(--accent); color: var(--accent); }
  button:disabled { opacity: 0.6; cursor: default; }
  select { flex: 1; min-width: 0; background: #1c2024; color: #dfe5ea; border: 1px solid #333a40; border-radius: 6px; padding: 3px 6px; font: inherit; }
  .vitals { display: flex; flex-direction: column; gap: 3px; background: rgba(255, 255, 255, 0.03); border-radius: 6px; padding: 6px; }
  .meter { display: grid; grid-template-columns: 58px 1fr 54px; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
  .meter i { height: 5px; background: #222; border-radius: 3px; overflow: hidden; }
  .meter i b { display: block; height: 100%; background: #6fbf73; }
  .restart { border-color: #8e3b33; color: #f0b3aa; }
  .go { border-color: #3b8e4a; color: #b6f0bf; }
  .runhead { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .runhead b { letter-spacing: 0.06em; }
  .runcard.test .runhead b { color: #e0c34a; }
  .runhead .air { color: #ff4d42; font-weight: 800; letter-spacing: 0.1em; }
  select.n { flex: 0 0 auto; }
  .panel.hidden { display: none; }
  /* panel hidden = nothing but the broadcast: the way back only shows under the pointer */
  .reopen { position: absolute; top: 10px; left: 10px; opacity: 0; transition: opacity 0.2s; z-index: 2; }
  .show:hover .reopen { opacity: 0.55; }
  .reopen:hover { opacity: 1 !important; }
  .hide { padding: 2px 7px; }
  .small { margin: 0; color: #8d979f; font-size: 0.74rem; }
  .small.warn { color: #e0a34a; }
  /* a member's seat: the whole viewport, the director's cut, a Leave and a Sound button */
  .show.watch { height: 100%; }
  .show.watch .stage { min-height: 0; border-radius: 0; }
  .show.watch .dip { border-radius: 0; }
  .watchbar { position: absolute; top: 2.2%; left: 50%; transform: translateX(-50%); z-index: 3; display: flex; align-items: center; gap: 8px; color: #dfe5ea; font-size: 0.85rem; }
  .watchbar .live { color: #ff4d42; font-weight: 900; letter-spacing: 0.14em; }
  .watchbar em { color: #8d979f; font-style: normal; }
  .watchbar button { background: rgba(10, 12, 14, 0.75); padding: 6px 12px; }
  /* WALK THE MAP: what can be done here, bottom left, clear of the cast strip */
  .walk { position: absolute; left: 14px; bottom: 17%; z-index: 6; display: flex; flex-direction: column; gap: 6px; max-width: min(46vw, 520px); pointer-events: none; }
  .walk > * { pointer-events: auto; }
  .wacts { display: flex; flex-direction: column; gap: 3px; }
  .wacts button { display: flex; align-items: center; gap: 8px; text-align: left; background: rgba(8, 10, 14, 0.78); color: #f1f3f4; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 6px; padding: 5px 10px; font: inherit; font-size: 0.86rem; cursor: pointer; }
  .wacts button:hover { border-color: #e8b04a; }
  .wacts kbd { background: #e8b04a; color: #14100a; border-radius: 4px; padding: 0 6px; font: inherit; font-weight: 700; font-size: 0.78rem; }
  .wbusy { background: rgba(8, 10, 14, 0.78); border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 6px; padding: 6px 10px; color: #f1f3f4; font-size: 0.86rem; display: flex; flex-direction: column; gap: 4px; }
  .wbusy small { opacity: 0.6; font-size: 0.72rem; }
  .wbar { height: 5px; background: rgba(255, 255, 255, 0.14); border-radius: 3px; overflow: hidden; }
  .wbar b { display: block; height: 100%; background: #e8b04a; }
  .wnote { background: rgba(8, 10, 14, 0.78); border-left: 3px solid #e8b04a; border-radius: 4px; padding: 5px 10px; color: #f1f3f4; font-size: 0.84rem; }
  .wkeys { color: rgba(241, 243, 244, 0.72); font-size: 0.74rem; text-shadow: 0 1px 2px #000; }
</style>
