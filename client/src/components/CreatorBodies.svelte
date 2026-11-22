<script lang="ts">
  // SOLACE SURVIVORZ — THE CREATOR'S BODIES (docs/survivorz/CREATOR.md). Drop a rigged model in;
  // the worker on Josh's PC re-poses it, puts the whole clip library on it, checks every clip and
  // sends the packed body back. This is where it's dropped and where each step is watched.
  import { onMount } from "svelte";
  import { api, ApiError, getToken, type CreatorBody, type CreatorBodiesPayload } from "../lib/api";
  import { ask } from "../lib/confirm.svelte";
  import { plain } from "../creator/errors";

  let { onready }: { onready?: () => void } = $props();

  // the bake's steps, in order (scripts/survivorz/creator/bake.mjs STEPS), in plain words
  const STEPS: [string, string][] = [
    ["intake", "Take in"],
    ["jobs", "List clips"],
    ["retarget", "Animate"],
    ["shoulders", "Shoulders"],
    ["pack", "Pack"],
    ["baseline", "Measure"],
    ["clean", "Clean"],
    ["build", "Built moves"],
    ["guns", "Guns"],
    ["posture", "Posture"],
    ["repack", "Repack"],
    ["law", "No clipping"],
    ["ground", "Feet down"],
    ["pairs", "Grabs & bites"],
    ["verify", "Final check"],
    ["speeds", "Speeds"],
    ["kit", "Pack & holsters"],
  ];

  let data = $state<CreatorBodiesPayload | null>(null);
  let err = $state("");
  let file = $state<File | null>(null);
  let id = $state("");
  let height = $state("");
  let sending = $state(false);
  let sent = $state(0);
  let dragging = $state(false);
  let open = $state<string | null>(null);
  let picker = $state<HTMLInputElement | null>(null);

  const slug = (name: string) => name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  const workerUp = $derived(!!data?.worker.seenAt && Date.now() - data.worker.seenAt < 90_000);
  const busy = $derived(!!data?.bodies.some((b) => b.status === "queued" || b.status === "baking" || b.status === "paused"));
  const mb = (n: number) => `${(n / 1e6).toFixed(n > 1e7 ? 0 : 1)} MB`;

  let readyBefore = new Set<string>();
  async function load(): Promise<void> {
    try {
      data = await api.adminCreatorBodies();
      err = "";
      const ready = new Set(data.bodies.filter((b) => b.status === "ready").map((b) => b.id));
      if ([...ready].some((x) => !readyBefore.has(x)) && readyBefore.size + ready.size > 0) onready?.();
      readyBefore = ready;
    } catch (e) {
      err = plain(e, "Couldn't load the bodies.");
    }
  }
  onMount(() => {
    void load();
    let t: ReturnType<typeof setTimeout>;
    const tick = () => { t = setTimeout(async () => { await load(); tick(); }, busy ? 4000 : 20000); };
    tick();
    return () => clearTimeout(t);
  });

  // SEVERAL AT ONCE (Josh, Nov 3 2026: twelve models in one folder): each goes up in turn under the
  // id its file name gives it; anything refused is listed, the rest bake in the order dropped.
  let batch = $state<{ total: number; done: number; sent: number; now: string; failed: string[] } | null>(null);
  function takeAll(list: FileList | null | undefined): void {
    const all = [...(list ?? [])];
    if (all.length > 1) void sendMany(all);
    else take(all[0]);
  }
  async function sendMany(all: File[]): Promise<void> {
    if (sending) return;
    const ok = all.filter((f) => /\.(fbx|glb|zip)$/i.test(f.name));
    batch = { total: ok.length, done: 0, sent: 0, now: "", failed: all.filter((f) => !ok.includes(f)).map((f) => `${f.name}: not an FBX, GLB or zip`) };
    err = "";
    for (const f of ok) {
      batch.now = f.name;
      const r = await upload(f, slug(f.name), new URLSearchParams());
      if (r.status === 200) batch.sent++;
      else batch.failed.push(`${f.name}: ${why(r.status, r.body)}`);
      batch.done++;
      void load();
    }
    batch.now = "";
    if (!batch.failed.length) batch = null;
  }

  function take(f: File | null | undefined): void {
    if (!f) return;
    if (!/\.(fbx|glb|zip)$/i.test(f.name)) {
      err = "Drop an FBX, a GLB, or a zip holding one.";
      return;
    }
    err = "";
    file = f;
    id = slug(f.name);
  }
  function onDrop(e: DragEvent): void {
    e.preventDefault();
    dragging = false;
    takeAll(e.dataTransfer?.files);
  }

  function send(): void {
    if (!file || sending) return;
    if (!/^[a-z0-9-]{2,32}$/.test(id)) {
      err = "The id is 2-32 characters: a-z, 0-9 and -.";
      return;
    }
    const q = new URLSearchParams();
    if (height.trim()) q.set("height", height.trim());
    void upload(file, id, q).then((r) => {
      if (r.status === 200) {
        file = null; id = ""; height = "";
        void load();
      } else err = why(r.status, r.body);
    });
  }

  function why(status: number, body: { error?: string; message?: string } | null): string {
    return body?.error === "id_taken" ? "That id is taken — pick another."
      : body?.error === "not_a_model" ? "That file isn't an FBX, GLB or zip."
      : body?.error === "too_large" ? "Too big (250 MB at most)."
      : status === 0 ? "Upload failed — check your connection."
      : body?.message ?? body?.error ?? `Upload failed (${status}).`;
  }
  function upload(f: File, bodyId: string, q: URLSearchParams): Promise<{ status: number; body: { error?: string; message?: string } | null }> {
    q.set("id", bodyId);
    q.set("name", f.name);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/survivorz/bodies?${q}`);
    const token = getToken();
    if (token) xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) sent = e.loaded / e.total; };
    sending = true;
    sent = 0;
    return new Promise((done) => {
      xhr.onload = () => {
        sending = false;
        let body: { error?: string; message?: string } | null = null;
        try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
        done({ status: xhr.status, body });
      };
      xhr.onerror = () => { sending = false; done({ status: 0, body: null }); };
      xhr.send(f);
    });
  }

  /** A SEALED SUIT is the body's (Nov 5 2026): whoever wears it has no backpack and a muffled voice. */
  async function toggleSuited(b: CreatorBody): Promise<void> {
    try { await api.adminCreatorBodyEdit(b.id, { suited: !b.suited }); await load(); onready?.(); }
    catch (e) { err = plain(e, "Couldn't change the suit."); await load(); }
  }
  async function pause(b: CreatorBody): Promise<void> {
    try { await api.adminCreatorBodyPause(b.id); await load(); } catch (e) { err = plain(e, "Couldn't pause it."); }
  }
  async function resume(b: CreatorBody): Promise<void> {
    try { await api.adminCreatorBodyResume(b.id); await load(); } catch (e) { err = plain(e, "Couldn't resume it."); }
  }
  async function bakePairs(b: CreatorBody): Promise<void> {
    try { await api.adminCreatorBodyPairs(b.id); await load(); } catch (e) { err = plain(e, "Couldn't queue it."); }
  }
  async function rebake(b: CreatorBody): Promise<void> {
    try { await api.adminCreatorBodyRebake(b.id); await load(); } catch (e) { err = plain(e, "Couldn't re-queue it."); }
  }
  async function remove(b: CreatorBody): Promise<void> {
    if (!(await ask({ title: `Remove ${b.id}?`, body: "The model and its baked body are deleted.", confirm: "remove it", danger: true }))) return;
    try {
      await api.adminCreatorBodyDelete(b.id);
      await load();
    } catch (e) {
      const d = e instanceof ApiError ? (e.data as { name?: string } | undefined) : undefined;
      err = e instanceof ApiError && e.code === "in_use" ? `${d?.name ?? "A character"} wears this body — change theirs first.` : "Couldn't remove it.";
    }
  }

  // TIME LEFT (Josh, Nov 3 2026: "a estimated time to completion in the bake"): each step not done
  // yet adds what it's expected to take (learned from earlier bakes); the running one is read off its
  // own progress once it reports any, else what's left of its expected time.
  let now = $state(Date.now());
  onMount(() => { const t = setInterval(() => (now = Date.now()), 5000); return () => clearInterval(t); });
  function timeLeft(b: CreatorBody): number | null {
    if (b.status !== "baking") return null;
    let left = 0, known = false;
    for (const [k] of STEPS) {
      const s = b.steps[k];
      if (!s || s.state === "done") continue;
      if (s.expectMs) known = true;
      const exp = s.expectMs ?? 0;
      if (s.state === "running" && s.startedAt) {
        const el = Math.max(0, now - s.startedAt);
        const p = s.progress ?? 0;
        left += p > 0.05 ? (el * (1 - p)) / p : Math.max(exp * 0.1, exp - el);
      } else left += exp;
    }
    return known ? left : null;
  }
  const leftLabel = (ms: number): string => {
    const m = Math.round(ms / 60000);
    const at = new Date(now + ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `${m < 1 ? "under a minute" : m === 1 ? "about 1 min" : `about ${m} min`} left · done around ${at}`;
  };
  const stepState = (b: CreatorBody, key: string) => b.steps[key]?.state ?? (b.status === "ready" && (key !== "pairs" || b.pairs) ? "done" : "");
  const dur = (s?: { startedAt?: number; endedAt?: number }) =>
    s?.startedAt && s.endedAt ? `${Math.max(1, Math.round((s.endedAt - s.startedAt) / 1000))}s` : "";
  // THE QUEUE (Josh, Nov 4 2026: "a queue so multiple bodies can be baked"). The PC bakes one at a
  // time — each bake already fills the GPU, so two side by side wouldn't finish any sooner — and takes
  // the next the moment one is done. The line is queueOrder; a paused body keeps its place but is
  // skipped until it's resumed.
  const byQueue = (a: CreatorBody, b: CreatorBody) => (a.queueOrder ?? 1e9) - (b.queueOrder ?? 1e9) || a.createdAt - b.createdAt;
  const baking = $derived((data?.bodies ?? []).filter((b) => b.status === "baking"));
  const line = $derived((data?.bodies ?? []).filter((b) => b.status === "queued" || b.status === "paused").sort(byQueue));
  const queued = $derived(line.filter((b) => b.status === "queued"));
  const others = $derived((data?.bodies ?? []).filter((b) => b.status === "ready" || b.status === "failed"));
  const cards = $derived([...baking, ...line, ...others]);
  // what a whole bake takes: the running bake's own learned step times, else the finished bakes', else 40 min
  const fullBake = $derived.by(() => {
    for (const b of baking) {
      const t = Object.values(b.steps).reduce((n, s) => n + (s.expectMs ?? 0), 0);
      if (t > 60_000) return t;
    }
    const spans = (data?.bodies ?? []).filter((b) => b.status === "ready").map((b) => {
      const st = Object.values(b.steps).filter((s) => s.startedAt && s.endedAt);
      return st.length ? Math.max(...st.map((s) => s.endedAt!)) - Math.min(...st.map((s) => s.startedAt!)) : 0;
    }).filter((t) => t > 60_000);
    return spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : 40 * 60_000;
  });
  // when each queued body should start (ms from now), in line order
  const startsIn = $derived.by(() => {
    let t = baking.reduce((n, b) => n + (timeLeft(b) ?? fullBake), 0);
    const out = new Map<string, number>();
    for (const b of queued) { out.set(b.id, t); t += fullBake; }
    out.set("", t);
    return out;
  });
  const clock = (ms: number) => new Date(now + ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const span = (ms: number) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

  async function reorder(ids: string[]): Promise<void> {
    try { await api.adminCreatorQueue(ids); await load(); } catch (e) { err = plain(e, "Couldn't move it."); }
  }
  function move(b: CreatorBody, to: number): void {
    const ids = line.map((x) => x.id).filter((x) => x !== b.id);
    ids.splice(Math.max(0, Math.min(ids.length, to)), 0, b.id);
    void reorder(ids);
  }

  // NOT BAKED YET: the bodies characters wear that aren't on a shelf. One with no model dropped yet gets
  // its own Add button, which sends the file under that body's id whatever the file is called.
  let showUnbaked = $state(false);
  let rowFor = $state<string | null>(null);
  let rowPicker = $state<HTMLInputElement | null>(null);
  let rowSending = $state<string | null>(null);
  const rowOf = (body: string) => data?.bodies.find((b) => b.id === body) ?? null;
  const missing = $derived((data?.unbaked ?? []).filter((u) => !rowOf(u.body)).length);
  function addFor(body: string): void {
    rowFor = body;
    rowPicker?.click();
  }
  async function sendFor(body: string, f: File | null | undefined): Promise<void> {
    if (!f || sending) return;
    if (!/\.(fbx|glb|zip)$/i.test(f.name)) { err = "Drop an FBX, a GLB, or a zip holding one."; return; }
    err = "";
    rowSending = body;
    const r = await upload(f, body, new URLSearchParams());
    rowSending = null;
    if (r.status !== 200) err = `${body}: ${why(r.status, r.body)}`;
    void load();
  }

  const statusLabel = (b: CreatorBody) =>
    b.status === "queued" ? (workerUp ? `In line · #${queued.findIndex((x) => x.id === b.id) + 1}` : "Waiting for your PC")
    : b.status === "baking" ? "Baking"
    : b.status === "paused" ? (b.paused === "game" ? "Paused for a game" : "Paused")
    : b.status === "ready" ? "Ready to wear"
    : "Stopped";
</script>

<section class="bodies">
  <div class="top">
    <h3>Bodies</h3>
    {#if data}
      <span class="pill" class:up={workerUp} class:off={!data.worker.configured}>
        {!data.worker.configured ? "Worker not set up on the server" : workerUp ? `Your PC is ready (${data.worker.name})` : "Your PC's worker isn't running"}
      </span>
    {/if}
  </div>

  {#if batch}
    <div class="form">
      {#if batch.now}
        <div class="file">📦 {batch.now} <span class="soft">{batch.done + 1} of {batch.total}</span></div>
        <div class="bar"><div style="width: {Math.round(((batch.done + sent) / Math.max(1, batch.total)) * 100)}%"></div></div>
        <p class="soft">Uploading {batch.total} models… {Math.round(sent * 100)}% of this one</p>
      {:else}
        <p>{batch.sent ? `${batch.sent} sent to bake.` : "Nothing went up."} These didn't:</p>
      {/if}
      {#each batch.failed as f (f)}<p class="warn">{f}</p>{/each}
      {#if !batch.now}<div class="row"><button onclick={() => (batch = null)}>OK</button></div>{/if}
    </div>
  {:else if !file}
    <button
      class="drop"
      class:over={dragging}
      ondragover={(e) => { e.preventDefault(); dragging = true; }}
      ondragleave={() => (dragging = false)}
      ondrop={onDrop}
      onclick={() => picker?.click()}
    >
      <b>Drop a rigged model here</b>
      <span>FBX, GLB, or a zip with its textures — or click to pick one. Several at once go up under their file names.</span>
      <span class="src">From Mixamo, Sketchfab or Fab (Unreal). It must have a skeleton: an unrigged model is refused — rig it free on Mixamo first, then drop it again.</span>
    </button>
    <input class="hidden" type="file" multiple accept=".fbx,.glb,.zip" bind:this={picker} onchange={(e) => takeAll((e.currentTarget as HTMLInputElement).files)} />
  {:else}
    <div class="form">
      <div class="file">📦 {file.name} <span class="soft">{mb(file.size)}</span></div>
      <div class="grid">
        <label>Body id<input bind:value={id} placeholder="e.g. dmitri" disabled={sending} /></label>
        <label>Height in metres (optional)<input bind:value={height} placeholder="from the model" inputmode="decimal" disabled={sending} /></label>
      </div>
      {#if sending}
        <div class="bar"><div style="width: {Math.round(sent * 100)}%"></div></div>
        <p class="soft">Uploading… {Math.round(sent * 100)}%</p>
      {:else}
        <div class="row">
          <button class="primary" onclick={send}>Bake it</button>
          <button onclick={() => (file = null)}>Cancel</button>
        </div>
      {/if}
    </div>
  {/if}
  {#if err}<p class="err">{err}</p>{/if}

  {#if data && (data.unbaked?.length ?? 0) > 0}
    <button class="link" onclick={() => (showUnbaked = !showUnbaked)}>
      {showUnbaked ? "▾" : "▸"} Not baked yet ({data.unbaked.length}){missing ? ` · ${missing} still need a model` : ""}
    </button>
    {#if showUnbaked}
      <div class="form unbaked">
        <p class="soft">Characters whose body isn't baked. Add a model to any that has none — it goes up under that body's id, whatever the file is called.</p>
        {#each data.unbaked as u (u.body)}
          {@const row = rowOf(u.body)}
          <div
            class="urow"
            role="group"
            ondragover={(e) => { if (!row) e.preventDefault(); }}
            ondrop={(e) => { if (row) return; e.preventDefault(); e.stopPropagation(); void sendFor(u.body, e.dataTransfer?.files?.[0]); }}
          >
            <b>{u.body}</b>
            <span class="soft">{u.characters.map((c) => `${c.name}${c.status === "cast" ? "" : ` (${c.status})`}`).join(", ")}</span>
            <span class="grow"></span>
            {#if row}
              <span class="status {row.status}">{statusLabel(row)}</span>
            {:else if rowSending === u.body}
              <span class="soft">Uploading… {Math.round(sent * 100)}%</span>
            {:else}
              <span class="warn small">No model yet</span>
              <button onclick={() => addFor(u.body)} disabled={sending}>Add model</button>
            {/if}
          </div>
        {/each}
        <input class="hidden" type="file" accept=".fbx,.glb,.zip" bind:this={rowPicker}
          onchange={(e) => { const el = e.currentTarget as HTMLInputElement; if (rowFor) void sendFor(rowFor, el.files?.[0]); el.value = ""; }} />
      </div>
    {/if}
  {/if}

  {#if baking.length || line.length}
    <div class="form queue">
      <div class="row">
        <b>Bake queue</b>
        <span class="soft">One at a time on your PC; the next starts the moment one finishes.</span>
        <span class="grow"></span>
        {#if queued.length}<span class="soft">All done around {clock(startsIn.get("") ?? 0)} ({span(startsIn.get("") ?? 0)})</span>{/if}
      </div>
      {#each baking as b (b.id)}
        <div class="qrow now"><i>●</i><b>{b.id}</b><span class="soft">baking{timeLeft(b) != null ? ` · ${leftLabel(timeLeft(b)!)}` : ""}</span></div>
      {/each}
      {#each line as b, i (b.id)}
        <div class="qrow" class:held={b.status === "paused"}>
          <i>{b.status === "paused" ? "⏸" : queued.findIndex((x) => x.id === b.id) + 1}</i>
          <b>{b.id}</b>
          <span class="soft">
            {b.status === "paused" ? (b.paused === "game" ? "paused for a game" : "paused — skipped until you resume it")
              : workerUp ? `starts around ${clock(startsIn.get(b.id) ?? 0)}` : "waits for your PC"}
          </span>
          <span class="grow"></span>
          {#if i > 0}<button class="mini" title="Bake this next" onclick={() => move(b, 0)}>⤒ Next</button>{/if}
          <button class="mini" title="Move up" disabled={i === 0} onclick={() => move(b, i - 1)}>↑</button>
          <button class="mini" title="Move down" disabled={i === line.length - 1} onclick={() => move(b, i + 1)}>↓</button>
        </div>
      {/each}
    </div>
  {/if}

  {#each cards as b (b.id)}
    <div class="card {b.status}">
      <div class="head">
        <b>{b.id}</b>
        <span class="soft">{b.sourceName} · {mb(b.sourceBytes)}{b.report?.height ? ` · ${b.report.height} m` : ""}</span>
        <span class="status {b.status}">{statusLabel(b)}</span>
      </div>
      {#if timeLeft(b) != null}<div class="eta">⏱ {leftLabel(timeLeft(b)!)}</div>{/if}
      <div class="steps">
        {#each STEPS as [key, label] (key)}
          {@const s = stepState(b, key)}
          <span class="step {s}" title={b.steps[key]?.error ?? dur(b.steps[key])}>
            <i>{s === "done" ? "✓" : s === "failed" ? "✗" : s === "running" ? "●" : "○"}</i>{label}{#if s === "running" && b.steps[key]?.progress}&nbsp;{Math.round((b.steps[key].progress ?? 0) * 100)}%{/if}
          </span>
        {/each}
        <span class="step {b.status === 'ready' ? 'done' : ''}"><i>{b.status === "ready" ? "✓" : "○"}</i>Sent</span>
      </div>
      {#if b.status === "paused"}
        <p class="soft small">
          {b.paused === "game" ? "A game is running, so the GPU is yours. It carries on by itself when the game closes." : "The GPU is free."}
          {b.resumeFrom ? `It picks up at "${STEPS.find(([k]) => k === b.resumeFrom)?.[1] ?? b.resumeFrom}".` : ""}
        </p>
      {/if}
      {#if b.error}<p class="err small">{b.error}</p>{/if}
      {#if b.report && (b.report.fixed?.length || b.report.warnings?.length)}
        <button class="link" onclick={() => (open = open === b.id ? null : b.id)}>
          {open === b.id ? "Hide" : "What the intake found"} ({(b.report.fixed?.length ?? 0) + (b.report.warnings?.length ?? 0)})
        </button>
        {#if open === b.id}
          <ul class="found">
            {#each b.report.fixed ?? [] as f}<li class="fixed">Fixed: {f}</li>{/each}
            {#each b.report.warnings ?? [] as w}<li class="warned">Warning: {w}</li>{/each}
          </ul>
        {/if}
      {/if}
      <div class="row">
        <label class="suit" title="No backpack over the air pack, and a muffled voice"><input type="checkbox" checked={!!b.suited} onchange={() => toggleSuited(b)} /> Sealed suit</label>
        <span class="grow"></span>
        {#if b.status === "baking" || b.status === "queued" || (b.status === "paused" && b.paused === "game")}<button onclick={() => pause(b)}>⏸ Pause</button>{/if}
        {#if b.status === "paused" && b.paused === "me"}<button class="primary" onclick={() => resume(b)}>▶ Resume</button>{/if}
        {#if b.status === "ready" && !b.pairs}<button class="primary" onclick={() => bakePairs(b)} title="About 25 minutes on your PC">Bake grabs &amp; bites</button>{/if}
        {#if b.status === "failed" || b.status === "ready"}<button onclick={() => rebake(b)}>Bake again</button>{/if}
        {#if b.status !== "baking" && !(b.status === "paused" && b.paused === "game")}<button class="danger" onclick={() => remove(b)}>Remove</button>{/if}
      </div>
    </div>
  {/each}
</section>

<style>
  .bodies { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
  .top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  h3 { margin: 0; font-size: 0.95rem; color: var(--ink); }
  .pill { font-size: 0.72rem; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--line); color: var(--ink-dim); }
  .pill.up { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, var(--line)); }
  .pill.off { color: var(--danger); }
  .drop {
    display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 22px;
    border: 2px dashed var(--line); border-radius: 12px; background: var(--panel); color: var(--ink-soft);
    font: inherit; cursor: pointer;
  }
  .drop b { color: var(--ink); font-size: 0.95rem; }
  .drop span { font-size: 0.78rem; }
  .drop:hover, .drop.over { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--panel)); }
  .hidden { display: none; }
  .drop .src { font-size: 0.72rem; color: var(--ink-dim); max-width: 520px; text-align: center; }
  .suit { flex-direction: row; align-items: center; gap: 5px; font-size: 0.74rem; color: var(--ink-soft); cursor: pointer; }
  .suit input { padding: 0; accent-color: var(--accent); }
  .form, .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 9px; }
  .file { font-weight: 700; color: var(--ink); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
  label { display: flex; flex-direction: column; gap: 3px; font-size: 0.72rem; color: var(--ink-dim); }
  input { padding: 7px 9px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel-2); color: var(--ink); font: inherit; font-size: 0.85rem; }
  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .grow { flex: 1; }
  button { padding: 6px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel-2); color: var(--ink); font: inherit; font-size: 0.82rem; font-weight: 600; cursor: pointer; }
  button:hover { border-color: var(--accent); }
  button.primary { background: color-mix(in srgb, var(--accent) 22%, var(--panel-2)); border-color: var(--accent); }
  button.danger:hover { border-color: var(--danger); color: var(--danger); }
  button.link { align-self: flex-start; padding: 0; border: none; background: none; color: var(--accent); font-weight: 600; font-size: 0.76rem; }
  .bar { height: 6px; border-radius: 3px; background: var(--panel-2); overflow: hidden; }
  .bar div { height: 100%; background: var(--accent); transition: width 0.2s; }
  .head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .head b { color: var(--ink); }
  .status { margin-left: auto; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 1px 9px; border-radius: 999px; border: 1px solid var(--line); color: var(--ink-dim); }
  .status.baking { color: var(--accent); border-color: var(--accent); }
  .status.paused { color: #d9a441; border-color: color-mix(in srgb, #d9a441 55%, var(--line)); }
  .status.ready { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 55%, var(--line)); }
  .status.failed { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 55%, var(--line)); }
  .eta { font-size: 0.78rem; color: var(--ink-soft); }
  .steps { display: flex; flex-wrap: wrap; gap: 4px; }
  .step { display: inline-flex; align-items: center; gap: 4px; font-size: 0.72rem; padding: 2px 8px; border-radius: 999px; background: var(--panel-2); color: var(--ink-dim); }
  .step i { font-style: normal; font-size: 0.7rem; }
  .step.done { color: var(--ok); }
  .step.running { color: var(--accent); }
  .step.running i { animation: pulse 1s ease-in-out infinite; }
  .step.failed { color: var(--danger); }
  @keyframes pulse { 50% { opacity: 0.3; } }
  .found { margin: 0; padding-left: 18px; font-size: 0.76rem; color: var(--ink-soft); }
  .found .warned { color: #d9a441; }
  .soft { color: var(--ink-dim); font-size: 0.78rem; }
  .small { font-size: 0.74rem; }
  .warn { margin: 0; color: #d9a441; font-size: 0.76rem; }
  .err { margin: 0; color: var(--danger); font-size: 0.8rem; }
  .urow, .qrow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 6px 8px; border-radius: 8px; background: var(--panel-2); }
  .urow b, .qrow b { color: var(--ink); min-width: 8ch; }
  .urow .status { margin-left: 0; }
  .qrow i { font-style: normal; width: 1.6em; text-align: center; font-weight: 800; color: var(--ink-dim); font-size: 0.8rem; }
  .qrow.now i { color: var(--accent); animation: pulse 1s ease-in-out infinite; }
  .qrow.held { opacity: 0.7; }
  button.mini { padding: 3px 9px; font-size: 0.76rem; }
  button:disabled { opacity: 0.4; cursor: default; }
  button:disabled:hover { border-color: var(--line); }
</style>
