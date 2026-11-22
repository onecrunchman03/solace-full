<script lang="ts">
  // Moderator toolkit (also shown to admins inside the Admin Panel): ban,
  // timed suspension, role assignment (admins only), and invite minting —
  // the three powers Josh gave the moderator role. Server-side, all of it
  // rides the "mod" route auth level; the guards here are just good UI.
  import { api, ApiError, type Invite } from "../lib/api";
  import { chat } from "../lib/chat.svelte";
  import { session } from "../lib/session.svelte";
  import Avatar from "./Avatar.svelte";

  const isAdmin = $derived(!!session.user?.isAdmin);
  const candidates = $derived(
    chat.members.filter((m) => m.id !== session.user?.id && !m.isAdmin),
  );

  // Same reason as the admin picker: a select is fine at a dozen members and
  // unusable at three hundred. Matches display name or handle.
  let memberQ = $state("");
  const shown = $derived.by(() => {
    const q = memberQ.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (m) => m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q),
    );
  });

  let selectedId = $state<number | null>(null);
  const selected = $derived(chat.members.find((m) => m.id === selectedId) ?? null);
  let suspendHours = $state(24);
  let resetPw = $state("");
  let resetSecret = $state("");
  let showResetPw = $state(false);
  let busy = $state(false);
  let note = $state<{ kind: "ok" | "err"; text: string } | null>(null);

  function say(kind: "ok" | "err", text: string): void {
    note = { kind, text };
  }

  async function run(label: string, fn: () => Promise<unknown>): Promise<void> {
    if (busy) return;
    busy = true;
    note = null;
    try {
      await fn();
      say("ok", label);
    } catch (e) {
      say("err", e instanceof ApiError && e.code === "cannot_touch_mod"
        ? "Only an admin can act on another moderator."
        : e instanceof ApiError && e.code === "bad_password"
          ? ((e.data as { message?: string })?.message ?? "That password is too weak.")
          : "That didn't work.");
    } finally {
      busy = false;
    }
  }

  // ---- invites (the mod-facing copy of the admin invite tools) ----
  let invites = $state<Invite[]>([]);
  let invitesLoaded = $state(false);
  async function loadInvites(): Promise<void> {
    try {
      invites = (await api.adminInvites()).invites;
      invitesLoaded = true;
    } catch {
      /* not permitted / offline */
    }
  }
  async function mint(): Promise<void> {
    await run("Invite minted.", async () => {
      await api.adminCreateInvite();
      await loadInvites();
    });
  }
  async function revoke(code: string): Promise<void> {
    await run("Invite revoked.", async () => {
      await api.adminRevokeInvite(code);
      await loadInvites();
    });
  }
  $effect(() => {
    if (!invitesLoaded) void loadInvites();
  });
</script>

