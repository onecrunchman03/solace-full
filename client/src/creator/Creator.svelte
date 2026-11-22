<script lang="ts">
  // SOLACE SURVIVORZ — THE CHARACTER CREATOR (docs/survivorz/CREATOR.md; Josh, Nov 3 2026: "optimize
  // the UI so its not just one long scroll down list, prioritize productivity"). Three columns: the
  // characters (search, filters, select several for a bulk edit), the one being edited in tabs, and
  // its body turning beside the live checks. Bodies are their own tab. It opens in the Admin Panel or
  // in a window of its own (main.ts #creator). The creator only edits characters: who starts in the
  // map is the Survivorz panel's lineup.
  //
  // SKILLS AND GENES, NOTHING ELSE (Josh, Nov 5 2026): the sixteen skills in four groups with a points bar
  // against the suggested total, and the fifteen genes. No body stats, no perks; a sealed suit is the body's
  // (Bodies). THE WORKSHOP: this page makes a character ready; the Survivorz panel's Cast card puts them in.
  import { onMount } from "svelte";
  import { api, ApiError, type CastCharacter, type CastCheck, type CastListEntry, type CastPayload } from "../lib/api";
  import { ask } from "../lib/confirm.svelte";
  import { openPopout } from "../lib/popout";
  import CreatorBodies from "../components/CreatorBodies.svelte";
  import BodyPreview from "./BodyPreview.svelte";
  import RelationsTab from "./RelationsTab.svelte";
  import VoiceTab from "./VoiceTab.svelte";
  import { plain } from "./errors";

  let { popped = false }: { popped?: boolean } = $props();

  type Tab = "who" | "body" | "skills" | "mind" | "relations" | "voice" | "sheet";
  const TABS: [Tab, string][] = [["who", "Who"], ["body", "Body & kit"], ["skills", "Skills"], ["mind", "Personality"], ["relations", "Relations"], ["voice", "Voice"], ["sheet", "Sheet"]];
  let top = $state<"characters" | "bodies">("characters");
  let tab = $state<Tab>("who");

  let data = $state<CastPayload | null>(null);
  let cur = $state<CastCharacter | null>(null);
  let regardIn = $state<Record<string, number | null>>({});
  let isNew = $state(false);
  let checks = $state<CastCheck>({ errors: [], warnings: [] });
  let msg = $state("");
  let busy = $state(false);
  let restored = $state(false);
  let draftAt = $state<number | null>(null);
  let bibleText = $state<string | null | undefined>(undefined);
  async function loadBible(id: string): Promise<void> {
    bibleText = undefined;
    if (!/^[a-z]{2,16}$/.test(id)) return;
    try { bibleText = (await api.adminCastBible(id)).text; } catch { bibleText = null; }
  }

  // ---- the list: search, filters, selection ----
  let q = $state("");
  let fSkill = $state("");
  let fBody = $state<"" | "baked" | "unbaked">("");
  let fState = $state<"" | "list" | "show" | "todo">("");
  /** WHAT'S LEFT (Josh, Nov 4 2026): each character's steps into the show, from the server */
  const stepsOf = (id: string) => data?.todo?.[id] ?? [];
  const liveOf = (id: string): boolean => stepsOf(id).find((s) => s.key === "live")?.done === true;
  const doneOf = (id: string): number => stepsOf(id).filter((s) => s.done).length;
  let picked = $state<string[]>([]);

  const entryOf = (id: string): CastListEntry | undefined => data?.list.find((e) => e.char.id === id);
  /** everyone as the panel sees them: the repo's files, each replaced by its list entry */
  // (WHAT OTHERS THINK is written into the others, in save order, exactly as the server does it
  // (survivorz-cast.ts everyone()). Shown from the raw rows, "B thinks 50 of A" set on A's tab left B's tab on the
  // old number — and the next save of B wrote the old number back over it.)
  const people = $derived.by(() => {
    if (!data) return [] as CastCharacter[];
    const d = $state.snapshot(data) as CastPayload;
    const by = new Map<string, CastCharacter>(d.cast.map((c) => [c.id, c]));
    for (const e of [...d.list].sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))) {
      if (e.deleted) { by.delete(e.char.id); continue; }
      by.set(e.char.id, e.char);
      for (const [k, v] of Object.entries(e.regardIn ?? {})) {
        const o = by.get(k);
        if (o && k !== e.char.id && typeof v === "number") o.regard = { ...(o.regard ?? {}), [e.char.id]: v };
      }
    }
    for (const c of by.values()) if (c.regard) c.regard = Object.fromEntries(Object.entries(c.regard).filter(([k]) => by.has(k) && k !== c.id));
    return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
  const shown = $derived(
    people.filter((c) => {
      const s = q.trim().toLowerCase();
      if (s && !(c.name.toLowerCase().includes(s) || c.short.toLowerCase().includes(s) || c.id.includes(s) || c.tag.toLowerCase().includes(s))) return false;
      if (fSkill && skillOf(c, fSkill) < 7) return false;
      if (fBody === "baked" && !data?.bodies.includes(c.body)) return false;
      if (fBody === "unbaked" && data?.bodies.includes(c.body)) return false;
      if (fState === "list" && !entryOf(c.id)) return false;
      if (fState === "show" && !liveOf(c.id)) return false;
      if (fState === "todo" && (c.status === "draft" || liveOf(c.id))) return false;
      return true;
    }),
  );
  const others = $derived(cur ? people.filter((o) => o.id !== cur!.id) : []);
  const takenVoices = $derived(Object.fromEntries(others.filter((o) => o.voice?.clone).map((o) => [o.voice.clone, o.name])));

  onMount(() => {
    void load();
    // (a bake finishing, or a save from another window: the list's "no body" and "what's left" used to stay as they
    // were until the next save here. The open character is left alone.)
    const t = window.setInterval(async () => {
      if (busy || top !== "characters" || document.hidden) return;
      try { data = await api.adminCast(); } catch { /* the next one tries again */ }
    }, 30_000);
    return () => clearInterval(t);
  });

  async function load(selectId?: string): Promise<void> {
    try {
      data = await api.adminCast();
      const id = selectId ?? cur?.id ?? people[0]?.id;
      const c = people.find((p) => p.id === id) ?? people[0];
      if (c && !(isNew && !selectId)) pick(c, false);
    } catch (e) {
      msg = plain(e, "Couldn't load the characters.");
    }
  }

  // ---- autosaved drafts: every change kept in this browser until saved or thrown away ----
  const DRAFT = (id: string) => `solace_creator_draft:${id || "__new"}`;
  type Draft = { char: CastCharacter; regardIn: Record<string, number | null>; at: number; isNew: boolean };
  function readDraft(id: string): Draft | null {
    try { return JSON.parse(localStorage.getItem(DRAFT(id)) ?? "null"); } catch { return null; }
  }
  function dropDraft(id: string): void {
    try { localStorage.removeItem(DRAFT(id)); } catch { /* private window */ }
  }

  function regardInOf(c: CastCharacter): Record<string, number | null> {
    const r: Record<string, number | null> = {};
    for (const o of people) if (o.id !== c.id && c.id in (o.regard ?? {})) r[o.id] = o.regard[c.id];
    return r;
  }

  /** a skill or gene the file leaves out: shown at what the show reads it as (its base; a gene 5) */
  function fillDefaults(c: CastCharacter): void {
    if (!data) return;
    c.skills ??= {}; c.genes ??= {};
    for (const k of data.vocab.skills) c.skills[k] ??= data.vocab.skillInfo[k].base;
    for (const k of data.vocab.genes) c.genes[k] ??= data.vocab.geneBase;
    // (a browser draft from before the skills round: the server converts it on save; here the old fields just go)
    const old = c as unknown as Record<string, unknown>;
    delete old.stats; delete old.perks; delete old.world; delete old.traits;
  }
  const skillOf = (c: CastCharacter, k: string): number => c.skills?.[k] ?? data?.vocab.skillInfo[k]?.base ?? 0;
  const topSkills = (c: CastCharacter): string[] => data
    ? data.vocab.skills.filter((k) => skillOf(c, k) >= 7 && skillOf(c, k) > data!.vocab.skillInfo[k].base).sort((a, b) => skillOf(c, b) - skillOf(c, a)).slice(0, 2).map((k) => data!.vocab.skillInfo[k].label)
    : [];
  const total = $derived(cur && data ? data.vocab.skills.reduce((n, k) => n + skillOf(cur!, k), 0) : 0);
  function pick(c: CastCharacter, fresh: boolean, resume = false): void {
    const d = readDraft(fresh ? "" : c.id);
    const saved = entryOf(c.id)?.updatedAt ?? 0;
    // (a new character's draft comes back when New is pressed again: it used to say "Draft kept" and never return)
    if (d && (fresh ? resume : d.at > saved)) {
      cur = d.char; regardIn = d.regardIn; restored = true; draftAt = d.at;
      fillDefaults(cur);
    } else {
      cur = structuredClone($state.snapshot(c)) as CastCharacter;
      fillDefaults(cur);
      regardIn = regardInOf(c);
      restored = false; draftAt = null;
    }
    isNew = fresh;
    msg = "";
    void loadBible(fresh ? "" : c.id);
  }

  let draftTimer = 0;
  $effect(() => {
    if (!cur) return;
    const snap = { char: $state.snapshot(cur) as CastCharacter, regardIn: $state.snapshot(regardIn) as Record<string, number | null> };
    clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => {
      const base = isNew ? null : people.find((p) => p.id === snap.char.id);
      // (compared with the same defaults filled in that opening a character fills: without them every character
      // whose file leaves a skill out got a "draft" the moment it was opened, and that phantom draft then hid
      // newer saves — a relation set from the other side — and wrote the old values back)
      const full = base ? (structuredClone($state.snapshot(base)) as CastCharacter) : null;
      if (full) fillDefaults(full);
      if (base && full && JSON.stringify(full) === JSON.stringify(snap.char) && JSON.stringify(regardInOf(base)) === JSON.stringify(snap.regardIn)) {
        // (edits taken back by hand: no draft left behind)
        if (!restored) { dropDraft(snap.char.id); draftAt = null; }
        return;
      }
      try {
        localStorage.setItem(DRAFT(isNew ? "" : snap.char.id), JSON.stringify({ ...snap, at: Date.now(), isNew }));
        draftAt = Date.now();
      } catch { /* private window */ }
    }, 700);
    return () => clearTimeout(draftTimer);
  });
  async function discard(): Promise<void> {
    if (!cur) return;
    dropDraft(isNew ? "" : cur.id);
    const base = people.find((p) => p.id === cur!.id);
    if (base) pick(base, false); else cur = null;
  }

  // ---- live checks, a beat after the last change ----
  let timer = 0;
  $effect(() => {
    if (!cur) return;
    const snap = $state.snapshot(cur) as CastCharacter;
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      try { checks = await api.adminCastCheck(snap); } catch { /* the next change tries again */ }
    }, 300);
    return () => clearTimeout(timer);
  });
  const bad = (field: string): boolean => checks.errors.some((p) => p.field === field || p.field.startsWith(field + "."));
  const tabBad = (t: Tab): boolean => {
    const f: Record<Tab, string[]> = { who: ["id", "name", "short", "tag", "status"], body: ["body", "kit"], skills: ["skills"], mind: ["genes"], relations: ["regard"], voice: ["voice"], sheet: ["sheet", "notes"] };
    return checks.errors.some((p) => f[t].some((k) => p.field === k || p.field.startsWith(k + ".")));
  };

  function newChar(): void {
    if (!data) return;
    const genes = Object.fromEntries(data.vocab.genes.map((k) => [k, data!.vocab.geneBase]));
    pick({
      id: "", status: "draft", name: "", short: "", tag: "", body: "", genes,
      skills: Object.fromEntries(data.vocab.skills.map((k) => [k, data!.vocab.skillInfo[k].base])),
      kit: { melee: "fists", bandage: 1, medkit: 0, food: 1, water: 1 }, regard: {}, voice: { clone: "", kokoro: "af_heart" }, sheet: "You are ",
    }, true, true);
    tab = "who";
  }
  function copyChar(): void {
    if (!cur) return;
    const c = structuredClone($state.snapshot(cur)) as CastCharacter;
    Object.assign(c, { id: "", status: "draft", name: "", short: "", body: "", voice: { clone: "", kokoro: c.voice.kokoro } });
    delete c.order; delete c.strip; delete c.notes;
    pick(c, true);
    tab = "who";
  }

  async function save(): Promise<void> {
    if (!cur || busy) return;
    busy = true;
    try {
      const r = await api.adminCastSave($state.snapshot(cur) as CastCharacter, $state.snapshot(regardIn) as Record<string, number | null>);
      const name = cur.name, id = cur.id;
      dropDraft(isNew ? "" : id);
      isNew = false;
      await load(id);
      const where = r.live ? " They're in the show." : r.held && cur?.status !== "draft" ? ` Not in the show yet: ${r.held}.` : "";
      msg = `Saved ${name}.${where}`;
    } catch (e) {
      msg = e instanceof ApiError ? `Not saved: ${(e.data?.errors ?? []).map((p: { field: string; error: string }) => `${p.field} ${p.error}`).join("; ") || e.code}` : String(e);
    } finally { busy = false; }
  }

  /** throw away my edits to a show character (the one in the show stays as it is) */
  async function undoEdits(): Promise<void> {
    if (!cur || entryOf(cur.id)?.state !== "changed") return;
    if (!(await ask({ title: `Undo your changes to ${cur.name}?`, body: "They go back to how they are in the show.", danger: true }))) return;
    const id = cur.id;
    try { await api.adminCastDelete(id); dropDraft(id); await load(id); msg = "Changes undone."; }
    catch (e) { msg = plain(e, "Couldn't undo them."); }
  }
  // DELETE A CHARACTER (Josh, Nov 3 2026): out of the show at once (the list is live since Nov 4); a show
  // character's mark is for good (Nov 10 2026) and its file leaves the repo at the next pull
  async function deleteChar(): Promise<void> {
    if (!cur || isNew) return;
    const inShow = data?.cast.some((c) => c.id === cur!.id);
    const name = cur.name || cur.id;
    if (!(await ask({
      title: `Delete ${name}?`,
      body: inShow ? "They leave the show now (a run they're already in keeps them to its end). This can't be undone." : "They're gone for good.",
      danger: true,
    }))) return;
    const id = cur.id;
    try {
      const r = await api.adminCastDeleteCharacter(id);
      dropDraft(id); cur = null; picked = picked.filter((x) => x !== id);
      await load();
      msg = `${name} is deleted.`;
    } catch (e) { msg = plain(e, "Couldn't delete them."); }
  }
  function download(): void {
    if (!data?.list.length) return;
    const body = JSON.stringify({ exportedAt: new Date().toISOString(), list: data.list.map((e) => (e.deleted ? { char: { id: e.char.id, deleted: true }, regardIn: {} } : { char: e.char, regardIn: e.regardIn })) }, null, 2);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    a.download = `survivorz-characters-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    msg = "Downloaded. (The show already reads your list; this is a copy.)";
  }

  // ---- bulk edit: one change, applied to every selected character and saved ----
  let bulkKind = $state<"" | "skill" | "kit">("");
  let bulkSkill = $state("melee");
  let bulkValue = $state("");
  let bulkKit = $state("bandage");
  async function applyBulk(): Promise<void> {
    if (!data || !bulkKind || !picked.length || busy || String(bulkValue ?? "").trim() === "") return;
    // (the open character's unsaved edits would be dropped: the bulk save is newer than their draft)
    if (cur && !isNew && draftAt && picked.includes(cur.id)) { msg = `Save or discard your changes to ${cur.name || cur.id} first.`; return; }
    const what = bulkKind === "skill" ? `${data.vocab.skillInfo[bulkSkill]?.label ?? bulkSkill} → ${Math.max(0, Math.min(10, Number(bulkValue) || 0))}` : `${pretty(bulkKit)} → ${Math.max(0, Math.min(9, Number(bulkValue) || 0))}`;
    if (!(await ask({ title: `${what} on ${picked.length} characters?`, body: "Each is checked and saved on its own; any that fail the rules are left as they were.", confirm: "apply" }))) return;
    busy = true;
    let okN = 0;
    const failed: string[] = [];
    for (const id of picked) {
      const base = people.find((p) => p.id === id);
      if (!base) continue;
      const c = structuredClone($state.snapshot(base)) as CastCharacter;
      if (bulkKind === "skill") c.skills = { ...c.skills, [bulkSkill]: Math.max(0, Math.min(10, Number(bulkValue) || 0)) };
      if (bulkKind === "kit") (c.kit as unknown as Record<string, number>)[bulkKit] = Math.max(0, Math.min(9, Number(bulkValue) || 0));
      try { await api.adminCastSave(c, regardInOf(base)); okN++; }
      catch (e) { failed.push(`${base.name}${e instanceof ApiError ? ` (${(e.data?.errors ?? []).map((p: { error: string }) => p.error).join("; ") || e.code})` : ""}`); }
    }
    busy = false;
    const done = `Changed ${okN} of ${picked.length}.${failed.length ? ` Not changed: ${failed.join(", ")}.` : ""}`;
    picked = [];
    await load(cur?.id);
    msg = done;   // (after the reload: picking the character again clears the message)
  }
  function toggle(id: string): void {
    picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
  }

  // ---- pop out ----
  // (lib/popout.ts, shared with the Survivorz show's pop-out)
  async function popOut(): Promise<void> {
    try { await openPopout("#creator", { name: "solace-creator", width: 1500, height: 950 }); }
    catch (e) { msg = e instanceof Error ? e.message : String(e); }
  }

  // ---- small helpers ----
  function setGun(v: string): void {
    if (!cur) return;
    if (v) { cur.kit.gun = v; cur.kit.mag ??= v === "rifle" ? 30 : 15; cur.kit.ammo ??= 0; }
    else { delete cur.kit.gun; delete cur.kit.mag; delete cur.kit.ammo; }
  }
  const pretty = (k: string): string => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
  const stateTag = (c: CastCharacter): string => {
    const e = entryOf(c.id);
    if (!e) return "";
    return e.state === "new" ? "new" : e.state === "same" ? "" : "edited";
  };
  const bodyLabel = (b: string): string => {
    const twin = others.find((c) => c.body === b && c.status !== "draft");
    if (twin) return `${b} (${twin.name})`;
    return data?.bodies.includes(b) ? b : `${b} (not baked)`;
  };
  const bodyOpts = $derived(data && cur ? [...new Set([...data.bodies, cur.body].filter(Boolean))] : []);
  const ago = (t: number): string => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`; };

  function onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="creator" class:popped>
  <header>
    <h2>Characters</h2>
    <div class="toptabs">
      <button class:on={top === "characters"} onclick={() => (top = "characters")}>Characters</button>
      <button class:on={top === "bodies"} onclick={() => (top = "bodies")}>Bodies</button>
    </div>
    <span class="grow"></span>
    {#if top === "characters"}
      {#if draftAt}<span class="soft small">{restored ? "Unsaved changes restored" : "Draft kept"} · {ago(draftAt)} <button class="link" onclick={discard}>Discard</button></span>{/if}
      <button onclick={newChar} disabled={!data}>New</button>
      <button onclick={copyChar} disabled={!cur}>Copy</button>
      {#if cur && !isNew && entryOf(cur.id)?.state === "changed"}<button onclick={undoEdits} title="Throw away your changes">Undo changes</button>{/if}
      <button class="danger" onclick={deleteChar} disabled={!cur || isNew}>Delete</button>
      <button onclick={download} disabled={!data?.list.length} title="Save a copy of your list as a file">Download list</button>
      <button class="primary" onclick={save} disabled={!cur || busy || checks.errors.length > 0} title="Ctrl+S">Save</button>
    {/if}
    {#if !popped}<button onclick={popOut} title="Open the creator in its own window">⧉ Pop out</button>{/if}
  </header>
  {#if msg}<p class="msg">{msg}</p>{/if}

  {#if top === "bodies"}
    <div class="bodies-pane"><CreatorBodies onready={() => void load()} /></div>
  {:else if data}
    <div class="cols">
      <!-- THE LIST -->
      <nav class="list">
        <input class="search" type="search" placeholder="Search {people.length} characters…" bind:value={q} />
        <div class="filters">
          <select bind:value={fSkill} aria-label="Good at">
            <option value="">Good at anything</option>
            {#each data.vocab.skills as k (k)}<option value={k}>Good at {data.vocab.skillInfo[k].label.toLowerCase()}</option>{/each}
          </select>
          <select bind:value={fBody} aria-label="Body">
            <option value="">Any body</option><option value="baked">Body baked</option><option value="unbaked">Body not baked</option>
          </select>
          <select bind:value={fState} aria-label="Where">
            <option value="">Everyone</option><option value="list">Edited or new</option><option value="show">In the show</option><option value="todo">Waiting on something</option>
          </select>
        </div>
        <div class="who-list">
          {#if isNew && cur}<div class="who on"><span class="nm">{cur.name || "New character"}</span><small class="tag new">unsaved</small></div>{/if}
          {#each shown as c (c.id)}
            <div class="who" class:on={cur?.id === c.id && !isNew}>
              <input type="checkbox" checked={picked.includes(c.id)} onchange={() => toggle(c.id)} aria-label="Select {c.name}" />
              <button class="pickbtn" onclick={() => pick(c, false)}>
                <span class="nm">{c.name}</span>
                <small>{c.tag}</small>
              </button>
              <span class="badges">
                {#each topSkills(c) as s (s)}<i title="Good at {s.toLowerCase()}">{s.slice(0, 2)}</i>{/each}
                {#if stateTag(c)}<small class="tag {stateTag(c)}">{stateTag(c)}</small>{/if}
                {#if liveOf(c.id)}<small class="tag live" title="In the show">in show</small>
                {:else if c.status !== "draft" && stepsOf(c.id).length}<small class="tag wait" title={stepsOf(c.id).filter((s) => !s.done).map((s) => s.label).join(", ")}>{doneOf(c.id)}/{stepsOf(c.id).length}</small>
                {:else if !data.bodies.includes(c.body)}<small class="tag nobody" title="Body not baked">no body</small>{/if}
              </span>
            </div>
          {:else}
            <p class="soft small">Nobody matches.</p>
          {/each}
        </div>
        {#if picked.length}
          <div class="bulk">
            <b>{picked.length} selected</b> <button class="link" onclick={() => (picked = [])}>clear</button>
            <select bind:value={bulkKind}>
              <option value="">Change…</option>
              <option value="skill">A skill</option>
              <option value="kit">A kit count</option>
            </select>
            {#if bulkKind === "skill"}
              <select bind:value={bulkSkill}>{#each data.vocab.skills as k (k)}<option value={k}>{data.vocab.skillInfo[k].label}</option>{/each}</select>
              <input type="number" min="0" max="10" bind:value={bulkValue} placeholder="0-10" />
            {:else if bulkKind === "kit"}
              <select bind:value={bulkKit}>{#each ["bandage", "medkit", "food", "water"] as k (k)}<option value={k}>{pretty(k)}</option>{/each}</select>
              <input type="number" min="0" max="9" bind:value={bulkValue} placeholder="0-9" />
            {/if}
            <button class="primary" onclick={applyBulk} disabled={!bulkKind || busy || String(bulkValue ?? "").trim() === ""}>Apply</button>
          </div>
        {/if}
      </nav>

      {#if cur}
        <!-- THE EDITOR -->
        <main class="editor">
          <div class="tabs">
            {#each TABS as [t, label] (t)}
              <button class:on={tab === t} class:err={tabBad(t)} onclick={() => (tab = t)}>{label}</button>
            {/each}
          </div>
          <div class="pane">
            {#if tab === "who"}
              <div class="grid">
                <label>Id (never changes once saved)<input bind:value={cur.id} readonly={!isNew} class:bad={bad("id")} placeholder="lower-case letters" /></label>
                <label>Full name<input bind:value={cur.name} class:bad={bad("name")} /></label>
                <label>What the others call them<input bind:value={cur.short} class:bad={bad("short")} /></label>
                <label>On-screen caption<input bind:value={cur.tag} class:bad={bad("tag")} placeholder="who they are, e.g. Night janitor" /></label>
              </div>
              <p class="hint">Where they start is the map's. Whether they're in the show is set on the Survivorz panel's <b>Cast</b> card ({cur.status === "cast" ? "they walk in" : cur.status === "bench" ? "on the bench" : "off the show"} now).</p>
            {:else if tab === "body"}
              <div class="grid">
                <label>Body
                  <select bind:value={cur.body} class:bad={bad("body")}>
                    <option value="">— pick a body —</option>
                    {#each bodyOpts as b (b)}<option value={b}>{bodyLabel(b)}</option>{/each}
                  </select>
                </label>
                <span class="soft small self-end">A new body? <button class="link" onclick={() => (top = "bodies")}>Drop a model in Bodies</button></span>
              </div>
              {#if cur.body && data.suited.includes(cur.body)}<p class="hint">This body is a <b>sealed suit</b>: no backpack over the air pack, and a muffled voice. (Set on the body in Bodies.)</p>{/if}
              <h4>What they carry</h4>
              <div class="grid">
                <label>Melee weapon<select bind:value={cur.kit.melee}>{#each data.vocab.melee as m (m)}<option value={m}>{m}</option>{/each}</select></label>
                <label>Gun
                  <select value={cur.kit.gun ?? ""} onchange={(e) => setGun(e.currentTarget.value)}>
                    <option value="">none</option>
                    {#each data.vocab.guns as g (g)}<option value={g}>{g}</option>{/each}
                  </select>
                </label>
                {#if cur.kit.gun}
                  <label>Rounds in the gun<input type="number" min="0" max="30" bind:value={cur.kit.mag} class:bad={bad("kit.mag")} /></label>
                  <label>Spare rounds<input type="number" min="0" max="120" bind:value={cur.kit.ammo} class:bad={bad("kit.ammo")} /></label>
                {/if}
                <label>Bandages<input type="number" min="0" max="9" bind:value={cur.kit.bandage} /></label>
                <label>Med kits<input type="number" min="0" max="9" bind:value={cur.kit.medkit} /></label>
                <label>Food<input type="number" min="0" max="9" bind:value={cur.kit.food} /></label>
                <label>Water<input type="number" min="0" max="9" bind:value={cur.kit.water} /></label>
              </div>
            {:else if tab === "skills"}
              {@const budget = data.vocab.skillBudget}
              <div class="budget" class:over={total > budget}>
                <div class="btxt"><b>{total}</b> of {budget} points <span class="soft">· a suggestion, not a limit{total > budget ? ` — ${total - budget} over` : ""}</span></div>
                <div class="bbar"><i style="width: {Math.min(100, (total / budget) * 100)}%"></i></div>
              </div>
              <p class="hint">0 is untrained; 5 is an ordinary adult for the body. Skills marked <span class="grows">grows</span> get better during a run by doing the thing. A map is built around this list: skills speed things up, and anyone can still do them slowly.</p>
              <div class="groups">
                {#each data.vocab.skillGroups as g (g.id)}
                  <section class="group">
                    <h5>{g.label}</h5>
                    {#each data.vocab.skills.filter((k) => data!.vocab.skillInfo[k].group === g.id) as k (k)}
                      {@const si = data.vocab.skillInfo[k]}
                      <div class="sk" class:bad={bad(`skills.${k}`)}>
                        <div class="skhead">
                          <span class="sklabel">{si.label}{#if si.learns}<span class="grows">grows</span>{/if}</span>
                          <input type="range" min="0" max="10" step="1" bind:value={cur.skills[k]} aria-label={si.label} style="--base: {si.base * 10}%" />
                          <b class="skv" class:hi={(cur.skills[k] ?? 0) >= 8} class:lo={si.base >= 5 && (cur.skills[k] ?? 0) <= 2}>{cur.skills[k]}</b>
                        </div>
                        <p class="does">{si.does}</p>
                      </div>
                    {/each}
                  </section>
                {/each}
              </div>
            {:else if tab === "mind"}
              <p class="hint">Genes are who they are: what they <b>choose</b>, never what they can do. 5 is an ordinary person; each drifts up to 2 with what happens to them.</p>
              <div class="genes">
                {#each data.vocab.genes as k (k)}
                  <div class="sk">
                    <div class="skhead">
                      <span class="sklabel">{pretty(k)}</span>
                      <input type="range" min="0" max="10" bind:value={cur.genes[k]} aria-label={pretty(k)} style="--base: 50%" />
                      <b class="skv">{cur.genes[k]}</b>
                    </div>
                    {#if data.vocab.geneMeans[k]}<p class="does">{data.vocab.geneMeans[k][0].toUpperCase() + data.vocab.geneMeans[k].slice(1)}.</p>{/if}
                  </div>
                {/each}
              </div>
            {:else if tab === "relations"}
              <RelationsTab bind:cur bind:regardIn {others} />
            {:else if tab === "voice"}
              <VoiceTab bind:cur {data} {takenVoices} everyone={others} />
            {:else}
              <h4>The sheet <span class="soft">who they are, as the model is told</span></h4>
              <p class="soft small">Starts "You are NAME." Who they are, how they talk, what they know, what they want and fear, who the others are to them. Never a secret of the facility.</p>
              <textarea class="sheet" bind:value={cur.sheet} class:bad={bad("sheet")}></textarea>
              <div class="count" class:over={cur.sheet.length > data.vocab.limits.sheetMax}>{cur.sheet.length} / {data.vocab.limits.sheetMax}</div>
              <h4>Notes <span class="soft">for us, never the model</span></h4>
              <textarea rows="3" value={cur.notes ?? ""} oninput={(e) => { if (cur) cur.notes = e.currentTarget.value; }}></textarea>
              <h4>Their bible <span class="soft">docs/survivorz/cast/{cur.id || "id"}.md</span></h4>
              {#if bibleText}<details><summary class="soft">Show it</summary><pre class="bible">{bibleText}</pre></details>
              {:else}<p class="soft small">None yet. Claude writes it when the list is pulled.</p>{/if}
            {/if}
          </div>
        </main>

        <!-- PREVIEW + CHECKS -->
        <aside class="side">
          <BodyPreview body={cur.body} />
          {#if !isNew && stepsOf(cur.id).length}
            <section class="checks steps">
              <h4>What's left <span class="soft">{doneOf(cur.id)} of {stepsOf(cur.id).length}</span></h4>
              <ul>
                {#each stepsOf(cur.id) as s (s.key)}
                  <li class:done={s.done}><i>{s.done ? "✓" : "○"}</i><span>{s.label}{#if s.note}<small class="soft"> · {s.note}</small>{/if}</span></li>
                {/each}
              </ul>
            </section>
          {/if}
          <section class="checks">
            <h4>Checks</h4>
            {#if !checks.errors.length && !checks.warnings.length}<p class="ok">Ready to save.</p>{/if}
            <ul>
              {#each checks.errors as p, i (i)}<li class="err">{p.field}: {p.error}</li>{/each}
              {#each checks.warnings as p, i (i)}<li class="warn">{p.field}: {p.error}</li>{/each}
            </ul>
          </section>
        </aside>
      {/if}
    </div>
  {:else}
    <p class="soft">Loading…</p>
  {/if}
</div>

<style>
  /* THE SHOW'S LOOK (Josh, Nov 5 2026: "Survivorz show style"): the stream's near-black panels, amber and mint,
     tracked capitals for headings — theme-independent, like the casino and the show itself. */
  .creator {
    --sz-bg: #0a0b0c; --sz-panel: #121416; --sz-panel-2: #181b1e; --sz-raise: #1f2327; --sz-line: #262a2f; --sz-line-2: #343a40;
    --sz-ink: #eef1f3; --sz-soft: #c3c9ce; --sz-dim: #858d94; --sz-amber: #e8b04a; --sz-amber-ink: #17120a; --sz-mint: #6fd1a0; --sz-red: #ff5a44;
    /* the tabs it hosts (Bodies, Relations, Voice, the preview) style themselves with the theme tokens: in here, those
       ARE the show's */
    --bg: var(--sz-bg); --panel: var(--sz-panel); --panel-2: var(--sz-panel-2); --line: var(--sz-line); --line-2: var(--sz-line-2);
    --ink: var(--sz-ink); --ink-soft: var(--sz-soft); --ink-dim: var(--sz-dim); --accent: var(--sz-amber); --accent-ink: var(--sz-amber-ink);
    --danger: var(--sz-red); --ok: var(--sz-mint); --warn: #e0b65c;
    display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 0;
    color: var(--sz-ink); font-family: "Inter", "Segoe UI", system-ui, sans-serif;
    background: var(--sz-bg); border-radius: 12px; padding: 12px 14px; box-sizing: border-box;
  }
  .creator.popped { border-radius: 0; height: 100vh; padding: 14px 18px; }
  header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-bottom: 10px; border-bottom: 1px solid var(--sz-line); }
  h2 { margin: 0; font-size: 0.95rem; font-weight: 900; letter-spacing: 0.22em; text-transform: uppercase; color: var(--sz-ink); }
  h2::before { content: ""; display: inline-block; width: 4px; height: 0.95em; background: var(--sz-amber); margin-right: 9px; vertical-align: -2px; }
  .toptabs { display: flex; gap: 2px; margin-left: 10px; background: var(--sz-panel); padding: 3px; border-radius: 9px; border: 1px solid var(--sz-line); }
  .toptabs button { border: none; background: none; padding: 5px 14px; color: var(--sz-dim); font-weight: 700; letter-spacing: 0.04em; }
  .toptabs button.on { background: var(--sz-raise); color: var(--sz-ink); box-shadow: inset 0 -2px 0 var(--sz-amber); }
  .grow { flex: 1; }
  button { background: var(--sz-panel-2); color: var(--sz-ink); border: 1px solid var(--sz-line-2); border-radius: 7px; padding: 6px 12px; cursor: pointer; font: inherit; font-size: 0.82rem; transition: background 0.12s, border-color 0.12s; }
  button:hover:not(:disabled) { background: var(--sz-raise); border-color: #4a5158; }
  button:disabled { opacity: 0.4; cursor: default; }
  button.primary { background: var(--sz-amber); color: var(--sz-amber-ink); border-color: var(--sz-amber); font-weight: 800; letter-spacing: 0.04em; }
  button.primary:hover:not(:disabled) { background: #f2c063; border-color: #f2c063; }
  button.danger { border-color: color-mix(in srgb, var(--sz-red) 55%, var(--sz-line)); color: var(--sz-red); background: none; }
  button.link { background: none; border: none; padding: 0; color: var(--sz-amber); font-size: inherit; }
  .msg { margin: 0; padding: 8px 12px; border-left: 3px solid var(--sz-amber); background: var(--sz-panel); font-size: 0.82rem; color: var(--sz-soft); }
  .soft { color: var(--sz-dim); font-weight: 400; font-size: 0.76rem; }
  .small { font-size: 0.72rem; }
  .hint { margin: 2px 0 12px; font-size: 0.78rem; line-height: 1.45; color: var(--sz-soft); padding: 8px 11px; background: var(--sz-panel); border-left: 3px solid var(--sz-line-2); border-radius: 0 6px 6px 0; }
  .hint b { color: var(--sz-ink); }
  .bodies-pane { overflow: auto; min-height: 0; }
  .cols { display: grid; grid-template-columns: 268px minmax(0, 1fr) 320px; gap: 12px; flex: 1; min-height: 0; }
  .list, .editor, .side { min-height: 0; display: flex; flex-direction: column; gap: 8px; }
  .list { background: var(--sz-panel); border: 1px solid var(--sz-line); border-radius: 10px; padding: 8px; }
  .search { padding: 8px 10px; }
  .filters { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
  .filters select:first-child { grid-column: 1 / -1; }
  .who-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; padding-right: 2px; min-height: 120px; }
  .who { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 6px; padding: 5px 7px; border-radius: 7px; border-left: 3px solid transparent; }
  .who:hover { background: var(--sz-panel-2); }
  .who.on { border-left-color: var(--sz-amber); background: var(--sz-raise); }
  .who input[type="checkbox"] { accent-color: var(--sz-amber); }
  .pickbtn { background: none; border: none; padding: 2px 0; text-align: left; display: flex; flex-direction: column; min-width: 0; }
  .pickbtn:hover:not(:disabled) { background: none; }
  .pickbtn small { color: var(--sz-dim); font-size: 0.68rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nm { color: var(--sz-ink); font-size: 0.84rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badges { display: flex; gap: 3px; align-items: center; }
  .badges i { font-style: normal; font-size: 0.58rem; font-weight: 800; letter-spacing: 0.02em; padding: 1px 4px; border-radius: 4px; background: color-mix(in srgb, var(--sz-amber) 18%, var(--sz-panel-2)); color: var(--sz-amber); }
  .tag { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.04em; padding: 0 6px; border-radius: 999px; border: 1px solid var(--sz-line-2); color: var(--sz-dim); white-space: nowrap; }
  .tag.new { color: var(--sz-amber); border-color: var(--sz-amber); }
  .tag.edited { color: #e0b65c; border-color: #8a6f36; }
  .tag.nobody { color: var(--sz-red); border-color: color-mix(in srgb, var(--sz-red) 50%, var(--sz-line)); }
  .tag.live { color: var(--sz-mint); border-color: color-mix(in srgb, var(--sz-mint) 50%, var(--sz-line)); }
  .tag.wait { color: #e0b65c; border-color: #6d5a33; }
  .bulk { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px; border: 1px solid var(--sz-amber); border-radius: 9px; background: color-mix(in srgb, var(--sz-amber) 7%, var(--sz-panel)); font-size: 0.78rem; }
  .bulk input { width: 64px; }
  .editor { background: var(--sz-panel); border: 1px solid var(--sz-line); border-radius: 10px; padding: 0 12px 0; }
  .tabs { display: flex; gap: 0; border-bottom: 1px solid var(--sz-line); overflow-x: auto; scrollbar-width: none; }
  .tabs button { border: none; border-radius: 0; background: none; color: var(--sz-dim); padding: 11px 13px 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; font-size: 0.7rem; box-shadow: inset 0 -2px 0 transparent; white-space: nowrap; }
  .tabs button:hover:not(:disabled) { background: none; color: var(--sz-soft); }
  .tabs button.on { color: var(--sz-ink); box-shadow: inset 0 -2px 0 var(--sz-amber); }
  .tabs button.err::after { content: " •"; color: var(--sz-red); }
  .pane { flex: 1; overflow-y: auto; padding: 12px 2px 24px; min-height: 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; margin-bottom: 12px; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sz-dim); }
  .self-end { align-self: end; padding-bottom: 6px; }
  input, select, textarea { background: var(--sz-bg); color: var(--sz-ink); border: 1px solid var(--sz-line-2); border-radius: 6px; padding: 6px 8px; font: inherit; font-size: 0.85rem; font-weight: 400; letter-spacing: 0; text-transform: none; min-width: 0; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: var(--sz-amber); box-shadow: 0 0 0 2px color-mix(in srgb, var(--sz-amber) 22%, transparent); }
  textarea { width: 100%; resize: vertical; box-sizing: border-box; }
  .sheet { min-height: 320px; line-height: 1.5; }
  .bible { white-space: pre-wrap; font-size: 0.78rem; color: var(--sz-soft); max-height: 360px; overflow: auto; }
  .count { text-align: right; font-size: 0.7rem; color: var(--sz-dim); }
  .count.over { color: var(--sz-red); }
  .bad { border-color: var(--sz-red) !important; }
  h4 { margin: 16px 0 7px; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: var(--sz-amber); }
  h4 .soft { text-transform: none; letter-spacing: 0; color: var(--sz-dim); font-weight: 400; }
  .pane > h4:first-child { margin-top: 2px; }
  /* THE SKILLS: a points bar, then the four groups as cards */
  .budget { padding: 10px 12px; background: var(--sz-panel-2); border: 1px solid var(--sz-line); border-radius: 9px; margin-bottom: 10px; }
  .btxt { font-size: 0.82rem; color: var(--sz-soft); margin-bottom: 7px; }
  .btxt b { font-size: 1.15rem; color: var(--sz-ink); font-variant-numeric: tabular-nums; margin-right: 2px; }
  .bbar { height: 6px; border-radius: 3px; background: var(--sz-bg); overflow: hidden; }
  .bbar i { display: block; height: 100%; background: var(--sz-mint); border-radius: 3px; transition: width 0.2s, background 0.2s; }
  .budget.over .bbar i { background: var(--sz-amber); }
  .budget.over .btxt .soft { color: var(--sz-amber); }
  .groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 10px; }
  .group { background: var(--sz-panel-2); border: 1px solid var(--sz-line); border-radius: 9px; padding: 9px 11px 4px; }
  h5 { margin: 0 0 8px; font-size: 0.66rem; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; color: var(--sz-soft); border-bottom: 1px solid var(--sz-line); padding-bottom: 6px; }
  .genes { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); column-gap: 18px; }
  .sk { padding: 2px 0 2px; border-radius: 6px; }
  .sk.bad .skv { color: var(--sz-red); }
  .skhead { display: grid; grid-template-columns: 118px 1fr 24px; align-items: center; gap: 9px; }
  .sklabel { font-size: 0.82rem; font-weight: 600; color: var(--sz-ink); display: flex; align-items: center; gap: 5px; min-width: 0; }
  .grows { font-size: 0.54rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sz-mint); border: 1px solid color-mix(in srgb, var(--sz-mint) 45%, transparent); border-radius: 3px; padding: 0 3px; }
  .hint .grows { vertical-align: 1px; }
  .skv { text-align: right; font-size: 0.9rem; font-variant-numeric: tabular-nums; color: var(--sz-soft); }
  .skv.hi { color: var(--sz-amber); }
  .skv.lo { color: #d67b6b; }
  /* a range with a tick at where a new character starts it (--base) */
  .skhead input[type="range"] { -webkit-appearance: none; appearance: none; height: 18px; padding: 0; border: none; background: transparent; cursor: pointer; }
  .skhead input[type="range"]:focus { box-shadow: none; }
  .skhead input[type="range"]::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: linear-gradient(90deg, transparent calc(var(--base) - 1px), #59616a calc(var(--base) - 1px), #59616a calc(var(--base) + 1px), transparent calc(var(--base) + 1px)), var(--sz-line-2); }
  .skhead input[type="range"]::-moz-range-track { height: 4px; border-radius: 2px; background: var(--sz-line-2); }
  .skhead input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: var(--sz-amber); margin-top: -5px; box-shadow: 0 0 0 3px var(--sz-panel-2); }
  .skhead input[type="range"]::-moz-range-thumb { width: 14px; height: 14px; border: none; border-radius: 50%; background: var(--sz-amber); }
  .does { margin: 1px 0 8px 127px; font-size: 0.72rem; line-height: 1.38; color: var(--sz-dim); }
  .side { overflow-y: auto; }
  .checks { border: 1px solid var(--sz-line); border-radius: 10px; padding: 10px 12px; background: var(--sz-panel); }
  .checks h4 { margin: 0 0 6px; }
  .checks ul { margin: 0; padding-left: 16px; font-size: 0.78rem; line-height: 1.45; }
  .steps ul { list-style: none; padding-left: 0; display: flex; flex-direction: column; gap: 5px; }
  .steps li { display: flex; gap: 8px; align-items: baseline; color: var(--sz-dim); }
  .steps li i { font-style: normal; width: 1.1em; text-align: center; color: var(--sz-dim); }
  .steps li.done { color: var(--sz-ink); }
  .steps li.done i { color: var(--sz-mint); }
  .ok { margin: 0; color: var(--sz-mint); font-size: 0.8rem; }
  .err { color: var(--sz-red); }
  .warn { color: #e0b65c; }
  @media (max-width: 1200px) { .cols { grid-template-columns: 240px minmax(0, 1fr); } .side { grid-column: 1 / -1; } }
  @media (max-width: 760px) { .does { margin-left: 0; } .skhead { grid-template-columns: 1fr 24px; } .skhead input[type="range"] { grid-column: 1 / -1; grid-row: 2; } }
</style>
