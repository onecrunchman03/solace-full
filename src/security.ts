// THE SECURITY LAYER (Josh, Aug 2026: "just want to make sure the server
// doesn't have any unauthorized access").
//
// Two separable things live here:
//
//   POSTURE  — standing facts about how the door is configured. Slow-moving,
//              green/red, answers "is this server set up safely right now".
//   FINDINGS — things that HAPPENED in a window and deserve a look. Each one
//              is an event a hostile party would have to produce, phrased as
//              what it would mean rather than as a metric.
//
// Findings are what Sterling escalates, so every one of them carries a stable
// `id` (its alert-cooldown key) and an honest severity. The bar for `crit` is
// deliberately high: an alert that fires on ordinary Tuesday behaviour trains
// the operator to ignore it, which is worse than not having it.
//
// Everything here reads. Nothing in this module mutates state, and none of it
// is reachable below "admin" — the rows carry your friends' raw IP addresses.

import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import type { Store } from "./db/store";
import { rateLimitDenials } from "./http";

/** How long the sign-in ledger keeps rows. Josh's call, Aug 2026. */
export const SECURITY_RETENTION_DAYS = 90;
/** The default window the panel and the sweep look back over. */
export const WINDOW_MS = 24 * 3_600_000;
/** Two successful logins from different networks inside this = worth a look. */
const TRAVEL_MS = 60 * 60_000;
/** Distinct usernames from one address before it reads as a stuffing run. */
const STUFFING_NAMES = 3;
/** Raw failures from one address before it reads as a brute-force attempt. */
const BRUTE_FAILS = 20;
/** No successful sign-in in this long makes a staff account dead weight. */
const DORMANT_MS = 90 * 86_400_000;

export type Severity = "info" | "warn" | "crit";

export interface PostureCheck {
  name: string;
  ok: boolean;
  detail: string;
  severity: Severity;
}

export interface Finding {
  /** Stable across repeats of the same condition — Sterling's cooldown key. */
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  at: number;
  /** True for anything touching an admin or moderator account. */
  staff?: boolean;
  /** Override Sterling's default re-alert cooldown (6h). For standing
   *  operator chores — a pending reboot — a weekly reminder is a reminder;
   *  four DMs a day is a nag (Josh, Aug 2026). */
  cooldownMs?: number;
}

const ago = (ms: number) => Date.now() - ms;

// ---- Posture ---------------------------------------------------------------

