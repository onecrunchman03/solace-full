<script lang="ts">
  import { chat, ui, toggleRoster, debtLabel } from "../lib/chat.svelte";
  import { pages, loadRoster } from "../lib/pages.svelte";
  import { session } from "../lib/session.svelte";
  import { openProfile } from "../lib/nav.svelte";
  import { TITLE_NAMES, vipMark } from "../lib/emporium.svelte";
  import { voice } from "../lib/voice.svelte";
  import { statusOf } from "../lib/status.svelte";
  import { roleColorFor } from "../lib/roles.svelte";
  // PAGE ROLES: a role colour on the name, unless a paid flair is equipped.
  const nameStyle = (m: { id: number; cosmetics?: { flair?: string | null } | null }): string => {
    if (m.cosmetics?.flair) return "";
    const c = roleColorFor(pages.currentId, m.id);
    return c ? `color:${c}` : "";
  };
  import { bj } from "../lib/blackjack.svelte";
  import { pit } from "../lib/bonepit.svelte";
  import Avatar from "./Avatar.svelte";
  import { botKind } from "../lib/bots";

  // SCOPED TO THE PAGE YOU ARE ON (Josh, Aug 2026). chat.members is every
  // account on the server; a page's roster should be that page's people.
  // Solace General holds everyone, so it looks exactly as it always did.
  $effect(() => {
    void loadRoster(pages.currentId);
  });
  const pageIds = $derived(
    pages.rosterFor === pages.currentId && pages.rosterIds ? new Set(pages.rosterIds) : null,
  );
  // A LIVE GAME SOCKET IS PROOF SOMEBODY IS HERE (Aug 2026). Presence comes
  // from the app socket, but a body standing in the casino or the backrooms
  // is holding a different socket entirely — if the app one blips, they'd
  // read "offline" while the room can plainly see them. Whoever holds a zone
  // counts as online, and their whereabouts line goes with them.
  const onlineSet = $derived(new Set([...chat.online, ...Object.keys(chat.zones).map(Number)]));
  const members = $derived(
    // While the ids are still in flight, show everyone rather than nobody —
    // an empty roster mid-switch reads as "the page is dead".
    // A PRISONER is disabled like a corpse but is still a member: they show
    // (offline, "in the cells") because bail needs a witness.
    chat.members.filter((m) => (!m.disabled || chat.debtors[m.id] === 5) && (!pageIds || pageIds.has(m.id))),
  );
  const online = $derived(members.filter((m) => onlineSet.has(m.id)));
  const offline = $derived(members.filter((m) => !onlineSet.has(m.id)));
  const collapsed = $derived(ui.rosterCollapsed);

  /** Rich presence: where in the house someone is right now. All three
   *  sources already live on this client (voice presence, blackjack lobby
   *  broadcasts, pit state broadcasts) — the roster just surfaces them. */
  const whereabouts = $derived.by(() => {
    const map = new Map<number, string>();
    // The casino floor FIRST — it's the generic label, so a table seat (more
    // specific) overwrites it below.
    for (const [uid, zs] of Object.entries(chat.zones)) {
      if (zs.some((z) => z.zone === "casino")) map.set(Number(uid), "🎰 on the casino floor");
    }
    for (const g of pit.games) {
      if (g.phase === "done") continue;
      for (const p of g.players) {
        if (p.user && !p.eliminated) map.set(p.user.id, "🎲 in the Bone Pit");
      }
    }
    for (const l of bj.lobbies) {
      for (const s of l.seats) {
        if (s?.user && !s.left) map.set(s.user.id, `🃏 at the ${l.name}`);
      }
    }
    // The other worlds beat any table — a body in the backrooms isn't at
    // a blackjack seat, whatever a stale lobby row says.
    for (const [uid, zs] of Object.entries(chat.zones)) {
      const br = zs.find((z) => z.zone === "backrooms");
      if (br) {
        map.set(Number(uid), br.detail === "pools"
          ? "🌊 in the Poolrooms — Level 1"
          : br.detail === "pipes"
          ? "🔧 in Pipe Dreams — Level 2"
          : br.detail === "station"
          ? "⚡ in the Electrical Station — Level 3"
          : br.detail === "office"
          ? "🗂️ in the Abandoned Office — Level 4"
          : br.detail === "hotel"
          ? "🛎️ in the Terror Hotel — Level 5"
          : br.detail === "lights"
          ? "🔦 in Lights Out — Level 6"
          : br.detail === "ocean"
          ? "🌊 in Thalassophobia — Level 7"
          : br.detail === "cave"
          ? "🪨 in the Cave System — Level 8"
          : br.detail === "suburbs"
          ? "🏡 in the Suburbs — Level 9"
          : "🟨 in the Backrooms — Level 0");
      }
      if (zs.some((z) => z.zone === "escape")) map.set(Number(uid), "🔐 in the Escape Room");
    }
    // Voice last: "in voice" + a game beats just the game label.
    for (const [ch, ids] of Object.entries(voice.presence)) {
      const name = chat.channels.find((c) => c.id === Number(ch))?.name;
      for (const id of ids) {
        const gaming = map.get(id);
        map.set(id, gaming ? `🔊 + ${gaming}` : `🔊 in ${name ?? "voice"}`);
      }
    }
    return map;
  });
