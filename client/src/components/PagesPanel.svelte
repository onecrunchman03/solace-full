<script lang="ts">
  // THE PAGE PICKER — Josh: "when you click it to the right will show a list
  // of available pages and what their description/icon is with active/total
  // users." Clicking a page opens it; the channel sidebar then belongs to it.
  import { pages, createPage, joinPage, cancelRequest, leavePage, loadPages, movePage, GENERAL_PAGE_ID } from "../lib/pages.svelte";
  import { api, ApiError, type PageJoinPolicy } from "../lib/api";
  import { ask, askText } from "../lib/confirm.svelte";
  import { chat, switchToPage, ui } from "../lib/chat.svelte";
  import { session } from "../lib/session.svelte";
  import PageIcon from "./PageIcon.svelte";

  let creating = $state(false);
  let name = $state("");
  let description = $state("");
  let joinPolicy = $state<PageJoinPolicy>("open");
  let discoverable = $state(true);
  let busy = $state(false);
  let error = $state("");
  /** The knock button flips to its consequence on hover — "requested ✓" is a
   *  withdraw button, and a checkmark that cancels on click is a surprise. */
  let hoverKnock = $state<number | null>(null);
  /** Staff reordering the rail. */
  let arranging = $state(false);

  // Unread messages per page: the cards say where the activity is. Only
  // channels we can see count — which is exactly the set that arrives.
  const unreadByPage = $derived.by(() => {
    const out = new Map<number, number>();
    for (const c of chat.channels) {
      const n = chat.unread[c.id] ?? 0;
      if (n > 0) out.set(c.pageId, (out.get(c.pageId) ?? 0) + n);
    }
    return out;
  });

  const POLICY_COPY: Record<PageJoinPolicy, string> = {
    open: "anyone can walk in",
    request: "people ask; managers approve",
    invite: "members are added by hand",
  };

  // The panel mounts each time the picker opens — refresh the cards so the
  // online/member counts are current rather than whenever the last page
  // event happened to rebroadcast them. A failure keeps the cached list; the
  // reconnect resync catches it up.
  $effect(() => {
    loadPages().catch(() => {});
  });

  const me = $derived(session.user);
  // Only the admin creates pages on the hub (the server enforces it too) —
  // anyone else who wants a page of their own self-hosts one (the band below).
  const canCreate = $derived(!!me?.isAdmin);
  // ADMINS configure any page from the list; everyone else — moderators
  // included (Sep 2026 scoping) — gets the gear only where they manage.
  const isStaff = $derived(!!me?.isAdmin);

  async function submit(e: Event) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    busy = true;
    error = "";
    try {
      const page = await createPage(
        name.trim(), description.trim(), joinPolicy,
        joinPolicy === "open" ? true : discoverable,
      );
      creating = false;
      name = "";
      description = "";
      joinPolicy = "open";
      discoverable = true;
      await switchToPage(page.id);
    } catch (err) {
      error = err instanceof Error ? err.message : "Couldn't create that page";
    } finally {
      busy = false;
    }
  }

  async function enter(p: (typeof pages.list)[number]) {
    const mine = p.role !== null;
    if (!mine && p.joinPolicy !== "open") return; // the card's button handles knocking
    // Walking into an open page is what enrols you.
    if (!mine) {
      try {
        await joinPage(p.id);
      } catch {
        /* already in, or a race — opening it is still right */
      }
    }
    await switchToPage(p.id);
  }

  async function knock(id: number) {
    error = "";
    hoverKnock = null; // the button under the pointer is about to swap
    try {
      await joinPage(id);
    } catch {
      error = "Couldn't send that request.";
    }
  }

  async function unknock(id: number) {
    error = "";
    hoverKnock = null;
    try {
      await cancelRequest(id);
    } catch {
      error = "Couldn't withdraw that request.";
    }
  }

  /** A refused reorder (another staffer changed the list mid-Arrange) must
   *  not fail silently — say so and pull the fresh order. */
  async function nudge(id: number, dir: -1 | 1) {
    error = "";
    try {
      await movePage(id, dir);
    } catch {
      error = "Couldn't reorder — the list changed. Refreshed it.";
      loadPages().catch(() => {});
    }
  }

  // The satellite-app download: members-only by ROUTE auth (the whole panel
  // already sits behind login; the server is what actually gates the file).
  // Blob-fetch → synthetic <a download> because a plain link can't send the
  // bearer token and a ?token= link would be a shareable session.
  let downloading = $state(false);
  let dlError = $state("");
  async function downloadSatellite() {
    if (downloading) return;
    downloading = true;
    dlError = "";
    try {
      const blob = await api.satelliteAppBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Solace-Satellite-Setup.exe";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke late — the browser reads the blob after the click returns.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      dlError = e instanceof ApiError && e.status === 404
        ? "The installer isn't on the server yet."
        : "Download failed — try again.";
    } finally {
      downloading = false;
    }
  }

  // The Linux how-to (F8): an expandable guide under the band — the CLI
  // one-liner, what the wizard asks, and the full command list.
  let linuxOpen = $state(false);
  let copied = $state(false);
  const linuxCmd = `curl -fsSL ${location.origin}/api/satellite/install.sh | sudo bash -s -- --key YOUR-KEY`;
  const LINUX_CMDS: [string, string][] = [
    ["solace-satellite status", "how the community is doing"],
    ["solace-satellite config", "change settings — storage, backups, retention, voice"],
    ["solace-satellite logs", "follow the live log"],
    ["solace-satellite backup", "run a backup right now"],
    ["solace-satellite update", "upgrade to the latest version in place"],
    ["solace-satellite restart", "restart the service"],
    ["solace-satellite stop / start", "take the community offline / bring it back"],
    ["solace-satellite uninstall", "remove it from the machine"],
  ];
  async function copyLinuxCmd() {
    try {
      await navigator.clipboard.writeText(linuxCmd);
      copied = true;
      setTimeout(() => (copied = false), 1800);
    } catch { /* clipboard blocked — the text is selectable */ }
  }

  /** REPORT A COMMUNITY (THE PAPERWORK, Sep 2026): a whole page — the thing
   *  to reach for when a hosted community's host isn't keeping it clean. It
   *  goes privately to the admin, who is DMed at once and has the delist
   *  switch beside the report count. */
  let reportedPage = $state<number | null>(null);
  async function reportPage(id: number, name: string): Promise<void> {
    const reason = await askText({
      title: `Report ${name}`,
      label: "What's going on there?",
      placeholder: "tell the admin what you saw and where",
      confirm: "report",
      maxLength: 500,
    });
    if (!reason) return;
    try {
      await api.report("page", id, reason);
      reportedPage = id;
      setTimeout(() => (reportedPage = null), 4000);
    } catch {
      error = "Couldn't send that report.";
    }
  }

  /** Leaving a PRIVATE page is one-way for an ordinary member — only staff can
   *  put them back — so that one asks first. A public page can be walked back
   *  into by tapping it, so it just goes. */
  async function doLeave(id: number, name: string, pub: boolean) {
    if (!pub && !(await ask({ title: `Leave ${name}?`, body: "It's private — you won't see it again unless a moderator adds you back.", confirm: "leave the page", danger: true }))) return;
    error = "";
    try {
      const wasViewing = pages.currentId === id;
      await leavePage(id);
      // Leaving the page you were VIEWING must move the message pane too —
      // leavePage resets currentId, but without this the old page's
      // conversation sat behind General's rail.
      if (wasViewing) await switchToPage(pages.currentId);
    } catch {
      error = "Couldn't leave that page.";
    }
  }