export function securityPosture(store: Store): PostureCheck[] {
  const checks: PostureCheck[] = [];
  const now = Date.now();

  // 1. The front door. An open registration with no invite requirement is the
  //    one setting that turns "invite-only friend group" into "anyone".
  const open = config.allowRegistration && !config.requireInvite;
  checks.push({
    name: "Registration policy",
    ok: !open,
    severity: "crit",
    detail: open
      ? "OPEN — anyone who finds solace.zone can create an account. Set REQUIRE_INVITE=true."
      : config.allowRegistration
        ? "Invite-only (registration on, invite code required)."
        : "Closed — registration is disabled entirely.",
  });

  // 2. Recovery secrets. Without one an account can't be network-challenged,
  //    so a leaked password is by itself enough to get in.
  const noSecret = store.accountsWithoutSecret();
  const staff = store.staffAccounts();
  const staffIds = new Set(staff.map((s) => s.id));
  const staffNoSecret = noSecret.filter((u) => staffIds.has(u.id));
  checks.push({
    name: "Recovery secrets",
    ok: noSecret.length === 0,
    severity: staffNoSecret.length ? "crit" : "warn",
    detail: noSecret.length === 0
      ? "Every live account has one — new-network logins are all challenged."
      : `${noSecret.length} account(s) without one: ${noSecret.slice(0, 6).map((u) => u.username).join(", ")}` +
        (staffNoSecret.length ? ` — INCLUDING STAFF (${staffNoSecret.map((u) => u.username).join(", ")})` : "") +
        ". They are prompted on next login; until then a stolen password alone gets in.",
  });

  // 3. Staff surface. Every admin is a full compromise if taken.
  const admins = staff.filter((s) => s.isAdmin);
  checks.push({
    name: "Staff accounts",
    ok: admins.length > 0 && admins.length <= 3,
    severity: "info",
    detail: `${admins.length} admin(s), ${staff.length - admins.length} moderator(s): ` +
      staff.map((s) => `${s.username}${s.isAdmin ? " (admin)" : ""}`).join(", "),
  });

  // 4. Dormant staff — privilege nobody is watching.
  const dormant = staff
    .map((s) => ({ ...s, last: store.lastLoginAt(s.id) }))
    .filter((s) => s.last !== null && now - s.last! > DORMANT_MS);
  if (dormant.length) {
    checks.push({
      name: "Dormant staff",
      ok: false,
      severity: "warn",
      detail: `${dormant.map((d) => d.username).join(", ")} hold privilege but haven't signed in for 90+ days.`,
    });
  }

  // 5. Live lockouts. Present tense: somebody is being locked out right now.
  const locked = store.lockedOutAccounts();
  checks.push({
    name: "Brute-force lockouts",
    ok: locked.length === 0,
    severity: "warn",
    detail: locked.length === 0
      ? "No account is currently locked."
      : `${locked.length} locked right now: ` +
        locked.map((l) => `${l.username} (${l.failedLogins} fails)`).join(", "),
  });

  // 6. Outstanding invites are standing permission to create an account.
  const liveInvites = store.listInvites(now).filter((i) => i.status === "active");
  checks.push({
    name: "Outstanding invites",
    ok: liveInvites.length <= 5,
    severity: "info",
    detail: liveInvites.length === 0
      ? "None redeemable — the only way in is an account that already exists."
      : `${liveInvites.length} code(s) still redeemable. Revoke any you don't remember minting.`,
  });

  // 7. Sessions. A token is a bearer credential: whoever holds it is in.
  const sessions = store.listSessions();
  const veryOld = sessions.filter((s) => now - s.createdAt > 180 * 86_400_000);
  checks.push({
    name: "Session tokens",
    ok: true,
    severity: "info",
    detail: `${sessions.length} live across ${new Set(sessions.map((s) => s.userId)).size} account(s); ` +
      `TTL ${config.sessionTtlDays}d of disuse` +
      (veryOld.length ? `; ${veryOld.length} issued over 180 days ago and still sliding.` : "."),
  });

  // 8. The ledger itself. If this is empty the whole panel is blind, and an
  //    empty panel must never read as "all clear".
  const oldest = store.listLoginEvents({ limit: 1, since: 0 });
  const total = store.loginOutcomeCounts(0).reduce((t, r) => t + r.n, 0);
  checks.push({
    name: "Sign-in ledger",
    ok: total > 0,
    severity: "warn",
    detail: total > 0
      ? `${total.toLocaleString()} attempts recorded, kept ${SECURITY_RETENTION_DAYS} days. Newest ${new Date(oldest[0]!.at).toISOString().slice(0, 16).replace("T", " ")} UTC.`
      : "EMPTY — nothing has been recorded yet. If the server has been up a while, recording is broken and this screen is blind.",
  });

  // 9. Throttle pressure since boot. Not a verdict, a volume dial.
  const denials = rateLimitDenials();
  const authDenials = denials.filter((d) => ["login", "register", "reset"].includes(d.key));
  checks.push({
    name: "Rate-limit denials",
    ok: authDenials.reduce((t, d) => t + d.count, 0) < 50,
    severity: "info",
    detail: denials.length === 0
      ? "None since boot."
      : denials.map((d) => `${d.key}: ${d.count}`).join(", ") + " (since boot).",
  });

  return checks;
}

// ---- Findings --------------------------------------------------------------

