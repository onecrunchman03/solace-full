// THE PAPERWORK (Josh, Sep 2026: "i want to make sure there user agreements
// and liability protection for me") — driven against a real server:
//
//   · the documents are served, and /api/legal names the versions in force;
//   · registration with the sign-up box records the acceptance (version,
//     clock, address) in the LEDGER, not just a flag; without the box the
//     account exists but reads "not accepted" — the TermsGate's cue;
//   · the gate's accept route takes only the CURRENT version and writes a
//     ledger row of its own; the acceptance never leaks onto the public
//     roster shape;
//   · the Satellite Host Agreement: a register call with no acceptance and
//     none on the key is refused WITHOUT burning the key; the wizard's
//     up-front acceptance against the key makes an old-daemon register call
//     succeed; the daemon's own flag works too; the satellite row carries
//     the version; the admin registry shows it;
//   · reports: a whole community can be reported, a hosted-community
//     message id that isn't indexed 404s, and every report reaches the
//     admin as a Sterling DM at once — the "I didn't catch it in time" fix.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const PORT = 8508;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "legal-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN_PW = "Harness!Admin9xy";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW,
    ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false", BACKROOMS_ENABLED: "false",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let bootLog = "";
srv.stdout.on("data", (d) => { bootLog += d; });
srv.stderr.on("data", (d) => { bootLog += d; });
const stop = () => { try { srv.kill("SIGINT"); } catch {} };
process.on("exit", stop);

