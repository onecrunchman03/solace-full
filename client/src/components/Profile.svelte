<script lang="ts">
  import { api, type ProfileData, type Emoji } from "../lib/api";
  import { session } from "../lib/session.svelte";
  import { chat, debtLabel } from "../lib/chat.svelte";
  import { openDmWith } from "../lib/dm.svelte";
  import { startTradeWith } from "../lib/trade.svelte";
  import { silverSend } from "../lib/wallet.svelte";
  import { isBlocked, toggleBlock } from "../lib/blocks.svelte";
  import { askText } from "../lib/confirm.svelte";
  import { TITLE_NAMES, vipMark } from "../lib/emporium.svelte";
  import { nav, go, openMarket } from "../lib/nav.svelte";
  import Avatar from "./Avatar.svelte";
  import { botKind, isRegular } from "../lib/bots";
  import { showStone } from "../lib/abyss.svelte";

  // Tier palette mirrors the wheel gallery so a collection reads the same everywhere.
  const TIER_COLOR: Record<string, string> = {
    abyss: "#9b5cff", talisman: "#42c1c4", mythic: "#ff5db1", legendary: "#f39620", rare: "#9d63d2", common: "#7cae5f",
  };
  // "abyss" is the Stone's tier (lib/abyss.svelte.ts) — first, and clickable when it's yours.
  const TIER_ORDER = ["abyss", "talisman", "mythic", "legendary", "rare", "common", "special"];

  // Achievement tiers: earned first (newest up top), then locked by tier.
  const ACH_COLOR: Record<string, string> = {
    bronze: "#b0793f", silver: "#b9c2cc", gold: "#e8c34a", mythic: "#ff5db1",
  };
  const ACH_MEDAL: Record<string, string> = { bronze: "🥉", silver: "🥈", gold: "🥇", mythic: "👑" };
  const ACH_RANK: Record<string, number> = { bronze: 0, silver: 1, gold: 2, mythic: 3 };

  // Whose profile: an explicit target, else your own. Derived-by-value so that
  // reassigning session.user (same id) doesn't needlessly refetch.
  const targetId = $derived(nav.profileUserId ?? session.user?.id ?? null);

  let data = $state<ProfileData | null>(null);
  let loading = $state(true);
  let loadError = $state(false);
  let seq = 0;

  // Achievements: earned first (newest up top), then locked by tier.
  const achievementsSorted = $derived(
    [...(data?.achievements ?? [])].sort((a, b) => {
      if ((a.earnedAt !== null) !== (b.earnedAt !== null)) return a.earnedAt !== null ? -1 : 1;
      if (a.earnedAt !== null && b.earnedAt !== null) return b.earnedAt - a.earnedAt;
      return (ACH_RANK[a.tier] ?? 0) - (ACH_RANK[b.tier] ?? 0);
    }),
  );
  const earnedCount = $derived((data?.achievements ?? []).filter((a) => a.earnedAt !== null).length);

  async function load(id: number): Promise<void> {
    const mine = ++seq;
    loading = true;
    loadError = false;
    try {
      const d = await api.profile(id);
      if (mine !== seq) return; // a newer load superseded this one
      data = d;
      draftName = d.user.displayName;
      draftBio = d.bio ?? "";
      editing = false;
      avatarError = "";
      saveError = "";
    } catch {
      if (mine !== seq) return;
      loadError = true;
      data = null;
    } finally {
      if (mine === seq) loading = false;
    }
  }

  $effect(() => {
    if (targetId != null) void load(targetId);
  });

  const me = $derived(session.user);
  const isSelf = $derived(!!data && !!me && data.user.id === me.id);
  const viewingOther = $derived(nav.profileUserId != null && nav.profileUserId !== me?.id);
  const isOnline = $derived(!!data && (isSelf || chat.online.includes(data.user.id)));
  const joined = $derived(
    data
      ? new Date(data.user.createdAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "",
  );

  // Inventory grouped by tier (rarest-worthy first), for the collection grid.
  const groups = $derived.by(() => {
    const by: Record<string, Emoji[]> = {};
    for (const e of data?.inventory ?? []) (by[e.tier] ??= []).push(e);
    return TIER_ORDER.filter((t) => by[t]?.length).map((t) => ({
      tier: t,
      items: by[t].slice().sort((a, b) => a.name.localeCompare(b.name)),
    }));
  });

  // ---- Editing name + about me (self only) ----
  let editing = $state(false);
  let draftName = $state("");
  let draftBio = $state("");
  let saving = $state(false);
  let saveError = $state("");

  function startEdit(): void {
    if (!data) return;
    draftName = data.user.displayName;
    draftBio = data.bio ?? "";
    saveError = "";
    editing = true;
  }
  async function save(): Promise<void> {
    const name = draftName.trim();
    if (!name) {
      saveError = "Display name can't be empty.";
      return;
    }
    saving = true;
    saveError = "";
    try {
      const res = await api.updateProfile({ displayName: name, bio: draftBio.trim() });
      if (data) data = { ...data, user: { ...data.user, displayName: res.user.displayName }, bio: res.bio };
      if (session.user) session.user = { ...session.user, displayName: res.user.displayName };
      editing = false;
    } catch {
      saveError = "Could not save changes.";
    } finally {
      saving = false;
    }
  }

  // ---- Avatar upload / removal (self only) ----
  let fileInput = $state<HTMLInputElement>();
  let uploading = $state(false);
  let avatarError = $state("");

  async function onFilePicked(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // allow re-picking the same file later
    if (!file) return;
    if (file.size > 2_000_000) {
      avatarError = "Image must be under 2 MB.";
      return;
    }
    uploading = true;
    avatarError = "";
    try {
      const { avatar } = await api.uploadAvatar(file);
      if (data) data = { ...data, user: { ...data.user, avatar } };
      if (session.user) session.user = { ...session.user, avatar };
    } catch {
      avatarError = "Upload failed — use a PNG, JPEG, GIF, or WebP under 2 MB.";
    } finally {
      uploading = false;
    }
  }
  async function messageUser(): Promise<void> {
    if (!data) return;
    await openDmWith(data.user.id);
    go("dms");
  }
  function sendSilverTo(): void {
    if (!data) return;
    silverSend.to = data.user.id;
    openMarket("wallet");
  }
  function tradeUser(): void {
    if (!data) return;
    startTradeWith(data.user.id);
    openMarket("trade");
  }
  let reportedUser = $state(false);
  async function reportUser(): Promise<void> {
    if (!data) return;
    // The house prompt, not the browser's (banned; also a silent no-op in
    // the desktop shell, whose webview auto-returns null from prompt()).
    const reason = await askText({
      title: `Report ${data.user.displayName}`,
      label: "What's wrong?",
      placeholder: "tell the mods what happened",
      confirm: "report",
      maxLength: 500,
    });
    if (!reason) return;
    void api.report("user", data.user.id, reason).then(() => (reportedUser = true)).catch(() => {});
  }

  async function removePhoto(): Promise<void> {
    uploading = true;
    avatarError = "";
    try {
      await api.removeAvatar();
      if (data) data = { ...data, user: { ...data.user, avatar: null } };
      if (session.user) session.user = { ...session.user, avatar: null };
    } catch {
      avatarError = "Could not remove photo.";
    } finally {
      uploading = false;
    }
  }
</script>

<div class="page">
  {#if viewingOther}
    <button class="back" onclick={() => go("chat")}>← Back to chat</button>
  {/if}

  {#if loading}
    <p class="state">Loading profile…</p>
  {:else if loadError || !data}
    <p class="state">Couldn't load that profile.</p>
  {:else}
    <div class="card head">
      {#if data.user.banner}
        <!-- An uploaded banner IMAGE wins over the Emporium banner item. -->
        <div class="banner-layer banner-img" style="background-image: url('/banners/{data.user.banner}')"></div>
      {:else if data.user.cosmetics?.banner}
        <div class="banner-layer {data.user.cosmetics.banner}"></div>
      {/if}
      <div class="ava">
        <Avatar
          name={data.user.displayName}
          id={data.user.id}
          avatar={data.user.avatar}
          bot={botKind(data.user)}
          size={84}
          border={data.user.cosmetics?.border}
        />
        {#if isOnline}<span class="dot" title="Online"></span>{/if}
        {#if isSelf}
          <button class="cam" title="Change photo" disabled={uploading} onclick={() => fileInput?.click()}>
            📷
          </button>
        {/if}
      </div>

      <div class="meta">
        {#if editing}
          <input class="name-input" bind:value={draftName} maxlength="40" placeholder="Display name" />
        {:else}
          <div class="line1">
            <h1 class={data.user.cosmetics?.flair ?? ""}>{data.user.displayName}</h1>
            {#if data.user.cosmetics?.title}
              <span class="badge earned" class:vip={!!vipMark(data.user.cosmetics.title)}>{#if vipMark(data.user.cosmetics.title)}<span class="vipmark t{vipMark(data.user.cosmetics.title)}">✦</span>{/if}{TITLE_NAMES[data.user.cosmetics.title] ?? ""}</span>
            {/if}
            {#if botKind(data.user) === "goblins"}<span class="badge bot">⚖ CONCESSION No. 3</span>
            {:else if botKind(data.user) === "voss"}<span class="badge bot">▣ ASYNC · THRESHOLD-4</span>
            {:else if isRegular(botKind(data.user))}<span class="badge bot">🎰 CASINO REGULAR</span>
            {:else if data.user.isBot}<span class="badge bot">⚙ THE HOUSE</span>{/if}
            {#if data.user.isAdmin}<span class="badge">admin</span>{/if}
            {#if chat.debtors[data.user.id] === 5}
              <span class="badge debt">🔒 in the goblins' cells</span>
            {:else if data.user.disabled}<span class="badge dead">terminated</span>
            {:else if debtLabel(data.user.id)}<span class="badge debt">⚖ owes the goblins — {debtLabel(data.user.id)}</span>{/if}
          </div>
        {/if}
        <div class="handle">@{data.user.username}</div>
        <div class="sub">
          Joined {joined} ·
          {#if isOnline}<span class="on">online</span>{:else}<span class="off">offline</span>{/if}
        </div>

        {#if isSelf}
          <div class="photo-actions">
            <button class="mini" disabled={uploading} onclick={() => fileInput?.click()}>
              {uploading ? "Uploading…" : "Upload photo"}
            </button>
            {#if data.user.avatar}
              <button class="mini ghost" disabled={uploading} onclick={removePhoto}>Remove</button>
            {/if}
          </div>
          {#if avatarError}<div class="err">{avatarError}</div>{/if}
        {/if}
      </div>

      {#if isSelf && !editing}
        <button class="edit-btn" onclick={startEdit}>Edit</button>
      {:else if !isSelf}
        <div class="head-actions">
          {#if !isBlocked(data.user.id)}
            <button class="edit-btn accent" onclick={messageUser}>Message</button>
          {/if}
          {#if !data.user.disabled && !isBlocked(data.user.id)}
            <button class="edit-btn" onclick={tradeUser}>Trade</button>
            {#if !data.user.isBot}<button class="edit-btn" onclick={sendSilverTo}>Send silver</button>{/if}
          {/if}
          <button class="edit-btn" onclick={() => void toggleBlock(data!.user.id)}>
            {isBlocked(data.user.id) ? "Unblock" : "Block"}
          </button>
          <button class="edit-btn" onclick={reportUser}>{reportedUser ? "Reported ✓" : "Report"}</button>
        </div>
      {/if}
    </div>

    <input
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp"
      bind:this={fileInput}
      onchange={onFilePicked}
      hidden
    />

    <div class="card">
      <h2>About me</h2>
      {#if editing}
        <textarea
          class="bio-input"
          bind:value={draftBio}
          maxlength="500"
          rows="4"
          placeholder="Tell people a little about yourself…"
        ></textarea>
        <div class="count">{draftBio.length}/500</div>
        {#if saveError}<div class="err">{saveError}</div>{/if}
        <div class="edit-actions">
          <button class="save" disabled={saving} onclick={save}>{saving ? "Saving…" : "Save"}</button>
          <button class="ghost" disabled={saving} onclick={() => (editing = false)}>Cancel</button>
        </div>
      {:else if data.bio}
        <p class="bio">{data.bio}</p>
      {:else}
        <p class="muted">
          {isSelf ? "You haven't written anything yet — hit Edit to add a bio." : "This member hasn't written anything yet."}
        </p>
      {/if}
    </div>

    <!-- The house (admins, the bot) carries no badge wall — the server
         returns an empty list for them and the card simply doesn't show. -->
    {#if data.achievements.length}
    <div class="card">
      <h2>Achievements — {earnedCount}/{data.achievements.length}</h2>
      <div class="ach-grid">
          {#each achievementsSorted as a (a.id)}
            <div class="ach" class:locked={a.earnedAt === null} style="--tier:{ACH_COLOR[a.tier]}">
              <span class="ach-medal">{ACH_MEDAL[a.tier]}</span>
              <div class="ach-body">
                <div class="ach-name">{a.name}</div>
                <div class="ach-desc">{a.desc}</div>
                {#if a.earnedAt !== null}
                  <div class="ach-when">{new Date(a.earnedAt).toLocaleDateString()}</div>
                {:else if a.goal}
                  <div class="ach-prog">
                    <div class="ach-bar"><div class="ach-fill" style="width:{Math.min(100, ((a.cur ?? 0) / a.goal) * 100)}%"></div></div>
                    <span class="ach-nums">{a.cur ?? 0}/{a.goal}</span>
                  </div>
                {/if}
              </div>
            </div>
          {/each}
      </div>
    </div>
    {/if}

    <div class="card">
      <h2>Collection — {data.count}</h2>
      {#if groups.length === 0}
        <p class="muted">
          {isSelf ? "No emoji yet — win some on the wheel!" : "No emoji collected yet."}
        </p>
      {:else}
        {#each groups as g (g.tier)}
          <div class="tier-row" style="--tier:{TIER_COLOR[g.tier] ?? 'var(--ink-dim)'}">
            <div class="tier-head" style="color:{TIER_COLOR[g.tier] ?? 'var(--ink-soft)'}">
              {g.tier} · {g.items.length}
            </div>
            <div class="grid">
              {#each g.items as e (e.code)}
                {#if g.tier === "abyss" && isSelf}
                  <!-- THE STONE OF THE ABYSS: it answers a click (AbyssStone.svelte) -->
                  <button class="cell stone" title={e.name} onclick={showStone} aria-label={e.name}>
                    <img src={`/emoji/${e.file}`} alt="" loading="lazy" draggable="false" />
                  </button>
                {:else}
                  <img
                    class="cell"
                    class:glow={g.tier === "abyss"}
                    style="border-color:{(TIER_COLOR[g.tier] ?? '#666') + '55'}"
                    src={`/emoji/${e.file}`}
                    alt={e.name}
                    title={e.name}
                    loading="lazy"
                  />
                {/if}
              {/each}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  /* ---- Achievements ---- */
  .ach-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
  }
  .ach {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--tier) 55%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--tier) 8%, transparent);
  }
  .ach.locked {
    border-color: color-mix(in srgb, var(--ink-soft) 25%, transparent);
    background: transparent;
    opacity: 0.75;
  }
  .ach.locked .ach-medal {
    filter: grayscale(1) opacity(0.5);
  }
  .ach-medal {
    font-size: 1.3rem;
    line-height: 1;
    margin-top: 2px;
  }
  .ach-body {
    min-width: 0;
    flex: 1;
  }
  .ach-name {
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--tier);
  }
  .ach.locked .ach-name {
    color: var(--ink);
  }
  .ach-desc {
    font-size: 0.74rem;
    color: var(--ink-soft);
    margin-top: 1px;
  }
  .ach-when {
    font-size: 0.68rem;
    color: color-mix(in srgb, var(--tier) 80%, var(--ink-soft));
    margin-top: 4px;
  }
  .ach-prog {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
  }
  .ach-bar {
    flex: 1;
    height: 5px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--ink-soft) 18%, transparent);
    overflow: hidden;
  }
  .ach-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--tier);
  }
  .ach-nums {
    font-size: 0.66rem;
    color: var(--ink-soft);
    white-space: nowrap;
  }

  .page {
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
    padding: clamp(20px, 5vh, 48px) 24px 48px;
  }
  .back {
    display: block;
    max-width: 720px;
    margin: 0 auto 14px;
    padding: 0;
    background: none;
    border: none;
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.86rem;
    cursor: pointer;
  }
  .back:hover {
    color: var(--ink);
  }
  .state {
    text-align: center;
    color: var(--ink-soft);
    margin-top: 12vh;
  }
  .card {
    max-width: 720px;
    margin: 0 auto 16px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 20px 22px;
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: 20px;
    position: relative;
    overflow: hidden;
  }
  /* Equipped profile banner (Emporium) — a backdrop wash; content sits above. */
  .banner-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .banner-layer.banner-img {
    background-size: cover;
    background-position: center;
    opacity: 0.45; /* a wash, not a wall — the profile text stays readable */
  }
  .head > :global(*:not(.banner-layer)) {
    position: relative;
    z-index: 1;
  }
  .ava {
    position: relative;
    flex: none;
  }
  .dot {
    position: absolute;
    right: 3px;
    bottom: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--ok);
    border: 3px solid var(--panel);
  }
  .cam {
    position: absolute;
    right: -4px;
    bottom: -4px;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--panel-2);
    border: 1px solid var(--line);
    cursor: pointer;
    font-size: 0.8rem;
    line-height: 1;
  }
  .cam:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .cam:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .meta {
    flex: 1;
    min-width: 0;
  }
  .line1 {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  h1 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--ink);
  }
  .name-input {
    width: 100%;
    max-width: 340px;
    padding: 6px 10px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    font: inherit;
    font-size: 1.25rem;
    font-weight: 600;
  }
  .name-input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .badge {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.66rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent-ink);
    background: var(--accent);
  }
  .badge.dead {
    color: #fff;
    background: var(--danger);
  }
  /* THE MARK (Sep 2026): the goblins' public debtor tag. */
  .badge.debt {
    color: #ffb08a;
    background: rgba(140, 50, 30, 0.35);
    border: 1px solid rgba(200, 90, 60, 0.5);
    text-transform: none;
  }
  .badge.bot {
    color: var(--ink);
    background: linear-gradient(150deg, #b87333, #8a5424);
    border: 1px solid #6b3f16;
    color: #fff4e0;
  }
  .badge.earned {
    color: var(--ink);
    background: var(--panel-2);
    border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line));
  }
  .handle {
    margin-top: 3px;
    color: var(--ink-soft);
    font-size: 0.92rem;
  }
  .sub {
    margin-top: 6px;
    color: var(--ink-dim);
    font-size: 0.82rem;
  }
  .on {
    color: var(--ok);
  }
  .off {
    color: var(--ink-dim);
  }
  .photo-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
  .mini {
    padding: 5px 12px;
    border-radius: 7px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .mini:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .mini.ghost {
    background: none;
    color: var(--ink-soft);
  }
  .mini:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .head-actions {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .head-actions .edit-btn {
    width: 100%;
  }
  .edit-btn {
    flex: none;
    padding: 6px 16px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .edit-btn:hover {
    border-color: var(--accent);
  }
  .edit-btn.accent {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
    font-weight: 600;
  }
  h2 {
    margin: 0 0 10px;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-soft);
  }
  .bio {
    margin: 0;
    color: var(--ink);
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .muted {
    margin: 0;
    color: var(--ink-dim);
    line-height: 1.5;
  }
  .bio-input {
    width: 100%;
    resize: vertical;
    padding: 10px 12px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    font: inherit;
    line-height: 1.5;
  }
  .bio-input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .count {
    margin-top: 4px;
    text-align: right;
    font-size: 0.72rem;
    color: var(--ink-dim);
  }
  .edit-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
  .save {
    padding: 7px 18px;
    border-radius: 8px;
    border: none;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .save:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .ghost {
    padding: 7px 16px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: none;
    color: var(--ink-soft);
    font: inherit;
    cursor: pointer;
  }
  .err {
    margin-top: 8px;
    color: var(--danger);
    font-size: 0.82rem;
  }
  /* AN INVENTORY, BY RARITY (Josh, Sep 2026): every tier in its own row
     with a SLIGHT glow of its colour behind it — "not too much". */
  .tier-row {
    margin-bottom: 14px;
    padding: 10px 12px 12px;
    border-radius: 12px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--tier) 10%, transparent), transparent 85%);
    border: 1px solid color-mix(in srgb, var(--tier) 24%, var(--line));
    box-shadow: inset 0 0 24px color-mix(in srgb, var(--tier) 6%, transparent);
  }
  .tier-row:last-child {
    margin-bottom: 0;
  }
  .tier-head {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(46px, 1fr));
    gap: 8px;
  }
  .cell {
    width: 100%;
    aspect-ratio: 1;
    object-fit: contain;
    padding: 5px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 9px;
  }
  /* THE STONE OF THE ABYSS: a button in the grid, breathing violet */
  .cell.stone {
    display: grid;
    place-items: center;
    cursor: pointer;
    border-color: rgba(155, 92, 255, 0.5);
    background: radial-gradient(circle at 50% 50%, rgba(80, 30, 150, 0.35), var(--panel-2) 70%);
    animation: stonebreathe 3.6s ease-in-out infinite;
  }
  .cell.stone img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
  }
  .cell.stone:hover {
    transform: scale(1.06);
  }
  .cell.glow {
    box-shadow: 0 0 14px rgba(140, 70, 255, 0.4);
  }
  .cell.stone:focus-visible {
    outline: 2px solid #b48cff;
    outline-offset: 2px;
  }
  @keyframes stonebreathe {
    0%, 100% { box-shadow: 0 0 10px rgba(140, 70, 255, 0.35); }
    50% { box-shadow: 0 0 24px rgba(170, 100, 255, 0.75); }
  }
  @media (prefers-reduced-motion: reduce) {
    .cell.stone { animation: none !important; }
  }

  /* Phones: the avatar + identity + actions row overflows — let it wrap, and
     drop the action buttons onto their own full-width line. */
  @media (max-width: 560px) {
    .head {
      flex-wrap: wrap;
      gap: 14px;
    }
    h1 {
      font-size: 1.25rem;
      overflow-wrap: anywhere;
    }
    .sub {
      overflow-wrap: anywhere;
    }
    .edit-btn,
    .head-actions {
      width: 100%;
    }
    .head-actions {
      flex-direction: row;
    }
    .head-actions .edit-btn {
      flex: 1;
    }
  }
</style>