<section class="mod">
  <div class="pick-row">
    <input
      class="seek"
      type="search"
      placeholder="Search members…"
      bind:value={memberQ}
      aria-label="Search members"
    />
    <select bind:value={selectedId} size={memberQ ? 8 : undefined}>
      <option value={null}>Pick a member…</option>
      {#each shown as m (m.id)}
        <option value={m.id}>{m.displayName} (@{m.username}){m.role === "moderator" ? " · MOD" : ""}{m.locked ? " · banned" : ""}</option>
      {/each}
    </select>
    {#if selected}
      <span class="sel">
        <Avatar name={selected.displayName} id={selected.id} avatar={selected.avatar} size={22} />
        {selected.displayName}
        {#if selected.role === "moderator"}<span class="badge">MOD</span>{/if}
        {#if selected.locked}<span class="badge banned">BANNED</span>{/if}
      </span>
    {/if}
  </div>

  {#if selected}
    <div class="actions">
      <button
        class="btn danger"
        disabled={busy}
        onclick={() => run(selected.locked ? "Ban lifted." : "Banned.", () => api.adminLockUser(selected.id, !selected.locked))}
      >
        {selected.locked ? "Lift ban" : "Ban"}
      </button>
      <span class="susp">
        <input type="number" min="1" max="720" bind:value={suspendHours} aria-label="Suspension hours" />
        <button
          class="btn"
          disabled={busy || suspendHours < 1}
          onclick={() => run(`Suspended for ${suspendHours}h.`, () => api.adminSuspendUser(selected.id, suspendHours))}
        >
          Suspend (hours)
        </button>
        <button class="btn ghost" disabled={busy} onclick={() => run("Suspension lifted.", () => api.adminSuspendUser(selected.id, 0))}>
          Lift suspension
        </button>
      </span>
      {#if isAdmin}
        <button
          class="btn"
          disabled={busy}
          onclick={() =>
            run(
              selected.role === "moderator" ? "Back to regular member." : "Promoted to moderator.",
              () => api.adminSetRole(selected.id, selected.role === "moderator" ? "user" : "moderator"),
            )}
        >
          {selected.role === "moderator" ? "Remove moderator" : "Make moderator"}
        </button>
      {/if}
    </div>
    {#if isAdmin}
      <!-- ACCOUNT RECOVERY (admin only, Josh Aug 2026): clear a brute-force
           lockout, or set a brand-new password for a friend locked out with
           no recovery secret. The reset evicts every session. -->
      <div class="actions recover">
        <button
          class="btn ghost"
          disabled={busy}
          onclick={() => run("Login lockout cleared.", () => api.adminUnlockLogin(selected.id))}
        >
          Unlock login
        </button>
        <span class="susp">
          <span class="pwwrap">
            <input
              type={showResetPw ? "text" : "password"}
              placeholder="new password"
              bind:value={resetPw}
              aria-label="New password"
              autocomplete="new-password"
            />
            <button type="button" class="eye" onclick={() => (showResetPw = !showResetPw)} title={showResetPw ? "Hide" : "Show"}>
              {showResetPw ? "🙈" : "👁"}
            </button>
          </span>
          <button
            class="btn danger"
            disabled={busy || resetPw.length < 12}
            onclick={() =>
              run("Password reset — every session was signed out.", async () => {
                await api.adminResetPassword(selected.id, resetPw);
                resetPw = "";
              })}
          >
            Reset password
          </button>
        </span>
        <span class="susp">
          <input
            type="text"
            placeholder="new recovery secret phrase"
            bind:value={resetSecret}
            aria-label="New recovery secret"
          />
          <button
            class="btn danger"
            disabled={busy || resetSecret.length < 12}
            onclick={() =>
              run("Recovery secret reset — hand it to them privately.", async () => {
                await api.adminResetSecret(selected.id, resetSecret);
                resetSecret = "";
              })}
          >
            Reset secret
          </button>
        </span>
      </div>
      <p class="hint">Password rules still apply (12+ chars, mixed case, number, symbol). The recovery secret takes a 12+ char phrase — it screens like a password. Tell them to change both after they're back in.</p>
    {/if}
  {/if}

  <h3>Invite codes</h3>
  <div class="inv-row">
    <button class="btn" disabled={busy} onclick={() => void mint()}>Mint a single-use invite</button>
  </div>
  {#if invites.length}
    <div class="inv-list">
      {#each invites.slice(0, 8) as inv (inv.code)}
        <div class="inv">
          <code>{inv.code}</code>
          <span class="inv-meta">{inv.uses}/{inv.maxUses} used{inv.revoked ? " · revoked" : ""}</span>
          {#if !inv.revoked && inv.uses < inv.maxUses}
            <button class="btn ghost sm" onclick={() => void revoke(inv.code)}>Revoke</button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if note}<p class="note {note.kind}">{note.text}</p>{/if}
</section>

<style>
  .mod {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h3 {
    margin: 6px 0 0;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--ink-soft);
  }
  .actions.recover {
    border-top: 1px dashed color-mix(in srgb, var(--ink-soft) 35%, transparent);
    padding-top: 10px;
  }
  .pwwrap {
    position: relative;
    display: inline-flex;
  }
  .pwwrap input {
    /* Same reason as Login's: a flex item cannot shrink below its content
       width by default, so a narrow panel pushes the field out past the
       wrapper and strands the eye mid-box. */
    min-width: 0;
    padding-right: 2rem;
  }
  .eye {
    position: absolute;
    right: 2px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    opacity: 0.6;
  }
  .eye:hover {
    opacity: 1;
  }
  .hint {
    margin: 0;
    font-size: 0.72rem;
    color: var(--ink-soft);
  }
  .pick-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  select,
  .seek,
  input[type="number"] {
    background: var(--panel-2);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 7px 10px;
    font: inherit;
  }
  .seek {
    min-width: 170px;
  }
  input[type="number"] {
    width: 74px;
  }
  .sel {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.86rem;
  }
  .badge {
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    border: 1px solid var(--accent);
  }
  .badge.banned {
    background: color-mix(in srgb, var(--danger) 18%, transparent);
    border-color: var(--danger);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .susp {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .btn {
    padding: 7px 14px;
    border-radius: 9px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .btn:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .btn.danger {
    border-color: color-mix(in srgb, var(--danger) 55%, var(--line));
    color: var(--danger);
  }
  .btn.ghost {
    background: none;
  }
  .btn.sm {
    padding: 3px 10px;
    font-size: 0.78rem;
  }
  .inv-row {
    display: flex;
    gap: 8px;
  }
  .inv-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .inv {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.82rem;
  }
  .inv code {
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 2px 8px;
    letter-spacing: 0.08em;
  }
  .inv-meta {
    color: var(--ink-dim);
    font-size: 0.74rem;
  }
  .note.ok {
    color: var(--ok);
  }
  .note.err {
    color: var(--danger);
  }
  .note {
    font-size: 0.82rem;
    margin: 0;
  }
</style>
