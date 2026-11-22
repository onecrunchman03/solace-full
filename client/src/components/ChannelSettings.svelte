<script lang="ts">
  import { chat, saveChannel, saveChannelAllow, deleteChannelById, createChannel } from "../lib/chat.svelte";
  import { pages } from "../lib/pages.svelte";
  import { session } from "../lib/session.svelte";
  import { roles, loadRoles } from "../lib/roles.svelte";
  import { api } from "../lib/api";
  import Avatar from "./Avatar.svelte";

  let { channelId, onClose }: { channelId: number; onClose: () => void } = $props();

  const channel = $derived(chat.channels.find((c) => c.id === channelId));
  const isTopLevel = $derived(!!channel && channel.parentId == null);
  const childCount = $derived(chat.channels.filter((c) => c.parentId === channelId).length);
  // Members who can be added to the allow-list (owner + admins post regardless).
  const members = $derived(
    chat.members.filter((m) => !m.disabled && m.id !== channel?.createdBy),
  );

  const page = $derived(pages.list.find((p) => p.id === channel?.pageId));
  const pageName = $derived(page?.name ?? "this page");
  const isDefault = $derived(!!channel && page?.defaultChannelId === channel.id);
  // Page-wide setting → page-wide authority: the server's admin-or-manager
  // (a moderator only where they manage — Sep 2026 scoping).
  const canSetDefault = $derived(!!session.user && (session.user.isAdmin || page?.role === "manager"));
  let savingDefault = $state(false);
  async function toggleDefault(e: Event) {
    const box = e.currentTarget as HTMLInputElement;
    if (!channel || savingDefault) return;
    savingDefault = true;
    try {
      await saveChannel(channel.id, { makeDefault: !isDefault });
    } catch {
      box.checked = isDefault; // the tick lies otherwise
      note = { kind: "err", text: "Couldn't change the landing channel." };
    } finally {
      savingDefault = false;
    }
  }

  // Close if the channel disappears (e.g. deleted elsewhere).
  $effect(() => {
    if (!channel) onClose();
  });

  // Local drafts, (re)initialized whenever the modal targets a new channel.
  let draftName = $state("");
  let draftTopic = $state("");
  let allow = $state<Set<number>>(new Set());
  let initFor = -1;
  $effect(() => {
    if (channel && initFor !== channel.id) {
      draftName = channel.name;
      draftTopic = channel.topic ?? "";
      allow = new Set(channel.postAllow);
      initFor = channel.id;
    }
  });

  // PAGE ROLES: who may SEE the channel (empty = the whole page) and, when
  // locked, which roles may POST beside the allow-list.
  const customRoles = $derived((channel ? roles.byPage[channel.pageId]?.roles ?? [] : []).filter((r) => !r.isEveryone));
  let viewRoles = $state<Set<number>>(new Set());
  let postRoles = $state<Set<number>>(new Set());
  let rolesFor = -1;
  $effect(() => {
    if (channel && rolesFor !== channel.id) {
      viewRoles = new Set(channel.viewRoles ?? []);
      postRoles = new Set(channel.postRoles ?? []);
      rolesFor = channel.id;
      void loadRoles(channel.pageId);
    }
  });
  let savingRoles = $state(false);
  function toggleRole(set: "view" | "post", id: number): void {
    const cur = set === "view" ? viewRoles : postRoles;
    const next = new Set(cur);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (set === "view") viewRoles = next;
    else postRoles = next;
  }
  async function saveRoles(): Promise<void> {
    if (!channel || savingRoles) return;
    savingRoles = true;
    try {
      await api.setChannelRoles(channel.id, { view: [...viewRoles], post: [...postRoles] });
      note = { kind: "ok", text: "Role gates saved." };
    } catch {
      note = { kind: "err", text: "Couldn’t save the role gates." };
    } finally {
      savingRoles = false;
    }
  }

  let savingDetails = $state(false);
  let savingLock = $state(false);
  let savingAllow = $state(false);
  let note = $state<{ kind: "ok" | "err"; text: string } | null>(null);
  let subName = $state("");
  let confirmingDelete = $state(false);

  async function saveDetails() {
    if (!channel || savingDetails) return;
    const name = draftName.trim();
    if (!name) {
      note = { kind: "err", text: "Channel name can’t be empty." };
      return;
    }
    savingDetails = true;
    note = null;
    try {
      await saveChannel(channel.id, { name, topic: draftTopic.trim() || null });
      note = { kind: "ok", text: "Saved." };
    } catch {
      note = { kind: "err", text: "Couldn’t save changes." };
    } finally {
      savingDetails = false;
    }
  }

  async function toggleLock() {
    if (!channel || savingLock) return;
    savingLock = true;
    note = null;
    try {
      await saveChannel(channel.id, { locked: !channel.locked });
    } catch {
      note = { kind: "err", text: "Couldn’t change the lock." };
    } finally {
      savingLock = false;
    }
  }

  function toggleMember(id: number) {
    const next = new Set(allow);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    allow = next;
  }

  async function saveAllow() {
    if (!channel || savingAllow) return;
    savingAllow = true;
    note = null;
    try {
      await saveChannelAllow(channel.id, [...allow]);
      note = { kind: "ok", text: "Allow-list updated." };
    } catch {
      note = { kind: "err", text: "Couldn’t update the allow-list." };
    } finally {
      savingAllow = false;
    }
  }

  async function addSub() {
    const name = subName.trim();
    if (!channel || !name) return;
    try {
      await createChannel(name, channel.id);
      subName = "";
      note = { kind: "ok", text: `Added sub-channel “${name}”.` };
    } catch {
      note = { kind: "err", text: "Couldn’t add the sub-channel." };
    }
  }

  async function doDelete() {
    if (!channel) return;
    try {
      await deleteChannelById(channel.id);
      onClose();
    } catch {
      note = { kind: "err", text: "Couldn’t delete the channel." };
      confirmingDelete = false;
    }
  }
