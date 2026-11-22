<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as THREE from "three";
  import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
  import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
  import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
  import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
  import { connectGame, type GameNet, type Welcome } from "../lib/gamenet";
  import {
    createScene,
    buildChunk,
    pruneChunks,
    wallsBetween,
    tickFlickers,
    tickAvatar,
    WorldIndex,
    makeAvatar,
    disposeAvatar,
    CELL,
    EYE,
    type PeerAvatar,
  } from "../lib/world";
  import { createController, type PlayerState } from "../lib/controller";
  import { joinProximityVoice, type ProximityVoice, type SpatialPeer } from "../lib/voicechat";
  import { startHum, footstep, closeAmbience } from "../lib/ambience";

  let { door, onExit }: { door: number; onExit: () => void } = $props();

  let host: HTMLDivElement;
  let doorName = $state("");
  let entered = $state(false);
  let deniedMsg = $state("");
  let lost = $state(false);
  let locked = $state(false);
  let micState = $state<"joining" | "live" | "muted" | "off">("off");
  let voice: ProximityVoice | null = null;

  let net: GameNet | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let raf = 0;
  let cleanupFns: (() => void)[] = [];

  onMount(() => {
    const { scene, camera } = createScene();
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    // Bloom sells the fluorescence: threshold sits above every lit surface
    // so ONLY the panels bleed — the halo your eyes add around a bright
    // light, which belongs in clean POV (grain does not).
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // Soft halos around the panels — restrained (Josh: lights too bright).
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.36, 0.5, 0.93);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const world = new WorldIndex(16);
    const player: PlayerState = { x: 0, y: 0, yaw: 0, pitch: 0, moving: false };
    const ctl = createController(player, world);
    const peers = new Map<number, PeerAvatar>();

    let worldSize = 256;
    let chunkSize = 16;
    const requested = new Set<string>();
    let lastChunkCheck = 0;
    let lastMoveSend = 0;
    let lastVoiceAt = 0;
    const wallCache = new Map<number, number>(); // peerId → occlusion walls (5Hz)
    let lastSent = { x: -1, y: -1, h: -999 };
    let bobT = 0;

    const resize = (): void => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer!.setSize(w, h);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);
    cleanupFns.push(() => window.removeEventListener("resize", resize));

    // ---- Net -----------------------------------------------------------
    net = connectGame({
      onWelcome: (w: Welcome) => {
        worldSize = w.size;
        chunkSize = w.chunk;
        world.chunkSize = w.chunk;
        for (const d of w.districts ?? []) world.districtTypes.set(d.id, d.type);
        world.mapSize = w.size;
        player.x = w.you.x;
        player.y = w.you.y;
        // Face away from your door into the yellow.
        const d = w.doors[w.you.door];
        player.yaw = d.edge === "N" ? Math.PI : d.edge === "S" ? 0 : d.edge === "E" ? Math.PI / 2 : -Math.PI / 2;
        doorName = d.name;
        entered = true;
        wantChunks(true);
        // Proximity voice: open mic, distance does the rest. If voice isn't
        // configured server-side the game simply stays silent.
        micState = "joining";
        void joinProximityVoice().then((r) => {
          if (r.ok) {
            voice = r.voice;
            micState = "live";
          } else {
            micState = "off";
          }
        });
      },
      onDenied: (e) => {
        deniedMsg =
          e === "full" ? "The backrooms are at capacity (16 inside). Try again soon."
          : e === "already_inside" ? "You're already inside from another window."
          : e === "backrooms_offline" ? "The doors won't open — the world failed verification server-side."
          : "The door won't open.";
      },
      onChunk: (c) => buildChunk(world, scene, c),
      onPos: (id, name, x, y, h) => {
        let p = peers.get(id);
        if (!p) {
          p = makeAvatar(scene, name);
          peers.set(id, p);
        }
        p.target.set(x * CELL, 0, y * CELL);
        p.heading = h;
      },
      onBye: (id) => {
        const p = peers.get(id);
        if (p) {
          disposeAvatar(scene, p);
          peers.delete(id);
        }
      },
      onCorrect: (x, y) => {
        player.x = x;
        player.y = y;
      },
      onClosed: () => {
        lost = true;
      },
    });
    net.enter(door);

    const wantChunks = (immediate = false): void => {
      const now = performance.now();
      if (!immediate && now - lastChunkCheck < 250) return;
      lastChunkCheck = now;
      const pcx = Math.floor(player.x / chunkSize);
      const pcy = Math.floor(player.y / chunkSize);
      const missing: { cx: number; cy: number }[] = [];
      const maxC = Math.ceil(worldSize / chunkSize);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const cx = pcx + dx;
          const cy = pcy + dy;
          if (cx < 0 || cy < 0 || cx >= maxC || cy >= maxC) continue;
          const k = `${cx},${cy}`;
          if (!world.meshes.has(k) && !requested.has(k)) {
            requested.add(k);
            missing.push({ cx, cy });
          }
        }
      }
      if (missing.length) net!.requestChunks(missing);
      pruneChunks(world, scene, pcx, pcy, 4);
    };

    // ---- Input ---------------------------------------------------------
    const canvas = renderer.domElement;
    const onClick = (): void => {
      if (!locked) canvas.requestPointerLock();
      voice?.onGesture(); // retry any autoplay-blocked voices on real input
      startHum(); // needs a gesture once; idempotent after
    };
    const onLockChange = (): void => {
      locked = document.pointerLockElement === canvas;
    };
    const onMouseMove = (e: MouseEvent): void => {
      if (locked) ctl.onMouse(e.movementX, e.movementY);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      ctl.keys.add(e.code);
      if (e.code === "KeyM" && voice) {
        const next = !voice.muted();
        voice.setMuted(next);
        micState = next ? "muted" : "live";
      }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      ctl.keys.delete(e.code);
    };
    const onBlur = (): void => ctl.keys.clear();
    canvas.addEventListener("click", onClick);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    cleanupFns.push(() => {
      canvas.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (document.pointerLockElement) document.exitPointerLock();
    });

    // ---- The loop ------------------------------------------------------
    // Debug handle (harmless in prod; used by dev tooling/screenshot checks).
    (window as unknown as { __br?: unknown }).__br = { world, player, scene, camera };

    let last = performance.now();
    const frame = (): void => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (entered) {
        ctl.tick(dt);
        wantChunks();

        // Send position at 10Hz when something changed.
        if (now - lastMoveSend > 100) {
          const dx = Math.abs(player.x - lastSent.x) + Math.abs(player.y - lastSent.y);
          const dh = Math.abs(player.yaw - lastSent.h);
          if (dx > 0.01 || dh > 0.03) {
            net!.move(player.x, player.y, player.yaw);
            lastSent = { x: player.x, y: player.y, h: player.yaw };
          }
          lastMoveSend = now;
        }
      }

      // Camera from player state (+ a subtle walk bob). Each bob trough is a
      // footfall — the step sounds ride the same clock as the sway.
      const sprinting = ctl.keys.has("ShiftLeft") || ctl.keys.has("ShiftRight");
      const prevPhase = Math.floor(bobT / Math.PI);
      bobT = player.moving ? bobT + dt * (sprinting ? 12 : 9) : 0;
      if (player.moving && Math.floor(bobT / Math.PI) !== prevPhase && bobT > 0) {
        footstep(sprinting);
      }
      const bob = player.moving ? Math.sin(bobT) * 0.035 : 0;
      camera.position.set(player.x * CELL, EYE + bob, player.y * CELL);
      camera.rotation.y = player.yaw;
      camera.rotation.x = player.pitch;

      tickFlickers(world, now);

      // Peers glide toward their latest reported spot, hazmat suits swapping
      // between walk and idle by whether they're covering ground.
      const t = 1 - Math.exp(-10 * dt);
      for (const p of peers.values()) {
        p.group.position.lerp(p.target, t);
        p.group.rotation.y = p.heading;
        tickAvatar(p, dt);
      }

      // Acoustics: occlusion rays at 5Hz (cheap grid walk), positions every
      // frame so the HRTF panner tracks movement smoothly.
      if (voice) {
        if (now - lastVoiceAt > 200) {
          lastVoiceAt = now;
          wallCache.clear();
          for (const [id, p] of peers) {
            wallCache.set(id, wallsBetween(world, player.x, player.y, p.target.x / CELL, p.target.z / CELL));
          }
        }
        const sp = new Map<number, SpatialPeer>();
        for (const [id, p] of peers) {
          sp.set(id, { x: p.target.x / CELL, y: p.target.z / CELL, walls: wallCache.get(id) ?? 0 });
        }
        voice.updateSpatial({ x: player.x, y: player.y, yaw: player.yaw }, sp);
      }

      composer.render();
    };
    raf = requestAnimationFrame(frame);

    cleanupFns.push(() => {
      cancelAnimationFrame(raf);
      for (const p of peers.values()) disposeAvatar(scene, p);
      peers.clear();
      renderer?.dispose();
      renderer?.domElement.remove();
    });
  });

  onDestroy(() => {
    try {
      voice?.leave();
      net?.leave();
      net?.close();
    } catch {
      /* gone */
    }
    closeAmbience();
    for (const fn of cleanupFns) fn();
  });

  function leaveNow() {
    onExit();
  }
