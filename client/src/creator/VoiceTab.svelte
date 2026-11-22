<script lang="ts">
  // THE VOICE TAB (Josh, Nov 3 2026): hear voices before picking one. The library holds every voice
  // made so far (the cast's, the casino's, every take ever designed); design a new one from a
  // description (ElevenLabs makes three takes, keep one), or upload a clip. A sample is a line in
  // character, spoken by slopbot's clone exactly as the show would. One voice each: a voice somebody
  // already speaks with can't be picked (src/survivorz/cast/rules.ts).
  import { onMount } from "svelte";
  import { ApiError, getToken, type CastCharacter, type CastPayload } from "../lib/api";
  import { ask } from "../lib/confirm.svelte";
  import { plain } from "./errors";

  let { cur = $bindable(), data, takenVoices, everyone = [] }: { cur: CastCharacter; data: CastPayload; takenVoices: Record<string, string>; everyone?: CastCharacter[] } = $props();

  interface Voice { name: string; label: string; source: "designed" | "uploaded" | "workstation"; description?: string; addedAt: number; usedBy: string | null }
  let lib = $state<Voice[]>([]);
  let loaded = $state(false);
  let canDesign = $state(false);
  let slopbot = $state(false);
  let err = $state("");
  let q = $state("");
  let src = $state<"" | Voice["source"]>("");
  let free = $state(true);
  let playing = $state<string | null>(null);
  let audio: HTMLAudioElement | null = null;

  const auth = (): Record<string, string> => { const t = getToken(); return t ? { authorization: `Bearer ${t}` } : {}; };
  async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
    const r = await fetch(url, { method, headers: { ...auth(), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new ApiError(r.status, j?.error ?? "error", j?.message, j);
    return j as T;
  }
  async function load(): Promise<void> {
    try {
      const j = await call<{ voices: Voice[]; canDesign: boolean; slopbot: boolean }>("GET", "/api/admin/survivorz/voices");
      lib = j.voices; canDesign = j.canDesign; slopbot = j.slopbot; loaded = true;
    } catch (e) { err = plain(e, "Couldn't load the voices."); }
  }
  onMount(() => { void load(); return () => stop(); });

  /** play an audio route (it needs the session, so it's fetched, not linked) */
  // (one clip at a time: a second press while the first was still downloading used to start both, the first
  // with no way to stop it; the clip's memory is given back when it stops, not only when it ends)
  let playSeq = 0, playUrl = "";
  function stop(): void {
    audio?.pause(); audio = null;
    if (playUrl) { URL.revokeObjectURL(playUrl); playUrl = ""; }
  }
  async function play(key: string, url: string): Promise<void> {
    const seq = ++playSeq;
    stop();
    if (playing === key) { playing = null; return; }
    playing = key;
    try {
      const r = await fetch(url, { headers: auth() });
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      if (seq !== playSeq) return;
      playUrl = URL.createObjectURL(blob);
      audio = new Audio(playUrl);
      audio.onended = () => { if (seq === playSeq) { playing = null; stop(); } };
      await audio.play();
    } catch { if (seq === playSeq) { playing = null; err = "Couldn't play that."; } }
  }

  const shown = $derived(lib.filter((v) => {
    const s = q.trim().toLowerCase();
    // (what the list shows is what the search finds: "rollo", "take b")
    if (s && !(v.name.includes(s) || v.label.toLowerCase().includes(s) || (v.description ?? "").toLowerCase().includes(s) || `${famTitle(family(v.name))} ${takeOf(v)}`.toLowerCase().includes(s))) return false;
    if (src && v.source !== src) return false;
    if (free && whoHas(v.name)) return false;
    return true;
  }));
  /** somebody other than this character speaks with it */
  const whoHas = (name: string): string | null => takenVoices[name] ?? null;

  // ---- THE LIBRARY, ORGANIZED (Josh, Nov 11 2026: "organize all of the voices in the character creator menu").
  // Every voice belongs to a FAMILY — the character it was made for (a survivor's takes A/B/C, a regular's
  // designed takes) or the callers — and reads as a take of that family instead of a file name. ----
  const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
  const REGULARS = new Set(["duke", "tasha", "chase", "host", "claudia"]);
  function family(n: string): { key: string; title: string } {
    // (a take designed here is survivor-<id>-<4 letters and digits>: the same family as the lettered takes)
    let m = /^survivor-([a-z]+)(?:-[a-z0-9]+)?$/.exec(n);
    if (m) return { key: m[1], title: cap(m[1]) };
    if (/^(queens|brooklyn)-\d+$/.test(n)) return { key: "rollo", title: "Rollo" };
    m = /^([a-z]+)(?:-|$)/.exec(n);
    if (m && REGULARS.has(m[1])) return { key: m[1], title: m[1] === "claudia" ? "Claudia" : `${m[1] === "host" ? "The host" : cap(m[1])} · casino` };
    if (/^(classic|hype)-\d+$|^announcer$|^derby-call/.test(n)) return { key: "~callers", title: "Announcers & callers" };
    return { key: "~other", title: "Other voices" };
  }
  /** a family reads as the character who speaks with it ("Cole Renner", not the file's "Renner") */
  const famTitle = (f: { key: string; title: string }): string =>
    f.key.startsWith("~") ? f.title : [...everyone, cur].find((c) => c.voice?.clone && family(c.voice.clone).key === f.key)?.name || f.title;
  /** what a voice reads as inside its family: "Take B", "Salty 2", "Queens 1" (a label someone typed wins) */
  function takeOf(v: Voice): string {
    if (v.label && v.label !== v.name) return v.label;
    const n = v.name;
    let m = /^survivor-[a-z]+(?:-([a-z0-9]+))?$/.exec(n);
    if (m) return `Take ${(m[1] ?? "a").toUpperCase()}`;
    if (n === "announcer") return "Derby announcer";
    if (n === "derby-call-reel") return "Derby call reel";
    if (REGULARS.has(n)) return "Original";
    m = /^[a-z]+-([a-z]+)(?:-(\d+))?$/.exec(n);
    if (m && REGULARS.has(n.split("-")[0])) return `${cap(m[1])}${m[2] ? ` ${m[2]}` : ""}`;
    m = /^([a-z]+)-(\d+)$/.exec(n);
    if (m) return `${cap(m[1])} ${m[2]}`;
    return n;
  }
  /** families in a useful order: this character's own first, then the cast's, then the rest, callers last */
  const groups = $derived.by(() => {
    const by = new Map<string, { key: string; title: string; voices: Voice[] }>();
    for (const v of shown) {
      const f = family(v.name);
      let g = by.get(f.key);
      if (!g) by.set(f.key, (g = { key: f.key, title: famTitle(f), voices: [] }));
      g.voices.push(v);
    }
    // (a new character with no id yet has no family of their own: nothing is put first)
    const own = cur.voice.clone ? family(cur.voice.clone).key : cur.id ? family(`survivor-${cur.id.replace(/[^a-z]/g, "")}`).key : "";
    const rank = (k: string): number => (k === own ? 0 : k.startsWith("~") ? 3 : everyone.some((c) => family(c.voice?.clone ?? "").key === k) ? 1 : 2);
    for (const g of by.values()) g.voices.sort((a, b) => takeOf(a).localeCompare(takeOf(b), undefined, { numeric: true }));
    return [...by.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.title.localeCompare(b.title));
  });
  /** a voice's name as the rest of the tab shows it: "Chad — Take B" */
  const titleOf = (name: string): string => { const v = lib.find((x) => x.name === name); return v ? `${famTitle(family(name))} — ${takeOf(v)}` : name; };

  // ---- EVERYONE'S VOICE: one line per character, the ones without a voice the library holds marked ----
  const roll = $derived(
    [...everyone.filter((c) => c.id !== cur.id), cur].filter((c) => c.id || c.name)
      .map((c) => ({ c, clone: c.voice?.clone ?? "", ok: !loaded || (!!c.voice?.clone && lib.some((v) => v.name === c.voice.clone)) }))
      .sort((a, b) => Number(a.ok) - Number(b.ok) || a.c.name.localeCompare(b.c.name)),
  );
  const missing = $derived(roll.filter((r) => !r.ok).length);
  function use(name: string): void { cur.voice = { ...cur.voice, clone: name }; }
  const mine = $derived(lib.find((v) => v.name === cur.voice.clone) ?? null);

  // ---- a sample: a line in character, in this voice ----
  let situation = $state("Somebody asks who wants to take first watch.");
  let line = $state("");
  let sampling = $state(false);
  let sampleNote = $state("");
  async function hearInCharacter(voiceName?: string): Promise<void> {
    if (sampling) return;
    sampling = true; sampleNote = "";
    try {
      // a fresh line from the real model when there's a sheet to write it from, else the last one
      if (!line || !voiceName) {
        const h = await call<{ line: string | null; note?: string }>("POST", "/api/admin/survivorz/cast/hear", { char: $state.snapshot(cur), situation });
        if (h.line) line = h.line;
        else if (!line) { sampleNote = h.note ?? "The model wrote nothing."; line = "Keep your voice down. We're not alone in here."; }
      }
      const r = await call<{ clip: string }>("POST", "/api/admin/survivorz/voices/sample", { text: line, clone: voiceName ?? cur.voice.clone, kokoro: cur.voice.kokoro });
      await play(`sample:${r.clip}`, `/api/admin/survivorz/voices/clip/${r.clip}`);
    } catch (e) {
      sampleNote = plain(e, "Couldn't voice that.");
    } finally { sampling = false; }
  }
  async function hearStock(): Promise<void> {
    if (sampling) return;
    sampling = true; sampleNote = "";
    try {
      // (a voice name nobody has: the agent falls back to the stock voice)
      const r = await call<{ clip: string }>("POST", "/api/admin/survivorz/voices/sample", { text: line || "Keep your voice down. We're not alone in here.", clone: "stock-only", kokoro: cur.voice.kokoro });
      await play(`stock:${r.clip}`, `/api/admin/survivorz/voices/clip/${r.clip}`);
    } catch (e) { sampleNote = plain(e, "Couldn't voice that."); }
    finally { sampling = false; }
  }

  // ---- design ----
  let description = $state("");
  let takes = $state<{ id: string; name: string }[]>([]);
  let designing = $state(false);
  async function design(): Promise<void> {
    if (designing || description.trim().length < 20) return;
    if (!(await ask({ title: "Make three takes?", body: "ElevenLabs designs three voices from your description. It uses a few hundred of your monthly credits.", confirm: "make them" }))) return;
    designing = true; err = "";
    try {
      const r = await call<{ takes: { id: string }[] }>("POST", "/api/admin/survivorz/voices/design", { description, text: line });
      const base = (cur.id || cur.short || "voice").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      takes = r.takes.map((t, i) => ({ id: t.id, name: `survivor-${base}-${Date.now().toString(36).slice(-4)}${i + 1}` }));
    } catch (e) { err = plain(e, "Couldn't make the takes."); }
    finally { designing = false; }
  }
  let keeping = false;
  async function keep(t: { id: string; name: string }, andUse: boolean): Promise<void> {
    // (a double press kept it, then read "expired" for the second)
    if (keeping) return;
    keeping = true;
    try {
      await call("POST", "/api/admin/survivorz/voices/keep", { take: t.id, name: t.name, label: `${cur.name || "New"} — ${description.slice(0, 40)}` });
      takes = takes.filter((x) => x !== t);
      await load();
      if (andUse) use(t.name);
    } catch (e) { err = plain(e, "Couldn't keep that take."); }
    finally { keeping = false; }
  }

  // ---- upload ----
  let upName = $state("");
  let upFile = $state<File | null>(null);
  async function upload(): Promise<void> {
    if (!upFile || !/^[a-z0-9-]{2,40}$/.test(upName)) { err = "Name it 2-40 characters: a-z, 0-9 and -."; return; }
    try {
      // (no label: the file's name used to become it, and the list read "Marcus — ref_final2.mp3")
      const r = await fetch(`/api/admin/survivorz/voices?name=${encodeURIComponent(upName)}`, { method: "POST", headers: { ...auth(), "content-type": "application/octet-stream" }, body: upFile });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new ApiError(r.status, j?.error ?? "error", j?.message, j);
      upFile = null; await load(); use(upName); upName = "";
    } catch (e) { err = `Not uploaded. ${plain(e, "")}`.trim(); }
  }
  async function removeVoice(v: Voice): Promise<void> {
    if (!(await ask({ title: `Delete the voice ${titleOf(v.name)}?`, body: "Its clip leaves the library for good.", danger: true }))) return;
    try { await call("DELETE", `/api/admin/survivorz/voices/${v.name}`); await load(); } catch (e) { err = plain(e, "Couldn't delete it."); }
  }
  const SRC = { designed: "designed", uploaded: "your clip", workstation: "from the PC" } as const;
</script>

<div class="voice">
  <section class="now">
    <div class="cur">
      <span class="lbl">Their voice</span>
      {#if cur.voice.clone}
        <b>{mine ? titleOf(cur.voice.clone) : cur.voice.clone}</b>
        <span class="soft">{cur.voice.clone}{mine ? "" : " — not in the library"}</span>
        <button onclick={() => play(`ref:${cur.voice.clone}`, `/api/admin/survivorz/voices/file/${cur.voice.clone}`)} disabled={!mine}>{playing === `ref:${cur.voice.clone}` ? "■" : "▶"} The clip</button>
        <button class="link" onclick={() => use("")}>clear</button>
      {:else}
        <b>None yet</b><span class="soft">pick one below, design one, or upload a clip</span>
      {/if}
    </div>
    <div class="sample">
      <label>What just happened <input bind:value={situation} /></label>
      <button class="primary" onclick={() => hearInCharacter()} disabled={sampling || !slopbot}>{sampling ? "Voicing…" : "▶ Hear them in character"}</button>
    </div>
    {#if line}<p class="line">“{line}”</p>{/if}
    {#if !slopbot}<p class="warn">Slopbot's voices aren't answering, so samples can't be voiced right now (the clips still play).</p>{/if}
    {#if sampleNote}<p class="warn">{sampleNote}</p>{/if}
    <div class="stock">
      <label>Stock voice <span class="soft">(used if the clone is down)</span>
        <select bind:value={cur.voice.kokoro}>{#each data.vocab.kokoro as v (v)}<option value={v}>{v}</option>{/each}</select>
      </label>
      <button onclick={hearStock} disabled={sampling || !slopbot}>▶ Hear it</button>
    </div>
  </section>

  {#if err}<p class="err">{err} <button class="link" onclick={() => (err = "")}>ok</button></p>{/if}

  <section>
    <h4>The library <span class="soft">{lib.length} voices</span></h4>
    <div class="filters">
      <input type="search" placeholder="Search voices…" bind:value={q} />
      <select bind:value={src}><option value="">Every source</option><option value="designed">Designed</option><option value="uploaded">Your clips</option><option value="workstation">From the PC</option></select>
      <label class="row"><input type="checkbox" bind:checked={free} /> only free ones</label>
    </div>
    <div class="lib">
      {#each groups as g (g.key)}
        <div class="fam">{g.title} <span class="soft">{g.voices.length}</span></div>
      {#each g.voices as v (v.name)}
        {@const taken = whoHas(v.name)}
        <div class="v" class:on={cur.voice.clone === v.name}>
          <button class="play" onclick={() => play(`ref:${v.name}`, `/api/admin/survivorz/voices/file/${v.name}`)} title="Play the clip">{playing === `ref:${v.name}` ? "■" : "▶"}</button>
          <div class="vt"><b>{takeOf(v)}</b><span>{v.name} · {SRC[v.source]}{v.description ? ` · ${v.description}` : ""}</span></div>
          {#if taken}<span class="taken">{taken}'s</span>
          {:else if cur.voice.clone === v.name}<span class="ok">✓ theirs</span>
          {:else}
            <button class="sm" onclick={() => hearInCharacter(v.name)} disabled={sampling || !slopbot} title="A line in character, in this voice">In character</button>
            <button class="sm primary" onclick={() => use(v.name)}>Use</button>
          {/if}
          {#if !v.usedBy && cur.voice.clone !== v.name}<button class="x" title="Delete" onclick={() => removeVoice(v)}>✕</button>{/if}
        </div>
      {/each}
      {:else}
        <p class="soft">No voices match.</p>
      {/each}
    </div>
  </section>

  <section>
    <h4>Everyone's voice <span class="soft">{!loaded ? "" : missing ? `${missing} without a voice the library holds` : `all ${roll.length} have one`}</span></h4>
    <div class="roll">
      {#each roll as r, i (i)}
        <div class="who" class:bad={!r.ok} class:me={r.c === cur}>
          <span class="nm">{r.c.name || r.c.id}</span>
          {#if r.ok}
            <button class="play" onclick={() => play(`ref:${r.clone}`, `/api/admin/survivorz/voices/file/${r.clone}`)} title="Play the clip">{playing === `ref:${r.clone}` ? "■" : "▶"}</button>
            <span class="vn">{titleOf(r.clone)}</span>
          {:else}
            <span class="vn">{r.clone ? `"${r.clone}" isn't in the library` : "no voice picked"}</span>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <div class="make">
    <section>
      <h4>Design a voice <span class="soft">ElevenLabs makes three takes</span></h4>
      {#if canDesign}
        <textarea rows="3" bind:value={description} placeholder="e.g. A gravelly Texan man in his sixties, slow and dry, a smoker's rasp, warm underneath"></textarea>
        <button class="primary" onclick={design} disabled={designing || description.trim().length < 20}>{designing ? "Making takes…" : "Make 3 takes"}</button>
        {#each takes as t (t.id)}
          <div class="take">
            <button class="play" onclick={() => play(`take:${t.id}`, `/api/admin/survivorz/voices/take/${t.id}`)}>{playing === `take:${t.id}` ? "■" : "▶"}</button>
            <input bind:value={t.name} aria-label="Name" />
            <button class="sm" onclick={() => keep(t, false)}>Keep</button>
            <button class="sm primary" onclick={() => keep(t, true)}>Keep & use</button>
          </div>
        {/each}
      {:else}
        <p class="soft">Not set up on this server yet (it needs the ElevenLabs key).</p>
      {/if}
    </section>
    <section>
      <h4>Upload a clip <span class="soft">10–30 s of one person talking, MP3 or WAV</span></h4>
      <input type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" onchange={(e) => (upFile = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)} />
      <div class="row2">
        <input placeholder="name, e.g. survivor-marcus" bind:value={upName} />
        <button class="primary" onclick={upload} disabled={!upFile}>Add & use</button>
      </div>
    </section>
  </div>
</div>

<style>
  .voice { display: flex; flex-direction: column; gap: 12px; }
  section { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: var(--panel); display: flex; flex-direction: column; gap: 8px; }
  h4 { margin: 0; font-size: 0.86rem; color: var(--ink); }
  .soft { color: var(--ink-dim); font-weight: 400; font-size: 0.76rem; }
  .lbl { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-dim); }
  .cur { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .cur b { color: var(--ink); }
  .sample, .stock, .row2 { display: flex; gap: 8px; align-items: end; flex-wrap: wrap; }
  .sample label, .stock label { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 3px; font-size: 0.74rem; color: var(--ink-dim); }
  .line { margin: 0; font-style: italic; color: var(--ink-soft); }
  .warn { margin: 0; color: #d9a441; font-size: 0.78rem; }
  .err { margin: 0; color: var(--danger); font-size: 0.8rem; }
  .ok { color: var(--ok); font-size: 0.76rem; }
  .filters { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .filters input[type="search"] { flex: 1; min-width: 160px; }
  .row { display: flex; gap: 4px; align-items: center; font-size: 0.76rem; color: var(--ink-dim); }
  .lib { display: flex; flex-direction: column; gap: 3px; max-height: 340px; overflow-y: auto; }
  .v { display: grid; grid-template-columns: auto 1fr auto auto auto; gap: 8px; align-items: center; padding: 5px 8px; border-radius: 8px; border: 1px solid transparent; }
  .v:hover { background: var(--panel-2); }
  .v.on { border-color: var(--accent); }
  .vt { display: flex; flex-direction: column; min-width: 0; }
  .vt b { color: var(--ink); font-size: 0.82rem; }
  .vt span { color: var(--ink-dim); font-size: 0.7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .taken { font-size: 0.72rem; color: var(--ink-dim); }
  .fam { position: sticky; top: 0; z-index: 1; background: var(--panel); padding: 6px 4px 2px; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-soft, var(--ink)); border-bottom: 1px solid var(--line); }
  .roll { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 4px 12px; }
  .who { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1.2fr); align-items: center; gap: 6px; padding: 3px 6px; border-radius: 8px; font-size: 0.78rem; }
  .who .nm { color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who .vn { color: var(--ink-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who.bad .vn { color: var(--danger); grid-column: 2 / 4; }
  .who.me { background: var(--panel-2); }
  .who button.play { width: 24px; height: 24px; font-size: 0.66rem; }
  .make { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .take { display: flex; gap: 6px; align-items: center; }
  .take input { flex: 1; }
  textarea, input, select { background: var(--bg); color: var(--ink); border: 1px solid var(--line-2, var(--line)); border-radius: 6px; padding: 5px 8px; font: inherit; font-size: 0.84rem; min-width: 0; }
  textarea { resize: vertical; }
  button { background: var(--panel-2); color: var(--ink); border: 1px solid var(--line-2, var(--line)); border-radius: 8px; padding: 6px 11px; cursor: pointer; font: inherit; font-size: 0.82rem; }
  button:disabled { opacity: 0.45; cursor: default; }
  button.primary { background: var(--accent); color: var(--accent-ink, #111); border-color: var(--accent); font-weight: 700; }
  button.sm { padding: 3px 9px; font-size: 0.74rem; }
  button.play { width: 30px; height: 30px; padding: 0; border-radius: 50%; }
  button.link { background: none; border: none; padding: 0; color: var(--accent); font-size: 0.76rem; }
  button.x { background: none; border: none; color: var(--ink-dim); padding: 0 4px; }
  button.x:hover { color: var(--danger); }
  @media (max-width: 1100px) { .make { grid-template-columns: 1fr; } }
</style>