</script>

<aside class="roster" class:collapsed>
  {#if collapsed}
    <button class="rail" onclick={toggleRoster} title="Show members ({online.length} online)">
      <span class="chev">◂</span>
      <span class="rail-dot"></span>
      <span class="rail-count">{online.length}</span>
    </button>
  {:else}
    <div class="rheader">
      <span class="rtitle">Members</span>
      <button class="collapse" onclick={toggleRoster} title="Hide members">▸</button>
    </div>

    <div class="group">
      <div class="label">Online — {online.length}</div>
      {#each online as m (m.id)}
        <button class="member" class:you={m.id === session.user?.id} onclick={() => openProfile(m.id)}>
          <Avatar name={m.displayName} id={m.id} avatar={m.avatar} bot={botKind(m)} size={26} border={m.cosmetics?.border} />
          <span class="who-col">
            <span class="name {m.cosmetics?.flair ?? ''}" style={nameStyle(m)}>{m.displayName}{#if debtLabel(m.id)}<span class="debt" title="owes the goblins">⚖ {debtLabel(m.id)}</span>{/if}</span>
            {#if statusOf(m.id)}
              <span class="where">{statusOf(m.id) === "busy" ? "⛔ busy" : "🌙 away"}</span>
            {:else if whereabouts.get(m.id)}
              <span class="where">{whereabouts.get(m.id)}</span>
            {:else if m.cosmetics?.title}
              <span class="title">{#if vipMark(m.cosmetics.title)}<span class="vipmark t{vipMark(m.cosmetics.title)}">✦</span>{/if}{TITLE_NAMES[m.cosmetics.title] ?? ""}</span>
            {/if}
          </span>
          <span class="dot st-{statusOf(m.id) ?? 'online'}" title={statusOf(m.id) ?? "online"}></span>
        </button>
      {/each}
      {#if online.length === 0}<div class="empty">No one online</div>{/if}
    </div>

    {#if offline.length}
      <div class="group">
        <div class="label">Offline — {offline.length}</div>
        {#each offline as m (m.id)}
          <button class="member dim" onclick={() => openProfile(m.id)}>
            <Avatar name={m.displayName} id={m.id} avatar={m.avatar} bot={botKind(m)} size={26} border={m.cosmetics?.border} />
            <span class="who-col">
              <span class="name {m.cosmetics?.flair ?? ''}" style={nameStyle(m)}>{m.displayName}{#if debtLabel(m.id)}<span class="debt" title="owes the goblins">⚖ {debtLabel(m.id)}</span>{/if}</span>
              {#if chat.debtors[m.id] === 5}
                <span class="where cells">🔒 in the goblins' cells</span>
              {:else if m.cosmetics?.title}<span class="title">{#if vipMark(m.cosmetics.title)}<span class="vipmark t{vipMark(m.cosmetics.title)}">✦</span>{/if}{TITLE_NAMES[m.cosmetics.title] ?? ""}</span>{/if}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</aside>

<style>
  .roster {
    background: var(--panel);
    border-left: 1px solid var(--line);
    overflow-y: auto;
    padding: 0.75rem 0.5rem;
  }
  .roster.collapsed {
    padding: 0.6rem 0;
    display: flex;
    justify-content: center;
  }
  /* ---- collapsed rail ---- */
  .rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 8px 0;
    background: none;
    border: none;
    color: var(--ink-soft);
    cursor: pointer;
    font: inherit;
  }
  .rail:hover {
    color: var(--ink);
  }
  .chev {
    font-size: 0.85rem;
  }
  .rail-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    /* Online = --ok, the documented green/amber/red status language (accent
       made "online" nearly match "away" in Cozy and render RED in De Stijl). */
    background: var(--ok);
    box-shadow: 0 0 6px 0 color-mix(in srgb, var(--ok) 55%, transparent);
  }
  .rail-count {
    font-size: 0.78rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  /* ---- header ---- */
  .rheader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.4rem 0.5rem;
  }
  .rtitle {
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ink-dim);
    font-weight: 700;
  }
  .collapse {
    background: none;
    border: none;
    color: var(--ink-dim);
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 5px;
  }
  .collapse:hover {
    color: var(--ink);
    background: var(--panel-2);
  }
  .group {
    margin-bottom: 1rem;
  }
  .label {
    padding: 0 0.5rem 0.4rem;
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--ink-dim);
  }
  .member {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.3rem 0.5rem;
    border-radius: 7px;
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .member:hover {
    background: var(--panel-2);
  }
  .member.dim {
    opacity: 0.55;
  }
  /* THE MARK (Sep 2026): the goblins' public debtor tag. Shame is free. */
  .debt {
    margin-left: 5px;
    padding: 0 5px;
    border-radius: 4px;
    font-size: 0.56rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    vertical-align: 1px;
    color: #ffb08a;
    background: rgba(140, 50, 30, 0.35);
    border: 1px solid rgba(200, 90, 60, 0.5);
    white-space: nowrap;
  }
  .where.cells { color: #d9534f; }
  .member.you .name {
    color: var(--accent);
    font-weight: 500;
  }
  .who-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .name {
    font-size: 0.86rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .where {
    font-size: 0.66rem;
    color: var(--accent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title {
    font-size: 0.62rem;
    color: var(--ink-dim);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    /* Online = --ok (see .rail-dot) — the away/busy variants override below. */
    background: var(--ok);
    box-shadow: 0 0 6px 0 color-mix(in srgb, var(--ok) 55%, transparent);
    flex: none;
  }
  .dot.st-away {
    background: #e0a83c;
    box-shadow: 0 0 6px 0 rgba(224, 168, 60, 0.5);
  }
  .dot.st-busy {
    background: var(--danger);
    box-shadow: 0 0 6px 0 rgba(220, 60, 60, 0.5);
  }
  .empty {
    padding: 0 0.5rem;
    font-size: 0.8rem;
    color: var(--ink-dim);
  }

  /* PHONE MODE: the members drawer — taller rows, a real title. */
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .rheader {
      padding: 0.2rem 0.5rem 0.7rem;
    }
    .rtitle {
      font-size: 0.8rem;
      color: var(--ink-soft);
    }
    .collapse {
      display: none; /* the drawer scrim closes it */
    }
    .label {
      font-size: 0.7rem;
      padding-bottom: 0.5rem;
    }
    .member {
      padding: 0.5rem 0.5rem;
      gap: 0.65rem;
    }
    .name {
      font-size: 0.98rem;
    }
    .where,
    .title {
      font-size: 0.72rem;
    }
    .member:hover {
      background: none;
    }
    .member:active {
      background: var(--panel-2);
    }
  }
</style>
