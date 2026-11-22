<script lang="ts">
  // The admin's levers, one Admin Panel section at a time: the panel mounts
  // this with the `part` it is showing, and only that part's data loads.
  // Kept as one file because the parts share the busy flag, the result
  // notice and the member list.
  import { onMount } from "svelte";
  import Avatar from "./Avatar.svelte";

  export type ToolsPart = "members" | "reports" | "invites" | "house" | "backrooms";
  let { part }: { part: ToolsPart } = $props();
  import { api, ApiError, type User, type Invite, type ReportItem, type PandoraKeyId, type NpcBrainStatus } from "../lib/api";
  import { ask } from "../lib/confirm.svelte";
  import { session } from "../lib/session.svelte";
  import { loadWheel } from "../lib/wheel.svelte";
  import { emporium, loadEmporium } from "../lib/emporium.svelte";
  import { wallet } from "../lib/wallet.svelte";

  let users = $state<User[]>([]);
  let selectedId = $state<number | null>(session.user?.id ?? null);
  // A picker is fine at a dozen members and unusable at three hundred (Josh:
  // "just incase the user base grows massive going through that whole list
  // would be cumbersome"). Filters on both the display name and the handle,
  // since staff think in whichever one they were told.
  let userQ = $state("");
  const shownUsers = $derived.by(() => {
    const q = userQ.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q),
    );
  });
  let busy = $state(false);
  let note = $state<{ kind: "ok" | "err"; text: string } | null>(null);
  // The result of a click shows as a toast pinned to the foot of the panel,
  // so it is seen wherever the button was; it clears itself after a while.
  let noteTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const n = note;
    if (noteTimer) clearTimeout(noteTimer);
    if (n) noteTimer = setTimeout(() => { if (note === n) note = null; }, n.kind === "err" ? 9000 : 6000);
    return () => { if (noteTimer) clearTimeout(noteTimer); };
  });

  // Invites
  let invites = $state<Invite[]>([]);
  let newMaxUses = $state(1);
  let newTtl = $state(""); // hours, "" = never
  let newNote = $state("");
  let copied = $state<string | null>(null);

  async function loadUsers() {
    try {
      const r = await api.users();
      users = r.users;
      if (selectedId == null && users.length) selectedId = users[0].id;
    } catch {
      note = { kind: "err", text: "Couldn’t load the user list." };
    }
  }
  async function loadInvites() {
    try {
      invites = (await api.adminInvites()).invites;
    } catch {
      /* non-fatal — the mint form still works */
    }
  }
  onMount(() => {
    if (part === "members") loadUsers();
    if (part === "invites") loadInvites();
    if (part === "reports") loadReports();
    if (part === "house") {
      loadBrain();
      if (emporium.loading) void loadEmporium();
    }
  });

  // ---- Moderation powers (ban is the lock below; these are the rest) ----
  let suspendHours = $state(24);
  let resetPw = $state("");
  let resetSecret = $state("");
  let showResetPw = $state(false);
  async function act(label: string, fn: () => Promise<unknown>, reload = false): Promise<void> {
    if (busy || selectedId == null) return;
    busy = true;
    note = null;
    try {
      await fn();
      if (reload) await loadUsers();
      note = { kind: "ok", text: label };
    } catch (e) {
      note = {
        kind: "err",
        text: e instanceof ApiError && e.code === "bad_password"
          ? ((e.data as { message?: string })?.message ?? "That password is too weak.")
          : "That didn't work.",
      };
    } finally {
      busy = false;
    }
  }
  const suspend = (hours: number) => {
    const name = selectedUser?.displayName ?? "them";
    return act(hours > 0 ? `${name} is suspended for ${hours}h.` : `${name}'s suspension is lifted.`, () => api.adminSuspendUser(selectedId!, hours));
  };
  const toggleRole = () => {
    const mod = selectedUser?.role === "moderator";
    const name = selectedUser?.displayName ?? "them";
    return act(mod ? `${name} is a regular member again.` : `${name} is now a moderator.`, () => api.adminSetRole(selectedId!, mod ? "user" : "moderator"), true);
  };
  const unlockLogin = () => act("Login lockout cleared.", () => api.adminUnlockLogin(selectedId!));
  const doResetPassword = () =>
    act("Password reset — every session was signed out.", async () => {
      await api.adminResetPassword(selectedId!, resetPw);
      resetPw = "";
    });
  const doResetSecret = () =>
    act("Recovery secret reset — hand it to them privately.", async () => {
      await api.adminResetSecret(selectedId!, resetSecret);
      resetSecret = "";
    });

  // ---- THE HOUSE'S BRAINS: is the model answering, and the off switch ----
  let brain = $state<NpcBrainStatus | null>(null);
  async function loadBrain() {
    try {
      brain = await api.adminNpcBrain();
    } catch {
      brain = null;
    }
  }
  async function setBrain(on: boolean) {
    if (busy) return;
    busy = true;
    note = null;
    try {
      brain = await api.adminSetNpcBrain(on);
      note = { kind: "ok", text: on ? "The three are talking again." : "The three are back to scripted lines only." };
    } catch {
      note = { kind: "err", text: "Couldn't change the switch." };
    } finally {
      busy = false;
    }
  }

  // ---- Report queue (blocks + reports moderation layer) ----
  let reports = $state<ReportItem[]>([]);
  async function loadReports() {
    try {
      reports = (await api.adminReports()).reports;
    } catch {
      /* non-fatal */
    }
  }
  async function resolveReport(r: ReportItem) {
    try {
      await api.setReportStatus(r.id, r.status === "open" ? "resolved" : "open");
      await loadReports();
    } catch {
      note = { kind: "err", text: "Couldn’t update the report." };
    }
  }
  const openReports = $derived(reports.filter((r) => r.status === "open"));

  // ---- THE NOTICE BOARD: a brief to #Solace Updates, as Sterling ----
  const BRIEF_MAX = 4000;
  let brief = $state("");
  async function postBrief() {
    const text = brief.trim();
    if (!text || busy) return;
    if (!(await ask({ title: "Post this to Solace Updates?", body: "Sterling posts it to the whole server. It can't be edited from here once it's up.", confirm: "post it" }))) return;
    busy = true;
    note = null;
    try {
      await api.adminSterlingUpdate(text);
      note = { kind: "ok", text: "Posted to Solace Updates." };
      brief = "";
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      note = { kind: "err", text: code === "no_board" ? "The Solace Updates channel is missing." : code === "too_long" ? "Too long (4,000 characters at most)." : "Couldn't post it." };
    } finally {
      busy = false;
    }
  }

  // ---- Sterling's specials + the Wall of Fame season reset ----
  let specialKind = $state("");

  async function fireSpecial() {
    if (!specialKind || busy) return;
    busy = true;
    note = null;
    try {
      await api.adminFireSpecial(specialKind);
      note = { kind: "ok", text: "Sterling is announcing it now." };
      specialKind = "";
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      note = { kind: "err", text: code === "special_active" ? "A special is already running." : "Couldn't fire the special." };
    } finally {
      busy = false;
    }
  }

  async function resetWall() {
    if (busy) return;
    if (!(await ask({ title: "Reset the entire Wall of Fame?", body: "Every leaderboard stat goes to zero — a fresh season. Crowns and collections are untouched. This cannot be undone.", confirm: "start a new season", danger: true, typeToConfirm: "RESET" }))) return;
    busy = true;
    note = null;
    try {
      const r = await api.adminResetStats();
      note = { kind: "ok", text: `Wall of Fame reset (${r.cleared} records cleared).` };
    } catch {
      note = { kind: "err", text: "Couldn't reset the stats." };
    } finally {
      busy = false;
    }
  }

  // ---- PANDORA'S BOX test levers ----
  async function pandoraKey(key: PandoraKeyId, revoke: boolean): Promise<void> {
    if (selectedId == null || busy) return;
    busy = true;
    note = null;
    try {
      const r = await api.adminPandoraKey(selectedId, key, revoke);
      note = { kind: "ok", text: revoke ? `${key} key ${r.revoked ? "revoked" : "wasn't held"} — ${selectedUser?.displayName}` : `${key} key ${r.granted ? "granted" : "already held"} → ${selectedUser?.displayName}` };
    } catch (e) {
      note = { kind: "err", text: e instanceof ApiError ? e.message : "Failed" };
    } finally {
      busy = false;
    }
  }
  // THE STONE OF THE ABYSS: hand a test stone over, or take it back (which
  // also shuts their Portal). The admin may hold one — Josh tests with it.
  async function abyssStone(revoke: boolean): Promise<void> {
    if (selectedId == null || busy) return;
    busy = true;
    note = null;
    try {
      const r = await api.adminAbyssStone(selectedId, revoke);
      note = { kind: "ok", text: revoke ? `Stone ${r.revoked ? "taken back" : "wasn't held"} — ${selectedUser?.displayName}` : `Stone ${r.granted ? "handed over" : "already held"} → ${selectedUser?.displayName}` };
    } catch (e) {
      note = { kind: "err", text: e instanceof ApiError ? e.message : "Failed" };
    } finally {
      busy = false;
    }
  }
  async function pandoraKeyAll(revoke: boolean): Promise<void> {
    for (const k of ["prismatic", "brass", "rusted"] as PandoraKeyId[]) await pandoraKey(k, revoke);
  }
  async function pandoraReset(): Promise<void> {
    if (selectedId == null || busy) return;
    if (!(await ask({ title: "Reset their opening?", body: "The ledger row, the world flag it set and the Pandoran suit all go. For test accounts only.", danger: true }))) return;
    busy = true;
    note = null;
    try {
      const r = await api.adminPandoraReset(selectedId);
      note = { kind: "ok", text: r.cleared ? `Opening cleared — ${selectedUser?.displayName}` : "Nothing to clear." };
    } catch (e) {
      note = { kind: "err", text: e instanceof ApiError ? e.message : "Failed" };
    } finally {
      busy = false;
    }
  }

  // ---- STERLING NOTICES YOU: one of his private notes, now ----
  const NOTICES = [
    ["first_legendary", "First legendary"],
    ["streak", "Rough streak"],
    ["back", "Welcome back"],
    ["friend_death", "A friend died"],
  ] as const;
  async function sterlingNotice(kind: (typeof NOTICES)[number][0]) {
    if (selectedId == null || busy) return;
    busy = true;
    note = null;
    try {
      await api.adminSterlingNotice(selectedId, kind);
      note = { kind: "ok", text: `Sterling is writing to ${selectedUser?.displayName ?? "them"}.` };
    } catch {
      note = { kind: "err", text: "Couldn't send the note." };
    } finally {
      busy = false;
    }
  }

  // ---- Mint silver (defaults to the selected user) ----
  let grantAmount = $state("");

  async function grantCoins() {
    const amount = Number(grantAmount);
    if (!Number.isInteger(amount) || amount < 1 || busy) return;
    busy = true;
    note = null;
    try {
      const r = await api.adminGrantCoins(amount, selectedId ?? undefined);
      if (r.userId === session.user?.id) wallet.coins = r.coins;
      note = { kind: "ok", text: `Minted ${amount.toLocaleString()} silver → ${selectedUser?.displayName ?? "you"} (now ${r.coins.toLocaleString()}).` };
      grantAmount = "";
    } catch {
      note = { kind: "err", text: "Couldn’t mint the silver." };
    } finally {
      busy = false;
    }
  }

  // ---- Backrooms playtest tools ----
  let brGrantAmount = $state("");
  let brImmortal = $state(false);

  // FOUNDRY'S DISBURSEMENT. Research Credit was retired in Sep 2026 — the
  // backrooms runs on silver now — so the old per-user RC mint is gone: with
  // one currency, handing a player money is the ordinary "Mint silver" lever
  // above. What is left is the size of ASYNC'S ACQUISITION ACCOUNT, the
  // funded budget Voss buys findings out of (src/backrooms/grant.ts).
  // A negative amount claws it back; it can never go below zero.
  async function brAdjustGrant() {
    const amount = Number(brGrantAmount);
    if (!Number.isInteger(amount) || amount === 0 || busy) return;
    busy = true;
    note = null;
    try {
      const r = await api.adminBrGrant(amount);
      note = { kind: "ok", text: `Async's budget is now ${r.grant.toLocaleString()} silver.` };
      brGrantAmount = "";
    } catch {
      note = { kind: "err", text: "Couldn't adjust the budget." };
    } finally {
      busy = false;
    }
  }

  async function brToggleImmortal() {
    if (busy) return;
    busy = true;
    try {
      const r = await api.adminBrImmortal(!brImmortal);
      brImmortal = r.on;
      note = { kind: "ok", text: brImmortal ? "The entity cannot kill you." : "You are mortal again." };
    } catch {
      note = { kind: "err", text: "Couldn't toggle immortality." };
    } finally {
      busy = false;
    }
  }

  async function brSummon() {
    if (busy) return;
    busy = true;
    try {
      const r = await api.adminBrSummon();
      note = {
        kind: "ok",
        text: r.armed
          ? "Armed. It will spawn ~10m away and come to you the moment you enter a door."
          : "It is ~10m away and coming. Good luck.",
      };
    } catch {
      note = { kind: "err", text: "Couldn't summon it." };
    } finally {
      busy = false;
    }
  }

  // ---- Emporium price editor ----
  let priceItemId = $state("");
  let priceValue = $state("");

  async function setPrice(reset = false) {
    if (!priceItemId || busy) return;
    const price = reset ? null : Number(priceValue);
    if (!reset && (!Number.isInteger(price) || price! < 1)) {
      note = { kind: "err", text: "Price must be a positive whole number." };
      return;
    }
    busy = true;
    note = null;
    try {
      const r = await api.adminSetItemPrice(priceItemId, price);
      emporium.items = emporium.items.map((i) => (i.id === r.itemId ? { ...i, price: r.price } : i));
      note = { kind: "ok", text: `${r.itemId} now costs ${r.price} silver.` };
      priceValue = "";
    } catch {
      note = { kind: "err", text: "Couldn’t set the price." };
    } finally {
      busy = false;
    }
  }

  async function mintInvite() {
    if (busy) return;
    busy = true;
    note = null;
    try {
      const opts: { maxUses?: number; ttlHours?: number; note?: string } = {};
      if (newMaxUses > 1) opts.maxUses = newMaxUses;
      if (newTtl) opts.ttlHours = Number(newTtl);
      if (newNote.trim()) opts.note = newNote.trim();
      const r = await api.adminCreateInvite(opts);
      // Re-read rather than prepend: the list carries each code's status,
      // which the mint reply doesn't.
      await loadInvites();
      newNote = "";
      note = { kind: "ok", text: `Minted ${r.invite.code} — copied to clipboard.` };
      copyCode(r.invite.code);
    } catch {
      note = { kind: "err", text: "Couldn’t create an invite." };
    } finally {
      busy = false;
    }
  }

  async function revokeInvite(code: string) {
    if (busy) return;
    if (!(await ask({ title: `Revoke invite ${code}?`, body: "It can no longer be redeemed.", confirm: "revoke it", danger: true }))) return;
    busy = true;
    note = null;
    try {
      await api.adminRevokeInvite(code);
      await loadInvites();
      note = { kind: "ok", text: `Invite ${code} revoked.` };
    } catch {
      note = { kind: "err", text: "Revoke failed." };
    } finally {
      busy = false;
    }
  }

  function copyCode(code: string) {
    navigator.clipboard?.writeText(code).then(
      () => {
        copied = code;
        setTimeout(() => {
          if (copied === code) copied = null;
        }, 1500);
      },
      () => {}, // clipboard blocked; the code is still visible to copy by hand
    );
  }

  const selectedUser = $derived(users.find((u) => u.id === selectedId) ?? null);
  const isSelf = $derived(selectedId != null && selectedId === session.user?.id);
  const isDead = $derived(!!selectedUser?.disabled);

  async function resetSpins() {
    if (selectedId == null || busy) return;
    busy = true;
    note = null;
    try {
      const r = await api.adminResetSpins(selectedId);
      note = { kind: "ok", text: `Refilled ${selectedUser?.displayName ?? "user"} to ${r.spins.total} spins.` };
      if (isSelf) await loadWheel(); // reflect my own refill in the wheel immediately
    } catch {
      note = { kind: "err", text: "Reset failed." };
    } finally {
      busy = false;
    }
  }

  async function rigDeath() {
    if (selectedId == null || busy) return;
    const name = selectedUser?.displayName ?? "this user";
    const warning = selectedUser?.isAdmin
      ? `${name} is an admin — admins are immune to death ("the house can't die"), so this just fizzles on their next spin. Continue anyway?`
      : `Make ${name}'s next spin land on 💀 death?\n\nWithout a talisman their account is permanently tombstoned (you can revive it here). Continue?`;
    if (!(await ask({ title: selectedUser?.isAdmin ? `Rig ${name}'s next spin anyway?` : `Send ${name} to the death slot?`, body: warning, confirm: "rig the wheel", danger: true }))) return;
    busy = true;
    note = null;
    try {
      const r = await api.adminRigDeath(selectedId);
      // A rig is NOT a guaranteed kill. The wedge still meets the talisman,
      // and most accounts are carrying one — so say what will happen rather
      // than letting the operator find out and read it as a bug.
      note = r.immune
        ? { kind: "ok", text: `${name}'s next spin is rigged to death — but they're an admin, so it will fizzle.` }
        : r.shielded
          ? { kind: "ok", text: `${name}'s next spin is rigged to death — but they're holding a 🧿 talisman, so it will BURN THE SHIELD and spare them. Rig again once it's gone for a real kill.` }
          : { kind: "ok", text: `${name}'s next spin is rigged to death — unshielded, so it will tombstone them.` };
    } catch {
      note = { kind: "err", text: "Couldn’t rig the spin." };
    } finally {
      busy = false;
    }
  }

  async function rigLegendary() {
    if (selectedId == null || busy) return;
    const name = selectedUser?.displayName ?? "this user";
    busy = true;
    note = null;
    try {
      await api.adminRigLegendary(selectedId);
      note = { kind: "ok", text: `${name}'s next spin is a GUARANTEED legendary — go test the party.` };
    } catch {
      note = { kind: "err", text: "Couldn’t rig the spin." };
    } finally {
      busy = false;
    }
  }

  // ---- Lock / delete ----
  async function toggleLock() {
    if (selectedId == null || busy || !selectedUser) return;
    const locking = !selectedUser.locked;
    const name = selectedUser.displayName;
    if (locking && !(await ask({ title: `Lock ${name}'s account?`, body: "They'll be signed out everywhere and can't log in until unlocked.", confirm: "lock the account", danger: true }))) return;
    busy = true;
    note = null;
    try {
      await api.adminLockUser(selectedId, locking);
      await loadUsers();
      note = { kind: "ok", text: locking ? `${name} locked — sessions killed.` : `${name} unlocked.` };
    } catch {
      note = { kind: "err", text: "Lock change failed." };
    } finally {
      busy = false;
    }
  }

  async function deleteAccount() {
    if (selectedId == null || busy || !selectedUser) return;
    const name = selectedUser.displayName;
    // ONE dialog with a typed phrase, not two clicks. The old pair of browser
    // confirms was still just two reflexes in a row; typing the handle is the
    // thing a misclick cannot do.
    if (
      !(await ask({
        title: `Delete ${name}'s account?`,
        body:
          "This scrubs their identity, wipes avatar, bio and cosmetics, BURNS their emoji and silver, and seals the account forever. " +
          'Their messages remain as "deleted user".\n\nThis cannot be undone.',
        confirm: "delete the account",
        danger: true,
        typeToConfirm: selectedUser.username,
      }))
    )
      return;
    busy = true;
    note = null;
    try {
      await api.adminDeleteUser(selectedId);
      await loadUsers();
      note = { kind: "ok", text: `${name} is gone — identity scrubbed, assets burned, account sealed.` };
    } catch {
      note = { kind: "err", text: "Delete failed." };
    } finally {
      busy = false;
    }
  }

  async function revive() {
    if (selectedId == null || busy) return;
    const name = selectedUser?.displayName ?? "this user";
    busy = true;
    note = null;
    try {
      await api.adminReviveUser(selectedId);
      await loadUsers(); // refresh so the revived user no longer shows as dead
      note = { kind: "ok", text: `${name} revived — they can log in again.` };
    } catch {
      note = { kind: "err", text: "Revive failed." };
    } finally {
      busy = false;
    }
  }

  async function grantTalisman() {
    if (selectedId == null || busy) return;
    const name = selectedUser?.displayName ?? "this user";
    busy = true;
    note = null;
    try {
      await api.adminGrantTalisman(selectedId);
      note = { kind: "ok", text: `🪬 ${name} now holds the death shield.` };
    } catch (e) {
      note = {
        kind: "err",
        text: e instanceof ApiError && e.code === "already_shielded"
          ? `${name} is already shielded.`
          : "Talisman grant failed.",
      };
    } finally {
      busy = false;
    }
  }

