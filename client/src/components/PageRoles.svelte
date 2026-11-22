<script lang="ts">
  // THE ROLE EDITOR — Page Settings → Roles (Josh, Sep 2026). Managers and
  // admins see everything; a member with `manage_roles` sees the same list
  // but can only touch roles below their own and grant what they hold —
  // the server refuses the rest, this just greys it.
  import { roles, loadRoles, can } from "../lib/roles.svelte";
  import { pages } from "../lib/pages.svelte";
  import { session } from "../lib/session.svelte";
  import { api, ApiError, type PageRoleDef, type Perm } from "../lib/api";
  import { ask } from "../lib/confirm.svelte";
  import Avatar from "./Avatar.svelte";

  let { pageId }: { pageId: number } = $props();

  const snap = $derived(roles.byPage[pageId]);
  const page = $derived(pages.list.find((p) => p.id === pageId));
  const isAll = $derived(!!session.user?.isAdmin || page?.role === "manager");
  const canRoles = $derived(can(pageId, "manage_roles"));
  const myTop = $derived(snap?.top ?? null);
  const myPerms = $derived(new Set<Perm>(snap?.mine === "all" || !snap ? [] : snap.mine));
  const PERM_ORDER: Perm[] = ["post", "attach", "gif", "mention_everyone", "create_channels", "manage_channels", "manage_members", "manage_roles"];

  $effect(() => {
    void loadRoles(pageId);
  });

  /** Discord's reach rule, mirrored for the affordance. */
  function touchable(r: PageRoleDef): boolean {
    if (isAll) return true;
    if (!canRoles || myTop === null) return false;
    return r.position < myTop && r.perms.every((p) => myPerms.has(p));
  }
  function grantable(p: Perm): boolean {
    return isAll || myPerms.has(p);
  }
  const custom = $derived((snap?.roles ?? []).filter((r) => !r.isEveryone));
  const everyone = $derived((snap?.roles ?? []).find((r) => r.isEveryone));
  const holders = (id: number): number =>
    Object.values(snap?.assignments ?? {}).filter((ids) => ids.includes(id)).length;

  // ---- editing ----
  let editing = $state<number | "new" | null>(null);
  let name = $state("");
  let color = $state("");
  let perms = $state<Set<Perm>>(new Set());
  let busy = $state(false);
  let err = $state("");

  function startNew(): void {
    editing = "new";
    name = "";
    color = "";
    perms = new Set<Perm>(["post", "attach", "gif"]);
    err = "";
  }
  function startEdit(r: PageRoleDef): void {
    editing = r.id;
    name = r.name;
    color = r.color ?? "";
    perms = new Set(r.perms);
    err = "";
  }
  function togglePerm(p: Perm): void {
    const next = new Set(perms);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    perms = next;
  }
  const why = (e: unknown): string => {
    const code = e instanceof ApiError ? e.code : "";
    return code === "bad_name" ? "That name won't do (1–32 characters, not \"everyone\")."
      : code === "bad_color" ? "That colour isn't valid."
      : code === "cannot_grant" ? "You can only grant permissions you hold yourself."
      : code === "too_many_roles" ? "A page holds at most 25 roles."
      : code === "forbidden" ? "That role is above your reach."
      : "Couldn't save.";
  };
  async function save(): Promise<void> {
    if (busy) return;
    busy = true;
    err = "";
    try {
      const body = { name: name.trim(), color: color || null, perms: [...perms] };
      if (editing === "new") await api.createRole(pageId, body);
      else if (typeof editing === "number") {
        const r = snap?.roles.find((x) => x.id === editing);
        await api.updateRole(pageId, editing, r?.isEveryone ? { perms: body.perms } : body);
      }
      await loadRoles(pageId, true);
      editing = null;
    } catch (e) {
      err = why(e);
    } finally {
      busy = false;
    }
  }
  async function remove(r: PageRoleDef): Promise<void> {
    if (!(await ask({ title: `Delete the ${r.name} role?`, body: `${holders(r.id)} member(s) hold it. Channel gates using it are cleared.`, danger: true }))) return;
    try {
      await api.deleteRole(pageId, r.id);
      await loadRoles(pageId, true);
      if (editing === r.id) editing = null;
    } catch (e) {
      err = why(e);
    }
  }
  async function move(r: PageRoleDef, dir: -1 | 1): Promise<void> {
    const ids = custom.map((x) => x.id);
    const i = ids.indexOf(r.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await api.reorderRoles(pageId, ids);
      await loadRoles(pageId, true);
    } catch (e) {
      err = why(e);
    }
  }

  // ---- handing out ----
  let assignFor = $state<number | null>(null);
  const memberRoles = (uid: number): number[] => snap?.assignments[uid] ?? [];
  // One toggle at a time: two quick ticks both read the old set and the
  // second PUT dropped the first (Oct 2026 review).
  let assigning = $state(false);
  async function toggleAssign(uid: number, r: PageRoleDef): Promise<void> {
    if (assigning) return;
    assigning = true;
    const held = new Set(memberRoles(uid));
    if (held.has(r.id)) held.delete(r.id);
    else held.add(r.id);
    try {
      await api.setMemberRoles(pageId, uid, [...held]);
      await loadRoles(pageId, true);
    } catch (e) {
      err = why(e);
    } finally {
      assigning = false;
    }
  }
