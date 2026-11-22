<script lang="ts">
  import { voice, videoTrackFor, setStreamVolume, watchStream, leaveStream } from "../lib/voice.svelte";
  import { isDesktopShell } from "../lib/platform";

  // The stage: cameras + my own publishes always show; someone ELSE's screen
  // stream is OPT-IN — a "watch" pill offers it, joining puts it on stage,
  // and leaving hides it again (and mutes its audio locally).
  // Click a tile to focus it large; double-click for browser fullscreen;
  // minimize collapses to a pill so it never blocks the app.

  let focusedSid = $state<string | null>(null);
  const tiles = $derived(
    voice.tiles.filter((t) => t.local || t.kind === "camera" || voice.watching.includes(t.userId)),
  );
  const unwatched = $derived(
    voice.tiles.filter((t) => t.kind === "screen" && !t.local && !voice.watching.includes(t.userId)),
  );
  const focused = $derived(tiles.find((t) => t.sid === focusedSid) ?? null);

  $effect(() => {
    // Auto-focus a lone screen share; clear focus when its tile leaves view.
    if (focusedSid && !tiles.some((t) => t.sid === focusedSid)) focusedSid = null;
    if (!focusedSid) {
      const screen = tiles.find((t) => t.kind === "screen");
      if (screen) focusedSid = screen.sid;
    }
  });

  function joinStream(t: { userId: number; sid: string }): void {
    watchStream(t.userId);
    voice.stageMin = false;
    focusedSid = t.sid;
  }

  /** Svelte action: attach the LiveKit video track to this <video>. */
  function attach(el: HTMLVideoElement, sid: string) {
    let current = sid;
    videoTrackFor(current)?.attach(el);
    return {
      update(next: string) {
        if (next === current) return;
        videoTrackFor(current)?.detach(el);
        current = next;
        videoTrackFor(current)?.attach(el);
      },
      destroy() {
        videoTrackFor(current)?.detach(el);
      },
    };
  }

  function fullscreen(e: MouseEvent) {
    const el = (e.currentTarget as HTMLElement).querySelector("video");
    if (el) void el.requestFullscreen?.();
  }

  // ---- Pop out ----
  // Preferred: DOCUMENT Picture-in-Picture (Chromium/WebView2) — a real
  // window the user can drag to any monitor, resize with the mouse, snap,
  // and whose video can go FULLSCREEN on that screen (double-click or the
  // ⛶ button). It also carries a WORKING volume slider — the browser's own
  // video-PiP mute button is useless here because LiveKit video tracks are
  // silent (audio rides separate elements in the main window).
  // Fallback: classic element PiP where Document PiP doesn't exist.
  let bigVideo = $state<HTMLVideoElement | null>(null);
  let pipActive = $state(false);
  let docPipWin: Window | null = null;
  let docPipSid: string | null = null;

  interface DocPip {
    requestWindow(opts?: { width?: number; height?: number }): Promise<Window>;
  }
  const docPip = (): DocPip | undefined =>
    (window as unknown as { documentPictureInPicture?: DocPip }).documentPictureInPicture;

  // ---- Drag + resize the in-app stage ----
  // The bar is a drag handle (buttons still click); CSS `resize: both` puts
  // a grab corner on the panel. Position resets when the stage unmounts.
  let dragPos = $state<{ x: number; y: number } | null>(null);
  function startDrag(e: PointerEvent): void {
    if ((e.target as HTMLElement).closest("button")) return;
    const stage = (e.currentTarget as HTMLElement).closest(".stage") as HTMLElement | null;
    if (!stage) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const offX = e.clientX - r.left;
    const offY = e.clientY - r.top;
    const move = (ev: PointerEvent) => {
      dragPos = {
        x: Math.max(4, Math.min(window.innerWidth - 120, ev.clientX - offX)),
        y: Math.max(4, Math.min(window.innerHeight - 60, ev.clientY - offY)),
      };
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function popOutDocStyles(): string {
    return `
      * { box-sizing: border-box; }
      body { margin: 0; height: 100vh; display: flex; flex-direction: column; background: #000; font: 13px system-ui, sans-serif; }
      video { flex: 1; min-height: 0; width: 100%; object-fit: contain; background: #000; }
      .bar { display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: #111; color: #ddd; }
      .bar .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
      .bar input[type=range] { flex: 2; accent-color: #e8a33c; min-width: 80px; }
      .bar button { background: #222; color: #ddd; border: 1px solid #333; border-radius: 6px; padding: 4px 10px; cursor: pointer; font: inherit; }
      .bar button:hover { border-color: #e8a33c; }
      .bar .pct { width: 42px; text-align: right; font-variant-numeric: tabular-nums; color: #aaa; }
    `;
  }

  /** Fill a popped-out window (Document PiP or a plain popup) with the
   *  video, a fullscreen button, and a WORKING stream-volume slider. */
  function buildPopContent(win: Window, t: { sid: string; userId: number; name: string; kind: string; local: boolean }): void {
    const d = win.document;
    d.title = `Solace — ${t.local ? "your" : `${t.name}'s`} ${t.kind === "screen" ? "stream" : "camera"}`;
    const style = d.createElement("style");
    style.textContent = popOutDocStyles();
    d.head.appendChild(style);

    const v = d.createElement("video");
    v.autoplay = true;
    v.playsInline = true;
    v.muted = true; // the video track is silent; audio plays in the main window
    d.body.appendChild(v);
    videoTrackFor(t.sid)?.attach(v);
    v.addEventListener("dblclick", () => void v.requestFullscreen?.());

    const bar = d.createElement("div");
    bar.className = "bar";
    const name = d.createElement("span");
    name.className = "name";
    name.textContent = `${t.local ? "You" : t.name} · ${t.kind === "screen" ? "stream" : "camera"}`;
    bar.appendChild(name);
    if (t.kind === "screen" && !t.local) {
      const vol = d.createElement("input");
      vol.type = "range";
      vol.min = "0";
      vol.max = "150";
      vol.value = String(Math.round((voice.streamVolumes[t.userId] ?? 1) * 100));
      const pct = d.createElement("span");
      pct.className = "pct";
      pct.textContent = `${vol.value}%`;
      vol.addEventListener("input", () => {
        setStreamVolume(t.userId, Number(vol.value) / 100);
        pct.textContent = `${vol.value}%`;
      });
      bar.appendChild(vol);
      bar.appendChild(pct);
    }
    const fs = d.createElement("button");
    fs.textContent = "⛶ Fullscreen";
    fs.addEventListener("click", () => void v.requestFullscreen?.());
    bar.appendChild(fs);
    d.body.appendChild(bar);

    win.addEventListener("pagehide", () => {
      videoTrackFor(t.sid)?.detach(v);
      docPipWin = null;
      docPipSid = null;
      pipActive = false;
    });
  }

  async function popOut(): Promise<void> {
    const t = focused;
    if (!t) return;
    // 0) The desktop shell: ask Rust for a real NATIVE window pointed at the
    //    #popout page (its own subscribe-only LiveKit connection — a separate
    //    webview can't share this window's media objects). We then LEAVE the
    //    stream in-app so it isn't downloaded twice; audio + volume live in
    //    the pop-out window.
    if (isDesktopShell && t.kind === "screen" && voice.channelId != null) {
      const invoke = (
        window as unknown as { __TAURI__?: { core?: { invoke?: (cmd: string, args: object) => Promise<unknown> } } }
      ).__TAURI__?.core?.invoke;
      if (invoke) {
        try {
          await invoke("open_popout", {
            url: `${location.origin}/#popout=${voice.channelId}.${t.userId}`,
          });
          // Watching someone else in the pop-out: stop downloading it in-app
          // too (still counted as a viewer). Your OWN stream keeps its local
          // preview — that costs nothing.
          if (!t.local) leaveStream(t.userId, true);
          return;
        } catch (e) {
          // The browser fallbacks can never work inside the shell's webview —
          // surface the REAL reason instead of a pop-up-blocker red herring.
          voice.error = `Pop-out failed — ${String(e)}. If this persists, update the desktop app from solace.zone.`;
          return;
        }
      } else {
        voice.error = "Pop-out needs the latest Solace desktop app — update from solace.zone.";
        return;
      }
    }
    // 1) Document PiP: always-on-top real window (Chrome/Edge).
    const dpp = docPip();
    if (dpp) {
      try {
        const win = await dpp.requestWindow({ width: 960, height: 580 });
        docPipWin = win;
        docPipSid = t.sid;
        pipActive = true;
        buildPopContent(win, t);
        return;
      } catch {
        docPipWin = null;
        docPipSid = null;
        /* fall through */
      }
    }
    // 2) Classic element PiP: the browser's floating video bubble. Needs NO
    //    pop-up permission, so browsers with a popup blocker (Brave shields,
    //    strict Chrome settings) still get a movable always-on-top window.
    const el = bigVideo;
    if (el && "requestPictureInPicture" in el) {
      try {
        await el.requestPictureInPicture();
        pipActive = true;
        el.addEventListener("leavepictureinpicture", () => (pipActive = false), { once: true });
        return;
      } catch {
        /* refused — try the popup */
      }
    }
    // 3) A plain popup window (last resort — popup blockers can eat it).
    try {
      const win = window.open("", "_blank", "popup=yes,width=960,height=600");
      if (win) {
        docPipWin = win;
        docPipSid = t.sid;
        pipActive = true;
        buildPopContent(win, t);
        return;
      }
    } catch {
      /* popup blocked */
    }
    voice.error =
      "Couldn't pop the stream out — allow pop-ups for solace.zone (the icon in your address bar) and try again.";
  }

  function backFromPip(): void {
    if (docPipWin) {
      docPipWin.close(); // the pagehide handler resets state + detaches
      return;
    }
    void (document as Document & { exitPictureInPicture(): Promise<void> })
      .exitPictureInPicture()
      .catch(() => (pipActive = false));
  }

  $effect(() => {
    // The popped-out stream ended (or I left it) — close its window.
    if (docPipSid && !voice.tiles.some((t) => t.sid === docPipSid)) docPipWin?.close();
  });
</script>

{#if tiles.length || unwatched.length}
  <!-- Streams awaiting this viewer's opt-in — join is a click, always. -->
  {#if unwatched.length}
    <div class="watch-stack" class:raised={tiles.length > 0 && !voice.stageMin && !pipActive}>
      {#each unwatched as t (t.sid)}
        <button class="stage-pill watch" onclick={() => joinStream(t)} title="Join this stream">
          🖥️ {t.name} is streaming — <b>Watch</b>
          <span class="eye" title="people watching">👁 {voice.viewers[t.userId]?.length ?? 0}</span>
        </button>
      {/each}
    </div>
  {/if}
  {#if pipActive}
    <button class="stage-pill" onclick={backFromPip} title="Close the floating window and bring the stage back">
      📺 Popped out — bring back
    </button>
  {:else if voice.stageMin && tiles.length}
    <button class="stage-pill" onclick={() => (voice.stageMin = false)}>
      📺 {tiles.length} live — show
    </button>
  {/if}
  {#if tiles.length && (!voice.stageMin || pipActive)}
    <div
      class="stage"
      class:focused={focused !== null}
      class:pip-hidden={pipActive}
      style={dragPos ? `left:${dragPos.x}px; top:${dragPos.y}px; right:auto; bottom:auto;` : ""}
    >
      <div class="bar" role="presentation" onpointerdown={startDrag} title="Drag to move">
        <span class="title">📺 On stage</span>
        {#if focused?.kind === "screen"}
          <span class="eye bar-eye" title="people watching this stream">👁 {voice.viewers[focused.userId]?.length ?? 0}</span>
        {/if}
        <span class="bar-btns">
          {#if focused}
            <button class="mini-btn" title="Pop out to its own window — drag it to any screen, snap, or fullscreen it there" onclick={() => void popOut()}>⧉</button>
          {/if}
          {#if focused && focused.kind === "screen" && !focused.local}
            <button class="mini-btn leave" title="Leave this stream (hides it and mutes its audio for you)" onclick={() => leaveStream(focused.userId)}>✕ Leave</button>
          {/if}
          <button class="mini-btn" title="Minimize" onclick={() => (voice.stageMin = true)}>—</button>
        </span>
      </div>

      {#if focused}
        <div
          class="big"
          role="presentation"
          ondblclick={fullscreen}
          title="Double-click for fullscreen"
        >
          <video bind:this={bigVideo} use:attach={focused.sid} autoplay playsinline muted={focused.local}></video>
          <span class="label">{focused.local ? "You" : focused.name} · {focused.kind === "screen" ? "screen" : "camera"}</span>
        </div>
        {#if focused.kind === "screen" && !focused.local}
          <!-- The stream's own audio (not their voice) — local volume, per viewer. -->
          <div class="vol-row">
            <span class="vol-ico">🔊</span>
            <input
              type="range"
              min="0"
              max="150"
              value={Math.round((voice.streamVolumes[focused.userId] ?? 1) * 100)}
              oninput={(e) => setStreamVolume(focused.userId, Number(e.currentTarget.value) / 100)}
              aria-label="Stream volume"
            />
            <span class="vol-val">{Math.round((voice.streamVolumes[focused.userId] ?? 1) * 100)}%</span>
          </div>
        {/if}
      {/if}

      <div class="strip">
        {#each tiles.filter((t) => t.sid !== focusedSid) as t (t.sid)}
          <button class="tile" onclick={() => (focusedSid = t.sid)} ondblclick={fullscreen} title="Click to focus">
            <video use:attach={t.sid} autoplay playsinline muted={t.local}></video>
            <span class="label">{t.local ? "You" : t.name}{t.kind === "screen" ? " 🖥" : ""}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
{/if}

<style>
  .stage {
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 90;
    width: min(440px, calc(100vw - 90px));
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    background: color-mix(in srgb, var(--panel) 92%, black);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: 0 16px 50px rgba(0, 0, 0, 0.55);
    /* A grab corner (bottom-right) — resize like a window. */
    resize: both;
    overflow: hidden;
    min-width: 280px;
    min-height: 140px;
    max-width: 96vw;
    max-height: 92vh;
  }
  .bar {
    cursor: grab;
    user-select: none;
    touch-action: none;
  }
  .bar:active {
    cursor: grabbing;
  }
  .stage.focused {
    width: min(720px, calc(100vw - 90px));
  }
  /* Popped out: the source <video> must stay in the DOM (removing it closes
     the PiP window), so the stage hides instead of unmounting. */
  .stage.pip-hidden {
    display: none;
  }
  .bar-btns {
    display: flex;
    gap: 2px;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .title {
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: var(--ink-soft);
  }
  .mini-btn {
    background: none;
    border: none;
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.9rem;
    line-height: 1;
    padding: 2px 8px;
  }
  .mini-btn:hover {
    color: var(--ink);
  }
  .big {
    position: relative;
    border-radius: 10px;
    overflow: hidden;
    background: #000;
    /* Fills whatever height the user drags the panel to; at the default
       auto height the video just sizes from its width (aspect kept). */
    flex: 1;
    min-height: 0;
  }
  .big video {
    display: block;
    width: 100%;
    height: 100%;
    max-height: min(60vh, 560px);
    object-fit: contain;
  }
  .vol-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 4px;
  }
  .vol-row input {
    flex: 1;
    accent-color: var(--accent);
  }
  .vol-ico {
    font-size: 0.8rem;
  }
  .vol-val {
    flex: none;
    width: 40px;
    text-align: right;
    font-size: 0.72rem;
    color: var(--ink-soft);
    font-variant-numeric: tabular-nums;
  }
  .strip {
    display: flex;
    gap: 6px;
    overflow-x: auto;
  }
  .strip:empty {
    display: none;
  }
  .tile {
    position: relative;
    flex: none;
    width: 132px;
    height: 78px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    background: #000;
    cursor: pointer;
  }
  .tile:hover {
    border-color: var(--accent);
  }
  .tile video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .label {
    position: absolute;
    left: 6px;
    bottom: 5px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.62);
    color: #eee;
    font-size: 0.68rem;
    font-weight: 600;
    max-width: calc(100% - 12px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stage-pill {
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 90;
    padding: 8px 16px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--panel);
    color: var(--ink);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  }
  .stage-pill:hover {
    border-color: var(--accent);
  }
  /* Watch offers stack above whatever else sits bottom-right. */
  .watch-stack {
    position: fixed;
    right: 12px;
    bottom: 56px;
    z-index: 91;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }
  .watch-stack.raised {
    bottom: auto;
    top: 12px;
  }
  .watch-stack .stage-pill.watch {
    position: static;
    border-color: color-mix(in srgb, var(--accent) 60%, var(--line));
  }
  .stage-pill.watch b {
    color: var(--accent);
  }
  .eye {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-left: 6px;
    padding: 1px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line));
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .bar-eye {
    margin-left: auto;
    margin-right: 6px;
  }
  .mini-btn.leave {
    font-size: 0.72rem;
    font-weight: 700;
    color: #ff8a80;
  }
  .mini-btn.leave:hover {
    color: #ffb4ab;
  }
  @media (max-width: 700px) {
    .stage,
    .stage.focused {
      right: 8px;
      left: 66px;
      width: auto;
    }
  }
</style>
