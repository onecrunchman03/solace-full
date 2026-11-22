<script lang="ts">
  // SOLACE SURVIVORZ — the model stand (Admin Panel → Survivorz → Assets → Models): every packed body
  // with the clips baked into it, the guns and the props, streamed through the admin-only door
  // (src/routes/survivorz-assets.ts). Its renderer lives only while this tab is open, so it never
  // holds a GPU context beside the show.
  import { onDestroy, onMount } from "svelte";
  import * as THREE from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import { assetUrl, fetchIndex, loadGlb, type SurvivorzIndex } from "../assets";

  let index = $state<SurvivorzIndex | null>(null);
  let error = $state<string | null>(null);

  // ---- what is on the stand ----
  let pick = $state(""); // "body:carla.glb" | "gun:hk416.glb" | "prop:shotgun.glb"
  let loading = $state<number | null>(null);
  let loadError = $state<string | null>(null);
  let clips = $state<string[]>([]);
  let playing = $state<string | null>(null);
  let loop = $state(true);
  let speed = $state(1);
  let filter = $state("");
  let prefix = $state<string | null>(null);

  const prefixes = $derived.by(() => {
    const seen = new Map<string, number>();
    for (const c of clips) {
      const p = c.split(/[-_ ]/)[0];
      seen.set(p, (seen.get(p) ?? 0) + 1);
    }
    return [...seen.entries()];
  });
  const shown = $derived(
    clips.filter(
      (c) =>
        (!prefix || c.split(/[-_ ]/)[0] === prefix) &&
        (!filter || c.toLowerCase().includes(filter.toLowerCase())),
    ),
  );

  // ---- the stage ----
  let host: HTMLDivElement;
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let model: THREE.Object3D | null = null;
  let onStand = $state(false);
  let mixer: THREE.AnimationMixer | null = null;
  let actions = new Map<string, THREE.AnimationAction>();
  let current: THREE.AnimationAction | null = null;
  let raf = 0;
  let disposed = false;
  let loadSeq = 0;
  const clock = new THREE.Clock();
  let resize: ResizeObserver | null = null;

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x15171a);
    scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x2a2622, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2.5, 4, 3);
    scene.add(key);
    scene.add(new THREE.GridHelper(10, 20, 0x444a52, 0x2a2e33));
    camera = new THREE.PerspectiveCamera(40, 1, 0.02, 200);
    camera.position.set(0, 1.4, 3.6);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.9, 0);
    controls.enableDamping = true;
    resize = new ResizeObserver(fit);
    resize.observe(host);
    fit();
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, clock.getDelta());
      mixer?.update(dt);
      controls.update();
      renderer!.render(scene, camera);
    };
    frame();

    fetchIndex()
      .then((i) => {
        if (disposed) return;
        index = i;
        const first = i.bodies.find((b) => b.kind === "survivor") ?? i.bodies[0];
        if (first) choose(`body:${first.file}`);
      })
      .catch((e) => {
        if (!disposed) error = e?.code === "not_available" ? "not_available" : "failed";
      });
  });

  function fit(): void {
    if (!renderer || !host) return;
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function clearModel(): void {
    mixer?.stopAllAction();
    mixer = null;
    actions = new Map();
    current = null;
    playing = null;
    clips = [];
    if (!model) return;
    scene.remove(model);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
    model = null;
    onStand = false;
  }

  async function choose(value: string): Promise<void> {
    pick = value;
    const [area, file] = value.split(":") as ["body" | "gun" | "prop", string];
    const seq = ++loadSeq;
    clearModel();
    loadError = null;
    loading = 0;
    try {
      const gltf = await loadGlb(assetUrl(area, file), (f) => {
        if (seq === loadSeq) loading = f;
      });
      if (disposed || seq !== loadSeq) return;
      model = gltf.scene;
      scene.add(model);
      onStand = true;
      frameModel(model);
      if (gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
        clips = gltf.animations.map((c) => c.name).sort();
        if (prefix && !clips.some((c) => c.startsWith(prefix + "-"))) prefix = null;
      }
    } catch {
      if (seq === loadSeq) loadError = "Couldn't load that file.";
    } finally {
      if (seq === loadSeq) loading = null;
    }
  }

  function frameModel(obj: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const reach = Math.max(size.x, size.y, size.z, 0.2);
    controls.target.copy(centre);
    camera.position.set(centre.x, centre.y + reach * 0.15, centre.z + reach * 2.2);
    camera.near = reach / 100;
    camera.far = reach * 100;
    camera.updateProjectionMatrix();
  }

  function play(name: string): void {
    const a = actions.get(name);
    if (!a || !mixer) return;
    const next = a.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loop;
    next.timeScale = speed;
    if (current && current !== next) next.crossFadeFrom(current, 0.2, false);
    next.play();
    current = next;
    playing = name;
  }

  $effect(() => {
    if (current) current.timeScale = speed;
  });

  const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

  onDestroy(() => {
    disposed = true;
    cancelAnimationFrame(raf);
    resize?.disconnect();
    clearModel();
    controls?.dispose();
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      renderer = null;
    }
  });
