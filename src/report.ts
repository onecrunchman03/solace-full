// The in-app weekly stability report — the Admin Panel twin of
// deploy/weekly-report.sh. Everything the Node process can see, formatted as
// plain text built to be pasted whole into a Claude session for review.
// Deliberately zero child-process calls (the hardened unit stays hardened):
// the OS layer — journald, systemd restart counts, fail2ban, cert expiry,
// apt state — remains the bash script's job, and the footer says so.

import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { runHealthChecks, BACKUP_DIR } from "./health";
import { ER_MINT_TRIPWIRE, mintSilverEq } from "./casino/escape-loot";
import { securityFindings, securityPosture, hostFindings, hostPosture } from "./security";
import { readLog } from "./logbuf";
import { loopStalls, liveSample } from "./perf";
import { getConnectionReport } from "./realtime";
import type { Store } from "./db/store";

const WEEK_MS = 7 * 24 * 3_600_000;

function dirSize(dir: string): number {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) total += dirSize(p);
      else {
        try {
          total += fs.statSync(p).size;
        } catch {
          /* raced a delete */
        }
      }
    }
  } catch {
    /* missing dir */
  }
  return total;
}

// ASCII-only punctuation throughout: the .txt opens in Notepad, which guesses
// ANSI and mojibakes em-dashes/middots (the first weekly report proved it).
//
// This used to be a rule you had to remember while writing each line, and the
// security section broke it immediately — its posture and finding text is
// written for the web panel, where em-dashes are correct. So the rule is now
// enforced at the seam instead: the whole report is transliterated on the way
// out, and no future section has to know about Notepad.
const ASCII: Record<string, string> = {
  "—": "-", "–": "-", "‒": "-", "−": "-",   // dashes
  "‘": "'", "’": "'", "“": '"', "”": '"',   // smart quotes
  "·": "|", "•": "*", "…": "...", " ": " ", // dots + nbsp
  "→": "->", "×": "x", "≥": ">=", "≤": "<=",
};
function toAscii(s: string): string {
  return s
    .replace(/[‒-—‘’“”·•… →×≥≤−]/g,
      (c) => ASCII[c] ?? "-")
    // Anything left (emoji in a check's detail, a member's display name in a
    // non-Latin script) becomes a marker rather than a mojibaked mess.
    .replace(/[^\x00-\x7F]/g, "?");
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const utc = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";

export function buildWeeklyReport(store: Store): string {
  const now = Date.now();
  const since = now - WEEK_MS;
  const L: string[] = [];
  const say = (s: string) => L.push(s);
  const head = (s: string) => {
    say("");
    say(`===== ${s} =====`);
  };

  say(`SOLACE WEEKLY REPORT (app layer) - ${utc(now)} (covering last 7 days)`);
  say(`process up ${(process.uptime() / 3600).toFixed(1)}h | node ${process.version} | rss ${mb(process.memoryUsage().rss)}`);
  if (process.uptime() < 300) {
    say("(fresh restart: background-loop heartbeats appear as each loop first runs - expect the full set after a few minutes)");
  }

  head("HEALTH CHECKS (live - includes heartbeats + LiveKit probe)");
  for (const c of runHealthChecks(store)) {
    say(`${c.ok ? " ok " : "RED "} ${c.name} - ${c.detail}`);
  }

  head("APP ERRORS, LAST 7 DAYS (server exceptions + browser crash reports)");
  const errors = store.listErrors(100).filter((e) => e.lastAt > since);
  const hits = errors.reduce((n, e) => n + e.count, 0);
  say(`distinct: ${errors.length} | total hits: ${hits}`);
  for (const e of errors.slice(0, 12)) {
    say(`  [${e.kind}] x${e.count} last ${utc(e.lastAt)} ${e.route ?? "-"} :: ${e.message.slice(0, 100)}`);
  }

  head("LOG RING (warn/error lines still in the buffer)");
  const noisy = readLog().filter((l) => l.level !== "log");
  say(`${noisy.length} warn/error lines buffered (last 25 below)`);
  for (const l of noisy.slice(-25)) {
    say(`  ${utc(l.at)} [${l.level}] ${l.line.slice(0, 140)}`);
  }

  head("PERFORMANCE, LAST 7 DAYS (1-min samples)");
  const p = store.perfAggregates(since);
  // perf_samples stores disk in decimal GB; the health check reports binary
  // GiB — convert here so the two sections agree (the first report showed
  // 3763 vs 3505 for the same disk, which reads like a 258 GB mystery).
  const diskGiB = p.minDiskFreeGb == null ? "?" : ((p.minDiskFreeGb * 1e9) / 1024 ** 3).toFixed(1);
  say(
    `samples ${p.samples} | cpu avg ${p.avgCpu ?? 0}% max ${p.maxCpu ?? 0}% | load max ${p.maxLoad ?? 0} | ` +
      `rss max ${p.maxRssMb ?? 0} MB | disk free min ${diskGiB} GB | ` +
      `ws max ${p.maxWs ?? 0} | http max ${p.maxHttpPerMin ?? 0}/min`,
  );
  // A held event loop is what a player feels as a hitch (their move frames
  // bunch up). Counted since boot; each one is a "[perf] event loop held"
  // line in the journal with its time.
  const live = liveSample();
  say(
    `event loop: ${loopStalls()} stalls over 200ms since boot | last 15s p99 ${live?.loopP99Ms ?? "?"}ms max ${live?.loopMaxMs ?? "?"}ms`,
  );

  head("ECONOMY (drift check - total should only move with real mint/burn)");
  const t = store.economyTotals();
  // The goblin vault is part of the conserved constant (migration 72's
  // invariant): a loan draw moves vault -> wallets and repayment the reverse,
  // so a total WITHOUT the vault term drifts on every loan.
  // THE HOUSE'S MINT (migration 93/95) is the one sanctioned way silver
  // reaches the goblins from nowhere; it is subtracted so the total only
  // moves with real mint/burn.
  // ASYNC'S GRANT (migration 99) is the same story as the vault: a turn-in
  // moves grant -> wallet and a purchase at Threshold-4 moves it back, so a
  // total without the grant term drifts on every relic Voss buys.
  say(
    `now: wallets ${t.totalCoins} + escrow ${t.escrow} + pot ${t.potPending} + vault ${t.vault} + grant ${t.grant} - house mints ${t.houseMints} = ` +
      `${t.totalCoins + t.escrow + t.potPending + t.vault + t.grant - t.houseMints}`,
  );
  say(`escape-room balances: chips ${t.totalChips} | free pulls ${t.totalFreePulls}`);
  for (const s of store.listEconomySnapshots(8)) {
    // Pre-migration-75 rows never measured the vault — print their old-style
    // total and mark it, rather than comparing blind rows against sighted ones.
    // The exchange float (Oct 2026): a winning close moves float -> wallet, so
    // a total without it drifts with the desk's P&L. Older rows never
    // measured it and are marked rather than compared.
    const withVault = s.vault != null && s.exchangeFloat != null;
    const total =
      s.totalCoins + s.escrow + s.potPending + (s.vault ?? 0) + (s.grant ?? 0) + (s.exchangeFloat ?? 0) - (s.houseMints ?? 0);
    say(
      `  ${s.day}  wallets ${s.totalCoins}  escrow ${s.escrow}  pot ${s.potPending}  ` +
        (withVault ? `vault ${s.vault}  ` : "") +
        (s.grant != null ? `grant ${s.grant}  ` : "") +
        (s.exchangeFloat != null ? `float ${s.exchangeFloat}  ` : "") +
        (withVault ? `total ${total}` : `total ${total} (older row, not comparable)`),
    );
  }
  // THE MINT'S WEEK (E3b): the escape room is the floor's one sanctioned
  // mint; this is its output per day in silver-equivalents, against the
  // tripwire the health check enforces. A drifting economy answers here
  // first.
  {
    const rows = store.erMintRecent(7);
    if (rows.length) {
      say("escape-room mint, by day (silver-eq; tripwire " + ER_MINT_TRIPWIRE + "):");
      for (const m of rows)
        say(`  ${m.day}  ${mintSilverEq(m)} eq  (${m.opens} opens: ${m.silver}ag ${m.chips}ch ${m.spins}sp ${m.pulls}pu)`);
    } else say("escape-room mint: no chests opened yet");
  }

  // The security console's week, condensed. This is here because the weekly
  // paste-into-Claude review is the routine Josh actually keeps — a screen he
  // has to remember to open is a screen that gets opened after something has
  // already gone wrong.
  head("SECURITY, LAST 7 DAYS (sign-in ledger + posture)");
  const findings = [...securityFindings(store, WEEK_MS), ...hostFindings()];
  const crit = findings.filter((f) => f.severity === "crit");
  say(`${findings.length} finding(s): ${crit.length} critical, ${findings.length - crit.length} warning`);
  for (const f of findings.slice(0, 12)) {
    say(`  ${f.severity === "crit" ? "CRIT" : "warn"} ${f.title}${f.staff ? " [STAFF]" : ""} - ${f.detail.slice(0, 120)}`);
  }
  say("");
  say("posture:");
  for (const c of [...securityPosture(store), ...hostPosture()]) {
    if (c.ok && c.severity === "info") continue; // green + informational: skip
    say(`  ${c.ok ? " ok " : c.severity === "crit" ? "RED " : "WARN"} ${c.name} - ${c.detail.slice(0, 160)}`);
  }
  say("");
  const counts = store.loginOutcomeCounts(since);
  say("sign-in attempts: " + (counts.map((c) => `${c.outcome} ${c.n}`).join(", ") || "none recorded"));
  const scanners = store.failedByIp(since, 5).filter((r) => r.users >= 2);
  if (scanners.length) {
    say("addresses trying more than one username:");
    for (const s of scanners) {
      say(`  ${s.ip}  ${s.users} names, ${s.fails} attempts, last ${utc(s.lastAt)}  [${String(s.names ?? "").slice(0, 80)}]`);
    }
  }
  const sessions = store.listSessions();
  say(`live sessions: ${sessions.length} across ${new Set(sessions.map((s) => s.userId)).size} account(s)`);

  head("ADMIN AUDIT TRAIL, LAST 7 DAYS");
  const audit = store.listAudit(200).filter((a) => a.at > since);
  say(`${audit.length} actions (last 10 below)`);
  for (const a of audit.slice(0, 10)) {
    say(`  ${utc(a.at)} actor=${a.actorId ?? "auto"} ${a.action} ${a.detail ? "| " + a.detail.slice(0, 60) : ""}`);
  }

  head("CONNECTIONS RIGHT NOW");
  const conns = getConnectionReport();
  say(`${conns.length} users connected | ${conns.reduce((n, c) => n + c.sockets, 0)} sockets | ${conns.filter((c) => c.voiceChannelId != null).length} in voice`);

  head("STORAGE");
  try {
    say(`db ${mb(fs.statSync(config.dbPath).size)}`);
  } catch {
    say("db size unavailable");
  }
  try {
    const wal = fs.statSync(config.dbPath + "-wal").size;
    say(`wal ${mb(wal)}${wal > 50 * 1024 * 1024 ? "  <-- LARGE: checkpoint starvation?" : ""}`);
  } catch {
    say("wal none");
  }
  for (const d of ["avatars", "banners", "sounds", "attachments", "pageicons", "music", "surfaces"]) {
    say(`uploads/${d} ${mb(dirSize(path.join(config.uploadsDir, d)))}`);
  }
  say(`emoji catalog ${mb(dirSize(config.emojiDir))}`);

  head(`BACKUPS (${BACKUP_DIR})`);
  try {
    const archives = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith(".tar.gz"))
      .map((f) => ({ f, s: fs.statSync(path.join(BACKUP_DIR, f)) }))
      .sort((a, b) => b.s.mtimeMs - a.s.mtimeMs);
    say(`${archives.length} archives | newest three:`);
    for (const a of archives.slice(0, 3)) {
      say(`  ${a.f} ${mb(a.s.size)} | ${((now - a.s.mtimeMs) / 3_600_000).toFixed(1)}h old`);
    }
  } catch {
    say("backup dir not readable on this machine (dev, or check permissions)");
  }

  head("SATELLITE ERRORS (F6)");
  try {
    const satErrs = store.satelliteErrorsUnfixed();
    if (satErrs.length === 0) say("none unfixed - the ledger is clean");
    else {
      say(`${satErrs.length} unfixed signature(s) across ${new Set(satErrs.map((e) => e.satelliteId)).size} satellite(s)`);
      say("export the full report: Admin Panel -> Satellites -> Download error report");
    }
  } catch {
    say("ledger not readable");
  }

  say("");
  say("===== END - OS layer (journal, restart counts, fail2ban, cert, apt) =====");
  say("For those sections run on the server:  sudo bash /opt/solace/deploy/weekly-report.sh");
  return toAscii(L.join("\n"));
}