const api = async (method, url, { token, body, headers = {} } = {}) => {
  const h = { ...headers };
  if (token) h.authorization = "Bearer " + token;
  if (body !== undefined) h["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
};
let secretSeq = 0;
const register = async (username, extra = {}) => {
  const secret = `vault marmalade lantern ${["quartz", "thistle", "harbour", "ember"][secretSeq++ % 4]} 47`;
  return api("POST", "/api/register", {
    body: { username, password: "Str0ng!Passw0rd#Z", displayName: username, secret, ...extra },
    headers: { "x-forwarded-for": `10.77.0.${10 + secretSeq}` },
  });
};

const run = async () => {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(BASE + "/health")).ok) break; } catch { /* booting */ }
    await sleep(250);
  }
  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  ok(!!admin, "admin logged in");
  if (!admin) { console.log(bootLog.slice(-2000)); process.exit(1); }
  const adminId = (await api("GET", "/api/me", { token: admin })).body.user.id;

  // ---- 1. The documents and their versions --------------------------------
  console.log("\n-- the documents --");
  const legal = await api("GET", "/api/legal");
  ok(legal.status === 200 && legal.body.termsVersion >= 1 && legal.body.hostingVersion >= 1,
    `/api/legal names the versions in force (terms v${legal.body?.termsVersion}, hosting v${legal.body?.hostingVersion})`);
  ok(typeof legal.body.urls?.terms === "string" && legal.body.urls.terms.startsWith("/legal/"), "…and where the documents live");
  const TV = legal.body.termsVersion, HV = legal.body.hostingVersion;
  // The pages themselves are static client files — present in the repo, and
  // each carries the version line the gate quotes.
  const fs = require("node:fs");
  for (const doc of ["terms", "guidelines", "privacy", "hosting", "copyright", "index"]) {
    const file = path.join(ROOT, "client", "public", "legal", `${doc}.html`);
    const html = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    // The version line must match the number the server enforces — bumping
    // TERMS_VERSION without editing the page is exactly the drift to catch.
    const want = doc === "hosting" ? `Version ${HV}` : `Version ${TV}`;
    ok(html.includes("<main>") && (doc === "index" || html.includes(want)), `legal/${doc}.html exists with the version line the server enforces (${want})`);
  }

  // ---- 2. Terms acceptance at sign-up -------------------------------------
  console.log("\n-- terms acceptance --");
  const withBox = await register("agrees_pages", { acceptTerms: true });
  ok(withBox.status === 200 && withBox.body.user.termsVersion === TV,
    `a sign-up with the box ticked reads accepted v${withBox.body?.user?.termsVersion}`);
  const without = await register("silent_pages");
  ok(without.status === 200 && without.body.user.termsVersion === null,
    "a sign-up WITHOUT the box still registers, but reads not-accepted (the gate's cue)");
  const withTok = withBox.body.token, noTok = without.body.token;
  const meNo = await api("GET", "/api/me", { token: noTok });
  ok(meNo.body.user.termsVersion === null, "/api/me carries termsVersion null for them");
  const stale = await api("POST", "/api/me/accept-terms", { token: noTok, body: { version: TV + 7 } });
  ok(stale.status === 400 && stale.body.error === "stale_version", `accepting a version that isn't current is refused (${stale.status})`);
  const accepted = await api("POST", "/api/me/accept-terms", { token: noTok, body: { version: TV }, headers: { "x-forwarded-for": "10.77.9.9" } });
  ok(accepted.status === 200 && accepted.body.user.termsVersion === TV, "the gate's accept records the current version");
  ok((await api("GET", "/api/me", { token: noTok })).body.user.termsVersion === TV, "…and /api/me agrees afterwards");
  // The LEDGER is the evidence: open the DB and read the rows.
  {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"), { readOnly: true });
    const agreesId = withBox.body.user.id, silentId = without.body.user.id;
    const rowsA = db.prepare("SELECT version, at, ip FROM terms_acceptances WHERE userId = ? ORDER BY at").all(agreesId);
    const rowsS = db.prepare("SELECT version, at, ip FROM terms_acceptances WHERE userId = ? ORDER BY at").all(silentId);
    ok(rowsA.length === 1 && rowsA[0].version === TV && typeof rowsA[0].at === "number" && rowsA[0].ip === "10.77.0.11",
      "the sign-up acceptance is a ledger row with version, clock and address");
    ok(rowsS.length === 1 && rowsS[0].ip === "10.77.9.9", "the gate's acceptance is a ledger row of its own");
    const col = db.prepare("SELECT termsVersion, termsAcceptedAt FROM users WHERE id = ?").get(silentId);
    ok(col.termsVersion === TV && col.termsAcceptedAt > 0, "the users row carries the fast-read copy");
    db.close();
  }
  // The roster never carries it.
  const roster = await api("GET", "/api/users", { token: withTok });
  const rosterRow = (roster.body.users ?? roster.body).find?.((u) => u.username === "agrees_pages");
  ok(rosterRow && !("termsVersion" in rosterRow) && !("termsAcceptedAt" in rosterRow), "the public roster shape has no acceptance fields");

  // ---- 2b. NO WAY AROUND IT: the server refuses, whatever the client ------
  // Josh: "make sure what you did was implemented properly and there are no
  // ways around it." A curl session that registered without the box holds a
  // valid token and gets nothing with it until it accepts.
  console.log("\n-- the server enforces it --");
  const curl = await register("curl_pages"); // no box, straight to the API
  const curlTok = curl.body.token, curlId = curl.body.user.id;
  const chans403 = await api("GET", "/api/channels", { token: curlTok });
  ok(chans403.status === 403 && chans403.body.error === "terms_required" && chans403.body.version === TV
    && chans403.body.url === legal.body.urls.terms,
    `an ordinary route refuses a session with no acceptance (${chans403.status} ${chans403.body?.error}) and says which version`);
  const gen0 = (await api("GET", "/api/channels", { token: withTok })).body.channels.find((c) => c.name === "general");
  ok((await api("POST", `/api/channels/${gen0.id}/messages`, { token: curlTok, body: { body: "hello?" } })).status === 403,
    "…posting is refused");
  ok((await api("GET", "/api/wheel", { token: curlTok })).status === 403, "…the Wheel is refused");
  ok((await api("GET", "/api/dm", { token: curlTok })).status === 403, "…DMs are refused");
  ok((await api("PATCH", "/api/me", { token: curlTok, body: { displayName: "sneaky" } })).status === 403, "…even editing your own profile");
  ok((await api("GET", "/api/me", { token: curlTok })).status === 200, "reading yourself is allowed (the gate needs it)");
  // The four WebSocket doors refuse the upgrade.
  const wsRefused = (p) => new Promise((resolve) => {
    const s = new WebSocket(`ws://127.0.0.1:${PORT}${p}?token=${curlTok}`);
    let opened = false;
    s.addEventListener("open", () => { opened = true; s.close(); });
    s.addEventListener("error", () => {});
    s.addEventListener("close", () => resolve(!opened));
    setTimeout(() => { try { s.close(); } catch {} resolve(!opened); }, 3000);
  });
  ok(await wsRefused("/ws"), "the app socket refuses the upgrade");
  ok(await wsRefused("/ws-casino"), "…so does the casino floor's");
  ok(await wsRefused("/ws-escape"), "…and the escape room's");
  // A moderator is bound like anyone else — only the Operator's own account
  // (a party to no contract with itself) and Sterling are outside it.
  ok((await api("POST", `/api/admin/users/${curlId}/role`, { token: admin, body: { role: "moderator" } })).status === 200, "(promoted to moderator)");
  ok((await api("GET", "/api/admin/reports", { token: curlTok })).status === 403, "a moderator with no acceptance is refused the mod routes too");
  const adminMe = (await api("GET", "/api/me", { token: admin })).body.user;
  ok(adminMe.isAdmin && adminMe.termsVersion === null && (await api("GET", "/api/channels", { token: admin })).status === 200,
    "the admin account (the Operator) is not gated — the house doesn't sign its own paper");
  // Accepting opens everything; the socket connects.
  ok((await api("POST", "/api/me/accept-terms", { token: curlTok, body: { version: TV } })).status === 200, "the curl session accepts");
  ok((await api("GET", "/api/channels", { token: curlTok })).status === 200, "…and the same token now reaches the route");
  ok(!(await wsRefused("/ws")), "…and the app socket upgrades");
  // Signing out was always allowed — the Terms name it as the way out.
  const bye = await register("leaver_pages");
  ok((await api("POST", "/api/logout", { token: bye.body.token })).status === 200, "a session that never accepted may still sign out");

  // ---- 3. The Satellite Host Agreement -------------------------------------
  console.log("\n-- the host agreement --");
  const pubkey = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
  const mint = async () => (await api("POST", "/api/admin/satellites/keys", { token: admin, body: { ownerUserId: adminId } })).body.code;
  const k1 = await mint();
  const bare = await api("POST", "/api/satellite/register", { body: { key: k1, name: "Bare", pubkey, version: "0.3.3" } });
  ok(bare.status === 400 && bare.body.error === "hosting_agreement_required" && bare.body.url === legal.body.urls.hosting,
    `a register call with no acceptance anywhere is refused (${bare.status} ${bare.body?.error}) and told where to read`);
  // …and the key is NOT burned: the wizard's up-front acceptance still lands.
  ok((await api("POST", "/api/satellite/accept-hosting", { body: { key: "AAAAAAAAAAAAAAAAAAAA", version: HV } })).status === 403,
    "accepting against a made-up key is refused");
  ok((await api("POST", "/api/satellite/accept-hosting", { body: { key: k1, version: HV + 1 } })).status === 400,
    "accepting a version that isn't current is refused");
  const acc = await api("POST", "/api/satellite/accept-hosting", { body: { key: k1, version: HV }, headers: { "x-forwarded-for": "10.77.5.5" } });
  ok(acc.status === 200 && acc.body.version === HV, "the wizard's up-front acceptance against the key is recorded");
  const oldDaemon = await api("POST", "/api/satellite/register", { body: { key: k1, name: "Wizard Town", pubkey, version: "0.3.3" } });
  ok(oldDaemon.status === 200 && Number.isInteger(oldDaemon.body.satelliteId),
    `an OLD daemon's register call (no flag) succeeds on that key — the refusal never burned it (${oldDaemon.status})`);
  const k2 = await mint();
  const pub2 = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
  const flagged = await api("POST", "/api/satellite/register", {
    body: { key: k2, name: "Flag Town", pubkey: pub2, version: "0.3.4", acceptHosting: true },
  });
  ok(flagged.status === 200, `a register call carrying acceptHosting:true registers on a fresh key (${flagged.status})`);
  const reg = await api("GET", "/api/admin/satellites", { token: admin });
  const wiz = reg.body.satellites.find((s) => s.id === oldDaemon.body.satelliteId);
  const flg = reg.body.satellites.find((s) => s.id === flagged.body.satelliteId);
  ok(wiz?.hostingVersion === HV && wiz.hostingAcceptedAt > 0, "the satellite row carries the accepted version (wizard path)");
  ok(flg?.hostingVersion === HV, "…and the flag path");
  ok(typeof wiz?.openReports === "number", "the admin registry reports open reports per satellite");
  const keys = reg.body.keys;
  ok(keys.length >= 2 && keys.every((k) => k.usedAt !== null), "both keys read as used exactly once");
  // A satellite row WITHOUT the current agreement on it (a pre-agreement
  // registration, or a version bump) is refused at the rendezvous handshake
  // — before the signature is even looked at.
  {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
    db.prepare("UPDATE satellites SET hostingVersion = NULL WHERE id = ?").run(flagged.body.satelliteId);
    db.close();
  }
  const handshake = (satelliteId) => new Promise((resolve) => {
    const s = new WebSocket(`ws://127.0.0.1:${PORT}/ws-satellite`);
    s.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data));
      if (m.type === "challenge") s.send(JSON.stringify({ type: "hello", satelliteId, version: "0.3.4", ts: Date.now(), sig: "not-even-a-signature" }));
    });
    s.addEventListener("error", () => {});
    s.addEventListener("close", (e) => resolve({ code: e.code, reason: String(e.reason) }));
    setTimeout(() => { try { s.close(); } catch {} resolve({ code: 0, reason: "timeout" }); }, 4000);
  });
  const noAgreement = await handshake(flagged.body.satelliteId);
  ok(noAgreement.code === 4403 && noAgreement.reason === "hosting_agreement_required",
    `a satellite with no agreement on its row is refused the link (${noAgreement.code} ${noAgreement.reason})`);
  const withAgreement = await handshake(oldDaemon.body.satelliteId);
  ok(withAgreement.code === 4403 && withAgreement.reason.startsWith("bad_signature"),
    `…while one with the agreement gets as far as the signature check (${withAgreement.reason})`);

  // ---- 4. Reports reach the admin --------------------------------------------
  console.log("\n-- reports --");
  // A community can be reported. Bind the wizard satellite to a page first.
  const bound = await api("POST", `/api/admin/satellites/${oldDaemon.body.satelliteId}/page`, { token: admin, body: { name: "Wizard Town" } });
  ok(bound.status === 200 && bound.body.page?.id, `the satellite got a page (${bound.status})`);
  const pageId = bound.body.page.id;
  // The community is request-to-join by default and discoverable → visible to report.
  const dmBefore = (await api("GET", "/api/dm", { token: admin })).body;
  const rep = await api("POST", "/api/report", { token: withTok, body: { kind: "page", refId: pageId, reason: "the host is letting people post stolen credit cards in there" } });
  ok(rep.status === 200 && Number.isInteger(rep.body.id), `a whole community can be reported (${rep.status})`);
  ok((await api("POST", "/api/report", { token: withTok, body: { kind: "page", refId: 987654, reason: "nothing there" } })).status === 404,
    "reporting a page that doesn't exist 404s");
  // The reporter is NOT a member of Wizard Town (request-to-join, card
  // visible) — a card you can see is a community you can report…
  const wizCard = (await api("GET", "/api/pages", { token: withTok })).body.pages.find((p) => p.id === pageId);
  ok(wizCard && wizCard.role === null && wizCard.joinPolicy === "request", "…the reporter isn't a member of it (a discoverable card was enough)");
  // …while a HIDDEN page stays nonexistent to them, report included.
  const hidden = (await api("POST", "/api/pages", { token: admin, body: { name: "Admin Cellar", joinPolicy: "invite", discoverable: false } })).body.page;
  ok((await api("POST", "/api/report", { token: withTok, body: { kind: "page", refId: hidden.id, reason: "probe" } })).status === 404,
    "a hidden page can't be reported by an outsider (404, never a 403 — no existence oracle)");
  ok((await api("POST", "/api/report", { token: withTok, body: { kind: "message", refId: 1_000_000_000 * oldDaemon.body.satelliteId + 5, reason: "x" } })).status === 404,
    "a hosted-community message id the hub never indexed 404s");
  await sleep(300);
  // Sterling DMed the admin.
  const convos = (await api("GET", "/api/dm", { token: admin })).body;
  const list = convos.conversations ?? convos;
  const sterlingConvo = list.find((c) => c.otherUser?.isBot);
  ok(!!sterlingConvo, "the admin has a conversation with Sterling");
  let dmText = "";
  if (sterlingConvo) {
    const msgs = (await api("GET", `/api/dm/${sterlingConvo.id}/messages`, { token: admin })).body;
    const arr = msgs.messages ?? msgs;
    dmText = arr.map((m) => m.body).join("\n");
  }
  ok(/REPORT #\d+/.test(dmText) && dmText.includes("Wizard Town") && dmText.includes("stolen credit cards"),
    "…and Sterling's DM names the report, the community and the reason");
  void dmBefore;
  // The queue shows the page kind, and the satellite registry counts it.
  const queue = (await api("GET", "/api/admin/reports", { token: admin })).body.reports;
  const item = queue.find((r) => r.id === rep.body.id);
  ok(item?.kind === "page" && item.pageId === pageId && item.pageName === "Wizard Town", "the admin queue shows the page report with its name");
  const reg2 = (await api("GET", "/api/admin/satellites", { token: admin })).body.satellites.find((s) => s.id === oldDaemon.body.satelliteId);
  ok(reg2?.openReports === 1, `the satellite's registry row counts the open report (${reg2?.openReports})`);
  ok((await api("POST", `/api/admin/reports/${rep.body.id}/status`, { token: admin, body: { status: "resolved" } })).status === 200, "the admin resolves it");
  const reg3 = (await api("GET", "/api/admin/satellites", { token: admin })).body.satellites.find((s) => s.id === oldDaemon.body.satelliteId);
  ok(reg3?.openReports === 0, "…and the count drops to zero");
  // A plain member's report of a hub message also DMs the admin.
  const chans = (await api("GET", "/api/channels", { token: withTok })).body.channels;
  const gen = chans.find((c) => c.name === "general") ?? chans[0];
  const posted = await api("POST", `/api/channels/${gen.id}/messages`, { token: noTok, body: { body: "buy my totally legal pills" } });
  const rep2 = await api("POST", "/api/report", { token: withTok, body: { kind: "message", refId: posted.body.message?.id ?? posted.body.id, reason: "spam" } });
  ok(rep2.status === 200, `a hub message report is accepted (${rep2.status})`);
  await sleep(300);
  const msgs2 = (await api("GET", `/api/dm/${sterlingConvo.id}/messages`, { token: admin })).body;
  const arr2 = msgs2.messages ?? msgs2;
  ok(arr2.some((m) => m.body.includes(`REPORT #${rep2.body.id}`) && m.body.includes("#general")), "…and the admin is DMed about that one too, naming the channel");

  console.log(`\n${n - bad}/${n} passed`);
  stop();
  process.exit(bad ? 1 : 0);
};

run().catch((e) => { console.error(e); console.log(bootLog.slice(-3000)); stop(); process.exit(1); });
