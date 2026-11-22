<script lang="ts">
  // The Admin Panel, reworked as an operations console: a grouped left nav
  // (Observe / Operate / Manage) with the content pane on the right, so ten
  // sections fit without tab soup. Moderators see only Moderation; admins
  // get the whole house.
  import { onDestroy } from "svelte";
  import { session } from "../lib/session.svelte";
  import { ask } from "../lib/confirm.svelte";
  import { api, type StorageRow, type LoginEvent, type SessionRow, type User } from "../lib/api";
  import AdminTools from "./AdminTools.svelte";
  import ModTools from "./ModTools.svelte";
  import Satellites from "./Satellites.svelte";
  import ServerStats from "./ServerStats.svelte";
  import JukeboxAdmin from "./JukeboxAdmin.svelte";
  import MapEditor from "./MapEditor.svelte";
  import Lazy from "./Lazy.svelte";
  import Avatar from "./Avatar.svelte";
  import { botKind } from "../lib/bots";

  const isAdmin = $derived(!!session.user?.isAdmin);

  type Section =
    | "overview" | "members" | "reports" | "invites" | "connections" | "security" | "audit"
    | "economy" | "house" | "satellites"
    | "backrooms" | "maps" | "jukebox"
    | "survivorz" | "cast"
    | "server" | "logs" | "errors" | "storage"
    | "mod";
  type NavItem = { id: Section; label: string; icon: string };

  // Grouped by what you came to do. Moderators get their one toolkit.
  const NAV: { group: string; items: NavItem[] }[] = [
    { group: "", items: [{ id: "overview", label: "Overview", icon: "🩺" }] },
    {
      group: "People",
      items: [
        { id: "members", label: "Members", icon: "👤" },
        { id: "reports", label: "Reports", icon: "🚩" },
        { id: "invites", label: "Invites", icon: "🎟️" },
        { id: "connections", label: "Who's online", icon: "🔌" },
        { id: "security", label: "Security", icon: "🔒" },
        { id: "audit", label: "Audit trail", icon: "🧾" },
      ],
    },
    {
      group: "The house",
      items: [
        { id: "economy", label: "Economy", icon: "🪙" },
        { id: "house", label: "House levers", icon: "🎩" },
        { id: "satellites", label: "Satellites", icon: "🛰️" },
      ],
    },
    {
      group: "Worlds",
      items: [
        { id: "jukebox", label: "Jukebox", icon: "🎵" },
        { id: "backrooms", label: "Backrooms", icon: "🚪" },
        { id: "maps", label: "Map editor", icon: "🗺️" },
      ],
    },
    {
      group: "Shows",
      items: [
        { id: "survivorz", label: "Survivorz", icon: "🧟" },
        { id: "cast", label: "Characters", icon: "🧬" },
      ],
    },
    {
      group: "Server",
      items: [
        { id: "server", label: "Performance", icon: "📈" },
        { id: "logs", label: "Live logs", icon: "📜" },
        { id: "errors", label: "Errors", icon: "🐞" },
        { id: "storage", label: "Storage", icon: "💾" },
      ],
    },
  ];
  const MOD_NAV: { group: string; items: NavItem[] }[] = [
    { group: "", items: [{ id: "mod", label: "Moderation", icon: "🛡️" }] },
  ];
  const nav = $derived(isAdmin ? NAV : MOD_NAV);
  const allowed = (s: Section) => nav.some((g) => g.items.some((i) => i.id === s));

  // The section you were on survives a refresh (this tab only).
  const SECTION_KEY = "solace_admin_section";
  function savedSection(): Section | null {
    try {
      return (sessionStorage.getItem(SECTION_KEY) as Section | null) ?? null;
    } catch {
      return null;
    }
  }
  let section = $state<Section>(savedSection() ?? "overview");
  $effect(() => {
    // A section this account can't open (a mod, or an old saved id) falls back.
    if (!allowed(section)) section = isAdmin ? "overview" : "mod";
  });
  function goTo(s: Section): void {
    section = s;
    try {
      sessionStorage.setItem(SECTION_KEY, s);
    } catch {
      /* private window */
    }
  }

  // Headings for the sections whose component doesn't carry its own.
  const HEAD: Partial<Record<Section, { title: string; lead?: string }>> = {
    members: { title: "Members", lead: "Pick a member — every card acts on them." },
    reports: { title: "Reports", lead: "What members have flagged. Open ones first." },
    invites: { title: "Invites", lead: "Codes that let someone sign up." },
    house: { title: "House levers", lead: "Server-wide switches, posts and prices." },
    backrooms: { title: "Backrooms", lead: "Tools for playtesting. The community map always shows you the creatures and relics." },
    jukebox: { title: "Jukebox" },
    server: { title: "Performance", lead: "Live load, plus the reports to paste into a review." },
    storage: { title: "Storage", lead: "Disk used per member." },
    mod: { title: "Moderation", lead: "Ban, suspend and mint invite codes." },
  };

  // Open reports drive a nav pill like errors do.
  let openReports = $state(0);

  // ---- Overview (health + quick numbers), refreshed while open ----
  type Check = { name: string; ok: boolean; detail: string };
  let checks = $state<Check[]>([]);
  let overviewErrors = $state(0);
  let overviewCoins = $state<number | null>(null);
  // Findings count drives a nav pill the same way errors do — the whole point
  // of the Security screen is that you don't have to remember to open it.
  let overviewFindings = $state(0);
  let overviewCrit = $state(0);
  async function loadOverview(): Promise<void> {
    try {
      const [h, e, ec, s] = await Promise.all([
        api.adminHealth(), api.adminErrors(), api.adminEconomy(), api.adminSecurity(24),
      ]);
      checks = h.checks;
      overviewErrors = e.errors.length;
      overviewCoins = ec.now.totalCoins + ec.now.escrow;
      overviewFindings = s.findings.length;
      overviewCrit = s.findings.filter((f) => f.severity === "crit").length;
    } catch {
      /* offline */
    }
    try {
      const [r, c] = await Promise.all([api.adminReports(), api.adminConnections()]);
      openReports = r.reports.filter((x) => x.status === "open").length;
      overviewOnline = c.connections.length;
    } catch {
      /* offline */
    }
  }
  let overviewOnline = $state<number | null>(null);
  // The nav pills want their numbers whatever section you open first.
  $effect(() => {
    // Re-read on every section change so a resolved report or a cleared
    // error drops its pill; the Overview section polls on its own.
    if (isAdmin && section !== "overview") void loadOverview();
  });

  // ---- Live logs: incremental polling while the tab is open ----
  type LogLine = { id: number; at: number; level: string; line: string };
  let logLines = $state<LogLine[]>([]);
  let logAfter = 0;
  let logEpoch = 0; // the server's boot marker; a change means a restart
  let logFilter = $state<"all" | "warn" | "error">("all");
  let logBox = $state<HTMLDivElement | null>(null);
  async function pollLogs(): Promise<void> {
    try {
      let r = await api.adminLogs(logAfter);
      if (logEpoch && r.epoch !== logEpoch) {
        // The server restarted — its line ids reset to 1, so our stale cursor
        // now hides everything. Drop what we have and take the fresh buffer.
        logLines = [];
        logAfter = 0;
        r = await api.adminLogs(0);
      }
      logEpoch = r.epoch;
      if (r.lines.length) {
        // scroll-stick only when the reader is already at the bottom
        const atBottom = !logBox || logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 40;
        logLines = [...logLines, ...r.lines].slice(-600);
        logAfter = r.lines[r.lines.length - 1].id;
        if (atBottom) queueMicrotask(() => logBox?.scrollTo({ top: logBox.scrollHeight }));
      }
    } catch {
      /* offline */
    }
  }
  const shownLogs = $derived(
    logFilter === "all" ? logLines : logLines.filter((l) => (logFilter === "error" ? l.level === "error" : l.level !== "log")),
  );

  // ---- Errors ----
  type Err = { id: number; kind: string; message: string; stack: string | null; route: string | null; userId: number | null; count: number; firstAt: number; lastAt: number };
  let errors = $state<Err[]>([]);
  let openErr = $state<number | null>(null);
  async function loadErrors(): Promise<void> {
    try {
      errors = (await api.adminErrors()).errors;
    } catch {
      /* offline */
    }
  }
  async function clearErrors(): Promise<void> {
    if (!(await ask({ title: "Clear every recorded error?", body: "The table empties. Anything still going wrong will report itself again within minutes.", confirm: "clear the table" }))) return;
    try {
      await api.adminClearErrors();
      errors = [];
    } catch {
      /* offline */
    }
  }

  // ---- Economy ----
  let economy = $state<Awaited<ReturnType<typeof api.adminEconomy>> | null>(null);
  async function loadEconomy(): Promise<void> {
    try {
      economy = await api.adminEconomy();
    } catch {
      /* offline */
    }
  }

  // ---- Connections ----
  let conns = $state<Awaited<ReturnType<typeof api.adminConnections>>["connections"]>([]);
  async function loadConns(): Promise<void> {
    try {
      conns = (await api.adminConnections()).connections;
    } catch {
      /* offline */
    }
  }
  function agentLabel(agents: string[]): string {
    if (agents.some((a) => a.includes("SolaceShell"))) return "🖥️ desktop app";
    if (agents.some((a) => /Mobile|Android|iPhone/.test(a))) return "📱 phone";
    return "🌐 browser";
  }

  // ---- Security ----
  // Three views of one question: is the door configured right (posture), did
  // anything happen that shouldn't have (findings), and who is holding a
  // credential right now (sessions). The event log underneath is the raw
  // ledger, filterable, because every summary above is lossy by design.
  let sec = $state<Awaited<ReturnType<typeof api.adminSecurity>> | null>(null);
  let secHours = $state(24);
  let secTab = $state<"findings" | "events" | "sessions">("findings");
  let secEvents = $state<LoginEvent[]>([]);
  let secSessions = $state<(SessionRow & { user: User | null })[]>([]);
  let secFilter = $state("");
  let secBusy = $state(false);
  let secNote = $state("");

  async function loadSecurity(): Promise<void> {
    try {
      sec = await api.adminSecurity(secHours);
    } catch {
      /* offline */
    }
  }
  async function loadSecEvents(): Promise<void> {
    try {
      secEvents = (await api.adminSecurityEvents({ limit: 200, outcome: secFilter || undefined })).events;
    } catch {
      /* offline */
    }
  }
  async function loadSecSessions(): Promise<void> {
    try {
      secSessions = (await api.adminSecuritySessions()).sessions;
    } catch {
      /* offline */
    }
  }
  async function revokeSession(handle: string, who: string): Promise<void> {
    if (!(await ask({ title: `Sign out this ${who} session?`, body: "Whoever is holding that token is logged out immediately.", confirm: "sign it out", danger: true }))) return;
    secBusy = true;
    try {
      await api.adminRevokeSessions({ handle });
      await loadSecSessions();
      secNote = "Session revoked.";
    } catch {
      secNote = "Couldn't revoke that session.";
    } finally {
      secBusy = false;
    }
  }
  async function revokeAllFor(userId: number, name: string): Promise<void> {
    if (!(await ask({ title: `Sign ${name} out of every device?`, body: "They'll have to log in again everywhere.", confirm: "sign them out", danger: true }))) return;
    secBusy = true;
    try {
      const r = await api.adminRevokeSessions({ userId });
      await loadSecSessions();
      secNote = `Revoked ${r.revoked} session(s) for ${name}.`;
    } catch {
      secNote = "Couldn't revoke those sessions.";
    } finally {
      secBusy = false;
    }
  }
  // Plain-English names for the ledger's outcome codes — the panel should
  // read like a sentence, not like a database column.
  const OUTCOMES: Record<string, string> = {
    ok: "signed in",
    register: "account created",
    challenged: "challenged (new network)",
    challenge_passed: "verified from a new network",
    bad_password: "wrong password",
    bad_secret: "wrong recovery secret",
    unknown_user: "no such account",
    account_closed: "closed account",
    locked: "blocked by lockout",
    suspended: "suspended",
    rate_limited: "rate limited",
    reset_ok: "password reset",
    reset_failed: "failed reset",
    password_changed: "password changed",
    secret_changed: "recovery secret changed",
  };
  const GOOD = new Set(["ok", "register", "challenge_passed"]);
  const outcomeClass = (o: string) =>
    GOOD.has(o) ? "good" : o === "challenged" || o === "password_changed" || o === "secret_changed" ? "note" : "bad";
  const since = (at: number | null): string => {
    if (!at) return "never";
    const d = Date.now() - at;
    if (d < 60_000) return "just now";
    if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
    if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
    return `${Math.floor(d / 86_400_000)}d ago`;
  };

  // ---- Audit trail ----
  let audit = $state<Awaited<ReturnType<typeof api.adminAudit>>["audit"]>([]);
  async function loadAudit(): Promise<void> {
    try {
      audit = (await api.adminAudit()).audit;
    } catch {
      /* offline */
    }
  }

  // Per-section loaders + polling, cleaned up when the section changes.
  $effect(() => {
    const s = section;
    let timer: ReturnType<typeof setInterval> | null = null;
    if (s === "overview") {
      void loadOverview();
      timer = setInterval(() => void loadOverview(), 15_000);
    } else if (s === "logs") {
      void pollLogs();
      timer = setInterval(() => void pollLogs(), 3_000);
    } else if (s === "errors") {
      void loadErrors();
      timer = setInterval(() => void loadErrors(), 15_000);
    } else if (s === "economy") {
      void loadEconomy();
    } else if (s === "connections") {
      void loadConns();
      timer = setInterval(() => void loadConns(), 10_000);
    } else if (s === "security") {
      void loadSecurity();
      void loadSecEvents();
      void loadSecSessions();
      timer = setInterval(() => void loadSecurity(), 30_000);
    } else if (s === "audit") {
      void loadAudit();
    } else if (s === "storage" && !storageLoaded) {
      void loadStorage();
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  });

  // ---- Storage report (unchanged behavior) ----
  let rows = $state<StorageRow[]>([]);
  let q = $state("");
  let storageLoaded = $state(false);
  let qTimer: ReturnType<typeof setTimeout> | null = null;
  async function loadStorage(): Promise<void> {
    try {
      rows = (await api.adminStorage(q)).users;
      storageLoaded = true;
    } catch {
      /* offline */
    }
  }
  function onSearch(): void {
    if (qTimer) clearTimeout(qTimer);
    qTimer = setTimeout(() => void loadStorage(), 300);
  }
  onDestroy(() => {
    if (qTimer) clearTimeout(qTimer); // leaving the panel cancels the debounce
  });

  function fmtBytes(b: number): string {
    if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
    if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
    if (b >= 1e3) return `${(b / 1e3).toFixed(0)} KB`;
    return `${b} B`;
  }
  const ts = (at: number) => new Date(at).toLocaleString();

  let exportBusy = $state(false);
  let exportMsg = $state("");
  async function download(kind: "weekly" | "perf"): Promise<void> {
    if (exportBusy) return;
    exportBusy = true;
    exportMsg = "";
    try {
      const blob = kind === "weekly" ? await api.adminWeeklyReportBlob() : await api.adminPerfExportBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const day = new Date().toISOString().slice(0, 10);
      a.download = kind === "weekly" ? `solace-weekly-${day}.txt` : `solace-perf-${day}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      exportMsg = "Download failed — check you're still signed in as an admin.";
    } finally {
      exportBusy = false;
    }
  }
</script>

<div class="panel-wrap">
  <div class="console">
    <aside class="nav">
      <h1>🛠️ {isAdmin ? "Admin" : "Moderator"}</h1>
      {#each nav as g (g.group)}
        <div class="group">
          {#if g.group}<span class="group-label">{g.group}</span>{/if}
          {#each g.items as it (it.id)}
            <button class="navbtn" class:active={section === it.id} onclick={() => goTo(it.id)}>
              <span class="ni">{it.icon}</span><span class="nl">{it.label}</span>
              {#if it.id === "errors" && overviewErrors > 0}<span class="pill">{overviewErrors}</span>{/if}
              {#if it.id === "reports" && openReports > 0}<span class="pill">{openReports}</span>{/if}
              {#if it.id === "security" && overviewFindings > 0}<span class="pill sec" class:crit={overviewCrit > 0}>{overviewFindings}</span>{/if}
            </button>
          {/each}
        </div>
      {/each}
    </aside>

    <main class="content">
      {#if HEAD[section]}
        <header class="head">
          <h2>{HEAD[section]!.title}</h2>
          {#if HEAD[section]!.lead}<p class="lead">{HEAD[section]!.lead}</p>{/if}
        </header>
      {/if}
      {#if section === "overview" && isAdmin}
        {@const red = checks.filter((c) => !c.ok).length}
        <h2>Overview</h2>
        <p class="lead">Everything green means everything's fine. Sterling DMs you when it isn't.</p>
        <div class="quick">
          <div class="qcard" class:alarm={red > 0}>
            <span class="qv">{checks.length === 0 ? "…" : red === 0 ? "✅" : "🔴"}</span>
            <span class="ql">{checks.length === 0 ? "checking…" : red === 0 ? "All systems go" : `${red} check${red === 1 ? "" : "s"} red`}</span>
          </div>
          <button class="qcard act" class:alarm={overviewErrors > 0} onclick={() => goTo("errors")}>
            <span class="qv">{overviewErrors}</span><span class="ql">recorded errors</span>
          </button>
          <button class="qcard act" class:alarm={openReports > 0} onclick={() => goTo("reports")}>
            <span class="qv">{openReports}</span><span class="ql">open report{openReports === 1 ? "" : "s"}</span>
          </button>
          <button class="qcard act" class:alarm={overviewCrit > 0} onclick={() => goTo("security")}>
            <span class="qv">{overviewFindings === 0 ? "🔒" : overviewCrit > 0 ? "🔴" : "🟠"}</span>
            <span class="ql">{overviewFindings === 0 ? "no security findings" : `${overviewFindings} security finding${overviewFindings === 1 ? "" : "s"}`}</span>
          </button>
          <button class="qcard act" onclick={() => goTo("connections")}>
            <span class="qv">{overviewOnline ?? "…"}</span><span class="ql">online now</span>
          </button>
          <button class="qcard act" onclick={() => goTo("economy")}>
            <span class="qv">{overviewCoins === null ? "…" : overviewCoins.toLocaleString()}</span><span class="ql">silver in circulation</span>
          </button>
        </div>
        <h3>Health checks</h3>
        <div class="checks cols">
          {#each [...checks].sort((a, b) => Number(a.ok) - Number(b.ok)) as c (c.name)}
            <div class="check" class:bad={!c.ok}>
              <span class="dot">{c.ok ? "🟢" : "🔴"}</span>
              <span class="cname">{c.name}</span>
              <span class="cdetail">{c.detail}</span>
            </div>
          {:else}
            <p class="muted">Loading checks…</p>
          {/each}
        </div>
      {:else if section === "logs" && isAdmin}
        <h2>Live logs</h2>
        <div class="logbar">
          {#each ["all", "warn", "error"] as f (f)}
            <button class="chipbtn" class:on={logFilter === f} onclick={() => (logFilter = f as typeof logFilter)}>{f}</button>
          {/each}
          <span class="hint">The server's last ~600 lines, live (3s poll). Errors glow.</span>
        </div>
        <div class="logbox" bind:this={logBox}>
          {#each shownLogs as l (l.id)}
            <div class="logline {l.level}">
              <span class="lt">{new Date(l.at).toLocaleTimeString()}</span>
              <span class="ll">{l.line}</span>
            </div>
          {:else}
            <p class="muted">Waiting for log lines…</p>
          {/each}
        </div>
      {:else if section === "errors" && isAdmin}
        <div class="rowhead">
          <h2>Errors</h2>
          <button class="btn danger" onclick={clearErrors} disabled={!errors.length}>Clear all</button>
        </div>
        <p class="lead">Server exceptions and your friends' browser crashes, deduplicated with counts.</p>
        {#each errors as e (e.id)}
          <button class="errrow" class:open={openErr === e.id} onclick={() => (openErr = openErr === e.id ? null : e.id)}>
            <span class="ekind {e.kind}">{e.kind}</span>
            <span class="emsg">{e.message}</span>
            <span class="ecount">×{e.count}</span>
            <span class="ewhen">{ts(e.lastAt)}</span>
          </button>
          {#if openErr === e.id}
            <div class="errdetail">
              {#if e.route}<div><b>Where:</b> {e.route}</div>{/if}
              {#if e.userId}<div><b>User id:</b> {e.userId}</div>{/if}
              <div><b>First seen:</b> {ts(e.firstAt)}</div>
              {#if e.stack}<pre>{e.stack}</pre>{/if}
            </div>
          {/if}
        {:else}
          <p class="muted">No recorded errors. Suspiciously clean.</p>
        {/each}
      {:else if section === "security" && isAdmin}
        <div class="rowhead">
          <h2>Security</h2>
          <select class="hours" bind:value={secHours} onchange={() => void loadSecurity()}>
            <option value={24}>last 24 hours</option>
            <option value={72}>last 3 days</option>
            <option value={168}>last 7 days</option>
            <option value={720}>last 30 days</option>
          </select>
        </div>
        <p class="lead">
          Who tried to get in, who got in, and who is holding a session right now.
          Sterling DMs you the red ones — anything on an admin account, every time.
        </p>

        {#if sec}
          <!-- POSTURE: how the door is configured. Slow-moving and boring
               when healthy, which is the point. -->
          <div class="checks wrap">
            {#each sec.posture as c (c.name)}
              <div class="check" class:bad={!c.ok && c.severity !== "info"}>
                <span class="dot">{c.ok ? "🟢" : c.severity === "crit" ? "🔴" : c.severity === "info" ? "⚪" : "🟠"}</span>
                <span class="cname">{c.name}</span>
                <span class="cdetail">{c.detail}</span>
              </div>
            {/each}
          </div>

          <!-- THE BOX. Separate from the app checks above on purpose: those
               come from our own database, these come from a root collector
               reading the machine. Different question, different owner — and
               a missing collector must not read as a clean machine. -->
          <h3>The machine</h3>
          <div class="checks wrap">
            {#each sec.host as c (c.name)}
              <div class="check" class:bad={!c.ok && c.severity !== "info"}>
                <span class="dot">{c.ok ? "🟢" : c.severity === "crit" ? "🔴" : c.severity === "info" ? "⚪" : "🟠"}</span>
                <span class="cname">{c.name}</span>
                <span class="cdetail">{c.detail}</span>
              </div>
            {/each}
          </div>
          <p class="hint">
            If the machine is genuinely compromised, everything in this section is
            editable by whoever compromised it. Local logs catch a careless intruder,
            not a careful one — off-box backups are the real integrity story.
          </p>

          <div class="logbar">
            {#each [["findings", `Findings${sec.findings.length ? ` (${sec.findings.length})` : ""}`], ["events", "Sign-in log"], ["sessions", "Sessions"]] as [id, label] (id)}
              <button class="chipbtn" class:on={secTab === id}
                onclick={() => (secTab = id as typeof secTab)}>{label}</button>
            {/each}
            {#if secNote}<span class="hint">{secNote}</span>{/if}
          </div>

          {#if secTab === "findings"}
            {#each sec.findings as f (f.id)}
              <div class="finding {f.severity}">
                <span class="fmark">{f.severity === "crit" ? "🔴" : "🟠"}</span>
                <div class="fbody">
                  <b>{f.title}{#if f.staff}<span class="staffchip">STAFF</span>{/if}</b>
                  <span class="fdetail">{f.detail}</span>
                </div>
                <span class="fwhen">{since(f.at)}</span>
              </div>
            {:else}
              <p class="muted">
                Nothing flagged in this window. That means no stuffing pattern, no
                verified sign-in from an unknown network, and no password resets —
                not that the ledger is empty (check the Sign-in log tab).
              </p>
            {/each}

            <h3>Attempts by outcome</h3>
            <div class="pills">
              {#each sec.counts as c (c.outcome)}
                <span class="opill {outcomeClass(c.outcome)}">{OUTCOMES[c.outcome] ?? c.outcome} <b>{c.n}</b></span>
              {:else}
                <span class="muted">No attempts in this window.</span>
              {/each}
            </div>

            {#if sec.failedByIp.length}
              <h3>Failures by address</h3>
              <p class="hint">
                Sorted by how many DIFFERENT usernames each address tried — that's
                what separates an attack from someone who forgot their password.
              </p>
              <div class="tbl">
                <div class="trow thead"><span>Address</span><span>Names tried</span><span>Attempts</span><span>Last</span></div>
                {#each sec.failedByIp as r (r.ip)}
                  <div class="trow" class:danger={r.users >= 3}>
                    <span class="mono">{r.ip}</span>
                    <span title={r.names}>{r.users}</span>
                    <span>{r.fails}</span>
                    <span>{since(r.lastAt)}</span>
                  </div>
                {/each}
              </div>
            {/if}

            {#if sec.failedByAccount.length}
              <h3>Failures by account</h3>
              <div class="tbl">
                <div class="trow thead"><span>Account</span><span>Failures</span><span>Addresses</span><span>Last</span></div>
                {#each sec.failedByAccount as r (r.username)}
                  <div class="trow"><span>{r.username}</span><span>{r.fails}</span><span>{r.ips}</span><span>{since(r.lastAt)}</span></div>
                {/each}
              </div>
            {/if}

            <h3>Staff accounts</h3>
            <p class="hint">Listed whether or not anything looks wrong — the question is whether every one of these is a sign-in you can account for.</p>
            <div class="tbl">
              <div class="trow thead"><span>Account</span><span>Role</span><span>Last sign-in</span><span>Recent</span></div>
              {#each sec.staff as s (s.id)}
                <div class="trow">
                  <span>{s.username}</span>
                  <span>{s.isAdmin ? "admin" : "moderator"}</span>
                  <span>{since(s.lastLoginAt)}</span>
                  <span class="mono small">{s.recent.map((e) => `${OUTCOMES[e.outcome] ?? e.outcome} · ${e.ip}`).join(" | ") || "—"}</span>
                </div>
              {/each}
            </div>

          {:else if secTab === "events"}
            <div class="logbar">
              <select class="hours" bind:value={secFilter} onchange={() => void loadSecEvents()}>
                <option value="">every outcome</option>
                {#each Object.entries(OUTCOMES) as [id, label] (id)}
                  <option value={id}>{label}</option>
                {/each}
              </select>
              <button class="chipbtn" onclick={() => void loadSecEvents()}>Refresh</button>
              <span class="hint">The raw ledger, newest first. Kept 90 days.</span>
            </div>
            <div class="tbl">
              <div class="trow thead"><span>When</span><span>Account</span><span>Outcome</span><span>Address</span><span>Device</span></div>
              {#each secEvents as e (e.id)}
                <div class="trow ev">
                  <span class="awhen">{ts(e.at)}</span>
                  <span>{e.username}</span>
                  <span class="ocell {outcomeClass(e.outcome)}">{OUTCOMES[e.outcome] ?? e.outcome}</span>
                  <span class="mono">{e.ip}</span>
                  <span class="small">{e.ua ?? "—"}</span>
                </div>
              {:else}
                <p class="muted">No matching attempts.</p>
              {/each}
            </div>

          {:else}
            <p class="hint">
              Every live session token. A token is a bearer credential — whoever holds
              it is signed in — so anything here you can't place should be revoked.
            </p>
            <div class="tbl">
              <div class="trow sess thead"><span>Member</span><span>Device</span><span>Address</span><span>Issued</span><span>Last used</span><span></span></div>
              {#each secSessions as s (s.handle)}
                <div class="trow sess">
                  <span class="cwho">
                    {#if s.user}
                      <Avatar name={s.user.displayName} id={s.user.id} avatar={s.user.avatar} bot={botKind(s.user)} size={20} profile /> {s.user.displayName}
                    {:else}#{s.userId}{/if}
                  </span>
                  <span class="small">{s.device}</span>
                  <span class="mono">{s.ip ?? "—"}</span>
                  <span>{since(s.createdAt)}</span>
                  <span>{since(s.lastSeenAt)}</span>
                  <span class="acts">
                    <button class="btn tiny" disabled={secBusy} onclick={() => void revokeSession(s.handle, s.user?.displayName ?? "member")}>Revoke</button>
                    {#if s.user}
                      <button class="btn tiny danger" disabled={secBusy} onclick={() => void revokeAllFor(s.userId, s.user!.displayName)}>All</button>
                    {/if}
                  </span>
                </div>
              {:else}
                <p class="muted">No live sessions.</p>
              {/each}
            </div>
          {/if}
        {:else}
          <p class="muted">Loading…</p>
        {/if}
      {:else if section === "economy" && isAdmin}
        <h2>Economy</h2>
        {#if economy}
          <div class="quick">
            <div class="qcard"><span class="qv">{economy.now.totalCoins.toLocaleString()}</span><span class="ql">in wallets</span></div>
            <div class="qcard"><span class="qv">{economy.now.escrow.toLocaleString()}</span><span class="ql">in escrow (on tables)</span></div>
            <div class="qcard"><span class="qv">{economy.now.potPending.toLocaleString()}</span><span class="ql">undrawn lottery value</span></div>
            <div class="qcard"><span class="qv">{economy.now.vault.toLocaleString()}</span><span class="ql">goblin vault</span></div>
            <div class="qcard"><span class="qv">{economy.now.grant.toLocaleString()}</span><span class="ql">async grant</span></div>
          </div>
          <h3>Escrow by surface</h3>
          <div class="tbl">
            {#each economy.now.escrows.filter((e) => e.total > 0) as e (e.name)}
              <div class="trow"><span>{e.name}</span><span class="tnum">{e.total.toLocaleString()}</span></div>
            {:else}
              <p class="muted">No chips on any table right now.</p>
            {/each}
          </div>
          <h3>Daily snapshots</h3>
          <div class="tbl">
            <div class="trow snaps thead"><span>Day</span><span class="tnum">Wallets</span><span class="tnum">Escrow</span><span class="tnum">Pot</span><span class="tnum">Vault</span><span class="tnum">Grant</span><span class="tnum">Δ total</span></div>
            {#each economy.snapshots as s, i (s.day)}
              {@const prev = economy.snapshots[i + 1]}
              {@const total = s.totalCoins + s.escrow + s.potPending + (s.vault ?? 0) + (s.grant ?? 0) + (s.exchangeFloat ?? 0) - (s.houseMints ?? 0)}
              {@const comparable = prev != null && s.vault != null && prev.vault != null && s.exchangeFloat != null && prev.exchangeFloat != null}
              {@const delta = comparable && prev ? total - (prev.totalCoins + prev.escrow + prev.potPending + (prev.vault ?? 0) + (prev.grant ?? 0) + (prev.exchangeFloat ?? 0) - (prev.houseMints ?? 0)) : 0}
              <div class="trow snaps">
                <span>{s.day}</span>
                <span class="tnum">{s.totalCoins.toLocaleString()}</span>
                <span class="tnum">{s.escrow.toLocaleString()}</span>
                <span class="tnum">{s.potPending.toLocaleString()}</span>
                <span class="tnum">{s.vault != null ? s.vault.toLocaleString() : "—"}</span>
                <span class="tnum">{s.grant != null ? s.grant.toLocaleString() : "—"}</span>
                <span class="tnum" class:up={delta > 0} class:down={delta < 0}>{comparable ? (delta > 0 ? "+" : "") + delta.toLocaleString() : "—"}</span>
              </div>
            {:else}
              <p class="muted">First snapshot lands within five minutes of boot.</p>
            {/each}
          </div>
          <p class="hint">Silver only enters via the Trader, escape-room chests, and admin mints, and leaves via burns. Loans just move silver between the vault and wallets, and Threshold-4 moves it between Async's grant and wallets — the total (wallets + escrow + pot + vault + grant) shouldn't move on either; a sudden spike is a bug worth reporting.</p>
        {:else}
          <p class="muted">Loading…</p>
        {/if}
      {:else if section === "connections" && isAdmin}
        <h2>Who's online</h2>
        <p class="lead">Everyone connected right now — device, addresses, and where they are.</p>
        <div class="tbl">
          <div class="trow thead"><span>Member</span><span>Device</span><span>Sockets</span><span>IPs</span><span>Where</span></div>
          {#each conns as c (c.user?.id ?? Math.random())}
            <div class="trow conn">
              <span class="cwho">
                {#if c.user}<Avatar name={c.user.displayName} id={c.user.id} avatar={c.user.avatar} bot={botKind(c.user)} size={20} profile /> {c.user.displayName}{:else}?{/if}
              </span>
              <span>{agentLabel(c.agents)}</span>
              <span>{c.sockets}</span>
              <span class="ips">{c.ips.join(", ")}</span>
              <span>{c.voiceChannelId != null ? "🔊 in voice" : c.status}</span>
            </div>
          {:else}
            <p class="muted">Nobody connected (except you, presumably — refresh in a beat).</p>
          {/each}
        </div>
      {:else if section === "audit" && isAdmin}
        <h2>Audit trail</h2>
        <p class="lead">Every admin, moderator, and house action — newest first.</p>
        <div class="tbl">
          {#each audit as a (a.id)}
            <div class="trow">
              <span class="awhen">{ts(a.at)}</span>
              <span class="awho">{a.actor?.displayName ?? "🤖 the house"}</span>
              <span class="aact">{a.action}</span>
              <span class="adet">{a.detail ?? ""}</span>
            </div>
          {:else}
            <p class="muted">Nothing yet — actions land here from now on.</p>
          {/each}
        </div>
      {:else if section === "satellites" && isAdmin}
        <Satellites />
      {:else if section === "mod"}
        <ModTools />
      {:else if (section === "members" || section === "reports" || section === "invites" || section === "house" || section === "backrooms") && isAdmin}
        {#key section}<AdminTools part={section} />{/key}
      {:else if section === "jukebox" && isAdmin}
        <JukeboxAdmin />
      {:else if section === "maps" && isAdmin}
        <!-- a full-screen workspace of its own; Back returns to the console -->
        <MapEditor onclose={() => goTo("overview")} />
      {:else if section === "survivorz" && isAdmin}
        <!-- three.js + the show's bodies: its own chunk, loaded on first visit -->
        <Lazy load={() => import("../survivorz/watch/Watch.svelte")} />
      {:else if section === "cast" && isAdmin}
        <Lazy load={() => import("./CastAdmin.svelte")} />
      {:else if section === "server" && isAdmin}
        <div class="server">
          <ServerStats />
          <div class="export-row">
            <button class="btn" onclick={() => download("weekly")} disabled={exportBusy}>
              {exportBusy ? "Preparing…" : "⬇ Weekly stability report (TXT)"}
            </button>
            <span class="hint">The weekly check — errors, perf, economy drift, storage, backups. Paste the whole file into Claude for review (see deploy/WEEKLY-CHECK.md).</span>
          </div>
          <div class="export-row">
            <button class="btn" onclick={() => download("perf")} disabled={exportBusy}>
              {exportBusy ? "Preparing…" : "⬇ Export performance logs (JSON)"}
            </button>
            <span class="hint">Up to 14 days of one-minute samples — drop the file into a debugging session or an issue report.</span>
          </div>
          {#if exportMsg}<p class="note err">{exportMsg}</p>{/if}
        </div>
      {:else if section === "storage" && isAdmin}
        <div class="storage">
          <input class="search" placeholder="Search by username or display name…" bind:value={q} oninput={onSearch} />
          <div class="rows">
            <div class="row headrow">
              <span class="c-who">Member</span>
              <span class="c-num">Total on disk</span>
              <span class="c-num">Attachments</span>
              <span class="c-num">Profile media</span>
              <span class="c-num">Messages</span>
            </div>
            {#each rows as r (r.id)}
              <div class="row">
                <span class="c-who">
                  <Avatar name={r.displayName} id={r.id} avatar={r.avatar} size={22} profile />
                  <span class="who-name">{r.displayName}</span>
                  <span class="who-user">@{r.username}</span>
                </span>
                <span class="c-num total">{fmtBytes(r.totalBytes)}</span>
                <span class="c-num">{fmtBytes(r.attachBytes)} <em>({r.attachCount})</em></span>
                <span class="c-num">{fmtBytes(r.avatarBytes + r.bannerBytes + r.soundBytes)}</span>
                <span class="c-num">{(r.messages + r.dms).toLocaleString()}</span>
              </div>
            {:else}
              <p class="muted">{storageLoaded ? "No matches." : "Loading…"}</p>
            {/each}
          </div>
          <p class="hint">Live files only — attachment bytes exclude anything the retention sweep already purged. Message counts include DMs.</p>
        </div>
      {/if}
    </main>
  </div>
</div>

<style>
  .panel-wrap {
    height: 100%;
    overflow: hidden;
    background: var(--bg);
  }
  .console {
    display: grid;
    grid-template-columns: 208px 1fr;
    height: 100%;
    max-width: 1180px;
    margin: 0 auto;
  }
  .nav {
    padding: clamp(16px, 3vh, 30px) 12px 20px 16px;
    border-right: 1px solid var(--line);
    overflow-y: auto;
  }
  .nav h1 {
    margin: 0 0 12px 6px;
    font-size: 1.15rem;
    color: var(--ink);
  }
  .group {
    margin-bottom: 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .group-label {
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-dim);
    margin: 0 0 4px 8px;
  }
  .navbtn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border: none;
    border-radius: 9px;
    background: none;
    color: var(--ink-soft);
    font: inherit;
    font-weight: 600;
    font-size: 0.86rem;
    text-align: left;
    cursor: pointer;
  }
  .navbtn:hover {
    background: var(--panel-2);
    color: var(--ink);
  }
  .navbtn.active {
    background: color-mix(in srgb, var(--accent) 14%, var(--panel-2));
    color: var(--ink);
  }
  .ni {
    width: 20px;
    flex: none;
    text-align: center;
  }
  .nl {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .head {
    margin-bottom: 14px;
  }
  .head .lead {
    margin-bottom: 0;
  }
  .pill {
    margin-left: auto;
    background: var(--danger);
    color: #fff;
    font-size: 0.64rem;
    font-weight: 800;
    border-radius: 999px;
    padding: 1px 7px;
  }
  /* Warning-only findings ride an amber pill; only a crit gets the red one,
     or the red stops meaning anything. Scoped to the security pill so the
     errors pill keeps the colour it has always had. */
  .pill.sec:not(.crit) {
    background: #d9a441;
    color: #201603;
  }
  .content {
    padding: clamp(16px, 3vh, 30px) 22px 40px;
    overflow-y: auto;
    min-width: 0;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 1.2rem;
    color: var(--ink);
  }
  h3 {
    margin: 16px 0 6px;
    font-size: 0.9rem;
    color: var(--ink);
  }
  .lead {
    margin: 0 0 14px;
    color: var(--ink-soft);
    font-size: 0.85rem;
  }
  .rowhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .quick {
    display: grid;
    /* At most three across, so six cards make two even rows. */
    grid-template-columns: repeat(auto-fit, minmax(max(140px, calc((100% - 20px) / 3)), 1fr));
    gap: 10px;
    margin-bottom: 14px;
  }
  .qcard {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  /* The findings card is a button — the number is only useful if the thing
     it counts is one click away. */
  .qcard.act {
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .qcard.act:hover {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 6%, var(--panel));
  }
  .qcard.alarm {
    border-color: color-mix(in srgb, var(--danger) 55%, var(--line));
    background: color-mix(in srgb, var(--danger) 7%, var(--panel));
  }
  .qv {
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .ql {
    font-size: 0.72rem;
    color: var(--ink-dim);
  }
  .checks {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .check {
    display: grid;
    grid-template-columns: 24px minmax(140px, 200px) 1fr;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 9px;
    background: var(--panel);
    border: 1px solid var(--line);
    font-size: 0.82rem;
  }
  .check.bad {
    border-color: color-mix(in srgb, var(--danger) 60%, var(--line));
    background: color-mix(in srgb, var(--danger) 7%, var(--panel));
  }
  .cname {
    font-weight: 700;
    color: var(--ink);
  }
  .cdetail {
    color: var(--ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Health checks are terse ("write probe OK") and read better on one line.
     Security checks are the opposite: the detail IS the check -- which five
     accounts, what to set, what to run -- and measured at 1309px wide the
     longest of them wanted 867px against the 585px the row gives, so a third
     of the sentence was being swallowed by the ellipsis. These wrap. */
  /* Health checks are many and short: two columns when there is room,
     with anything red sorted to the top. */
  .checks.cols {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr));
  }
  .checks.wrap .check {
    align-items: start;
  }
  .checks.wrap .cdetail {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    line-height: 1.45;
  }
  .logbar {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .chipbtn {
    padding: 3px 12px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--ink-soft);
    font: inherit;
    font-size: 0.74rem;
    font-weight: 700;
    cursor: pointer;
  }
  .chipbtn.on {
    border-color: var(--accent);
    color: var(--ink);
    background: color-mix(in srgb, var(--accent) 12%, var(--panel-2));
  }
  .logbox {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px 12px;
    height: min(60vh, 560px);
    overflow: auto;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.74rem;
    line-height: 1.5;
  }
  .logline {
    display: flex;
    gap: 10px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .logline .lt {
    color: var(--ink-dim);
    flex: none;
  }
  .logline.warn .ll {
    color: #d9a648;
  }
  .logline.error .ll {
    color: var(--danger);
    font-weight: 600;
  }
  .errrow {
    display: grid;
    grid-template-columns: 64px 1fr auto auto;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 10px;
    margin-bottom: 3px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--panel);
    color: var(--ink);
    font: inherit;
    font-size: 0.82rem;
    text-align: left;
    cursor: pointer;
  }
  .errrow.open {
    border-color: var(--accent);
  }
  .ekind {
    font-size: 0.62rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    text-align: center;
    border-radius: 6px;
    padding: 2px 0;
  }
  .ekind.server {
    background: color-mix(in srgb, var(--danger) 22%, var(--panel-2));
  }
  .ekind.client {
    background: color-mix(in srgb, var(--accent) 22%, var(--panel-2));
  }
  .emsg {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ecount {
    font-weight: 800;
    color: var(--ink);
  }
  .ewhen {
    color: var(--ink-dim);
    font-size: 0.72rem;
  }
  .errdetail {
    margin: -2px 0 8px;
    padding: 10px 12px;
    border-radius: 9px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    font-size: 0.78rem;
    color: var(--ink-soft);
  }
  .errdetail pre {
    margin: 8px 0 0;
    overflow-x: auto;
    font-size: 0.7rem;
    color: var(--ink-dim);
  }
  .tbl {
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow-x: auto;
  }
  .trow {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) repeat(4, minmax(80px, auto));
    gap: 10px;
    padding: 7px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 55%, transparent);
    font-size: 0.82rem;
    align-items: center;
  }
  .trow:last-child {
    border-bottom: none;
  }
  .trow.thead {
    font-size: 0.64rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-dim);
  }
  .tnum {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .tnum.up {
    color: var(--ok);
  }
  .tnum.down {
    color: var(--danger);
  }
  .cwho {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .ips {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.72rem;
    color: var(--ink-soft);
  }
  .awhen {
    color: var(--ink-dim);
    font-size: 0.74rem;
  }
  .awho {
    font-weight: 700;
  }
  .aact {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.76rem;
  }
  .adet {
    color: var(--ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* ---- Security ---- */
  .hours {
    padding: 5px 8px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-size: 0.78rem;
  }
  .finding {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    align-items: start;
    padding: 10px 12px;
    margin-bottom: 8px;
    border-radius: 10px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-left: 3px solid var(--ink-dim);
  }
  .finding.crit {
    border-left-color: var(--danger);
    background: color-mix(in srgb, var(--danger) 8%, var(--panel));
  }
  .finding.warn {
    border-left-color: #d9a441;
  }
  .fbody {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .fdetail {
    font-size: 0.8rem;
    color: var(--ink-soft);
  }
  .fwhen {
    font-size: 0.72rem;
    color: var(--ink-dim);
    white-space: nowrap;
  }
  .staffchip {
    margin-left: 8px;
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 0.6rem;
    letter-spacing: 0.1em;
    background: var(--danger);
    color: #fff;
    vertical-align: middle;
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 6px;
  }
  .opill {
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 0.74rem;
    border: 1px solid var(--line);
    background: var(--panel);
  }
  .opill.good {
    border-color: color-mix(in srgb, var(--ok) 50%, transparent);
  }
  .opill.bad {
    border-color: color-mix(in srgb, var(--danger) 50%, transparent);
  }
  .opill b {
    font-variant-numeric: tabular-nums;
  }
  .mono {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.74rem;
  }
  .small {
    font-size: 0.72rem;
    color: var(--ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .trow.snaps {
    grid-template-columns: minmax(96px, 1fr) repeat(6, minmax(72px, auto));
  }
  .trow.danger {
    background: color-mix(in srgb, var(--danger) 10%, transparent);
  }
  .ocell.good {
    color: var(--ok);
  }
  .ocell.bad {
    color: var(--danger);
  }
  .ocell.note {
    color: #d9a441;
  }
  /* The sessions table carries one more column than the shared 5-track grid. */
  .trow.sess {
    grid-template-columns: minmax(140px, 1fr) minmax(110px, auto) minmax(110px, auto) minmax(80px, auto) minmax(80px, auto) minmax(120px, auto);
  }
  .trow.ev {
    grid-template-columns: minmax(140px, auto) minmax(90px, auto) minmax(120px, auto) minmax(110px, auto) minmax(120px, 1fr);
  }
  .acts {
    display: inline-flex;
    gap: 6px;
    justify-content: flex-end;
  }
  .btn.tiny {
    padding: 3px 9px;
    font-size: 0.72rem;
    font-weight: 700;
  }

  .server {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .export-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .btn {
    padding: 8px 16px;
    border-radius: 9px;
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--ink);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .btn:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .btn.danger:hover:not(:disabled) {
    border-color: var(--danger);
    color: var(--danger);
  }
  .hint {
    font-size: 0.74rem;
    color: var(--ink-dim);
  }
  .note.err {
    margin: 8px 0 0;
    font-size: 0.8rem;
    color: var(--danger);
  }
  .muted {
    color: var(--ink-dim);
    padding: 8px 4px;
  }
  .storage {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .search {
    background: var(--panel-2);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 9px;
    padding: 9px 12px;
    font: inherit;
  }
  .rows {
    display: flex;
    flex-direction: column;
    overflow-x: auto;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(180px, 1.6fr) repeat(4, minmax(90px, 1fr));
    align-items: center;
    gap: 8px;
    padding: 7px 6px;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 55%, transparent);
    font-size: 0.84rem;
  }
  .headrow {
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: var(--ink-dim);
    text-transform: uppercase;
  }
  .c-who {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }
  .who-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .who-user {
    color: var(--ink-dim);
    font-size: 0.74rem;
  }
  .c-num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .c-num em {
    color: var(--ink-dim);
    font-style: normal;
    font-size: 0.74rem;
  }
  .c-num.total {
    font-weight: 800;
    color: var(--ink);
  }
  @media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
    .console {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
    }
    .nav {
      border-right: none;
      border-bottom: 1px solid var(--line);
      display: flex;
      gap: 10px;
      overflow-x: auto;
      padding: 12px 14px;
    }
    .nav h1 {
      display: none;
    }
    .group {
      flex-direction: row;
      margin-bottom: 0;
    }
    .group-label {
      display: none;
    }
    .navbtn {
      white-space: nowrap;
      /* The strip scrolls sideways, so these are the only way through the
         console on a phone — they measured 32px tall against a 44px touch
         floor, and a mis-tap on a horizontally scrolling row usually just
         scrolls it instead of selecting anything. */
      min-height: 44px;
      display: flex;
      align-items: center;
    }
    /* Scrolled-to content with no scrollbar needs an affordance: fade the
       right edge so it reads as "there is more this way". */
    .nav {
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
    }
    .nav::-webkit-scrollbar {
      display: none;
    }
    /* A check row is dot + 140-200px name + detail. On a phone that leaves
       the detail about 150px, and measured at 355px wide the security
       details ran past the right edge and were CLIPPED -- not scrolled, so
       the text was simply unreachable. Stack the detail under the name and
       let it wrap; the extra height is free on a scrolling column. */
    .check {
      grid-template-columns: 24px 1fr;
      align-items: start;
    }
    .cdetail {
      grid-column: 2;
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
      line-height: 1.4;
    }
    /* Same story for a finding: title, body and timestamp side by side is a
       three-column layout that has no business on a 390px screen. */
    .finding {
      grid-template-columns: auto 1fr;
    }
    .fwhen {
      grid-column: 2;
      margin-top: 2px;
    }
    /* The member-facing tables carry six columns; let them scroll inside
       their own box rather than dragging the page sideways with them. */
    .tbl {
      overflow-x: auto;
    }
  }
</style>
