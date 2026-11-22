<script lang="ts">
  // The stream pop-out PAGE — a whole separate window (the desktop shell's
  // native pop-out, or any window pointed at #popout=<channelId>.<userId>).
  // A separate window can't share the main window's LiveKit objects, so this
  // page runs its OWN subscribe-only viewer connection (a "<id>.v.<nonce>"
  // identity the server mints with canPublish: false; every client filters
  // those out of the peer list, so this window is invisible plumbing).
  import { onMount, onDestroy } from "svelte";
  import {
    Room,
    RoomEvent,
    Track,
    type RemoteTrack,
    type RemoteTrackPublication,
    type RemoteParticipant,
  } from "livekit-client";
  import { api } from "../lib/api";

  const { channelId, userId } = $props<{ channelId: number; userId: number }>();

  let status = $state<"connecting" | "live" | "ended" | "error" | "denied">("connecting");
  let streamerName = $state("");
  let volume = $state(100);
  let audioBlocked = $state(false);
  let videoEl = $state<HTMLVideoElement | null>(null);

  let room: Room | null = null;
  let audioEls: HTMLAudioElement[] = [];

  function applyVolume(): void {
    if (!room) return;
    for (const p of room.remoteParticipants.values()) {
      if (p.identity === String(userId)) p.setVolume(volume / 100, Track.Source.ScreenShareAudio);
    }
  }

  function attachVideo(track: RemoteTrack): void {
    if (videoEl) track.attach(videoEl);
    status = "live";
  }

  function handleTrack(track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant): void {
    if (p.identity !== String(userId)) return;
    streamerName = p.name || streamerName;
    if (track.kind === Track.Kind.Video && pub.source === Track.Source.ScreenShare) {
      attachVideo(track);
    } else if (track.kind === Track.Kind.Audio && pub.source === Track.Source.ScreenShareAudio) {
      const el = track.attach() as HTMLAudioElement;
      audioEls.push(el);
      document.body.appendChild(el);
      el.style.display = "none";
      applyVolume();
      audioBlocked = room ? !room.canPlaybackAudio : false;
    }
  }

  onMount(async () => {
    try {
      const { token, url } = await api.voiceToken(channelId, true);
      room = new Room({ adaptiveStream: true });
      room
        .on(RoomEvent.TrackSubscribed, handleTrack)
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
          if (p.identity !== String(userId)) return;
          track.detach().forEach((el) => el.remove());
          if (pub.source === Track.Source.ScreenShare) status = "ended";
        })
        .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
          if (p.identity === String(userId)) status = "ended";
        })
        .on(RoomEvent.AudioPlaybackStatusChanged, () => {
          audioBlocked = room ? !room.canPlaybackAudio : false;
        })
        .on(RoomEvent.Disconnected, () => {
          if (status === "live" || status === "connecting") status = "ended";
        });
      await room.connect(url, token);
      document.title = "Solace — Stream";
      // Already-published tracks don't re-fire TrackSubscribed; sweep them.
      for (const p of room.remoteParticipants.values()) {
        if (p.identity !== String(userId)) continue;
        streamerName = p.name || streamerName;
        for (const pub of p.trackPublications.values()) {
          if (pub.track) handleTrack(pub.track as RemoteTrack, pub as RemoteTrackPublication, p);
        }
      }
      if (status === "connecting") {
        // Connected, but they're not (or no longer) streaming.
        setTimeout(() => {
          if (status === "connecting") status = "ended";
        }, 8000);
      }
    } catch (e) {
      status = e instanceof Error && /403|locked/.test(e.message) ? "denied" : "error";
    }
  });

  onDestroy(() => {
    audioEls.forEach((el) => el.remove());
    void room?.disconnect();
    room = null;
  });

  function fullscreen(): void {
    void videoEl?.requestFullscreen?.();
  }
  function enableAudio(): void {
    void room?.startAudio().then(() => (audioBlocked = room ? !room.canPlaybackAudio : false));
  }
</script>

<div class="pop">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    bind:this={videoEl}
    autoplay
    playsinline
    muted
    ondblclick={fullscreen}
    title="Double-click for fullscreen"
  ></video>

  {#if status !== "live"}
    <div class="overlay">
      {#if status === "connecting"}<span>Tuning in…</span>
      {:else if status === "ended"}<span>The stream has ended. You can close this window.</span>
      {:else if status === "denied"}<span>That voice channel is locked.</span>
      {:else}<span>Couldn't connect to the stream.</span>{/if}
    </div>
  {/if}

  <div class="bar">
    <span class="name">{streamerName || "stream"}</span>
    {#if audioBlocked}
      <button class="btn hot" onclick={enableAudio}>🔊 Click to hear</button>
    {/if}
    <input
      type="range"
      min="0"
      max="150"
      bind:value={volume}
      oninput={applyVolume}
      aria-label="Stream volume"
    />
    <span class="pct">{volume}%</span>
    <button class="btn" onclick={fullscreen}>⛶ Fullscreen</button>
  </div>
</div>

<style>
  .pop {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: #000;
  }
  video {
    flex: 1;
    min-height: 0;
    width: 100%;
    object-fit: contain;
    background: #000;
  }
  .overlay {
    position: fixed;
    inset: 0 0 40px 0;
    display: grid;
    place-items: center;
    color: #bbb;
    font: 15px system-ui, sans-serif;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    background: #111;
    color: #ddd;
    font: 13px system-ui, sans-serif;
  }
  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .bar input[type="range"] {
    flex: 2;
    min-width: 80px;
    accent-color: #e8a33c;
  }
  .pct {
    width: 42px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: #aaa;
  }
  .btn {
    background: #222;
    color: #ddd;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
    font: inherit;
  }
  .btn:hover {
    border-color: #e8a33c;
  }
  .btn.hot {
    border-color: #e8a33c;
    color: #ffd98a;
  }
</style>
