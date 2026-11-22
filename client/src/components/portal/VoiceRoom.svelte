<script lang="ts">
  // THE VOICE ROOMS (src/portal/voice.ts; docs/portal/archive/voice.md). Sit
  // in one and talk: yours are the first voices in it in fifty-four million
  // years. Sitting alone, very rarely, the room plays back a few breaths of
  // its last session. Nothing says so. Tharvend files it as a repair.
  import { onDestroy } from "svelte";
  import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
  import GlyphText from "../../portal/GlyphText.svelte";
  import Glyph from "../../portal/Glyph.svelte";
  import { STATUS_STROKES } from "../../portal/status-strokes";
  import { api, type PortalVoiceState } from "../../lib/api";
  import { portalRefuse } from "../../lib/portal.svelte";
  import { playSfxAt } from "../../lib/sfx";

  let { room, name, sounds }: { room: string; name: number[]; sounds: Record<number, string> } = $props();

  type State = PortalVoiceState;
  let st = $state<State | null>(null);
  let lk = $state<Room | null>(null);
  let muted = $state(false);
  let joining = $state(false);
  let heard = new Set<string>();
  let joinedRoom = "";
  let audioBox: HTMLDivElement | null = null;
  let beatTimer: ReturnType<typeof setInterval> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;


  /** A fault the server stamped: play it once, at its moment, against the server's clock. */
  function maybePlay(s: State) {
    if (!lk || !s.fault) return;
    const key = `${s.fault.clip}@${s.fault.at}`;
    if (heard.has(key)) return;
    heard.add(key);
    const wait = s.fault.at - s.now;
    if (wait > -2000) playSfxAt(`portal/${s.fault.clip}`, Math.max(0, wait), 0.55);
  }

  async function refresh() {
    try { st = await api.portalVoice(room); } catch { st = null; }
  }
  async function join() {
    if (joining || lk) return;
    joining = true;
    try {
      const t = await api.portalVoiceToken(room);
      const url = t.url.startsWith("/") ? (location.protocol === "https:" ? "wss://" : "ws://") + location.host + t.url : t.url;
      const r = new Room({ adaptiveStream: true, dynacast: true });
      r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        audioBox?.appendChild(el);
      });
      r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => { track.detach().forEach((el) => el.remove()); });
      await r.connect(url, t.token);
      await r.localParticipant.setMicrophoneEnabled(true).catch(() => { muted = true; });
      lk = r;
      joinedRoom = room;
      const here = room;
      const beat = async () => { try { const s = await api.portalVoiceBeat(here); st = s; maybePlay(s); } catch { /* next beat */ } };
      void beat();
      beatTimer = setInterval(beat, 20_000);
    } catch { portalRefuse(); } finally { joining = false; }
  }
  async function leave() {
    if (beatTimer) clearInterval(beatTimer);
    beatTimer = null;
    const r = lk; lk = null;
    if (r) { await r.disconnect(); void api.portalVoiceLeave(joinedRoom).catch(() => {}); }
    audioBox?.replaceChildren();
    void refresh();
  }
  async function toggleMute() {
    if (!lk) return;
    muted = !muted;
    await lk.localParticipant.setMicrophoneEnabled(!muted).catch(() => {});
  }

  // A new room: leave the old one, look in on this one.
  $effect(() => {
    void room;
    void leave().then(refresh);
    pollTimer = setInterval(() => { if (!lk) void refresh(); }, 15_000);
    return () => { if (pollTimer) clearInterval(pollTimer); };
  });
  onDestroy(() => { void leave(); if (pollTimer) clearInterval(pollTimer); });
</script>

<div class="voice">
  <header><GlyphText tokens={name} {sounds} size={20} showSounds /><span class="wave">∿</span></header>
  <div class="hollow">
    <div class="ring" class:live={!!lk}>
      {#each st?.here ?? [] as h, i (i)}
        <span class="seat" class:you={h.you} style="--a:{(i / Math.max(1, st?.here.length ?? 1)) * 360}deg"><GlyphText tokens={h.name} {sounds} size={11} /></span>
      {/each}
    </div>
    {#if st && !st.enabled}
      <Glyph parts={STATUS_STROKES[6]} size={40} />
    {:else if lk}
      <div class="ctl">
        <button class:off={muted} onclick={toggleMute} aria-label="mic">{muted ? "◌" : "◉"}</button>
        <button onclick={leave} aria-label="leave">✕</button>
      </div>
    {:else}
      <button class="join" disabled={joining || !st?.enabled} onclick={join} aria-label="join">∿</button>
    {/if}
  </div>
  <div class="audio" bind:this={audioBox}></div>
</div>

<style>
  .voice { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  header { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--p-line); min-height: 52px; }
  .wave { color: var(--p-dim); }
  .hollow { flex: 1; display: grid; place-items: center; align-content: center; gap: 24px; background: radial-gradient(closest-side, rgba(90, 70, 160, 0.07), transparent); }
  .ring { position: relative; width: 240px; height: 240px; border: 1px dashed #2a2445; border-radius: 50%; }
  .ring.live { border-color: #3b2a6b; box-shadow: 0 0 40px rgba(110, 80, 200, 0.12) inset; }
  .seat { position: absolute; left: 50%; top: 50%; transform: rotate(var(--a)) translateY(-120px) rotate(calc(-1 * var(--a))) translate(-50%, -50%); white-space: nowrap; padding: 2px 6px; border-radius: 8px; background: #0e0b1a; border: 1px solid var(--p-line); }
  .seat.you { border-color: #6b55b8; }
  .ctl { display: flex; gap: 10px; }
  .ctl button, .join { min-width: 52px; height: 44px; border: 1px solid #3b2a6b; border-radius: 10px; background: #1a1430; color: var(--p-lit); font-size: 20px; cursor: pointer; }
  .ctl button.off { color: var(--p-dim); }
  .join:disabled { opacity: 0.3; cursor: default; }
  .audio { display: none; }
</style>