export function securityFindings(store: Store, windowMs = WINDOW_MS): Finding[] {
  const since = ago(windowMs);
  const out: Finding[] = [];
  const staffIds = new Set(store.staffAccounts().map((s) => s.id));

  // CREDENTIAL STUFFING. One address, several usernames. A person who forgot
  // their password fails against ONE name; a script walks a list. That's the
  // discriminator, so it's what the severity keys off — not raw volume.
  // Every address that crossed a line, not the top twenty (Oct 2026 review):
  // twenty junk addresses each walking four names pushed a real brute-force
  // run off the list for the whole window.
  for (const row of store.failedByIp(since, 500)) {
    if (row.users >= STUFFING_NAMES) {
      out.push({
        id: `stuffing:${row.ip}`,
        severity: "crit",
        title: "Credential stuffing pattern",
        detail: `${row.ip} failed against ${row.users} different usernames (${row.fails} attempts): ${String(row.names ?? "").slice(0, 120)}`,
        at: row.lastAt,
      });
    } else if (row.fails >= BRUTE_FAILS) {
      out.push({
        id: `brute:${row.ip}`,
        severity: "warn",
        title: "Sustained failed sign-ins",
        detail: `${row.ip} made ${row.fails} failed attempts against "${String(row.names ?? "").slice(0, 60)}".`,
        at: row.lastAt,
      });
    }
  }

  // CHALLENGE PASSED. Someone produced the password AND the recovery secret
  // from a network the account has never used. That is either a friend on
  // holiday or a complete takeover, and nothing on the wire distinguishes
  // them — so it is never silently swallowed.
  for (const e of store.listLoginEvents({ since, outcome: "challenge_passed", limit: 50 })) {
    const isStaff = e.userId !== null && staffIds.has(e.userId);
    out.push({
      id: `challenge:${e.userId}:${e.network}`,
      severity: isStaff ? "crit" : "warn",
      title: isStaff ? "STAFF signed in from a new network" : "New-network sign-in verified",
      detail: `${e.username} passed the recovery-secret challenge from ${e.ip} (${e.network}). ` +
        `If that wasn't them, the password AND the secret are both compromised.`,
      at: e.at,
      staff: isStaff,
    });
  }

  // TAKEOVER CREDENTIALS MOVING. A completed self-service reset means the
  // secret alone was enough to replace the password.
  for (const e of store.listLoginEvents({ since, outcome: "reset_ok", limit: 50 })) {
    const isStaff = e.userId !== null && staffIds.has(e.userId);
    out.push({
      id: `reset:${e.userId}:${Math.floor(e.at / 3_600_000)}`,
      severity: isStaff ? "crit" : "warn",
      title: "Password reset with the recovery secret",
      detail: `${e.username}'s password was reset from ${e.ip} and every session was evicted.`,
      at: e.at,
      staff: isStaff,
    });
  }
  for (const e of store.listLoginEvents({ since, outcome: "secret_changed", limit: 50 })) {
    if (e.userId !== null && staffIds.has(e.userId)) {
      out.push({
        id: `secret:${e.userId}:${Math.floor(e.at / 3_600_000)}`,
        severity: "warn",
        title: "Staff recovery secret changed",
        detail: `${e.username} replaced their recovery secret from ${e.ip}.`,
        at: e.at,
        staff: true,
      });
    }
  }

  // TWO PLACES AT ONCE. Impossible-travel without geo-IP: the /24 is already
  // stored for the challenge, so this costs nothing and shares no data with
  // any third party. Mobile-to-wifi handoff trips it, hence warn, not crit.
  for (const row of store.multiNetworkLogins(since, TRAVEL_MS)) {
    out.push({
      id: `travel:${row.userId}:${Math.floor(row.at / 3_600_000)}`,
      severity: "warn",
      title: "Signed in from two networks within the hour",
      detail: `${row.username}: ${String(row.networks ?? "").slice(0, 120)}. ` +
        `Usually a phone changing networks — worth a glance if they say otherwise.`,
      at: row.at,
      staff: staffIds.has(row.userId),
    });
  }

  return out.sort((a, b) => {
    const rank = { crit: 0, warn: 1, info: 2 } as const;
    return rank[a.severity] - rank[b.severity] || b.at - a.at;
  });
}