</script>

<section class="roles">
  <h3>Roles {#if custom.length}<span class="count">{custom.length}</span>{/if}</h3>
  {#if !snap}
    <p class="note">Loading…</p>
  {:else}
    <p class="note">A member's permissions are everything <b>@everyone</b> allows plus every role they hold. Roles higher in the list outrank the ones below.</p>
    <ul class="list">
      {#each custom as r, i (r.id)}
        <li class:dim={!touchable(r)}>
          <span class="swatch" style="background:{r.color ?? 'transparent'}; border-color:{r.color ?? 'var(--line)'}"></span>
          <span class="rname" style="color:{r.color ?? 'inherit'}">{r.name}</span>
          <span class="meta">{holders(r.id)} · {r.perms.length} perm{r.perms.length === 1 ? "" : "s"}</span>
          {#if isAll}
            <button class="mini" title="Move up" disabled={i === 0} onclick={() => move(r, -1)}>▲</button>
            <button class="mini" title="Move down" disabled={i === custom.length - 1} onclick={() => move(r, 1)}>▼</button>
          {/if}
          {#if touchable(r)}
            <button class="mini" onclick={() => startEdit(r)}>Edit</button>
            <button class="mini danger" onclick={() => remove(r)}>Delete</button>
          {/if}
        </li>
      {/each}
      {#if everyone}
        <li class="everyone">
          <span class="swatch"></span>
          <span class="rname">@everyone</span>
          <span class="meta">the baseline · {everyone.perms.length} perm{everyone.perms.length === 1 ? "" : "s"}</span>
          {#if canRoles}<button class="mini" onclick={() => startEdit(everyone)}>Edit</button>{/if}
        </li>
      {/if}
    </ul>
    {#if canRoles && editing === null}
      <button class="btn" onclick={startNew}>+ New role</button>
    {/if}

    {#if editing !== null}
      {@const isEveryoneEdit = typeof editing === "number" && snap.roles.find((r) => r.id === editing)?.isEveryone}
      <div class="editor">
        {#if !isEveryoneEdit}
          <label class="fld"><span>Name</span><input bind:value={name} maxlength="32" placeholder="e.g. Regulars" /></label>
          <label class="fld color">
            <span>Colour</span>
            <span class="row">
              <input type="color" value={color || "#888888"} oninput={(e) => (color = e.currentTarget.value)} />
              <button class="mini" onclick={() => (color = "")} disabled={!color}>No colour</button>
              <span class="preview" style="color:{color || 'inherit'}">{name || "Preview"}</span>
            </span>
          </label>
        {:else}
          <p class="note"><b>@everyone</b> — what every member of this page may do before any role.</p>
        {/if}
        <div class="perms">
          {#each PERM_ORDER as p (p)}
            {@const info = snap.permInfo[p]}
            <label class="perm" class:dim={!grantable(p)}>
              <input type="checkbox" checked={perms.has(p)} disabled={!grantable(p)} onchange={() => togglePerm(p)} />
              <span><b>{info?.name ?? p}</b><small>{info?.desc ?? ""}</small></span>
            </label>
          {/each}
        </div>
        {#if err}<p class="err">{err}</p>{/if}
        <div class="acts">
          <button class="btn ghost" onclick={() => (editing = null)} disabled={busy}>Cancel</button>
          <button class="btn go" onclick={save} disabled={busy || (!isEveryoneEdit && !name.trim())}>{busy ? "Saving…" : editing === "new" ? "Create role" : "Save role"}</button>
        </div>
      </div>
    {/if}

    {#if canRoles && custom.length}
      <h4 class="subh">Hand out roles</h4>
      <ul class="mems">
        {#each pages.members as m (m.user.id)}
          <li>
            <Avatar name={m.user.displayName} id={m.user.id} avatar={m.user.avatar} size={22} />
            <span class="who">{m.user.displayName}</span>
            <span class="chips">
              {#each custom.filter((r) => memberRoles(m.user.id).includes(r.id)) as r (r.id)}
                <span class="chip" style="border-color:{r.color ?? 'var(--line)'}; color:{r.color ?? 'inherit'}">{r.name}</span>
              {/each}
            </span>
            <button class="mini" onclick={() => (assignFor = assignFor === m.user.id ? null : m.user.id)}>{assignFor === m.user.id ? "Done" : "Roles…"}</button>
          </li>
          {#if assignFor === m.user.id}
            <li class="assign">
              {#each custom as r (r.id)}
                <label class="perm" class:dim={!touchable(r)}>
                  <input type="checkbox" checked={memberRoles(m.user.id).includes(r.id)} disabled={!touchable(r) || assigning} onchange={() => toggleAssign(m.user.id, r)} />
                  <span style="color:{r.color ?? 'inherit'}">{r.name}</span>
                </label>
              {/each}
            </li>
          {/if}
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
  .roles h3 { margin: 1rem 0 0.4rem; font-size: 0.95rem; }
  .count { margin-left: 0.4rem; font-size: 0.72rem; color: var(--ink-soft); }
  .note { font-size: 0.83rem; color: var(--ink-soft); margin: 0.3rem 0 0.6rem; }
  .list { list-style: none; margin: 0 0 0.6rem; padding: 0; display: grid; gap: 0.3rem; }
  .list li { display: flex; align-items: center; gap: 0.45rem; font-size: 0.88rem; padding: 0.3rem 0.4rem; border-radius: 8px; background: var(--panel-2); }
  .list li.dim { opacity: 0.6; }
  .list li.everyone { background: transparent; border: 1px dashed var(--line); }
  .swatch { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--line); flex: none; }
  .rname { font-weight: 700; }
  .meta { flex: 1; color: var(--ink-dim); font-size: 0.76rem; }
  .mini { font: inherit; font-size: 0.74rem; padding: 0.15rem 0.5rem; border-radius: 6px; border: 1px solid var(--line); background: var(--panel); color: var(--ink-soft); cursor: pointer; }
  .mini:hover:not(:disabled) { color: var(--ink); border-color: var(--ink-dim); }
  .mini:disabled { opacity: 0.4; cursor: default; }
  .mini.danger { color: var(--danger); }
  .btn { font: inherit; padding: 0.4rem 0.8rem; border-radius: 8px; border: 1px solid var(--line); background: var(--panel-2); color: var(--ink); cursor: pointer; }
  .btn.go { background: var(--accent); color: #1a1208; border-color: transparent; font-weight: 700; }
  .btn.ghost { background: transparent; }
  .editor { margin: 0.6rem 0; padding: 0.7rem; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); display: grid; gap: 0.5rem; }
  .fld { display: grid; gap: 0.25rem; }
  .fld span { font-size: 0.8rem; color: var(--ink-soft); }
  .fld input:not([type="color"]) { font: inherit; padding: 0.4rem 0.55rem; border-radius: 8px; border: 1px solid var(--line); background: var(--panel-2); color: var(--ink); }
  .fld.color .row { display: flex; align-items: center; gap: 0.5rem; }
  .fld input[type="color"] { width: 36px; height: 28px; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: transparent; cursor: pointer; }
  .preview { font-weight: 700; }
  .perms { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.35rem; }
  .perm { display: flex; gap: 0.45rem; align-items: flex-start; font-size: 0.84rem; cursor: pointer; }
  .perm.dim { opacity: 0.5; cursor: default; }
  .perm span { display: grid; }
  .perm small { color: var(--ink-dim); font-size: 0.72rem; line-height: 1.25; }
  .err { color: var(--danger); font-size: 0.82rem; margin: 0; }
  .acts { display: flex; gap: 0.4rem; justify-content: flex-end; }
  .subh { margin: 0.9rem 0 0.4rem; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-dim); }
  .mems { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.3rem; }
  .mems li { display: flex; align-items: center; gap: 0.45rem; font-size: 0.86rem; }
  .mems li.assign { flex-wrap: wrap; gap: 0.6rem; padding: 0.3rem 0.4rem 0.5rem 2rem; }
  .who { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chips { flex: 1; display: flex; gap: 0.25rem; flex-wrap: wrap; }
  .chip { font-size: 0.7rem; padding: 0 0.4rem; border-radius: 999px; border: 1px solid var(--line); }
</style>
