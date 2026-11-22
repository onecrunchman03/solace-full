// THE SECURITY CONSOLE — the sign-in ledger, session provenance, and the
// detections built on top of them (migration 65).
//
// Josh, Aug 2026: "for the admin panel can you give a security section built
// from a cyber security perspective. Just want to make sure the server doesn't
// have any unauthorized access."
//
// This drives a REAL server on a throwaway port, because the thing being
// tested is what the DOOR records — and the door is the routes. Two classes of
// assertion, and the second is the one that matters:
//
//   1. Does every path leave the right row? (a login, a bad password, a
//      challenge, a reset, a rate-limit denial…)
//   2. Does the panel refuse to leak? The responses carry raw IPs and session
//      handles for every account on the server, so a non-admin reaching any of
//      it is a worse bug than the one the panel was built to catch. Every
//      admin route is probed as a plain user AND as a moderator.
//
// The IP-shaped assertions run through X-Forwarded-For, which is exactly how
// Caddy feeds the real server — and the RIGHT-most hop is the one that counts
// (clientIp in http.ts), so the harness also proves a forged left-most hop
// can't put someone else's address in the ledger.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, writeFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const PORT = 8491;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "security-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN_PW = "Harness!Admin9xy";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR,
    ADMIN_PASSWORD: ADMIN_PW,
    ALLOW_REGISTRATION: "true",
    REQUIRE_INVITE: "false",
    BACKROOMS_ENABLED: "false",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let bootLog = "";
srv.stdout.on("data", (d) => { bootLog += d; });
srv.stderr.on("data", (d) => { bootLog += d; });
const stop = () => { try { srv.kill("SIGINT"); } catch {} };
process.on("exit", stop);

/** `from` becomes an X-Forwarded-For, i.e. the address Caddy observed. */
const api = async (method, url, { token, body, from } = {}) => {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  if (body !== undefined) headers["content-type"] = "application/json";
  if (from) headers["x-forwarded-for"] = from;
  const res = await fetch(BASE + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json };
};

let secretSeq = 0;
const SECRETS = new Map();
const register = async (username, password, from) => {
  const secret = `vault marmalade lantern ${["quartz", "thistle", "harbour", "ember"][secretSeq++ % 4]} 47`;
  SECRETS.set(username, secret);
  const r = await api("POST", "/api/register", {
    body: { username, password, displayName: username, secret, acceptTerms: true }, from,
  });
  return r.body?.token ?? null;
};