</script>

<div class="tools">
  {#if part === "members"}
    <!-- ONE picker; every card below acts on whoever it holds. -->
    <section class="card picker">
      <div class="pick">
        <input class="in seek" type="search" placeholder="Search by name or handle…" bind:value={userQ} aria-label="Search members" />
        <select class="in" bind:value={selectedId} disabled={busy || users.length === 0} size={userQ ? 8 : undefined} aria-label="Member">
          {#each shownUsers as u (u.id)}
            <option value={u.id}>{u.displayName} (@{u.username}){u.isAdmin ? " • admin" : u.role === "moderator" ? " • mod" : ""}{u.disabled ? " • † dead" : ""}{u.locked ? " • locked" : ""}</option>
          {/each}
        </select>
      </div>
      {#if selectedUser}
        <div class="who">
          <Avatar name={selectedUser.displayName} id={selectedUser.id} avatar={selectedUser.avatar} size={42} profile />
          <div class="who-text">
            <b>{selectedUser.displayName}</b>
            <span class="handle">@{selectedUser.username}</span>
            <span class="badges">
              {#if isSelf}<span class="badge">YOU</span>{/if}
              {#if selectedUser.isAdmin}<span class="badge">ADMIN</span>{:else if selectedUser.role === "moderator"}<span class="badge">MOD</span>{/if}
              {#if isDead}<span class="badge bad">† DEAD</span>{/if}
              {#if selectedUser.locked}<span class="badge bad">LOCKED</span>{/if}
            </span>
          </div>
        </div>
      {/if}
    </section>

    {#if selectedUser}
      <div class="grid">
        <section class="card">
          <h3 class="ch">🛡️ Standing</h3>
          <div class="row">
            <button class="btn" class:danger={!selectedUser.locked} onclick={toggleLock} disabled={busy || isSelf || selectedUser.isAdmin}>
              {selectedUser.locked ? "Unlock account" : "Lock account (ban)"}
            </button>
            <button class="btn" onclick={toggleRole} disabled={busy || isSelf || selectedUser.isAdmin}>
              {selectedUser.role === "moderator" ? "Remove moderator" : "Make moderator"}
            </button>
          </div>
          <div class="row">
            <input class="in num" type="number" min="1" max="720" bind:value={suspendHours} aria-label="Suspension hours" disabled={busy} />
            <span class="unit">hours</span>
            <button class="btn" onclick={() => suspend(suspendHours)} disabled={busy || isSelf || selectedUser.isAdmin || suspendHours < 1}>Suspend</button>
            <button class="btn ghost" onclick={() => suspend(0)} disabled={busy || isSelf || selectedUser.isAdmin}>Lift</button>
          </div>
          <p class="cs">A lock signs them out everywhere until it's lifted. A suspension ends on its own.</p>
        </section>

        <section class="card">
          <h3 class="ch">🔑 Sign-in help</h3>
          <div class="row">
            <button class="btn" onclick={unlockLogin} disabled={busy}>Clear login lockout</button>
          </div>
          <div class="row">
            <span class="pwwrap">
              <input class="in" type={showResetPw ? "text" : "password"} placeholder="New password" bind:value={resetPw} aria-label="New password" autocomplete="new-password" disabled={busy || selectedUser.isAdmin} />
              <button type="button" class="eye" onclick={() => (showResetPw = !showResetPw)} title={showResetPw ? "Hide" : "Show"}>{showResetPw ? "🙈" : "👁"}</button>
            </span>
            <button class="btn danger" onclick={doResetPassword} disabled={busy || selectedUser.isAdmin || resetPw.length < 12}>Reset password</button>
          </div>
          <div class="row">
            <input class="in grow" type="text" placeholder="New recovery secret" bind:value={resetSecret} aria-label="New recovery secret" disabled={busy} />
            <button class="btn danger" onclick={doResetSecret} disabled={busy || resetSecret.length < 12}>Reset secret</button>
          </div>
          <p class="cs">Both need 12+ characters; passwords also need mixed case, a number and a symbol. A reset signs them out everywhere. Your own password changes in Settings.</p>
        </section>

        <section class="card">
          <h3 class="ch">🎡 The Wheel</h3>
          <div class="row">
            <button class="btn" onclick={resetSpins} disabled={busy || isDead}>Refill spins to 7</button>
            <button class="btn" onclick={grantTalisman} disabled={busy}>Grant 🪬 talisman</button>
          </div>
          <div class="row">
            <button class="btn danger" onclick={rigDeath} disabled={busy || isDead}>Rig next spin → 💀 death</button>
            <button class="btn" onclick={rigLegendary} disabled={busy || isDead}>Rig next spin → ⭐ legendary</button>
          </div>
          <div class="row">
            <button class="btn good" onclick={revive} disabled={busy || !isDead}>Revive account</button>
          </div>
          <p class="cs">
            {#if isDead}This account is dead. Revive lets them log in again.
            {:else}A rigged death still burns a talisman first, and admins can't die.{/if}
          </p>
        </section>

        <section class="card">
          <h3 class="ch">🪙 Silver &amp; mail</h3>
          <div class="row">
            <input class="in grow" type="number" min="1" bind:value={grantAmount} placeholder="Silver to mint" disabled={busy} />
            <button class="btn" onclick={grantCoins} disabled={busy || !grantAmount}>Mint</button>
          </div>
          <span class="lbl">Sterling writes them a private note</span>
          <div class="row">
            {#each NOTICES as [k, label] (k)}
              <button class="btn sm" onclick={() => sterlingNotice(k)} disabled={busy}>{label}</button>
            {/each}
          </div>
        </section>

        <section class="card">
          <h3 class="ch">🗝 Endgame testing</h3>
          <span class="lbl">Pandora's keys</span>
          <div class="row">
            {#each ["prismatic", "brass", "rusted"] as k (k)}
              <button class="btn sm" onclick={() => pandoraKey(k as PandoraKeyId, false)} disabled={busy || selectedUser.isAdmin} title="Grant the {k} key">{k}</button>
            {/each}
            <button class="btn sm ghost" onclick={() => pandoraKeyAll(true)} disabled={busy}>Revoke all</button>
            <button class="btn sm danger" onclick={pandoraReset} disabled={busy}>Reset opening</button>
          </div>
          <span class="lbl">Stone of the Abyss</span>
          <div class="row">
            <button class="btn sm" onclick={() => abyssStone(false)} disabled={busy}>◎ Give the Stone</button>
            <button class="btn sm ghost" onclick={() => abyssStone(true)} disabled={busy}>Take it back</button>
          </div>
        </section>

        <section class="card danger-card">
          <h3 class="ch">⚠️ Delete account</h3>
          <p class="cs">Scrubs their name and profile, burns their emoji and silver, and seals the account for good. Their messages stay as "deleted user".</p>
          <div class="row">
            <button class="btn danger" onclick={deleteAccount} disabled={busy || isSelf || selectedUser.isAdmin}>Delete account…</button>
          </div>
        </section>
      </div>
    {/if}

  {:else if part === "reports"}
    {#if reports.length === 0}
      <p class="empty">No reports filed. A quiet house.</p>
    {:else}
      <div class="list">
        {#each [...openReports, ...reports.filter((r) => r.status !== "open")] as r (r.id)}
          <div class="card rep" class:resolved={r.status === "resolved"}>
            <div class="rep-line">
              <b>{r.reporter?.displayName ?? "?"}</b> reported
              {#if r.kind === "page"}
                the community <b>{r.pageName ?? "?"}</b>
                <span class="dim">(page — the delist switch is under Satellites if it's hosted)</span>
              {:else}
                <b>{r.target?.displayName ?? "?"}</b>
                <span class="dim">({r.kind}{r.pageName ? ` · in ${r.pageName}` : ""})</span>
              {/if}
              <span class="status {r.status}">{r.status}</span>
            </div>
            {#if r.excerpt}<div class="rep-excerpt">“{r.excerpt}”</div>{/if}
            <div class="rep-reason">Reason: {r.reason}</div>
            <div class="row">
              <button class="btn sm" onclick={() => resolveReport(r)}>
                {r.status === "open" ? "Mark resolved" : "Reopen"}
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

  {:else if part === "invites"}
    <section class="card">
      <h3 class="ch">Mint a code</h3>
      <div class="row">
        <select class="in" bind:value={newMaxUses} disabled={busy} aria-label="Uses">
          <option value={1}>Single-use</option>
          <option value={5}>5 uses</option>
          <option value={10}>10 uses</option>
          <option value={25}>25 uses</option>
        </select>
        <select class="in" bind:value={newTtl} disabled={busy} aria-label="Expiry">
          <option value="">Never expires</option>
          <option value="24">Expires in 1 day</option>
          <option value="168">Expires in 7 days</option>
          <option value="720">Expires in 30 days</option>
        </select>
      </div>
      <div class="row">
        <input class="in grow" bind:value={newNote} placeholder="Label (optional, e.g. “for Sam”)" disabled={busy} />
        <button class="btn" onclick={mintInvite} disabled={busy}>Mint</button>
      </div>
      <p class="cs">The new code is copied to your clipboard. Click any code to copy it again.</p>
    </section>

    {#if invites.length}
      <ul class="invites">
        {#each invites as inv (inv.code)}
          <li class="invite {inv.status}">
            <button class="code" onclick={() => copyCode(inv.code)} title="Copy code" disabled={busy}>
              {inv.code}{copied === inv.code ? " ✓" : ""}
            </button>
            <span class="imeta">
              {inv.uses}/{inv.maxUses} used · <span class="st">{inv.status}</span>{#if inv.note} · {inv.note}{/if}
            </span>
            {#if inv.status === "active"}
              <button class="btn sm ghost" onclick={() => revokeInvite(inv.code)} disabled={busy}>Revoke</button>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">No invite codes yet.</p>
    {/if}

  {:else if part === "house"}
    <div class="grid">
      <section class="card wide">
        <h3 class="ch">📣 Post to Solace Updates</h3>
        <textarea
          class="in brief-in"
          bind:value={brief}
          rows="7"
          maxlength={BRIEF_MAX}
          placeholder={"A TITLE LINE\n\nOne line per paragraph — don't press Enter mid-sentence.\n\n· One line per bullet, a blank line between them"}
          disabled={busy}
          aria-label="Update brief"
        ></textarea>
        <div class="row">
          <button class="btn" onclick={postBrief} disabled={busy || !brief.trim()}>Post as Sterling</button>
          <span class="cs">{brief.length.toLocaleString()} / {BRIEF_MAX.toLocaleString()}</span>
        </div>
        <p class="cs">Plain text, no **bold**. Every Enter stays a line break, so keep each paragraph and bullet on one line. Never brief a secret.</p>
      </section>

      <section class="card">
        <h3 class="ch">✨ Sterling's specials</h3>
        <select class="in" bind:value={specialKind} disabled={busy} aria-label="Special">
          <option value="">Pick a special…</option>
          <option value="flashsale">Flash Sale (2h, 30% off a department)</option>
          <option value="spindrop">Spin Drop (+2 spins for everyone)</option>
          <option value="rakefree">Rake-Free Night (6h)</option>
          <option value="potsweet">Pot Sweetener (300–800 to tonight's lottery)</option>
          <option value="doublestats">Double-Stats Day (24h)</option>
          <option value="shieldsale">Shield Sale (6h, 30% off the talisman)</option>
        </select>
        <div class="row"><button class="btn" onclick={fireSpecial} disabled={busy || !specialKind}>Fire it</button></div>
        <p class="cs">Announced @everyone. One at a time; he also runs 1–2 a week on his own.</p>
      </section>

      <section class="card">
        <h3 class="ch">🏷️ Emporium prices</h3>
        <select class="in" bind:value={priceItemId} disabled={busy} aria-label="Item">
          <option value="">Pick an item…</option>
          {#each emporium.items as i (i.id)}
            <option value={i.id}>{i.name} — {i.price}</option>
          {/each}
        </select>
        <div class="row">
          <input class="in grow" type="number" min="1" bind:value={priceValue} placeholder="New price" disabled={busy || !priceItemId} />
          <button class="btn" onclick={() => setPrice(false)} disabled={busy || !priceItemId || !priceValue}>Set</button>
          <button class="btn ghost" onclick={() => setPrice(true)} disabled={busy || !priceItemId}>Default</button>
        </div>
      </section>

      <section class="card">
        <h3 class="ch">🧠 Sterling, Ada &amp; the goblins</h3>
        {#if !brain}
          <p class="cs">Loading…</p>
        {:else if brain.houseAi === false}
          <p class="cs">Archived. Sterling, Dr. Voss and the goblins use their scripted lines and commands only; the AI model runs the Survivorz show. (NPC_HOUSE_AI=1 on the server brings it back.)</p>
        {:else if !brain.configured}
          <p class="cs">Not set up on this server (NPC_BRAIN_URL is empty). They answer their commands only.</p>
        {:else}
          <p class="status-line">
            {#if !brain.enabled}⏸ Switched off — scripted lines only. The Survivorz show still talks.
            {:else if brain.online}🟢 Talking ({brain.model}).
            {:else}🔴 The model isn't answering — they're using their scripted lines.{/if}
          </p>
          <p class="cs">
            {brain.stats.answered} answered · {brain.stats.voiced ?? 0} voiced · {brain.stats.bubbles ?? 0} counter batches · {(brain.stats.scripted ?? 0) + (brain.stats.voiceKept ?? 0)} scripted · {brain.stats.timeouts} timed out{#if brain.stats.avgLatencyMs != null} · ~{(brain.stats.avgLatencyMs / 1000).toFixed(1)}s a reply{/if}
          </p>
          <div class="row">
            {#if brain.enabled}
              <button class="btn" onclick={() => setBrain(false)} disabled={busy}>Switch off</button>
            {:else}
              <button class="btn" onclick={() => setBrain(true)} disabled={busy}>Switch on</button>
            {/if}
            <button class="btn ghost" onclick={loadBrain} disabled={busy}>Refresh</button>
          </div>
        {/if}
      </section>

      <section class="card danger-card">
        <h3 class="ch">🏆 Wall of Fame — new season</h3>
        <p class="cs">Wipes the leaderboard stats (spins, hands, biggest wins, silver gambled). Pit crowns and collections stay. Can't be undone.</p>
        <div class="row"><button class="btn danger" onclick={resetWall} disabled={busy}>Reset all stats…</button></div>
      </section>
    </div>

  {:else if part === "backrooms"}
    <div class="grid">
      <section class="card">
        <h3 class="ch">🧪 Playtesting</h3>
        <div class="row">
          <button class="btn" class:danger={brImmortal} onclick={brToggleImmortal} disabled={busy}>
            {brImmortal ? "🛡 Immortal — click to turn off" : "Become immortal"}
          </button>
          <button class="btn" onclick={brSummon} disabled={busy}>Summon the entity</button>
        </div>
        <p class="cs">Summon while inside and it comes now; summon from here and it comes the moment you walk through a door. Immortal stops the kill, not the chase.</p>
      </section>
      <section class="card">
        <h3 class="ch">🔬 Async's research budget</h3>
        <div class="row">
          <input class="in grow" type="number" bind:value={brGrantAmount} placeholder="Silver (negative takes back)" disabled={busy} />
          <button class="btn" onclick={brAdjustGrant} disabled={busy || !brGrantAmount}>Disburse</button>
        </div>
        <p class="cs">The pot Dr. Voss buys findings from. It can't go below zero.</p>
      </section>
    </div>
  {/if}

  {#if note}
    <div class="toast {note.kind}" role="status">
      <span>{note.text}</span>
      <button class="x" onclick={() => (note = null)} aria-label="Dismiss">✕</button>
    </div>
  {/if}
</div>

<style>
  .tools {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 100%;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
    gap: 12px;
    align-items: start;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .card.wide {
    grid-column: 1 / -1;
  }
  .danger-card {
    border-color: color-mix(in srgb, var(--danger) 40%, var(--line));
  }
  .ch {
    margin: 0;
    font-size: 0.9rem;
    color: var(--ink);
  }
  .cs {
    margin: 0;
    font-size: 0.74rem;
    line-height: 1.45;
    color: var(--ink-dim);
  }
  .lbl {
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-dim);
    margin-bottom: -4px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .row.foot {
    margin-top: 2px;
  }
  .in {
    padding: 8px 10px;
    background: var(--panel-2);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 8px;
    font: inherit;
    font-size: 0.85rem;
    box-sizing: border-box;
    min-width: 0;
  }
  .in:focus {
    outline: none;
    border-color: var(--accent);
  }
  select.in {
    width: 100%;
  }
  .row select.in {
    flex: 1;
    width: auto;
  }
  .in.grow {
    flex: 1;
  }
  .in.num {
    width: 74px;
  }
  .unit {
    font-size: 0.8rem;
    color: var(--ink-dim);
    margin-left: -2px;
  }
  .btn {
    padding: 8px 13px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-size: 0.84rem;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.12s ease, background 0.12s ease, color 0.12s ease;
  }
  .btn:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
    background: color-mix(in srgb, var(--accent) 12%, var(--panel-2));
  }
  .btn.danger {
    color: color-mix(in srgb, var(--danger) 85%, var(--ink));
  }
  .btn.danger:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--danger) 60%, transparent);
    background: color-mix(in srgb, var(--danger) 14%, transparent);
    color: var(--danger);
  }
  .btn.good:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--ok) 60%, transparent);
    background: color-mix(in srgb, var(--ok) 14%, transparent);
    color: var(--ok);
  }
  .btn.ghost {
    background: none;
  }
  .btn.sm {
    padding: 5px 10px;
    font-size: 0.78rem;
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  /* ---- members ---- */
  .picker {
    flex-direction: row;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 14px;
  }
  .pick {
    flex: 1 1 300px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .who {
    flex: 1 1 240px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 4px;
    min-width: 0;
  }
  .who-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .who-text b {
    font-size: 1rem;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .handle {
    font-size: 0.78rem;
    color: var(--ink-dim);
  }
  .badges {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    margin-top: 2px;
  }
  .badge {
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 0.6rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 60%, transparent);
    color: var(--ink);
  }
  .badge.bad {
    background: color-mix(in srgb, var(--danger) 16%, transparent);
    border-color: color-mix(in srgb, var(--danger) 60%, transparent);
  }
  .pwwrap {
    position: relative;
    display: inline-flex;
    flex: 1;
    min-width: 0;
  }
  .pwwrap .in {
    flex: 1;
    padding-right: 2rem;
  }
  .eye {
    position: absolute;
    right: 3px;
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

  /* ---- reports ---- */
  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rep {
    gap: 6px;
    font-size: 0.85rem;
  }
  .rep.resolved {
    opacity: 0.55;
  }
  .rep-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 5px;
  }
  .dim {
    color: var(--ink-dim);
  }
  .status {
    margin-left: auto;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 1px 8px;
    border-radius: 999px;
    border: 1px solid var(--line);
  }
  .status.open {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 55%, transparent);
  }
  .rep-excerpt {
    color: var(--ink-soft);
    font-style: italic;
  }
  .rep-reason {
    color: var(--ink-soft);
  }

  /* ---- invites ---- */
  .invites {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
  }
  .invite {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 55%, transparent);
    font-size: 0.82rem;
  }
  .invite:last-child {
    border-bottom: none;
  }
  .invite.used,
  .invite.expired,
  .invite.revoked {
    opacity: 0.5;
  }
  .invite .code {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 0.82rem;
    letter-spacing: 0.06em;
    font-weight: 700;
    color: var(--ink);
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 2px 8px;
    cursor: pointer;
  }
  .invite .code:hover:not(:disabled) {
    color: var(--accent);
  }
  .imeta {
    flex: 1;
    color: var(--ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .invite.active .st {
    color: var(--ok);
  }
  .invite.revoked .st {
    color: var(--danger);
  }

  /* ---- house ---- */
  .brief-in {
    width: 100%;
    min-height: 9rem;
    resize: vertical;
    line-height: 1.45;
  }
  .status-line {
    margin: 0;
    font-size: 0.84rem;
    color: var(--ink);
  }

  .empty {
    margin: 0;
    padding: 18px;
    text-align: center;
    color: var(--ink-dim);
    background: var(--panel);
    border: 1px dashed var(--line);
    border-radius: 12px;
    font-size: 0.85rem;
  }

  /* The result of the last click, pinned to the foot of the scrolling pane. */
  .toast {
    position: sticky;
    bottom: 14px;
    margin-top: auto;
    align-self: center;
    max-width: min(640px, 100%);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px 9px 14px;
    border-radius: 10px;
    font-size: 0.84rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    background: var(--panel-2);
    border: 1px solid var(--line);
    z-index: 2;
  }
  .toast.ok {
    border-color: color-mix(in srgb, var(--ok) 55%, var(--line));
    color: var(--ok);
  }
  .toast.err {
    border-color: color-mix(in srgb, var(--danger) 55%, var(--line));
    color: var(--danger);
  }
  .toast .x {
    background: none;
    border: none;
    color: var(--ink-dim);
    cursor: pointer;
    padding: 2px 4px;
  }
  .toast .x:hover {
    color: var(--ink);
  }
</style>