</script>

<div class="scrim" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="presentation">
  <div class="panel" role="dialog" aria-modal="true" aria-label="Channel settings">
    {#if channel}
      <header>
        <h2>{channel.locked ? "🔒" : "#"} {channel.name}</h2>
        <button class="x" onclick={onClose} title="Close">✕</button>
      </header>

      <!-- Details -->
      <section>
        <div class="lbl">Name</div>
        <input bind:value={draftName} maxlength="60" />
        <div class="lbl">Topic</div>
        <input bind:value={draftTopic} maxlength="200" placeholder="What's this channel about?" />
        <div class="row-actions">
          <button class="btn" onclick={saveDetails} disabled={savingDetails}>
            {savingDetails ? "Saving…" : "Save details"}
          </button>
        </div>
      </section>

      <!-- THE PAGE'S LANDING CHANNEL (Josh, Aug 2026). A page-wide choice,
           so it takes page authority rather than channel ownership. -->
      {#if channel.kind !== "voice" && canSetDefault}
        <section>
          <label class="switch">
            <input type="checkbox" checked={isDefault} disabled={savingDefault} onchange={toggleDefault} />
            <span>
              Default channel — where members land when they open
              <b>{pageName}</b>{isDefault ? "" : " (replaces whatever is set now)"}
            </span>
          </label>
        </section>
      {/if}

      <!-- Visibility by role (PAGE ROLES) -->
      {#if customRoles.length}
        <section>
          <div class="hint"><b>Who can see this channel.</b> Nobody ticked = everyone in the page. The creator, managers and admins always can.</div>
          <div class="allow-list">
            {#each customRoles as r (r.id)}
              <label class="member">
                <input type="checkbox" checked={viewRoles.has(r.id)} onchange={() => toggleRole("view", r.id)} />
                <span class="mname" style="color:{r.color ?? 'inherit'}">{r.name}</span>
              </label>
            {/each}
          </div>
          {#if channel.locked}
            <div class="hint"><b>Roles that may post</b> while it's locked (beside the allow-list below).</div>
            <div class="allow-list">
              {#each customRoles as r (r.id)}
                <label class="member">
                  <input type="checkbox" checked={postRoles.has(r.id)} onchange={() => toggleRole("post", r.id)} />
                  <span class="mname" style="color:{r.color ?? 'inherit'}">{r.name}</span>
                </label>
              {/each}
            </div>
          {/if}
          <div class="row-actions">
            <button class="btn" onclick={saveRoles} disabled={savingRoles}>{savingRoles ? "Saving…" : "Save role gates"}</button>
          </div>
        </section>
      {/if}

      <!-- Posting / lock -->
      <section>
        <label class="switch">
          <input type="checkbox" checked={channel.locked} disabled={savingLock} onchange={toggleLock} />
          <span>Lock posting — only approved members and post roles can post (everyone who can see it can still read)</span>
        </label>

        {#if channel.locked}
          <div class="hint">
            You{session.user?.isAdmin ? " and other admins" : " (owner) and admins"} can always post. Pick who else may:
          </div>
          <div class="allow-list">
            {#each members as m (m.id)}
              <label class="member">
                <input type="checkbox" checked={allow.has(m.id)} onchange={() => toggleMember(m.id)} />
                <Avatar name={m.displayName} id={m.id} avatar={m.avatar} size={22} />
                <span class="mname">{m.displayName}</span>
                {#if m.isAdmin}<span class="tag">admin</span>{/if}
              </label>
            {/each}
            {#if members.length === 0}<div class="hint">No other members yet.</div>{/if}
          </div>
          <div class="row-actions">
            <button class="btn" onclick={saveAllow} disabled={savingAllow}>
              {savingAllow ? "Saving…" : "Save allow-list"}
            </button>
          </div>
        {/if}
      </section>

      <!-- Sub-channels (top-level only) -->
      {#if isTopLevel}
        <section>
          <div class="lbl">Add a sub-channel</div>
          <div class="sub-row">
            <input
              bind:value={subName}
              maxlength="60"
              placeholder="sub-channel-name"
              onkeydown={(e) => e.key === "Enter" && addSub()}
            />
            <button class="btn" onclick={addSub} disabled={!subName.trim()}>Add</button>
          </div>
        </section>
      {/if}

      <!-- Danger -->
      <section class="danger-zone">
        {#if confirmingDelete}
          <div class="confirm">
            <span>
              Delete <b>#{channel.name}</b>{childCount > 0 ? ` and its ${childCount} sub-channel${childCount > 1 ? "s" : ""}` : ""}? This can't be undone.
            </span>
            <div class="row-actions">
              <button class="btn danger" onclick={doDelete}>Delete</button>
              <button class="btn ghost" onclick={() => (confirmingDelete = false)}>Cancel</button>
            </div>
          </div>
        {:else}
          <button class="btn danger ghost" onclick={() => (confirmingDelete = true)}>Delete channel</button>
        {/if}
      </section>

      {#if note}
        <p class="note {note.kind}">{note.text}</p>
      {/if}
    {/if}
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    z-index: var(--z-modal, 10000); /* above the theme atmosphere (9990) */
    padding: 16px;
  }
  .panel {
    width: min(460px, 100%);
    max-height: 88vh;
    overflow-y: auto;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 18px 20px 20px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .x {
    background: transparent;
    border: none;
    color: var(--ink-soft);
    font-size: 15px;
    cursor: pointer;
    line-height: 1;
  }
  .x:hover {
    color: var(--ink);
  }
  section {
    padding: 14px 0;
    border-top: 1px solid var(--line);
  }
  section:first-of-type {
    border-top: none;
    padding-top: 0;
  }
  .lbl {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-soft);
    margin-bottom: 5px;
  }
  .lbl:not(:first-child) {
    margin-top: 10px;
  }
  section > input,
  .sub-row input {
    width: 100%;
    padding: 8px 10px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    font: inherit;
  }
  section > input:focus,
  .sub-row input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .row-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
  .btn {
    padding: 7px 14px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .btn.ghost {
    background: none;
    border-color: var(--line);
    color: var(--ink-soft);
    font-weight: 500;
  }
  .btn.danger {
    background: var(--danger);
    color: #fff;
  }
  .btn.danger.ghost {
    background: none;
    border-color: var(--danger);
    color: var(--danger);
  }
  .switch {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    font-size: 0.88rem;
    color: var(--ink);
    cursor: pointer;
    line-height: 1.4;
  }
  .switch input {
    margin-top: 2px;
    flex: none;
  }
  .hint {
    margin-top: 8px;
    font-size: 0.78rem;
    color: var(--ink-dim);
    line-height: 1.45;
  }
  .allow-list {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 200px;
    overflow-y: auto;
  }
  .member {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 6px;
    border-radius: 7px;
    cursor: pointer;
  }
  .member:hover {
    background: var(--panel-2);
  }
  .mname {
    flex: 1;
    min-width: 0;
    font-size: 0.88rem;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--accent-ink);
    background: var(--accent);
    padding: 1px 6px;
    border-radius: 999px;
  }
  .sub-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .sub-row input {
    flex: 1;
  }
  .danger-zone .confirm {
    font-size: 0.85rem;
    color: var(--ink);
    line-height: 1.45;
  }
  .note {
    margin: 12px 0 0;
    font-size: 0.82rem;
  }
  .note.ok {
    color: var(--accent);
  }
  .note.err {
    color: var(--danger);
  }
</style>