</script>

<div class="game" bind:this={host}>
  {#if doorName && entered}
    <div class="door-banner">{doorName}</div>
  {/if}
  {#if entered && !locked}
    <div class="hint">click to look around · WASD to walk · SHIFT to hurry · ESC frees the mouse</div>
  {/if}
  {#if !entered && !deniedMsg}
    <div class="veil"><span>opening the door…</span></div>
  {/if}
  {#if deniedMsg}
    <div class="veil">
      <span>{deniedMsg}</span>
      <button onclick={leaveNow}>back</button>
    </div>
  {/if}
  {#if lost}
    <div class="veil">
      <span>connection lost — the hum swallowed the signal.</span>
      <button onclick={leaveNow}>back to the doors</button>
    </div>
  {/if}
  <button class="leave" onclick={leaveNow}>⏏ leave</button>
  {#if entered && micState !== "off"}
    <div class="mic" class:muted={micState === "muted"}>
      {micState === "joining" ? "◌ mic…" : micState === "muted" ? "✕ MIC MUTED · M" : "● MIC LIVE · M mutes"}
    </div>
  {/if}
</div>

<style>
  .game {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #837b40;
    cursor: crosshair;
  }
  .game :global(canvas) {
    display: block;
  }
  .door-banner {
    position: absolute;
    top: 26px;
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 22px;
    background: rgba(10, 8, 4, 0.55);
    border: 1px solid rgba(201, 178, 106, 0.35);
    border-radius: 3px;
    color: #e8dcae;
    font-size: 0.85rem;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    animation: fadeaway 6s ease forwards;
    pointer-events: none;
  }
  @keyframes fadeaway {
    0%, 70% { opacity: 1; }
    100% { opacity: 0; }
  }
  .hint {
    position: absolute;
    bottom: 26px;
    left: 50%;
    transform: translateX(-50%);
    padding: 7px 16px;
    background: rgba(10, 8, 4, 0.55);
    border-radius: 3px;
    color: #cfc39a;
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    pointer-events: none;
  }
  .veil {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background: rgba(6, 5, 3, 0.82);
    color: #d8cfae;
    font-size: 0.95rem;
    letter-spacing: 0.06em;
    z-index: 5;
  }
  .veil button {
    padding: 8px 22px;
    background: #c9b26a;
    border: none;
    border-radius: 3px;
    color: #171204;
    font-weight: 700;
    cursor: pointer;
  }
  .leave {
    position: absolute;
    top: 18px;
    right: 18px;
    padding: 6px 14px;
    background: rgba(10, 8, 4, 0.5);
    border: 1px solid rgba(201, 178, 106, 0.3);
    border-radius: 3px;
    color: #cfc39a;
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    cursor: pointer;
    z-index: 4;
  }
  .leave:hover {
    color: #e8dcae;
    border-color: rgba(201, 178, 106, 0.7);
  }
  .mic {
    position: absolute;
    bottom: 22px;
    right: 18px;
    padding: 6px 12px;
    background: rgba(10, 8, 4, 0.55);
    border: 1px solid rgba(92, 220, 120, 0.35);
    border-radius: 3px;
    color: #8fdc9c;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    pointer-events: none;
    z-index: 4;
  }
  .mic.muted {
    border-color: rgba(194, 90, 58, 0.5);
    color: #c98a72;
  }
</style>
