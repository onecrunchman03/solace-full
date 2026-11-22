<script lang="ts">
  // A page's settings: identity (name / description / icon / privacy / landing
  // channel) and its MEMBERSHIP. Who can do what mirrors the server exactly —
  // admins and the page's managers may edit it; only admins and moderators may
  // add or remove people or hand out the manager role; only an admin may
  // delete, and never the general page.
  import {
    pages, savePage, deletePage, setPageIcon, clearPageIcon,
    loadMembers, closeMembers, addMember, setMemberRole, removeMember, GENERAL_PAGE_ID,
  } from "../lib/pages.svelte";
  import { api, type PageJoinPolicy, type User } from "../lib/api";
  import { ask, confirmUi } from "../lib/confirm.svelte";
  import { chat } from "../lib/chat.svelte";
  import { session } from "../lib/session.svelte";
  import PageIcon from "./PageIcon.svelte";
  import Avatar from "./Avatar.svelte";
  import PageRoles from "./PageRoles.svelte";
  import { rolesOf } from "../lib/roles.svelte";

  let { pageId, onClose }: { pageId: number; onClose: () => void } = $props();

  const page = $derived(pages.list.find((p) => p.id === pageId));
  const me = $derived(session.user);
  const isAdmin = $derived(!!me?.isAdmin);
  const canEdit = $derived(isAdmin || page?.role === "manager");
  const isGeneral = $derived(pageId === GENERAL_PAGE_ID);
  // Adding and removing members (the server's mayManageMembers): admins, the
  // page's managers ("Manager manages everything" — PAGE ROLES), or a
  // `manage_members` role. Making or unmaking a MANAGER stays the staff rule
  // (admin, or a moderator who manages the page) — canPromote below.
  const canMembers = $derived(
    !isGeneral &&
      (isAdmin ||
        page?.role === "manager" ||
        // a role that carries it (never optimistic: only a LOADED snapshot says yes)
        (!!page && page.role === "member" && rolesOf(pageId, me?.id ?? 0).some((r) => r.perms.includes("manage_members")))),
  );
  const canPromote = $derived(!isGeneral && (isAdmin || (me?.role === "moderator" && page?.role === "manager")));

  let name = $state("");
  let description = $state("");
  let joinPolicy = $state<PageJoinPolicy>("open");
  let discoverable = $state(true);
  // PAGE CHAT POLICY (Sep 2026) — the satellite host's dials, for hub pages.
  let allowImages = $state(true);
  let allowGifs = $state(true);
  let staticDays = $state("");
  let animatedDays = $state("");
  let messageDays = $state("");
  const daysOr = (v: string): number | null => (v.trim() === "" ? null : Math.max(1, Math.min(3650, Math.round(Number(v)))));
  /** The landing channel pick; 0 = automatic (first text channel). */
  let landing = $state(0);
  /** Where the house bots chatter; 0 = #general, the old rule. ADMIN ONLY —
   *  the three voices belong to the house, not to the page. */
  let botRoom = $state(0);
  let busy = $state(false);
  let error = $state("");
  let addQuery = $state("");
  let memberQuery = $state("");
  let fileInput = $state<HTMLInputElement | null>(null);
  /** The knocks (request-policy pages) — managers/staff answer them here. */
  let requests = $state<{ user: User; at: number }[]>([]);
  const canAnswer = $derived(isAdmin || page?.role === "manager");

  // Seed the form ONCE per page. It used to re-seed from pages.list on every
  // change — and public-page frames broadcast to everyone, so somebody
  // joining an open page anywhere on the server wiped a half-typed
  // description right out of this dialog (Sep 2026 review).
  let seededFor = $state(-1);
  $effect(() => {
    const p = pages.list.find((x) => x.id === pageId);
    if (!p || seededFor === pageId) return;
    seededFor = pageId;
    name = p.name;
    description = p.description ?? "";
    joinPolicy = p.joinPolicy;
    discoverable = p.discoverable;
    allowImages = p.allowImages !== false;
    allowGifs = p.allowGifs !== false;
    staticDays = p.staticDays == null ? "" : String(p.staticDays);
    animatedDays = p.animatedDays == null ? "" : String(p.animatedDays);
    messageDays = p.messageDays == null ? "" : String(p.messageDays);
    landing = p.defaultChannelId ?? 0;
    botRoom = p.botChannelId ?? 0;
  });
  $effect(() => {
    void loadMembers(pageId);
    // Dialog closed (or moved to another page): stop tracking this member
    // list, or every page.change frame keeps refetching it forever.
    return () => closeMembers();
  });
  // The pending count on the DTO doubles as the refresh signal — a knock
  // arriving while the panel is open re-runs this. Keyed on the actual
  // values, so an unrelated page's frame doesn't cost a refetch.
  let reqKey = "";
  $effect(() => {
    const p = pages.list.find((x) => x.id === pageId);
    const live = !!p && p.joinPolicy === "request" && canAnswer;
    const key = live ? `${pageId}:${p.pending ?? 0}` : "off";
    if (key === reqKey) return;
    reqKey = key;
    if (!live) { requests = []; return; }
    api.pageRequests(pageId).then((r) => (requests = r.requests)).catch(() => {});
  });

  const textChannels = $derived(chat.channels.filter((c) => c.pageId === pageId && c.kind !== "voice"));

  async function answer(userId: number, approve: boolean) {
    error = "";
    try {
      await api.answerPageRequest(pageId, userId, approve);
      requests = requests.filter((r) => r.user.id !== userId);
      await loadMembers(pageId);
    } catch {
      error = "Couldn't answer that request.";
    }
  }

  const memberIds = $derived(new Set(pages.members.map((m) => m.user.id)));
  const candidates = $derived(
    chat.members
      .filter((u) => !memberIds.has(u.id) && !u.isBot)
      .filter((u) =>
        !addQuery.trim() ||
        u.displayName.toLowerCase().includes(addQuery.toLowerCase()) ||
        u.username.toLowerCase().includes(addQuery.toLowerCase()),
      )
      .slice(0, 8),
  );

  // Managers lead the list; the filter box appears once the list is long
  // enough to need one.
  const shownMembers = $derived(
    [...pages.members]
      .sort((a, b) =>
        (a.role === "manager" ? 0 : 1) - (b.role === "manager" ? 0 : 1) ||
        a.user.displayName.localeCompare(b.user.displayName),
      )
      .filter((m) => {
        const q = memberQuery.trim().toLowerCase();
        return !q || m.user.displayName.toLowerCase().includes(q) || m.user.username.toLowerCase().includes(q);
      }),
  );

  const ago = (at: number): string => {
    const m = Math.max(1, Math.round((Date.now() - at) / 60000));
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  };
  const sinceDate = (at: number): string =>
    new Date(at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  async function save() {
    if (busy) return;
    busy = true;
    error = "";
    try {
      await savePage(pageId, {
        name: name.trim() || undefined,
        description: description.trim() || null,
        joinPolicy: isGeneral ? undefined : joinPolicy,
        discoverable: isGeneral ? undefined : (joinPolicy === "open" ? true : discoverable),
        defaultChannelId: landing === 0 ? null : landing,
        // Absent for anyone but an admin, so a manager's save never trips the
        // route's 403 on a field their dialog never showed them.
        botChannelId: isAdmin ? (botRoom === 0 ? null : botRoom) : undefined,
        allowImages,
        allowGifs,
        staticDays: daysOr(staticDays),
        animatedDays: daysOr(animatedDays),
        messageDays: daysOr(messageDays),
      });
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't save";
    } finally {
      busy = false;
    }
  }

  async function pickIcon(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    busy = true;
    error = "";
    try {
      await setPageIcon(pageId, file);
    } catch (err) {
      error = err instanceof Error ? err.message : "That image was refused";
    } finally {
      busy = false;
      if (fileInput) fileInput.value = "";
    }
  }

  async function doRemove(userId: number, who: string) {
    if (!(await ask({
      title: `Remove ${who}?`,
      body: page?.joinPolicy === "open"
        ? "They can walk back in — the page is open."
        : "They won't see this page again unless they're let back in.",
      confirm: "remove them",
      danger: true,
    }))) return;
    await removeMember(pageId, userId);
  }

  async function doDelete() {
    const p = page;
    if (!p) return;
    if (!(await ask({
      title: `Delete ${p.name}?`,
      body: "Every channel inside it, and all their messages and files, go with it. This cannot be undone.",
      confirm: "delete the page",
      danger: true,
      typeToConfirm: p.name,
    }))) return;
    busy = true;
    try {
      await deletePage(pageId);
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't delete";
      busy = false;
    }
  }
</script>

<!-- Escape closes the dialog — unless the house confirm is open on top of
     it, whose own Escape answer must not take this panel down with it. -->
<svelte:window onkeydown={(e) => { if (e.key === "Escape" && !confirmUi.asking) onClose(); }} />

<div class="scrim" onclick={onClose} role="presentation"></div>
<div class="modal" role="dialog" aria-modal="true" aria-label="Page settings">
  {#if !page}
    <p class="gone">This page is no longer available.</p>
    <button class="btn" onclick={onClose}>Close</button>
  {:else}
    <header>
      <PageIcon {page} size={44} />
      <div class="head">
        <h2>{page.name}</h2>
        <p class="meta">created {sinceDate(page.createdAt)} · {page.members} member{page.members === 1 ? "" : "s"}</p>
      </div>
      <button class="x" onclick={onClose} aria-label="Close">✕</button>
    </header>

    {#if canEdit}
      <section>
        <h3>Identity</h3>
        <label class="fld">
          <span>Name</span>
          <input bind:value={name} maxlength="60" />
        </label>
        <label class="fld">
          <span>Description</span>
          <input bind:value={description} maxlength="240" placeholder="What is this page for?" />
        </label>
        <div class="iconrow">
          <PageIcon {page} size={52} />
          <div class="iconbtns">
            <button class="btn" onclick={() => fileInput?.click()} disabled={busy}>Change icon</button>
            {#if page.icon}
              <button class="btn ghost" onclick={() => clearPageIcon(pageId)} disabled={busy}>Remove</button>
            {/if}
            <input
              bind:this={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              hidden
              onchange={pickIcon}
            />
          </div>
        </div>
        {#if textChannels.length}
          <label class="fld">
            <span>Lands in</span>
            <select bind:value={landing}>
              <option value={0}>Automatic — the first text channel</option>
              {#each textChannels as c (c.id)}
                <option value={c.id}>#{c.name}</option>
              {/each}
            </select>
          </label>
        {/if}
        <!-- WHERE THE HOUSE TALKS TO ITSELF. Admins only, and only on the page
             the three voices actually speak on — everywhere else it would be
             a control that does nothing. -->
        {#if isAdmin && isGeneral && textChannels.length}
          <label class="fld">
            <span>House bots</span>
            <select bind:value={botRoom}>
              <option value={0}>#general — the usual</option>
              {#each textChannels as c (c.id)}
                <option value={c.id}>#{c.name}</option>
              {/each}
            </select>
          </label>
          <p class="note">
            Where Sterling, the goblins and Dr. Voss post the things nobody
            asked for — commentary, sales, arrivals, the barker. Commands are
            always answered in the channel they were typed in. A locked
            channel works: the bots write past the lock, so you get a room
            they talk in and nobody else can.
          </p>
        {/if}
        {#if !isGeneral}
          <label class="fld">
            <span>Joining</span>
            <select bind:value={joinPolicy}>
              <option value="open">Open — anyone can walk in</option>
              <option value="request">Request — people ask; managers approve</option>
              <option value="invite">Invite only — members are added by hand</option>
            </select>
          </label>
          {#if joinPolicy !== "open"}
            <label class="chk">
              <input type="checkbox" bind:checked={discoverable} />
              <span>
                <b>{discoverable ? "Discoverable" : "Hidden"}</b>
                {discoverable
                  ? "— everyone sees the page exists (never its channels)"
                  : "— invisible to everyone but members and staff"}
              </span>
            </label>
          {:else}
            <p class="note">An open page is always discoverable — nobody can walk into a door they can't see.</p>
          {/if}
        {:else}
          <p class="note">Solace General is the front door — it is always open, and nobody can leave it.</p>
        {/if}
        <h4 class="subh">Chat &amp; files</h4>
        <label class="chk">
          <input type="checkbox" bind:checked={allowImages} />
          <span><b>Attachments</b> — images and text files may be posted in this page's rooms</span>
        </label>
        <label class="chk" class:dim={!allowImages}>
          <input type="checkbox" bind:checked={allowGifs} disabled={!allowImages} />
          <span><b>GIFs</b> — animated images allowed</span>
        </label>
        <div class="days">
          <label class="fld">
            <span>Images expire after (days)</span>
            <input type="number" min="1" max="3650" placeholder="server default" bind:value={staticDays} />
          </label>
          <label class="fld">
            <span>GIFs expire after (days)</span>
            <input type="number" min="1" max="3650" placeholder="server default" bind:value={animatedDays} />
          </label>
          <label class="fld">
            <span>Messages are deleted after (days)</span>
            <input type="number" min="1" max="3650" placeholder="never" bind:value={messageDays} />
          </label>
        </div>
        <p class="note">Blank keeps the server's defaults (files expire; messages never do). Deleted messages are gone for everyone.</p>
        {#if error}<p class="err">{error}</p>{/if}
        <button class="btn go" onclick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
      </section>
    {/if}

    <PageRoles {pageId} />

    {#if page.joinPolicy === "request" && canAnswer}
      <section>
        <h3>Requests {#if requests.length}<span class="count">{requests.length}</span>{/if}</h3>
        {#if requests.length}
          <ul class="mems">
            {#each requests as r (r.user.id)}
              <li>
                <Avatar name={r.user.displayName} id={r.user.id} avatar={r.user.avatar} size={26} profile />
                <span class="who">{r.user.displayName}</span>
                <span class="when">{ago(r.at)}</span>
                <button class="btn go sm" onclick={() => answer(r.user.id, true)}>let in</button>
                <button class="btn ghost sm" onclick={() => answer(r.user.id, false)}>deny</button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="note">No pending requests.</p>
        {/if}
      </section>
    {/if}

    <section>
      <h3>Members <span class="count">{pages.members.length}</span></h3>
      {#if canMembers}
        <div class="add">
          <input bind:value={addQuery} placeholder="Add someone…" />
          {#if addQuery.trim()}
            <ul class="cands">
              {#each candidates as u (u.id)}
                <li>
                  <button onclick={() => { addMember(pageId, u.id); addQuery = ""; }}>
                    <Avatar name={u.displayName} id={u.id} avatar={u.avatar} size={22} /> {u.displayName}
                  </button>
                </li>
              {:else}
                <li class="none">Nobody left to add.</li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
      {#if pages.members.length > 8}
        <div class="add">
          <input bind:value={memberQuery} placeholder="Find a member…" />
        </div>
      {/if}
      <ul class="mems">
        {#each shownMembers as m (m.user.id)}
          <li title={`Member since ${sinceDate(m.since)}`}>
            <Avatar name={m.user.displayName} id={m.user.id} avatar={m.user.avatar} size={26} profile />
            <span class="who">{m.user.displayName}</span>
            {#if chat.online.includes(m.user.id)}<span class="live" title="Online"></span>{/if}
            {#if m.role === "manager"}<span class="tag">manager</span>{/if}
            {#each rolesOf(pageId, m.user.id) as r (r.id)}
              <span class="tag role" style="border-color:{r.color ?? 'var(--line)'}; color:{r.color ?? 'inherit'}">{r.name}</span>
            {/each}
            {#if canMembers && m.user.id !== me?.id && (m.role !== "manager" || canPromote)}
              <span class="acts">
                {#if canPromote}
                  <button
                    class="mini"
                    onclick={() => setMemberRole(pageId, m.user.id, m.role === "manager" ? "member" : "manager")}
                  >{m.role === "manager" ? "Demote" : "Make manager"}</button>
                {/if}
                <button class="mini danger" onclick={() => doRemove(m.user.id, m.user.displayName)}>Remove</button>
              </span>
            {/if}
          </li>
        {/each}
        {#if !shownMembers.length && memberQuery.trim()}
          <li class="none">Nobody matches.</li>
        {/if}
      </ul>
    </section>

    {#if isAdmin && !isGeneral}
      <section class="danger-zone">
        <h3>Danger zone</h3>
        <button class="btn danger" onclick={doDelete} disabled={busy}>Delete page</button>
      </section>
    {/if}
  {/if}
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); z-index: var(--z-modal, 10000); } /* above the theme atmosphere (9990) */
  .modal {
    position: fixed;
    z-index: calc(var(--z-modal, 10000) + 1);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(560px, calc(100vw - 2rem));
    max-height: min(84dvh, 900px);
    overflow-y: auto;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 1.1rem 1.25rem 1.4rem;
  }
  header { display: flex; align-items: center; gap: 0.7rem; margin-bottom: 0.9rem; }
  .head { flex: 1; min-width: 0; }
  h2 { margin: 0; font-size: 1.15rem; }
  .meta { margin: 0.1rem 0 0; font-size: 0.76rem; color: var(--ink-soft); }
  .x { border: none; background: none; color: var(--ink-soft); font-size: 1.05rem; cursor: pointer; }
  section { border-top: 1px solid var(--line); padding-top: 0.9rem; margin-top: 0.9rem; }
  section:first-of-type { border-top: none; margin-top: 0; padding-top: 0; }
  h3 { margin: 0 0 0.6rem; font-size: 0.78rem; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink-soft); }
  .count { color: var(--ink-soft); font-weight: 400; }
  .fld { display: grid; gap: 0.25rem; margin-bottom: 0.6rem; }
  .fld span { font-size: 0.8rem; color: var(--ink-soft); }
  .fld input, .add input {
    padding: 0.45rem 0.6rem;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--ink);
    font: inherit;
    width: 100%;
  }
  .iconrow { display: flex; align-items: center; gap: 0.8rem; margin: 0.5rem 0 0.7rem; }
  .iconbtns { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .chk { display: flex; gap: 0.5rem; align-items: flex-start; font-size: 0.84rem; color: var(--ink-soft); margin-bottom: 0.45rem; }
  .chk.dim { opacity: 0.5; }
  .subh { margin: 0.9rem 0 0.5rem; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-dim); }
  .days { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.5rem; margin-top: 0.4rem; }
  .chk b { color: var(--ink); }
  .note { font-size: 0.83rem; color: var(--ink-soft); margin: 0.4rem 0; }
  .err { color: var(--danger, #d9534f); font-size: 0.84rem; margin: 0.4rem 0 0; }
  .btn {
    padding: 0.4rem 0.75rem;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--ink);
    cursor: pointer;
    font-size: 0.85rem;
  }
  .btn:hover { border-color: var(--accent); }
  .btn.go { margin-top: 0.7rem; background: var(--accent); color: #1b1207; border: none; font-weight: 600; }
  .btn.ghost { background: none; }
  .btn.danger { border-color: #7a4b4b; color: #d98a8a; }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .add { position: relative; margin-bottom: 0.6rem; }
  .cands { list-style: none; margin: 0.3rem 0 0; padding: 0; display: grid; gap: 0.15rem; }
  .cands button {
    display: flex; align-items: center; gap: 0.45rem; width: 100%; text-align: left;
    padding: 0.3rem 0.45rem; border-radius: 7px; border: none; background: var(--bg);
    color: var(--ink); cursor: pointer; font-size: 0.86rem;
  }
  .cands button:hover { background: var(--hover, rgba(255,255,255,0.06)); }
  .cands .none, .mems .none { color: var(--ink-soft); font-size: 0.82rem; padding: 0.3rem 0.45rem; }
  .mems { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.3rem; }
  .mems li { display: flex; align-items: center; gap: 0.45rem; font-size: 0.88rem; }
  .btn.sm { padding: 0.25rem 0.55rem; font-size: 0.78rem; margin-top: 0; }
  .fld select {
    padding: 0.45rem 0.6rem;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--ink);
    font: inherit;
    width: 100%;
  }
  .who { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .when { color: var(--ink-soft); font-size: 0.74rem; flex: none; }
  .live { width: 7px; height: 7px; border-radius: 50%; background: var(--ok, #6fbf73); flex: none; }
  .tag {
    font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.06em;
    padding: 0.08rem 0.3rem; border-radius: 5px; border: 1px solid var(--line); color: var(--ink-soft);
  }
  .acts { display: flex; gap: 0.25rem; }
  .mini {
    font-size: 0.7rem; padding: 0.15rem 0.4rem; border-radius: 6px;
    border: 1px solid var(--line); background: none; color: var(--ink-soft); cursor: pointer;
  }
  .mini:hover { color: var(--ink); border-color: var(--accent); }
  .mini.danger:hover { color: #d98a8a; border-color: #7a4b4b; }
  .gone { color: var(--ink-soft); }
</style>
