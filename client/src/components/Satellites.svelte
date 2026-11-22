<script lang="ts">
  // ADMIN PANEL → SATELLITES (FEDERATION F1). The registry of self-hosted
  // community servers: mint a provisioning key for a member, watch the
  // links, read the event ledger, and pull the delist kill switch.
  // Function-first, like the rest of the console.
  import { api } from "../lib/api";
  import { ask, askText } from "../lib/confirm.svelte";
  import { chat } from "../lib/chat.svelte";
  import { loadPages } from "../lib/pages.svelte";
  import Avatar from "./Avatar.svelte";

  type Data = Awaited<ReturnType<typeof api.adminSatellites>>;
  let data = $state<Data | null>(null);
  let error = $state("");

  // Minting: pick the member who'll own the satellite, hand them the code.
  let ownerQuery = $state("");
  let ownerId = $state<number | null>(null);
  let note = $state("");
  let ttlHours = $state(72);
  let minted = $state<{ code: string; expiresAt: number; rotation?: string } | null>(null);
  let copied = $state(false);

  const candidates = $derived(
    ownerQuery.trim()
      ? chat.members
          .filter((u) => !u.isBot)
          .filter((u) =>
            u.displayName.toLowerCase().includes(ownerQuery.toLowerCase()) ||
            u.username.toLowerCase().includes(ownerQuery.toLowerCase()),
          )
          .slice(0, 6)
      : [],
  );
  const owner = $derived(chat.members.find((u) => u.id === ownerId) ?? null);

  async function refresh(): Promise<void> {
    try {
      data = await api.adminSatellites();
    } catch {
      /* keep the last view; the next poll retries */
    }
  }
  $effect(() => {
    void refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  });

  async function mint(): Promise<void> {
    if (ownerId == null) return;
    error = "";
    try {
      const r = await api.mintSatelliteKey(ownerId, ttlHours, note.trim() || undefined);
      minted = { code: r.code, expiresAt: r.expiresAt };
      copied = false;
      ownerQuery = ""; note = "";
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't mint that key.";
    }
  }

  async function copyCode(): Promise<void> {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted.code);
      copied = true;
    } catch { /* clipboard denied — the code is on screen */ }
  }

  async function revokeKey(id: number): Promise<void> {
    error = "";
    try { await api.revokeSatelliteKey(id); await refresh(); }
    catch { error = "Couldn't revoke that key."; }
  }

  async function delist(id: number, name: string): Promise<void> {
    if (!(await ask({
      title: `Delist ${name}?`,
      body: "Its link drops immediately and it cannot reconnect. Its community goes offline for everyone until it's reinstated.",
      confirm: "delist it",
      danger: true,
    }))) return;
    error = "";
    try { await api.delistSatellite(id); await refresh(); }
    catch { error = "Couldn't delist it."; }
  }

  async function reinstate(id: number): Promise<void> {
    error = "";
    try { await api.reinstateSatellite(id); await refresh(); }
    catch { error = "Couldn't reinstate it."; }
  }

  /** F3: mint a ROTATION key — the host's new box redeems it in the normal
   *  setup form and the community comes back under the same satellite id;
   *  the old identity key dies the moment it's redeemed. */
  async function rotate(id: number, name: string): Promise<void> {
    if (!(await ask({
      title: `Rotate ${name}'s identity?`,
      body: "Mints a one-shot key for the host's new machine. Redeeming it kills the old identity key instantly — use this when a host's box is lost or compromised.",
      confirm: "mint the rotation key",
    }))) return;
    error = "";
    try {
      const r = await api.mintSatelliteRotationKey(id, ttlHours);
      minted = { code: r.code, expiresAt: r.expiresAt, rotation: name };
      copied = false;
      await refresh();
    } catch {
      error = "Couldn't mint the rotation key.";
    }
  }

  /** F2: bind the community page. One per satellite; it opens as a
   *  request-to-join page with a #lobby, owned by the satellite's owner. */
  async function makePage(id: number): Promise<void> {
    const name = await askText({
      title: "Name the community page",
      body: "It opens request-to-join with a #lobby channel, managed by the satellite's owner.",
      confirm: "create the page",
    });
    if (!name) return;
    error = "";
    try {
      await api.createSatellitePage(id, name);
      await Promise.all([refresh(), loadPages()]);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't create the page.";
    }
  }

  /** F6: the weekly loop — download the unfixed error report, hand it to a
   *  session for fixing, then mark everything in it processed. */
  let erBusy = $state(false);
  async function downloadErrors(): Promise<void> {
    erBusy = true;
    error = "";
    try {
      const blob = await api.satErrorsExportBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `satellite-errors-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      error = "Couldn't export the error report.";
    } finally {
      erBusy = false;
    }
  }
  async function markProcessed(): Promise<void> {
    if (!(await ask({
      title: "Mark all error reports processed?",
      body: "Do this AFTER the exported report has been handled. These signatures stop appearing in exports — unless the same error recurs later, which reopens it.",
      confirm: "mark them processed",
    }))) return;
    error = "";
    try {
      await api.satErrorsProcessed();
      await refresh();
    } catch {
      error = "Couldn't mark them processed.";
    }
  }

  const ts = (at: number | null): string => (at ? new Date(at).toLocaleString() : "never");
  const keyState = (k: NonNullable<Data>["keys"][number]): string =>
    k.revoked ? "revoked" : k.usedAt ? "used" : (data && k.expiresAt < data.now) ? "expired" : "unused";
</script>

<h2>Satellites</h2>
<p class="lead">
  Self-hosted community servers. A satellite exists only if you minted a key
  for someone — the key opens the door once; their box's own keypair is the
  standing credential, and delisting cuts the wire instantly.
</p>
{#if error}<p class="err">{error}</p>{/if}

<section class="block">
  <h3>Mint a provisioning key</h3>
  <div class="mint">
    {#if owner}
      <span class="picked">
        <Avatar name={owner.displayName} id={owner.id} avatar={owner.avatar} size={22} />
        {owner.displayName}
        <button class="mini" onclick={() => (ownerId = null)}>✕</button>
      </span>
    {:else}
      <div class="find">
        <input bind:value={ownerQuery} placeholder="Who will own it?" />
        {#if candidates.length}
          <ul class="cands">
            {#each candidates as u (u.id)}
              <li><button onclick={() => { ownerId = u.id; ownerQuery = ""; }}>
                <Avatar name={u.displayName} id={u.id} avatar={u.avatar} size={20} /> {u.displayName}
              </button></li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
    <input class="note" bind:value={note} placeholder="Note (optional)" maxlength="120" />
    <label class="ttl">expires in
      <select bind:value={ttlHours}>
        <option value={24}>24h</option>
        <option value={72}>72h</option>
        <option value={168}>7d</option>
      </select>
    </label>
    <button class="btn go" disabled={ownerId == null} onclick={mint}>Mint key</button>
  </div>
  {#if minted}
    <div class="code">
      <p>
        {minted.rotation
          ? `Rotation key for ${minted.rotation} — the host pastes it into a fresh Solace Satellite install; redeeming it kills the old identity. Shown ONCE, dies ${ts(minted.expiresAt)}:`
          : `Hand this to the host — it is shown ONCE and dies ${ts(minted.expiresAt)}:`}
      </p>
      <div class="codebox">
        <code>{minted.code}</code>
        <button class="btn" onclick={copyCode}>{copied ? "Copied ✓" : "Copy"}</button>
        <button class="btn ghost" onclick={() => (minted = null)}>Done</button>
      </div>
    </div>
  {/if}
</section>

<section class="block">
  <h3>Registered satellites</h3>
  {#if data?.satellites.length}
    <div class="tbl">
      {#each data.satellites as s (s.id)}
        <div class="row" class:dead={s.status !== "active"}>
          <span class="dot" class:live={s.connected}></span>
          <span class="nm">{s.name} <span class="sub">#{s.id} · v{s.version || "?"}</span></span>
          <span class="own">{s.owner?.displayName ?? "?"}</span>
          <span class="seen">{s.connected ? "connected" : `last seen ${ts(s.lastSeenAt)}`}</span>
          <span class="net">{s.network ?? ""}</span>
          {#if s.openReports > 0}
            <span class="sub flag" title="Open reports pointing into this community — Admin Panel › Moderation has them">🚩 {s.openReports} open report{s.openReports === 1 ? "" : "s"}</span>
          {/if}
          {#if s.hostingVersion == null && s.status === "active"}
            <span class="sub flag" title="Registered before the Host Agreement existed — no acceptance on file">no host agreement</span>
          {/if}
          {#if s.pageName}
            <span class="sub">📄 {s.pageName}</span>
          {:else if s.status === "active"}
            <button class="mini" onclick={() => makePage(s.id)}>Create page</button>
          {/if}
          {#if s.status === "active"}
            <button class="mini" onclick={() => rotate(s.id, s.name)}>Rotate key</button>
            <button class="mini danger" onclick={() => delist(s.id, s.name)}>Delist</button>
          {:else}
            <span class="revoked">delisted</span>
            <button class="mini" onclick={() => reinstate(s.id)}>Reinstate</button>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <p class="muted">None yet. Mint a key and hand it to a host.</p>
  {/if}
</section>

{#if data?.keys.length}
  <section class="block">
    <h3>Provisioning keys</h3>
    <div class="tbl">
      {#each data.keys as k (k.id)}
        <div class="row">
          <span class="nm">key #{k.id} <span class="sub">for {k.owner?.displayName ?? "?"}{k.note ? ` · ${k.note}` : ""}</span></span>
          <span class="state s-{keyState(k)}">{keyState(k)}</span>
          <span class="seen">{k.usedAt ? `used ${ts(k.usedAt)}` : `expires ${ts(k.expiresAt)}`}</span>
          {#if keyState(k) === "unused"}
            <button class="mini danger" onclick={() => revokeKey(k.id)}>Revoke</button>
          {/if}
        </div>
      {/each}
    </div>
  </section>
{/if}

<section class="block">
  <h3>Host error reports</h3>
  <div class="row">
    <span class="nm">
      {#if (data?.errorCount ?? 0) > 0}
        <span class="errcount">{data?.errorCount}</span> unfixed error signature{data?.errorCount === 1 ? "" : "s"} from satellite hosts
      {:else}
        No unfixed errors — the ledger is clean
      {/if}
    </span>
    <button class="mini" disabled={erBusy} onclick={downloadErrors}>Download error report</button>
    {#if (data?.errorCount ?? 0) > 0}
      <button class="mini" onclick={markProcessed}>Mark all processed</button>
    {/if}
  </div>
  <p class="muted small">Weekly/monthly: download, paste into a session for fixing, then mark processed.
    Fixed signatures are remembered for a year and reopen only if they recur.</p>
</section>

<section class="block">
  <h3>Event ledger</h3>
  <div class="tbl">
    {#each data?.events ?? [] as e (e.id)}
      <div class="row ev">
        <span class="seen">{ts(e.at)}</span>
        <span class="kind k-{e.kind}">{e.kind}</span>
        <span class="sub">{e.satelliteId != null ? `#${e.satelliteId}` : ""} {e.ip ?? ""} {e.detail ?? ""}</span>
      </div>
    {:else}
      <p class="muted">Quiet so far.</p>
    {/each}
  </div>
</section>

<style>
  h2 { margin: 0 0 0.3rem; }
  .lead { color: var(--ink-soft); font-size: 0.88rem; margin: 0 0 1rem; }
  .err { color: var(--danger, #d9534f); font-size: 0.85rem; }
  .block { margin-bottom: 1.4rem; }
  h3 { margin: 0 0 0.5rem; font-size: 0.76rem; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink-soft); }
  .mint { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
  .mint input, .mint select {
    padding: 0.4rem 0.55rem; border-radius: 8px; border: 1px solid var(--line);
    background: var(--bg); color: var(--ink); font: inherit;
  }
  .find { position: relative; min-width: 220px; }
  .find input { width: 100%; }
  .cands {
    position: absolute; top: 100%; left: 0; right: 0; z-index: 5;
    list-style: none; margin: 0.2rem 0 0; padding: 0.2rem;
    background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
  }
  .cands button {
    display: flex; align-items: center; gap: 0.4rem; width: 100%; text-align: left;
    padding: 0.3rem 0.4rem; border: none; background: none; color: var(--ink);
    cursor: pointer; border-radius: 6px; font-size: 0.86rem;
  }
  .cands button:hover { background: var(--hover, rgba(255,255,255,0.06)); }
  .picked { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.88rem; }
  .note { flex: 1; min-width: 160px; }
  .ttl { display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; color: var(--ink-soft); }
  .btn {
    padding: 0.4rem 0.75rem; border-radius: 8px; border: 1px solid var(--line);
    background: var(--bg); color: var(--ink); cursor: pointer; font-size: 0.85rem;
  }
  .btn.go { background: var(--accent); color: #1b1207; border: none; font-weight: 600; }
  .btn.ghost { background: none; }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .code p { font-size: 0.84rem; color: var(--ink-soft); margin: 0.7rem 0 0.3rem; }
  .codebox { display: flex; gap: 0.5rem; align-items: center; }
  .codebox code {
    font-size: 1.05rem; letter-spacing: 0.12em; padding: 0.45rem 0.7rem;
    background: var(--bg); border: 1px solid var(--accent); border-radius: 8px;
  }
  .tbl { display: grid; gap: 0.3rem; }
  .row {
    display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
    padding: 0.45rem 0.6rem; border: 1px solid var(--line); border-radius: 8px;
    background: var(--panel); font-size: 0.86rem;
  }
  .row.dead { opacity: 0.65; }
  .row.ev { border: none; background: none; padding: 0.15rem 0.2rem; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--line); flex: none; }
  .dot.live { background: var(--ok, #6fbf73); }
  .nm { font-weight: 600; }
  .sub { color: var(--ink-soft); font-weight: 400; font-size: 0.8rem; }
  .sub.flag { color: #d98a8a; font-weight: 600; }
  .own, .seen, .net { color: var(--ink-soft); font-size: 0.8rem; }
  .state { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .s-unused { color: var(--ok, #6fbf73); }
  .s-used { color: var(--ink-soft); }
  .s-expired, .s-revoked { color: #c98b8b; }
  .revoked { color: #c98b8b; font-size: 0.78rem; }
  .kind { font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink); }
  .k-handshake_failed, .k-delisted, .k-register_refused { color: #d98a8a; }
  .k-registered, .k-connect { color: var(--ok, #6fbf73); }
  .mini {
    font-size: 0.72rem; padding: 0.18rem 0.45rem; border-radius: 6px;
    border: 1px solid var(--line); background: none; color: var(--ink-soft); cursor: pointer;
  }
  .mini:hover { color: var(--ink); border-color: var(--accent); }
  .mini.danger:hover { color: #d98a8a; border-color: #7a4b4b; }
  .muted { color: var(--ink-soft); font-size: 0.85rem; }
  .muted.small { font-size: 0.78rem; margin: 0.4rem 0 0; }
  .errcount {
    background: var(--danger, #d9534f); color: #fff; font-weight: 700;
    padding: 0.05rem 0.45rem; border-radius: 999px; font-size: 0.8rem;
  }
</style>