// ---- The box (Phase B: the host collector's snapshot) ----------------------
//
// deploy/security-collector.sh runs as root on a 10-minute timer and drops a
// JSON file here. The app only READS it — see the header of that script for
// why the sandbox is worth keeping. Everything below therefore assumes the
// file may be absent (never installed), stale (timer died), or malformed
// (half-written, though the collector writes atomically), and none of those
// may be allowed to read as "all clear".

/** A snapshot older than this is not evidence of anything. */
const SNAPSHOT_STALE_MS = 30 * 60_000;

interface HostSnapshot {
  at: number;
  host: string;
  uptime: string;
  notes: string;
  checks: PostureCheck[];
}

export function readHostSnapshot(): HostSnapshot | null {
  try {
    const file = path.join(config.dataDir, "security-snapshot.json");
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as HostSnapshot;
    if (!parsed || typeof parsed.at !== "number" || !Array.isArray(parsed.checks)) return null;
    return parsed;
  } catch {
    return null; // missing, unreadable, or malformed — all handled by the caller
  }
}

/**
 * The host checks, with one synthesised check in front of them describing the
 * collector itself. An absent collector is INFO (Phase B is opt-in per host);
 * a collector that ran once and then stopped is WARN, because the panel would
 * otherwise keep showing yesterday's reassuring answers forever.
 */
export function hostPosture(): PostureCheck[] {
  const snap = readHostSnapshot();
  if (!snap) {
    return [{
      name: "Host collector",
      ok: false,
      severity: "info",
      detail:
        "Not installed — this screen can only see the application, not the machine. " +
        "Install deploy/solace-security.{service,timer} to add SSH logins, fail2ban, " +
        "listening ports, firewall and patch state.",
    }];
  }
  const age = Date.now() - snap.at;
  const head: PostureCheck = age > SNAPSHOT_STALE_MS
    ? {
        name: "Host collector",
        ok: false,
        severity: "warn",
        detail: `STALE — last ran ${Math.round(age / 60_000)} minutes ago (expected every 10). ` +
          `Everything below is that old. Check: systemctl status solace-security.timer`,
      }
    : {
        name: "Host collector",
        ok: true,
        severity: "info",
        detail: `${snap.host}, up ${snap.uptime}. Snapshot ${Math.round(age / 60_000)} min old.` +
          (snap.notes ? ` (${snap.notes})` : ""),
      };
  return [head, ...snap.checks];
}

/** Host checks that are red become findings, so Sterling escalates them too. */
export function hostFindings(): Finding[] {
  const snap = readHostSnapshot();
  if (!snap) return [];
  const out: Finding[] = [];
  const age = Date.now() - snap.at;
  if (age > SNAPSHOT_STALE_MS) {
    out.push({
      id: "host:stale",
      severity: "warn",
      title: "Host security collector stopped reporting",
      detail: `The last host snapshot is ${Math.round(age / 60_000)} minutes old. ` +
        `Until it resumes, the machine-level half of the Security screen is blind.`,
      at: snap.at,
    });
    return out; // stale checks aren't worth alerting on individually
  }
  for (const c of snap.checks) {
    if (c.ok || c.severity === "info") continue;
    out.push({
      id: `host:${c.name}`,
      severity: c.severity,
      title: `Host: ${c.name}`,
      detail: c.detail,
      at: snap.at,
      // A pending reboot is a standing chore, not an incident: the operator
      // heard it the first time and picks the downtime window themselves.
      // Remind weekly, not every six hours.
      ...(c.name === "Pending reboot" ? { cooldownMs: 7 * 24 * 60 * 60_000 } : {}),
    });
  }
  return out;
}

/** Drop ledger rows past the retention window. Returns rows removed. */
export function pruneSecurity(store: Store): number {
  return store.loginEventsPrune(ago(SECURITY_RETENTION_DAYS * 86_400_000));
}