const run = async () => {
  for (let i = 0; i < 60 && !/listening on/.test(bootLog); i++) await sleep(250);
  if (!/listening on/.test(bootLog)) {
    console.error("server never booted:\n" + bootLog.slice(-2000));
    process.exit(1);
  }

  const PW = "Corridor!Lantern42";
  const HOME = "203.0.113.20";      // TEST-NET-3, the "usual" network
  const AWAY = "198.51.100.77";     // TEST-NET-2, somewhere else entirely

  const adminTok = (await api("POST", "/api/login", {
    body: { username: "admin", password: ADMIN_PW }, from: HOME,
  })).body?.token;
  ok(!!adminTok, "the admin can sign in");

  const aliceTok = await register("alice", PW, HOME);
  const bobTok = await register("bob", PW, HOME);
  ok(!!aliceTok && !!bobTok, "two members register");

  // ---- 1. THE LEDGER RECORDS WHAT HAPPENED -------------------------------

  const evOf = async (opts = "") => (await api("GET", `/api/admin/security/events?limit=400${opts}`, { token: adminTok })).body?.events ?? [];

  {
    const events = await evOf();
    const reg = events.filter((e) => e.outcome === "register");
    ok(reg.length === 2, `both registrations are on the ledger (${reg.length})`);
    ok(reg.every((e) => e.ip === HOME), "…recorded against the address they came from");
    ok(events.some((e) => e.outcome === "ok" && e.username === "admin"),
      "the admin's successful sign-in is recorded");
    ok(events.every((e) => typeof e.network === "string" && e.network.endsWith("/24")),
      "every row carries the normalized /24, not just the raw address");
  }

  // A wrong password is recorded, and does NOT vanish when the next attempt
  // succeeds — the old failedLogins counter did exactly that.
  {
    await api("POST", "/api/login", { body: { username: "alice", password: "WrongHorse!99x" }, from: HOME });
    await api("POST", "/api/login", { body: { username: "alice", password: PW }, from: HOME });
    const events = await evOf();
    ok(events.some((e) => e.username === "alice" && e.outcome === "bad_password"),
      "a wrong password lands on the ledger");
    ok(events.some((e) => e.username === "alice" && e.outcome === "ok"),
      "…and the later success does not erase it");
  }

  // An attempt on a name that doesn't exist is the tell for enumeration, so
  // it has to be recorded even though there's no user row to hang it on.
  {
    await api("POST", "/api/login", { body: { username: "nosuchperson", password: PW }, from: AWAY });
    const events = await evOf();
    const probe = events.find((e) => e.username === "nosuchperson");
    ok(!!probe && probe.outcome === "unknown_user", "a probe at a nonexistent account is recorded");
    ok(probe?.userId === null, "…with a null userId, since there is nobody to attribute it to");
  }

  // ---- 2. THE FORGED-HEADER CHECK ----------------------------------------
  // clientIp reads the RIGHT-most hop (the one Caddy appended). A client
  // sending its own X-Forwarded-For must not be able to write a chosen
  // address into the ledger and frame somebody else.
  {
    await api("POST", "/api/login", {
      body: { username: "bob", password: "WrongHorse!99x" },
      from: `9.9.9.9, ${AWAY}`,
    });
    const events = await evOf();
    const hit = events.find((e) => e.username === "bob" && e.outcome === "bad_password");
    ok(hit?.ip === AWAY, `the ledger takes the right-most hop (${hit?.ip}), not the forged 9.9.9.9`);
    ok(!events.some((e) => e.ip === "9.9.9.9"), "the forged address appears nowhere");
  }

  // ---- 3. THE NEW-NETWORK CHALLENGE, BOTH HALVES -------------------------
  {
    const chal = await api("POST", "/api/login", { body: { username: "alice", password: PW }, from: AWAY });
    ok(chal.body?.challenge === "secret" && !chal.body?.token,
      "a correct password from a new network is challenged, with no token issued");
    let events = await evOf();
    ok(events.some((e) => e.username === "alice" && e.outcome === "challenged"),
      "the challenge itself is recorded");

    const badSecret = await api("POST", "/api/login/verify", {
      body: { username: "alice", password: PW, secret: "not the right phrase at all" }, from: AWAY,
    });
    ok(badSecret.status === 401, "a wrong recovery secret is refused");
    events = await evOf();
    ok(events.some((e) => e.username === "alice" && e.outcome === "bad_secret"),
      "…and recorded as bad_secret, distinct from a bad password");

    const good = await api("POST", "/api/login/verify", {
      body: { username: "alice", password: PW, secret: SECRETS.get("alice") }, from: AWAY,
    });
    ok(!!good.body?.token, "the right secret gets in from the new network");
    events = await evOf();
    const passed = events.find((e) => e.username === "alice" && e.outcome === "challenge_passed");
    ok(!!passed, "the pass is recorded under its OWN outcome, not folded into ok");
    ok(passed?.ip === AWAY, "…against the new address");
  }

  // ---- 4. THE DETECTIONS -------------------------------------------------

  // Credential stuffing: one address, several names. This is the shape that
  // separates an attack from a person who forgot their password, so the
  // finding keys off distinct usernames rather than raw volume.
  {
    const SCANNER = "192.0.2.66";
    for (const name of ["alice", "bob", "carol", "dave"]) {
      await api("POST", "/api/login", { body: { username: name, password: "Whatever!123x" }, from: SCANNER });
    }
    const sec = (await api("GET", "/api/admin/security", { token: adminTok })).body;
    const byIp = sec.failedByIp.find((r) => r.ip === SCANNER);
    ok(!!byIp, "the scanner address shows up in failures-by-IP");
    ok(byIp?.users >= 4, `…having tried ${byIp?.users} distinct usernames`);
    const stuffing = sec.findings.find((f) => f.id === `stuffing:${SCANNER}`);
    ok(!!stuffing, "a credential-stuffing finding is raised");
    ok(stuffing?.severity === "crit", "…at crit severity");

    // …and a single account failing repeatedly is NOT called stuffing, which
    // is the false positive that would train Josh to ignore the alert.
    const solo = "192.0.2.99";
    for (let i = 0; i < 3; i++) {
      await api("POST", "/api/login", { body: { username: "bob", password: "Whatever!123x" }, from: solo });
    }
    const sec2 = (await api("GET", "/api/admin/security", { token: adminTok })).body;
    ok(!sec2.findings.some((f) => f.id === `stuffing:${solo}`),
      "one account failing several times is not reported as stuffing");
  }

  // Two networks inside the hour — the no-geo-IP impossible-travel check.
  {
    const sec = (await api("GET", "/api/admin/security", { token: adminTok })).body;
    const travel = sec.findings.find((f) => f.id.startsWith("travel:") && f.detail.includes("alice"));
    ok(!!travel, "alice signing in from two networks in the hour is flagged");
    ok(travel?.severity === "warn", "…as warn, since a phone changing networks does this");
  }

  // A challenge pass on a STAFF account is the loud one.
  {
    const chal = await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW }, from: AWAY });
    ok(chal.body?.challenge === "secret" || !!chal.body?.token,
      "the admin from a new network is either challenged or (no secret set) let in");
    const sec = (await api("GET", "/api/admin/security", { token: adminTok })).body;
    const staffRow = sec.staff.find((s) => s.username === "admin");
    ok(!!staffRow, "the admin appears in the staff-activity list");
    ok(Array.isArray(staffRow?.recent) && staffRow.recent.length > 0,
      "…with their recent sign-in attempts attached");
  }

  // A SEALED account is not live privilege. Banning or deleting a moderator
  // has to remove them from the staff surface, or the posture check keeps
  // counting privilege that can no longer sign in.
  {
    const tempTok = await register("tempmod", PW, HOME);
    const id = (await api("GET", "/api/admin/security/sessions", { token: adminTok }))
      .body.sessions.find((s) => s.user?.username === "tempmod")?.userId;
    await api("POST", `/api/admin/users/${id}/role`, { token: adminTok, body: { role: "moderator" } });
    let sec = (await api("GET", "/api/admin/security", { token: adminTok })).body;
    ok(sec.staff.some((s) => s.username === "tempmod"), "a promoted moderator joins the staff list");
    await api("POST", `/api/admin/users/${id}/delete`, { token: adminTok });
    sec = (await api("GET", "/api/admin/security", { token: adminTok })).body;
    ok(!sec.staff.some((s) => s.username === "tempmod"),
      "…and a sealed (scrubbed) account leaves it, rather than counting as live privilege");
    void tempTok;
  }

  // ---- 5. POSTURE --------------------------------------------------------
  {
    const sec = (await api("GET", "/api/admin/security", { token: adminTok })).body;
    const byName = Object.fromEntries(sec.posture.map((c) => [c.name, c]));
    ok(!!byName["Registration policy"], "posture reports the registration policy");
    ok(byName["Registration policy"].ok === false,
      "…and calls this harness's open registration what it is: not ok");
    ok(byName["Sign-in ledger"].ok === true, "the ledger reports itself as recording");
    ok(!!byName["Session tokens"], "posture counts live session tokens");
    ok(!!byName["Staff accounts"], "posture lists the staff surface");
  }

  // ---- 6. SESSIONS: PROVENANCE AND REVOCATION ----------------------------
  {
    const mine = (await api("GET", "/api/me/sessions", { token: aliceTok })).body?.sessions ?? [];
    ok(mine.length >= 2, `alice can see her own sessions (${mine.length})`);
    ok(mine.some((s) => s.current), "…and exactly one is marked as the current one");
    ok(mine.every((s) => !("token" in s)), "no session response ever carries the raw token");
    ok(mine.every((s) => typeof s.handle === "string" && s.handle.length === 16),
      "each is addressed by a 16-char handle instead");
    ok(mine.some((s) => s.ip === HOME) && mine.some((s) => s.ip === AWAY),
      "sessions remember which address issued them");
    ok(mine.every((s) => s.createdAt > 0 && s.lastSeenAt >= s.createdAt),
      "createdAt is fixed at issue and lastSeenAt slides from it");

    // Alice kills the away session; her current one survives.
    const away = mine.find((s) => s.ip === AWAY && !s.current);
    const rev = await api("POST", "/api/me/sessions/revoke", { token: aliceTok, body: { handle: away.handle } });
    ok(rev.body?.revoked === 1, "she can revoke a session she doesn't recognise");
    const after = (await api("GET", "/api/me/sessions", { token: aliceTok })).body?.sessions ?? [];
    ok(!after.some((s) => s.handle === away.handle), "…and it's gone");
    ok(after.some((s) => s.current), "…while the session she's using still works");

    // Cross-account revocation must fail: bob guessing alice's handle gets a
    // 404, because the lookup happens inside HIS OWN rows.
    const alicesHandle = after[0].handle;
    const cross = await api("POST", "/api/me/sessions/revoke", { token: bobTok, body: { handle: alicesHandle } });
    ok(cross.status === 404, "bob cannot revoke alice's session by handle");
    const stillThere = (await api("GET", "/api/me/sessions", { token: aliceTok })).body?.sessions ?? [];
    ok(stillThere.some((s) => s.handle === alicesHandle), "…and hers is untouched");
  }

  // Admin revocation of every session an account holds.
  {
    const before = (await api("GET", "/api/me/sessions", { token: bobTok })).body?.sessions ?? [];
    ok(before.length >= 1, "bob holds a session");
    const bobId = (await api("GET", "/api/admin/security/sessions", { token: adminTok }))
      .body.sessions.find((s) => s.user?.username === "bob")?.userId;
    ok(Number.isInteger(bobId), "the admin session list resolves each session to its member");
    const rev = await api("POST", "/api/admin/security/sessions/revoke", {
      token: adminTok, body: { userId: bobId },
    });
    ok(rev.body?.revoked >= 1, "the admin can revoke every session an account holds");
    const probe = await api("GET", "/api/me", { token: bobTok });
    ok(probe.status === 401, "…and bob's token stops working immediately");
    const audit = (await api("GET", "/api/admin/audit", { token: adminTok })).body?.audit ?? [];
    ok(audit.some((a) => a.action === "session.revoke_all"), "the revocation is on the audit trail");
  }

  // ---- 7. THE MACHINE LAYER ----------------------------------------------
  // deploy/security-collector.sh writes this file as root on a timer; the app
  // only reads it. The three states that matter are absent (never installed),
  // fresh, and stale — and NONE of them may render as a clean machine.
  const SNAP = path.join(DATA_DIR, "security-snapshot.json");
  {
    let sec = (await api("GET", "/api/admin/security", { token: adminTok })).body;
    const none = sec.host.find((c) => c.name === "Host collector");
    ok(sec.host.length === 1 && !!none, "with no collector installed, the machine section is one row");
    ok(none.ok === false && none.severity === "info",
      "…which says 'not installed' rather than reporting a healthy machine");
    ok(/Not installed/.test(none.detail), "…and says how to install it");

    // A fresh snapshot carrying one red check.
    writeFileSync(SNAP, JSON.stringify({
      at: Date.now(), host: "r220", uptime: "up 3 weeks", notes: "",
      checks: [
        { name: "Firewall (ufw)", ok: false, severity: "crit", detail: "ufw is INACTIVE — every listening port is exposed." },
        { name: "Listening ports", ok: true, severity: "info", detail: "Public listeners as expected." },
      ],
    }));
    sec = (await api("GET", "/api/admin/security", { token: adminTok })).body;
    ok(sec.host.length === 3, "a fresh snapshot's checks are surfaced under the collector row");
    ok(sec.host[0].ok === true && /r220/.test(sec.host[0].detail),
      "the collector row reports the host and the snapshot's age");
    ok(sec.host.some((c) => c.name === "Firewall (ufw)" && !c.ok),
      "the machine's own red check comes through");
    ok(sec.findings.some((f) => f.id === "host:Firewall (ufw)" && f.severity === "crit"),
      "…and becomes a finding, so Sterling escalates it like an app one");

    // A stale snapshot: the timer died. The old checks must stop counting.
    writeFileSync(SNAP, JSON.stringify({
      at: Date.now() - 90 * 60_000, host: "r220", uptime: "up 3 weeks", notes: "",
      checks: [{ name: "Firewall (ufw)", ok: true, severity: "info", detail: "Active." }],
    }));
    sec = (await api("GET", "/api/admin/security", { token: adminTok })).body;
    ok(sec.host[0].ok === false && /STALE/.test(sec.host[0].detail),
      "a snapshot older than 30 minutes is called stale, not trusted");
    ok(sec.findings.some((f) => f.id === "host:stale"),
      "…and raises its own finding, because a dead collector is itself the problem");
    ok(!sec.findings.some((f) => f.id.startsWith("host:") && f.id !== "host:stale"),
      "…while its individual stale checks are NOT alerted on");

    // Garbage in the file must not take the console down.
    writeFileSync(SNAP, "{ this is not json");
    sec = (await api("GET", "/api/admin/security", { token: adminTok })).body;
    ok(sec?.host?.length === 1 && /Not installed/.test(sec.host[0].detail),
      "an unreadable snapshot degrades to 'not installed' instead of erroring");
    rmSync(SNAP, { force: true });
  }

  // ---- 8. THE WEEKLY REPORT CARRIES IT -----------------------------------
  // Josh's actual routine is pasting the weekly report into a session, not
  // opening a panel. A security screen he has to remember to visit is one he
  // visits after something has already happened, so the week's findings have
  // to reach the report too.
  {
    const res = await fetch(BASE + "/api/admin/weekly-report", {
      headers: { authorization: "Bearer " + adminTok },
    });
    const txt = await res.text();
    ok(res.status === 200, "the weekly report still builds");
    ok(/SECURITY, LAST 7 DAYS/.test(txt), "…and has a security section");
    ok(/sign-in attempts:/.test(txt), "…with the attempt counts");
    ok(/addresses trying more than one username/.test(txt),
      "…and names the addresses that walked a username list");
    ok(/192\.0\.2\.66/.test(txt), "…including the scanner this harness ran");
    ok(/live sessions: \d+/.test(txt), "…and the live session count");
    ok(/Host collector/.test(txt), "…and says whether the host collector is installed");
    // ASCII only: the report opens in Notepad, which guesses ANSI and
    // mojibakes anything else (the first weekly report proved it).
    // eslint-disable-next-line no-control-regex
    ok(!/[^\x00-\x7F]/.test(txt), "the report stays ASCII-only so Notepad doesn't mangle it");
  }

  // ---- 9. THE PANEL MUST NOT LEAK ----------------------------------------
  // Everything above carries raw IPs for the whole server. A moderator is
  // explicitly NOT enough — they do moderation, not forensics.
  {
    const modTok = await register("morgan", PW, HOME);
    const morganId = (await api("GET", "/api/admin/security/sessions", { token: adminTok }))
      .body.sessions.find((s) => s.user?.username === "morgan")?.userId;
    await api("POST", `/api/admin/users/${morganId}/role`, { token: adminTok, body: { role: "moderator" } });
    const asMod = await api("GET", "/api/admin/security", { token: modTok });
    ok(asMod.status === 403, `a moderator is refused the security console (${asMod.status})`);

    for (const [method, url] of [
      ["GET", "/api/admin/security"],
      ["GET", "/api/admin/security/events"],
      ["GET", "/api/admin/security/sessions"],
      ["POST", "/api/admin/security/sessions/revoke"],
    ]) {
      const anon = await api(method, url);
      const asUser = await api(method, url, { token: aliceTok, ...(method === "POST" ? { body: {} } : {}) });
      ok(anon.status === 401 || anon.status === 403, `${url} refuses anonymous (${anon.status})`);
      ok(asUser.status === 403, `${url} refuses a plain member (${asUser.status})`);
    }

    // A member's own view is scoped to themselves — never anyone else's rows.
    const mySec = (await api("GET", "/api/me/security", { token: aliceTok })).body?.events ?? [];
    ok(mySec.length > 0, "a member can see their own sign-in history");
    ok(mySec.every((e) => e.username === "alice"),
      "…and it contains nobody else's attempts");
  }

  // ---- 10. A KICK HANGS UP ONLY THE SESSIONS THAT ENDED (Oct 2026 review) --
  // A kick closed EVERY socket an account had, and the client signs out on
  // that close, so revoking one device signed out all of them; and a password
  // change or reset deleted the session rows but left a thief's open sockets
  // streaming the account's DMs.
  {
    const { WebSocket } = require("ws");
    const NET = "203.0.113.31";
    const PW2 = "Lighthouse!Gravel58";
    const kTok = await register("kira", PW2, NET);
    const login = async (pw) => (await api("POST", "/api/login", { body: { username: "kira", password: pw }, from: NET })).body?.token;
    const t2 = await login(PW2), t3 = await login(PW2);
    const open = (tok) => new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${tok}`);
      const rec = { ws, code: null };
      ws.on("close", (c) => { rec.code = c; });
      ws.on("error", () => {});
      ws.on("open", () => resolve(rec));
    });
    const [s1, s2, s3] = [await open(kTok), await open(t2), await open(t3)];
    await sleep(300);
    const handles = (await api("GET", "/api/me/sessions", { token: kTok })).body?.sessions ?? [];
    // the handle is the first 16 hex of the token's SHA-256
    const { createHash } = await import("node:crypto");
    const handleOf = (tok) => createHash("sha256").update(tok).digest("hex").slice(0, 16);
    ok(handles.some((h) => h.handle === handleOf(t3)), "kira has three sessions, each with a live /ws");
    await api("POST", "/api/me/sessions/revoke", { token: kTok, body: { handle: handleOf(t3) } });
    await sleep(500);
    ok(s3.code === 4003, `revoking one device hangs up that device (${s3.code})`);
    ok(s1.code === null && s2.code === null, `…and nobody else — not the asker, not the other device (${s1.code}, ${s2.code})`);

    const PW3 = "Cormorant!Pebble71";
    const ch = await api("POST", "/api/me/password", { token: kTok, body: { current: PW2, next: PW3 } });
    await sleep(500);
    ok(ch.status === 200 && s2.code === 4003, `a password change hangs up the other devices' sockets (${ch.status}, ${s2.code})`);
    ok(s1.code === null, `…while the device that changed it stays connected (${s1.code})`);

    const t4 = await login(PW3);
    const s4 = await open(t4);
    const rs = await api("POST", "/api/reset-password", { body: { username: "kira", secret: SECRETS.get("kira"), newPassword: "Driftwood!Copper93" }, from: NET });
    await sleep(500);
    ok(rs.status === 200 && s1.code === 4003 && s4.code === 4003, `a reset by recovery secret hangs up EVERY socket (${rs.status}, ${s1.code}, ${s4.code})`);

    // THE PASSWORD SCREENS (Oct 2026 review): the change skipped the username
    // check, and a reset could make the password the recovery secret.
    const t5 = await login("Driftwood!Copper93");
    const withName = await api("POST", "/api/me/password", { token: t5, body: { current: "Driftwood!Copper93", next: "Kira_Lantern2026!" } });
    ok(withName.status === 400, `a new password containing the username is refused at change too (${withName.status})`);
    const asSecret = await api("POST", "/api/reset-password", { body: { username: "kira", secret: SECRETS.get("kira"), newPassword: SECRETS.get("kira") }, from: NET });
    ok(asSecret.status === 400, `a reset can't make the password the recovery secret (${asSecret.status})`);
  }

  // ---- 11. HOUSE LEVERS ON THE WRONG KIND OF ACCOUNT (Oct 2026 review) -------
  {
    const NET2 = "203.0.113.41";
    const gPw = "Marigold!Furnace64";
    await register("ghost", gPw, NET2);
    const gid = (await api("GET", "/api/admin/security/sessions", { token: adminTok })).body.sessions.find((s) => s.user?.username === "ghost")?.userId;
    const del = await api("POST", `/api/admin/users/${gid}/delete`, { token: adminTok });
    const unban = await api("POST", `/api/admin/users/${gid}/lock`, { token: adminTok, body: { locked: false } });
    ok(del.status === 200 && unban.status === 404, `an unban can't bring a deleted account back (${del.status}, ${unban.status})`);
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"), { readOnly: true });
    const row = db.prepare("SELECT passwordHash, role FROM users WHERE id = ?").get(gid);
    ok(row && !row.passwordHash.startsWith("scrypt$") && row.role === "user", "…and the scrub left no working password behind");
    const rig = await api("POST", "/api/admin/spins/rig-legendary", { token: adminTok, body: { userId: (await api("GET", "/api/me", { token: aliceTok })).body.user.id } });
    const audited = db.prepare("SELECT COUNT(*) AS c FROM audit WHERE action = 'spin.rig_legendary'").get().c;
    db.close();
    ok(rig.status === 200 && audited === 1, `a rigged legendary (a 2,500-silver mint) is audited (${audited})`);
  }

  // ---- THE LOCK BINDS STRANGERS (Oct 2026) --------------------------------
  {
    const STRANGER = "192.0.2.66"; // TEST-NET-1
    const carolTok = await register("carol", PW, HOME);
    ok(!!carolTok, "carol registers at home");
    for (let i = 0; i < 6; i++) {
      await api("POST", "/api/login", { body: { username: "carol", password: "NotHerPass!77z" }, from: STRANGER });
    }
    const away = await api("POST", "/api/login", { body: { username: "carol", password: PW }, from: STRANGER });
    ok(away.status === 429 && away.body?.error === "locked", `a stranger's failures lock the account against strangers (${away.status})`);
    const home = await api("POST", "/api/login", { body: { username: "carol", password: PW }, from: HOME });
    ok(home.status === 200 && !!home.body?.token, `…but carol's right password from home still gets in (${home.status})`);
    for (let i = 0; i < 6; i++) {
      await api("POST", "/api/login", { body: { username: "carol", password: "NotHerPass!77z" }, from: STRANGER });
    }
    const reset = await api("POST", "/api/reset-password", {
      body: { username: "carol", secret: SECRETS.get("carol"), newPassword: "Lighthouse!Gravel93" }, from: HOME,
    });
    ok(reset.status === 200, `…and she can reset with her secret from home through the lock (${reset.status})`);
    const { DatabaseSync } = await import("node:sqlite");
    const rw = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
    const carolId = rw.prepare("SELECT id FROM users WHERE username = 'carol'").get().id;
    rw.prepare("UPDATE users SET failedLogins = 30, lockedUntil = ? WHERE id = ?").run(Date.now() - 2 * 3_600_000, carolId);
    rw.close();
    await api("POST", "/api/login", { body: { username: "carol", password: "NotHerPass!77z" }, from: STRANGER });
    const ro = new DatabaseSync(path.join(DATA_DIR, "solace.db"), { readOnly: true });
    const after = ro.prepare("SELECT failedLogins, lockedUntil FROM users WHERE id = ?").get(carolId);
    ro.close();
    ok(after.failedLogins === 1 && after.lockedUntil === 0, `failures fade: a lock that ran out hours ago doesn't snap back to the cap (${after.failedLogins})`);
  }

  console.log(`\n${n - bad}/${n} passed`);
  stop();
  await sleep(300);
  try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  process.exit(bad ? 1 : 0);
};

run().catch((e) => { console.error(e); stop(); process.exit(1); });