</script>

<div class="models">
  <aside class="card">
    {#if error === "not_available"}
      <p class="note">The Survivorz assets aren't on this server. They live on the workstation for now.</p>
    {:else if error}
      <p class="note err">Couldn't read the asset list.</p>
    {/if}
    <label class="field">
      <span>Model</span>
      <select value={pick} onchange={(e) => choose((e.currentTarget as HTMLSelectElement).value)} disabled={!index}>
        {#if index}
          <optgroup label="Survivors">
            {#each index.bodies.filter((b) => b.kind === "survivor") as b (b.file)}
              <option value={`body:${b.file}`}>{b.id} · {mb(b.bytes)}</option>
            {/each}
          </optgroup>
          <optgroup label="Zombies">
            {#each index.bodies.filter((b) => b.kind === "zombie") as b (b.file)}
              <option value={`body:${b.file}`}>{b.id} · {mb(b.bytes)}</option>
            {/each}
          </optgroup>
          <optgroup label="Guns">
            {#each index.guns as g (g.file)}
              <option value={`gun:${g.file}`}>{g.file} · {mb(g.bytes)}</option>
            {/each}
          </optgroup>
          <optgroup label="Props">
            {#each index.props as p (p.file)}
              <option value={`prop:${p.file}`}>{p.file} · {mb(p.bytes)}</option>
            {/each}
          </optgroup>
        {/if}
      </select>
    </label>

    {#if loading !== null}
      <div class="bar"><div style:width={`${Math.round(loading * 100)}%`}></div></div>
    {/if}
    {#if loadError}<p class="note err">{loadError}</p>{/if}

    {#if clips.length}
      <div class="controls">
        <label class="row"><input type="checkbox" bind:checked={loop} /> Loop</label>
        <label class="row">
          Speed <input type="range" min="0.1" max="2" step="0.05" bind:value={speed} />
          <span class="num">{speed.toFixed(2)}×</span>
        </label>
      </div>
      <div class="chips">
        <button class:active={!prefix} onclick={() => (prefix = null)}>All {clips.length}</button>
        {#each prefixes as [p, n] (p)}
          <button class:active={prefix === p} onclick={() => (prefix = p)}>{p} {n}</button>
        {/each}
      </div>
      <input class="search" placeholder="Find a clip" bind:value={filter} />
      <ul class="clips">
        {#each shown as c (c)}
          <li><button class:active={playing === c} onclick={() => play(c)}>{c}</button></li>
        {/each}
      </ul>
    {:else if onStand && loading === null}
      <p class="note">No clips in this file.</p>
    {/if}
  </aside>
  <div class="stage" bind:this={host}></div>
</div>

<style>
  .models { flex: 1; min-height: 0; display: grid; grid-template-columns: 290px 1fr; gap: 12px; }
  .card { background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
  aside { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
  .field { display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.05em; }
  .row { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--ink-soft); }
  select, .search { background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; font: inherit; text-transform: none; letter-spacing: 0; }
  .controls { display: flex; flex-direction: column; gap: 4px; }
  .num { font-variant-numeric: tabular-nums; min-width: 3.5em; }
  .chips { display: flex; gap: 5px; flex-wrap: wrap; }
  button { background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 3px 9px; cursor: pointer; font: inherit; font-size: 0.8rem; }
  button.active { border-color: var(--accent); color: var(--accent); }
  .clips { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; min-height: 120px; display: flex; flex-direction: column; gap: 3px; }
  .clips button { width: 100%; text-align: left; padding: 4px 9px; }
  .stage { min-height: 0; border-radius: 10px; overflow: hidden; border: 1px solid var(--line); }
  .stage :global(canvas) { display: block; width: 100%; height: 100%; }
  .bar { height: 4px; background: var(--panel); border-radius: 2px; overflow: hidden; }
  .bar div { height: 100%; background: var(--accent); }
  .note { color: var(--ink-soft); margin: 0; font-size: 0.85rem; }
  .note.err { color: var(--danger); }
</style>
