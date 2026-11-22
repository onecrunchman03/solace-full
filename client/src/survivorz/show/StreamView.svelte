<script lang="ts">
  // SOLACE SURVIVORZ — THE STREAM PAGE (`/#survivorz-stream`, SURVIVORZ.md §12 "The stream rig").
  //
  // What the YouTube rig (scripts/survivorz/streamer.mjs) opens in Edge: the show, full window, in
  // watch mode, with NOTHING else on screen — no LIVE pill, no Leave, no sound button, no cursor — and
  // the sound started by itself. It runs on the rig's STREAM TOKEN (src/survivorz/streamtoken.ts), not
  // a session: the in-Solace broadcast stays off air for the run, nobody signs this browser in, and
  // there is no App around it, so no chat socket, no idle logout, no Terms gate.
  //
  // The token arrives one of two ways, and is held in memory only (lib/api's useStreamToken):
  //   · the rig sets `window.__survStreamToken` before the page loads (Playwright addInitScript) —
  //     it never sits in a URL, a history entry or a log;
  //   · for a hand test, `/#survivorz-stream=<token>`, stripped from the address bar at once.
  //
  // THE RIG'S CONTRACT (replaces the Oct 20 stand-in's `window.stage`), all on `window.stream`:
  //   ready       true once the scene has loaded
  //   stats()     { fps, frameMs, heapMB, phase, framesIn, lastServerFrameAt, chunks, lastChunkAt, … }
  //   start()     the tab capture (getDisplayMedia — call it from inside a click)
  //   record()    MediaRecorder on that capture → `window.__streamSink(kind, data)` (Playwright's
  //               exposeFunction: "meta" once, then base64 "data" chunks, in order)
  //   setStandby({on, text})   the standby card, pushed by the rig from its heartbeat's answer
  // The standby card is also polled from the server here, so it shows even if the rig is slow.
  import { onDestroy, onMount } from "svelte";
  import Show from "./Show.svelte";
  import { useStreamToken } from "../../lib/api";

  interface Standby { on: boolean; text: string }
  interface ShowLike { stats(): { fps: number; frameMs: number; heapMB?: number | null; frames?: number }; status?: { phase: string } }
  type Sink = (kind: "meta" | "data", data: string) => Promise<unknown>;
  interface StreamApi {
    ready: boolean;
    stats(): Record<string, unknown>;
    start(): Promise<void>;
    record(): Promise<{ mime: string; real: string }>;
    setStandby(s: Standby): void;
  }
  const W = window as unknown as {
    __survStreamToken?: string; __show?: ShowLike; __streamSink?: Sink; stream?: StreamApi;
  };

  // the token, before anything fetches
  const token = ((): string => {
    const m = /^#survivorz-stream=(.+)$/.exec(location.hash);
    if (!m) return W.__survStreamToken ?? "";
    history.replaceState(null, "", `${location.pathname}${location.search}#survivorz-stream`);
    return decodeURIComponent(m[1]);
  })();
  if (token) useStreamToken(token);

  let standby = $state<Standby>({ on: false, text: "" });
  let phase = $state("starting");
  let capture: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks = 0, lastChunkAt = 0, framesSeen = 0, lastServerFrameAt = 0;
  let poll = 0, watch = 0;

  async function pollStandby(): Promise<void> {
    if (!token) return;
    try {
      const r = await fetch("/api/survivorz/stream/state", { headers: { authorization: `Bearer ${token}` } });
      if (r.ok) { const j = await r.json(); if (j?.standby) setStandby(j.standby); }
    } catch { /* the next poll */ }
  }
  function setStandby(s: Standby): void {
    const on = s?.on === true, text = typeof s?.text === "string" ? s.text.slice(0, 140) : "";
    if (on !== standby.on || text !== standby.text) standby = { on, text };
  }

  const blobB64 = (b: Blob): Promise<string> => new Promise((res, rej) => {
    const fr = new FileReader();
    // (after ";base64," — the mime itself carries a comma: codecs=h264,opus)
    fr.onload = () => { const s = String(fr.result); res(s.slice(s.indexOf(";base64,") + 8)); };
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(b);
  });

  const api: StreamApi = {
    ready: false,
    stats() {
      const s = W.__show?.stats();
      return {
        fps: s ? Math.round(s.fps) : null,
        frameMs: s?.frameMs ?? null,
        heapMB: s?.heapMB ?? null,
        phase,
        framesIn: framesSeen,
        lastServerFrameAt: lastServerFrameAt || null,
        capturing: !!capture,
        recording: recorder?.state ?? "off",
        chunks,
        lastChunkAt: lastChunkAt || null,
        inner: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
        standby: standby.on,
      };
    },
    async start() {
      if (capture) return;
      // the tab's own picture and sound; Edge runs with --auto-accept-this-tab-capture
      capture = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1920, height: 1080, frameRate: 60 },
        // a tab's audio arrives with echo cancellation, noise suppression and gain control ON and in
        // mono (measured) — a voice-call chain that mangles a score and cancels the tab's own playout
        audio: { suppressLocalAudioPlayback: false, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 },
        preferCurrentTab: true, selfBrowserSurface: "include", systemAudio: "include",
      } as DisplayMediaStreamOptions);
    },
    async record() {
      const sink = W.__streamSink;
      if (!capture) throw new Error("no capture — call start() first");
      if (!sink) throw new Error("no sink — the rig exposes window.__streamSink");
      const mime = ["video/webm;codecs=h264,opus", "video/x-matroska;codecs=avc1,opus", "video/webm;codecs=vp8,opus"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "video/webm";
      // Edge encodes H.264 on the GPU and ffmpeg only copies it, so YouTube's 2 s keyframes are asked for here
      const rec = new MediaRecorder(capture, { mimeType: mime, videoBitsPerSecond: 9e6, audioBitsPerSecond: 160e3, videoKeyFrameIntervalDuration: 2000 } as MediaRecorderOptions);
      // what the capture REALLY delivers (settings report the constraint, not the frame)
      let real = "?";
      try {
        const Proc = (window as unknown as { MediaStreamTrackProcessor?: new (o: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> } }).MediaStreamTrackProcessor;
        if (Proc) {
          const reader = new Proc({ track: capture.getVideoTracks()[0].clone() }).readable.getReader();
          const { value } = await reader.read();
          if (value) { real = `${value.displayWidth}x${value.displayHeight}`; value.close(); }
          void reader.cancel();
        }
      } catch { /* the probe is a nicety */ }
      await sink("meta", JSON.stringify({ mime, real, inner: `${innerWidth}x${innerHeight}`, tracks: capture.getTracks().map((t) => t.kind) }));
      // chunks go to the rig IN ORDER (each waits for the last), which is also the backpressure
      let chain: Promise<unknown> = Promise.resolve();
      rec.ondataavailable = (e) => {
        if (!e.data.size) return;
        const blob = e.data;
        chain = chain.then(() => blobB64(blob)).then((b) => sink("data", b)).then(() => { chunks++; lastChunkAt = Date.now(); }).catch(() => { /* the rig's watchdog sees a stall */ });
      };
      rec.start(250);
      recorder = rec;
      return { mime, real };
    },
    setStandby,
  };
  W.stream = api;

  onMount(() => {
    poll = window.setInterval(pollStandby, 4000);
    void pollStandby();
    // the scene's readiness and the live feed's progress, read off the review hook (never the frame loop)
    watch = window.setInterval(() => {
      const s = W.__show;
      if (!s) return;
      const st = s.stats();
      if (typeof st.frames === "number" && st.frames !== framesSeen) { framesSeen = st.frames; lastServerFrameAt = Date.now(); }
      const p = s.status?.phase;
      if (p) phase = p;
      api.ready = phase === "ready";
    }, 500);
  });
  onDestroy(() => {
    window.clearInterval(poll);
    window.clearInterval(watch);
    recorder?.stop();
    capture?.getTracks().forEach((t) => t.stop());
  });
