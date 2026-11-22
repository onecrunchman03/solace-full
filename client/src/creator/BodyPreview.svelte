<script lang="ts">
  // THE CREATOR'S LIVE PREVIEW (docs/survivorz/CREATOR.md: "a turntable under three bunker
  // lighting presets"). The packed body the show itself loads (assets.ts loadGlb), standing in an
  // idle, slowly turning; drag to turn it by hand. Its own small renderer, torn down with the panel.
  import { onDestroy, onMount } from "svelte";
  import * as THREE from "three";
  import { assetUrl, loadGlb } from "../survivorz/assets";
  import { tameBody } from "../survivorz/show/bodymat";

  let { body }: { body: string } = $props();

  const LIGHTS = {
    mains: { label: "Mains", key: 0xfff1dc, keyI: 2.6, fill: 0x9fb4c8, fillI: 0.9, amb: 0.35 },
    emergency: { label: "Emergency", key: 0xff3b2a, keyI: 1.6, fill: 0x401010, fillI: 0.4, amb: 0.12 },
    torch: { label: "Torch", key: 0xfff6e0, keyI: 3.4, fill: 0x101418, fillI: 0.15, amb: 0.04 },
  } as const;
  let light = $state<keyof typeof LIGHTS>("mains");
  let status = $state("");
  let host = $state<HTMLDivElement | null>(null);

  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene, camera: THREE.PerspectiveCamera;
  let key: THREE.DirectionalLight, fill: THREE.DirectionalLight, amb: THREE.AmbientLight;
  let root: THREE.Object3D | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let raf = 0, yaw = 0, dragging = false, lastX = 0;
  let spinning = $state(true);
  const clock = new THREE.Clock();
  let loadSeq = 0;
  let ro: ResizeObserver | null = null;

  onMount(() => {
    if (!host) return;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      status = "No 3D on this machine.";
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(1.6, 2.6, 2.2);
    fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-2, 1.4, -1.5);
    amb = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(key, fill, amb);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    applyLight();
    ro = new ResizeObserver(size);
    ro.observe(host);
    size();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, clock.getDelta());
      mixer?.update(dt);
      if (spinning && !dragging) yaw += dt * 0.35;
      if (root) root.rotation.y = yaw;
      renderer!.render(scene, camera);
    };
    tick();
  });

  function size(): void {
    if (!renderer || !host) return;
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function applyLight(): void {
    if (!key) return;
    const L = LIGHTS[light];
    key.color.setHex(L.key); key.intensity = L.keyI;
    fill.color.setHex(L.fill); fill.intensity = L.fillI;
    amb.intensity = L.amb;
  }
  $effect(() => { void light; applyLight(); });

  function dispose(o: THREE.Object3D): void {
    o.traverse((x) => {
      const m = x as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry?.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        if (!mat) continue;
        for (const v of Object.values(mat)) if (v && typeof v === "object" && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
        mat.dispose();
      }
    });
  }
  async function show(id: string): Promise<void> {
    const seq = ++loadSeq;
    // (the last body's meshes and textures given back to the GPU: each character looked at used to stay there)
    if (root) { scene.remove(root); dispose(root); root = null; mixer = null; }
    if (!id) { status = "Pick a body to see it here."; return; }
    status = "Loading the body…";
    try {
      const g = await loadGlb(assetUrl("body", `${id}.glb`), (f) => { if (seq === loadSeq) status = `Loading the body… ${Math.round(f * 100)}%`; });
      if (seq !== loadSeq || !renderer) return;
      const r = g.scene;
      // (drawn exactly as the show draws it: matte cloth and skin, the hidden person hidden)
      tameBody(r);
      // stand it in an idle (the show's own calm clip if it has one)
      const clip = g.animations.find((a) => a.name === "ual1-idle-loop") ?? g.animations.find((a) => /idle/i.test(a.name)) ?? null;
      if (clip) { mixer = new THREE.AnimationMixer(r); mixer.clipAction(clip).play(); mixer.update(0.01); }
      const box = new THREE.Box3().setFromObject(r);
      const h = Math.max(1, box.max.y - box.min.y);
      camera.position.set(0, h * 0.58, h * 2.25);
      camera.lookAt(0, h * 0.5, 0);
      root = r;
      scene.add(r);
      status = "";
    } catch (e) {
      // (only a missing file means "not baked": a dropped connection said so too)
      if (seq === loadSeq) status = /404|not.?found/i.test(String((e as Error)?.message ?? e)) ? "This body isn't baked yet." : "Couldn't load the body. Pick it again to retry.";
    }
  }
  $effect(() => { void show(body); });

  function down(e: PointerEvent): void { dragging = true; lastX = e.clientX; spinning = false; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
  function move(e: PointerEvent): void { if (!dragging) return; yaw += (e.clientX - lastX) * 0.012; lastX = e.clientX; }
  function up(): void { dragging = false; }

  onDestroy(() => {
    cancelAnimationFrame(raf);
    ro?.disconnect();
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
    renderer = null;
  });
</script>

<div class="preview">
  <div class="stage" bind:this={host} onpointerdown={down} onpointermove={move} onpointerup={up} role="img" aria-label="The body, turning">
    {#if status}<p class="status">{status}</p>{/if}
  </div>
  <div class="bar">
    {#each Object.entries(LIGHTS) as [k, l] (k)}
      <button class:on={light === k} onclick={() => (light = k as keyof typeof LIGHTS)}>{l.label}</button>
    {/each}
    <span class="grow"></span>
    <button onclick={() => (spinning = !spinning)} title="Turn it, or drag to turn it yourself">{spinning ? "⏸ Turn" : "▶ Turn"}</button>
  </div>
</div>

<style>
  .preview { display: flex; flex-direction: column; gap: 6px; }
  .stage { position: relative; height: 330px; border-radius: 10px; overflow: hidden; background: radial-gradient(ellipse at 50% 35%, #2a2f36, #111316 75%); cursor: grab; touch-action: none; }
  .stage :global(canvas) { width: 100%; height: 100%; display: block; }
  .status { position: absolute; inset: 0; margin: 0; display: grid; place-items: center; color: #9aa4ad; font-size: 0.8rem; pointer-events: none; }
  .bar { display: flex; gap: 4px; align-items: center; }
  .grow { flex: 1; }
  button { padding: 3px 9px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel-2); color: var(--ink-soft); font: inherit; font-size: 0.72rem; cursor: pointer; }
  button.on { color: var(--ink); border-color: var(--accent); }
</style>