</script>

<section class="panel">
  <header>
    <div>
      <h2>Solace Pages</h2>
      <p class="sub">Communities, each with their own channels.</p>
    </div>
    <div class="headbtns">
      {#if isStaff && pages.list.length > 2}
        <button class="new" class:on={arranging} onclick={() => (arranging = !arranging)}>
          {arranging ? "Done" : "Arrange"}
        </button>
      {/if}
      {#if canCreate}
        <button class="new" onclick={() => (creating = !creating)}>
          {creating ? "Cancel" : "+ New page"}
        </button>
      {/if}
    </div>
  </header>

  {#if error && !creating}<p class="err top">{error}</p>{/if}
  {#if reportedPage !== null}<p class="sent top">Reported. The admin has been told.</p>{/if}

  <!-- Above the list (Josh: the list will grow — the door to hosting must
       not sink below the fold). -->
  <div class="selfhost">
    <span class="shicon">🛰</span>
    <span class="shbody">
      <span class="shtitle">Want to self-host?</span>
      <span class="shdesc">Host a community on your own machine — its messages live on your disk. An admin key gets you linked.</span>
    </span>
    <span class="shbtns">
      <button class="shbtn" onclick={downloadSatellite} disabled={downloading} title="Download the Solace Satellite desktop app">
        {downloading ? "Downloading…" : "⊞  Windows app"}
      </button>
      <button class="shbtn" class:on={linuxOpen} onclick={() => (linuxOpen = !linuxOpen)} title="One-line install for an Ubuntu server">
        🐧  Linux server <span class="chev">{linuxOpen ? "▴" : "▾"}</span>
      </button>
    </span>
  </div>
  {#if dlError}<p class="err shderr">{dlError}</p>{/if}

  {#if linuxOpen}
    <div class="linuxguide">
      <div class="lgcol">
        <h3>Windows</h3>
        <p class="lgp">
          Download the app above, open it, paste your key, name your community —
          done. It lives in the tray; the Settings card holds storage, backups
          and voice hosting.
        </p>
        <h3>Ubuntu server</h3>
        <p class="lgp">One line, on the box (Ubuntu 22.04+, needs sudo):</p>
        <div class="lgcmd">
          <code>{linuxCmd}</code>
          <button class="lgcopy" onclick={copyLinuxCmd}>{copied ? "Copied ✓" : "Copy"}</button>
        </div>
        <p class="lgp">
          The installer asks the rest in order — community name, who can join,
          where messages live, how long files are kept, daily backups, voice —
          and <b>Enter takes the sensible default</b> on every question. It runs
          as a system service and survives reboots by itself.
        </p>
      </div>
      <div class="lgcol">
        <h3>Afterwards, on the box</h3>
        <table class="lgcmds">
          <tbody>
            {#each LINUX_CMDS as [cmd, what] (cmd)}
              <tr><td><code>{cmd}</code></td><td>{what}</td></tr>
            {/each}
          </tbody>
        </table>
        <p class="lgp lgfoot">
          <code>config</code> reopens the setup questions any time. Community
          name &amp; privacy live here in Solace — your page → Page Settings.
          Hosting calls on the box wants router ports
          <b>TCP 7880 · TCP 7881 · UDP 50000–50060</b>; unforwarded, calls
          quietly run on the main server instead.
        </p>
      </div>
    </div>
  {/if}

  {#if creating}
    <form class="make" onsubmit={submit}>
      <input class="f" bind:value={name} placeholder="Page name" maxlength="60" />
      <input class="f" bind:value={description} placeholder="What is it for?" maxlength="240" />
      <label class="pub sel">
        <span class="lbl">Joining</span>
        <select bind:value={joinPolicy}>
          <option value="open">Open — {POLICY_COPY.open}</option>
          <option value="request">Request — {POLICY_COPY.request}</option>
          <option value="invite">Invite only — {POLICY_COPY.invite}</option>
        </select>
      </label>
      {#if joinPolicy !== "open"}
        <label class="pub">
          <input type="checkbox" bind:checked={discoverable} />
          <span>
            <b>{discoverable ? "Discoverable" : "Hidden"}</b>
            {discoverable
              ? "— everyone sees the page exists (never its channels)"
              : "— invisible to everyone but members and staff"}
          </span>
        </label>
      {/if}
      {#if error}<p class="err">{error}</p>{/if}
      <button class="go" disabled={!name.trim() || busy}>{busy ? "Creating…" : "Create page"}</button>
    </form>
  {/if}

  <ul class="list">
    {#each pages.list as p, i (p.id)}
      {@const mine = p.role !== null}
      {@const unread = unreadByPage.get(p.id) ?? 0}
      <li class="row">
        {#if arranging && p.id !== GENERAL_PAGE_ID}
          <span class="arrows">
            <button class="mv" disabled={i <= 1} aria-label={`Move ${p.name} up`}
              onclick={() => nudge(p.id, -1)}>▲</button>
            <button class="mv" disabled={i >= pages.list.length - 1} aria-label={`Move ${p.name} down`}
              onclick={() => nudge(p.id, 1)}>▼</button>
          </span>
        {/if}
        <button
          class="card"
          class:active={p.id === pages.currentId}
          onclick={() => enter(p)}
        >
          <PageIcon page={p} size={46} />
          <span class="body">
            <span class="top">
              <span class="nm">{p.name}</span>
              {#if unread > 0}<span class="pip" title={`${unread} unread`}>{unread > 99 ? "99+" : unread}</span>{/if}
              {#if p.id === GENERAL_PAGE_ID}
                <span class="tag home">home</span>
              {:else if p.joinPolicy === "invite"}
                <span class="tag priv">invite only</span>
              {:else if p.joinPolicy === "request"}
                <span class="tag req">request to join</span>
              {/if}
              {#if p.satelliteId != null}
                <span class="tag sat" class:down={p.remoteUp === false} title="Hosted by a community member's own server">
                  {p.remoteUp === false ? "🛰 offline" : "🛰 community"}
                </span>
              {/if}
              {#if p.role === "manager"}<span class="tag mgr">manager</span>{/if}
              {#if (isStaff || p.role === "manager") && (p.pending ?? 0) > 0}
                <span class="tag knock">{p.pending} waiting</span>
              {/if}
            </span>
            <span class="desc">{p.description ?? "No description yet."}</span>
            <span class="counts">
              <span class="dot" class:live={p.online > 0}></span>
              {p.online} active · {p.members} member{p.members === 1 ? "" : "s"}
              {#if !mine && p.joinPolicy === "open"}<span class="join">· tap to join</span>{/if}
              {#if !mine && p.joinPolicy === "invite"}<span class="join dim">· a moderator adds members</span>{/if}
            </span>
          </span>
        </button>
        {#if !mine && p.joinPolicy === "request"}
          {#if p.requested}
            <button
              class="gear knockbtn on"
              title="Withdraw your request"
              onmouseenter={() => (hoverKnock = p.id)}
              onmouseleave={() => (hoverKnock = null)}
              onclick={() => unknock(p.id)}
            >{hoverKnock === p.id ? "withdraw" : "requested ✓"}</button>
          {:else}
            <button class="gear knockbtn" title="Ask to join" onclick={() => knock(p.id)}>request</button>
          {/if}
        {/if}
        {#if mine && p.id !== GENERAL_PAGE_ID}
          <button
            class="gear leave"
            title={`Leave ${p.name}`}
            aria-label={`Leave ${p.name}`}
            onclick={() => doLeave(p.id, p.name, p.joinPolicy === "open")}
          >⏏</button>
        {/if}
        {#if isStaff || p.role === "manager"}
          <button class="gear" title={`Configure ${p.name}`} onclick={() => (ui.pageSettingsId = p.id)}>⚙</button>
        {/if}
        {#if p.id !== GENERAL_PAGE_ID && !isStaff}
          <button class="gear flag" title={`Report ${p.name} to the admin`} aria-label={`Report ${p.name}`} onclick={() => reportPage(p.id, p.name)}>⚑</button>
        {/if}
      </li>
    {/each}
    {#if pages.loading && !pages.list.length}
      <li class="empty">Loading pages…</li>
    {:else if !pages.list.length}
      <li class="empty">No pages yet.</li>
    {/if}
  </ul>
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    padding: 1.5rem 1.75rem 2rem;
    background: var(--bg);
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }
  h2 {
    margin: 0;
    font-size: 1.35rem;
    letter-spacing: 0.01em;
  }
  .sub {
    margin: 0.2rem 0 0;
    color: var(--ink-soft);
    font-size: 0.86rem;
  }
  .new {
    flex: none;
    padding: 0.45rem 0.8rem;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--ink);
    cursor: pointer;
    font-size: 0.85rem;
  }
  .new:hover { border-color: var(--accent); color: var(--accent); }
  .make {
    display: grid;
    gap: 0.55rem;
    padding: 0.9rem;
    margin-bottom: 1.1rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel);
  }
  .f {
    padding: 0.5rem 0.65rem;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--ink);
    font: inherit;
  }
  .pub { display: flex; gap: 0.5rem; align-items: flex-start; font-size: 0.84rem; color: var(--ink-soft); }
  .pub b { color: var(--ink); }
  .err { margin: 0; color: var(--danger, #d9534f); font-size: 0.84rem; }
  .err.top { margin: -0.6rem 0 0.8rem; }
  .sent { margin: 0; color: var(--ok, #6fbf73); font-size: 0.84rem; }
  .sent.top { margin: -0.6rem 0 0.8rem; }
  .gear.flag { font-size: 0.9rem; }
  .gear.flag:hover { color: var(--danger, #d9534f); border-color: var(--danger, #d9534f); }
  .headbtns { display: flex; gap: 0.4rem; flex: none; }
  .new.on { border-color: var(--accent); color: var(--accent); }
  .arrows { display: flex; flex-direction: column; gap: 0.2rem; justify-content: center; }
  .mv {
    width: 1.7rem;
    flex: 1;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 0.7rem;
  }
  .mv:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
  .mv:disabled { opacity: 0.35; cursor: default; }
  .pip {
    background: var(--accent);
    color: var(--accent-ink, #1b1207);
    font-size: 0.68rem;
    font-weight: 700;
    padding: 0.08rem 0.4rem;
    border-radius: 999px;
    line-height: 1.3;
  }
  .join.dim { color: var(--ink-soft); }
  .go {
    justify-self: start;
    padding: 0.45rem 0.9rem;
    border-radius: 8px;
    border: none;
    background: var(--accent);
    color: #1b1207;
    font-weight: 600;
    cursor: pointer;
  }
  .go:disabled { opacity: 0.5; cursor: default; }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; min-width: 0; }
  /* min-width: 0 on the row too — it is a GRID item, and a grid item's
     min-width also defaults to its content (the sideways-scrolling picker
     on phones was this, one level up from the card). */
  .row { display: flex; align-items: stretch; gap: 0.4rem; min-width: 0; }
  .gear {
    flex: none;
    width: 2.6rem;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--ink-soft);
    cursor: pointer;
    font-size: 1rem;
  }
  .gear:hover { color: var(--accent); border-color: var(--accent); }
  .gear.leave:hover { color: var(--danger, #d9534f); border-color: var(--danger, #d9534f); }
  .card {
    width: 100%;
    /* A flex item's min-width defaults to its content — a long nowrap
       description made the card wider than a phone and the whole picker
       scrolled sideways. Zero lets the description truncate instead. */
    min-width: 0;
    display: flex;
    gap: 0.85rem;
    align-items: center;
    text-align: left;
    padding: 0.75rem 0.9rem;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--ink);
    cursor: pointer;
  }
  .card:hover { border-color: var(--accent); }
  .card.active { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .body { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .top { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; }
  .nm { font-weight: 600; }
  .tag {
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.1rem 0.35rem;
    border-radius: 5px;
    border: 1px solid var(--line);
    color: var(--ink-soft);
  }
  .tag.home { color: var(--accent); border-color: var(--accent); }
  .tag.priv { color: #c98b8b; border-color: #7a4b4b; }
  .tag.req { color: var(--accent); border-color: currentColor; }
  .tag.knock { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); font-weight: 700; }
  .tag.mgr { color: var(--ok, #6fbf73); border-color: currentColor; }
  .tag.sat { color: var(--accent); border-color: currentColor; }
  .tag.sat.down { color: #c98b8b; border-color: #7a4b4b; }
  .pub.sel { align-items: center; }
  .pub.sel .lbl { font-weight: 700; color: var(--ink); }
  .pub.sel select {
    flex: 1;
    padding: 6px 8px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    font-size: 0.84rem;
  }
  .knockbtn {
    font-size: 0.72rem;
    font-weight: 700;
    white-space: nowrap;
    padding: 6px 10px;
  }
  .knockbtn.on { color: var(--accent); }
  .desc {
    color: var(--ink-soft);
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .counts { color: var(--ink-soft); font-size: 0.78rem; display: flex; align-items: center; gap: 0.35rem; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--line); }
  .dot.live { background: var(--ok, #6fbf73); }
  .join { color: var(--accent); }
  .empty { color: var(--ink-soft); font-size: 0.9rem; }
  .selfhost {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    margin-bottom: 1rem;
    padding: 0.75rem 0.9rem;
    border: 1px dashed var(--line);
    border-radius: 12px;
    background: var(--panel);
  }
  .err.shderr { margin: -0.6rem 0 0.8rem; }
  .shicon { font-size: 1.4rem; flex: none; }
  .shbody { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  .shtitle { font-weight: 600; }
  .shdesc { color: var(--ink-soft); font-size: 0.82rem; }
  .shbtn {
    flex: none;
    margin-left: auto;
    padding: 0.45rem 0.85rem;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--ink);
    cursor: pointer;
    font-size: 0.82rem;
    white-space: nowrap;
  }
  .shbtn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .shbtn:disabled { opacity: 0.6; cursor: default; }
  .shbtn.on { border-color: var(--accent); color: var(--accent); }
  .shbtns { display: flex; gap: 0.5rem; flex: none; margin-left: auto; }
  .shbtns .shbtn { margin-left: 0; }
  .chev { font-size: 0.7rem; opacity: 0.8; }
  .linuxguide {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 1.4rem;
    margin: -0.4rem 0 1rem;
    padding: 0.9rem 1rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
  }
  /* min-width: 0 — the nowrap one-liner must scroll INSIDE its box, never
     widen the grid column past the viewport (it clipped every paragraph on
     phones without this). */
  .lgcol { min-width: 0; }
  .linuxguide h3 {
    margin: 0.4rem 0 0.25rem;
    font-size: 0.78rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }
  .lgp { margin: 0.15rem 0 0.6rem; font-size: 0.84rem; color: var(--ink); line-height: 1.45; }
  .lgp b { color: var(--accent); font-weight: 600; }
  .lgcmd {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg);
    margin-bottom: 0.6rem;
    overflow-x: auto;
  }
  .lgcmd code {
    font-size: 0.76rem;
    white-space: nowrap;
    color: var(--ink);
    user-select: all;
  }
  .lgcopy {
    flex: none;
    margin-left: auto;
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--ink);
    font-size: 0.74rem;
    cursor: pointer;
  }
  .lgcopy:hover { border-color: var(--accent); color: var(--accent); }
  .lgcmds { border-collapse: collapse; width: 100%; font-size: 0.8rem; }
  .lgcmds td { padding: 0.24rem 0.6rem 0.24rem 0; vertical-align: top; }
  .lgcmds td:first-child { white-space: nowrap; }
  @media (max-width: 700px) {
    .lgcmds td:first-child { white-space: normal; }
    .lgcmds td:first-child code { overflow-wrap: anywhere; }
  }
  .lgcmds code { color: var(--accent); font-size: 0.76rem; }
  .lgcmds tr + tr td { border-top: 1px solid var(--line); }
  .lgfoot { color: var(--ink-soft); font-size: 0.78rem; margin-top: 0.6rem; }
  .lgfoot code { color: var(--accent); }
  @media (max-width: 700px) {
    .selfhost { flex-wrap: wrap; }
    .shbtns { margin-left: 0; flex-wrap: wrap; }
    .linuxguide { grid-template-columns: 1fr; }
  }
  /* Phone mode: nobody hosts a satellite from a phone — the installers'
     band is desktop furniture. */
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .selfhost { display: none; }
  }
  @media (max-width: 700px) {
    .panel { padding: 1rem; }
  }
  /* PHONE MODE: the picker is a screen of its own — an app-bar header. */
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .panel { padding: 0.9rem 0.85rem 1.5rem; }
    header { margin-bottom: 0.9rem; align-items: center; }
    h2 { font-size: 1.3rem; }
    .sub { font-size: 0.82rem; }
    .new { padding: 0.55rem 0.85rem; border-radius: 10px; }
    .card { padding: 0.8rem 0.85rem; gap: 0.75rem; }
    .card:hover:not(.active) { border-color: var(--line); }
    .nm { font-size: 1.02rem; }
    .gear { width: 2.8rem; }
  }
</style>