</script>

<div class="stream">
  {#if token}
    <Show watch stream />
  {:else}
    <div class="card"><b>SOLACE SURVIVORZ</b><span>no stream token</span></div>
  {/if}
  <!-- THE SHIELD: the rig's one click (the gesture getDisplayMedia wants) lands here, never on a cast
       card or the camera — a stray click must not take the stream out of the director's cut -->
  <div class="shield"></div>
  {#if standby.on}
    <div class="card standby"><b>SOLACE SURVIVORZ</b><span>{standby.text || "We'll be right back."}</span></div>
  {/if}
</div>

<style>
  /* exactly the window: the rig sizes Edge so this is 1920x1080 */
  :global(html), :global(body) { margin: 0; background: #000; overflow: hidden; cursor: none; }
  .stream { position: fixed; inset: 0; display: flex; background: #000; cursor: none; user-select: none; }
  .shield { position: absolute; inset: 0; z-index: 40; }
  .card {
    position: absolute; inset: 0; z-index: 50; display: grid; place-content: center; gap: 18px; text-align: center;
    background: radial-gradient(ellipse at center, #14181b 0%, #050607 70%); color: #dfe5ea;
    font-family: system-ui, sans-serif;
  }
  .card b { font-size: 64px; letter-spacing: 0.24em; font-weight: 900; color: #e8e2d4; }
  .card span { font-size: 30px; color: #9aa4ab; letter-spacing: 0.06em; }
</style>
