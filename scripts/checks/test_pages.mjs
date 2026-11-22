// PAGES harness — the community layer above channels (migration 63).
//
// Drives a REAL server on a throwaway port against a throwaway DB, because
// the whole point of pages is who can see what, and that lives in the routes
// and the realtime fan-out rather than in any one function.
//
// What it pins down, in Josh's words:
//   · "lets call the first page Solace general and lets just wrap in
//     everything we have built so far for chat in that"
//   · "every new user/every user gets auto added to the solace general page"
//   · "only users with the moderator role can create pages" (SUPERSEDED Sep
//     2026: "only admin can create new pages on the hub server… if users want
//     their own page then they will have to self host")
//   · "only the admin the ability to delete/modify/create pages"
//   · "only moderators and admins can add users to the other pages"
//   · "a moderator/admin can designate a user within a page to manage that
//     page only"
//   · pages "can be private and open to public" — and private has to mean
//     private on the wire, not just hidden in the UI.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const PORT = 8489;
const BASE = `http://127.0.0.1:${PORT}`;
// A throwaway DATA_DIR, so the server seeds a clean DB (and its own admin).
const DATA_DIR = path.join(ROOT, "data", "pages-harness");
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

const api = async (method, url, { token, body, raw, type } = {}) => {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  if (body !== undefined) headers["content-type"] = "application/json";
  if (raw) headers["content-type"] = type ?? "application/octet-stream";
  const res = await fetch(BASE + url, {
    method,
    headers,
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json };
};

let secretSeq = 0;
const register = async (username, password) => {
  // The recovery secret is weakness-screened like a password and may not
  // contain the username — so it can't be derived from it.
  const secret = `vault marmalade lantern ${["quartz", "thistle", "harbour", "ember"][secretSeq++ % 4]} 47`;
  const r = await api("POST", "/api/register", { body: { username, password, displayName: username, secret, acceptTerms: true } });
  if (!r.body?.token) console.error("   register failed:", username, r.status, JSON.stringify(r.body));
  return r.body?.token ?? null;
};

const run = async () => {
  // Wait for boot.
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(BASE + "/health");
      if (r.ok) break;
    } catch { /* not up yet */ }
    await sleep(250);
  }

  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  ok(!!admin, "admin logged in");
  if (!admin) { console.log(bootLog.slice(-2000)); process.exit(1); }

  // ---- 1. THE MIGRATION: everything that existed is Solace General --------
  const list0 = await api("GET", "/api/pages", { token: admin });
  const general = list0.body.pages.find((p) => p.id === 1);
  ok(!!general, "Solace General exists as page 1");
  ok(general?.name === "Solace General", `it is named Solace General (${general?.name})`);
  ok(general?.isPublic === true, "the main hall is public");
  ok(general?.role === "member" || general?.role === "manager", "the admin is enrolled in it");
  const chans0 = await api("GET", "/api/channels", { token: admin });
  ok(chans0.body.channels.length > 0, "there are channels");
  ok(chans0.body.channels.every((c) => c.pageId === 1), "every pre-existing channel belongs to Solace General");

  // ---- 2. New accounts join the main hall automatically -------------------
  const alice = await register("alice_pages", "Str0ng!Passw0rd#A");
  const bob = await register("bob_pages", "Str0ng!Passw0rd#B");
  ok(!!alice && !!bob, "registered two members");
  const aPages = await api("GET", "/api/pages", { token: alice });
  ok(aPages.body.pages.some((p) => p.id === 1 && p.role), "a brand-new account is already in Solace General");

  // ---- 3. Who may create a page -------------------------------------------
  // ADMIN ONLY (Josh, Sep 2026: "only admin can create new pages on the hub
  // server… if users want their own page then they will have to self host").
  // A moderator's page reach is their page role; creation isn't part of it.
  const denied = await api("POST", "/api/pages", { token: alice, body: { name: "Alice's Club" } });
  ok(denied.status === 403, `an ordinary member cannot create a page (${denied.status})`);

  const meAlice = await api("GET", "/api/me", { token: alice });
  const aliceId = meAlice.body.user.id;
  const bobId = (await api("GET", "/api/me", { token: bob })).body.user.id;
  const promote = await api("POST", `/api/admin/users/${aliceId}/role`, { token: admin, body: { role: "moderator" } });
  ok(promote.status === 200, `admin promoted alice to moderator (${promote.status})`);
  const modDenied = await api("POST", "/api/pages", { token: alice, body: { name: "Alice's Club" } });
  ok(modDenied.status === 403, `a MODERATOR cannot create a page either (${modDenied.status})`);
  const made = await api("POST", "/api/pages", {
    token: admin,
    body: { name: "The Back Room", description: "Quiet corner", isPublic: false },
  });
  ok(made.status === 200, `the admin can create a page (${made.status})`);
  const priv = made.body?.page;
  ok(priv?.role === "manager", "its creator manages it from the start");
  ok(priv?.isPublic === false, "it was created private");
  // Hand it to alice: a moderator who MANAGES a page is the shape the rest of
  // the run exercises (channels, members, the icon).
  const handOver = await api("POST", `/api/pages/${priv.id}/members`, {
    token: admin, body: { userId: aliceId, role: "manager" },
  });
  ok(handOver.status === 200, `the admin made the moderator its manager (${handOver.status})`);

  // ---- 4. PRIVATE MEANS PRIVATE -------------------------------------------
  const bobSees = await api("GET", "/api/pages", { token: bob });
  ok(!bobSees.body.pages.some((p) => p.id === priv.id), "a private page is not even listed to outsiders");
  const bobPeek = await api("GET", `/api/pages/${priv.id}/members`, { token: bob });
  ok(bobPeek.status === 404, `and probing it 404s rather than 403s (${bobPeek.status})`);

  // A channel inside it must not appear in anyone else's channel list.
  const ch = await api("POST", "/api/channels", { token: alice, body: { name: "back-chat", pageId: priv.id } });
  ok(ch.status === 200, `the page's manager can add a channel to it (${ch.status})`);
  const chanId = ch.body?.channel?.id;
  ok(ch.body?.channel?.pageId === priv.id, "the channel belongs to the page");
  const bobChans = await api("GET", "/api/channels", { token: bob });
  ok(!bobChans.body.channels.some((c) => c.id === chanId), "an outsider's channel list omits a private page's channels");
  const bobRead = await api("GET", `/api/channels/${chanId}/messages`, { token: bob });
  ok(bobRead.status === 404, `an outsider cannot read its history (${bobRead.status})`);
  const bobPost = await api("POST", `/api/channels/${chanId}/messages`, { token: bob, body: { body: "hello?" } });
  ok(bobPost.status === 404, `nor post into it (${bobPost.status})`);

  // ---- 5. Who adds members ------------------------------------------------
  // Make bob a manager of the private page. Managers add members since the
  // roles round; promotion to manager stays with staff.
  const addBob = await api("POST", `/api/pages/${priv.id}/members`, {
    token: alice, body: { userId: bobId, role: "manager" },
  });
  ok(addBob.status === 200, `a moderator MANAGING the page can add a member (${addBob.status})`);
  const carol = await register("carol_pages", "Str0ng!Passw0rd#C");
  const carolId = (await api("GET", "/api/me", { token: carol })).body.user.id;
  const bobAdds = await api("POST", `/api/pages/${priv.id}/members`, { token: bob, body: { userId: carolId } });
  // PAGE ROLES (Sep 2026, Josh: "Manager manages everything"): a manager
  // may add members now; only PROMOTION to manager stays the staff rule.
  ok(bobAdds.status === 200, `a page MANAGER adds members since the roles round (${bobAdds.status})`);
  const bobPromotes = await api("PATCH", `/api/pages/${priv.id}/members/${carolId}`, { token: bob, body: { role: "manager" } });
  ok(bobPromotes.status === 403, `…but cannot promote to manager (${bobPromotes.status})`);
  await api("DELETE", `/api/pages/${priv.id}/members/${carolId}`, { token: admin }); // carol is an outsider again for the join checks below

  // Bob, now a member, sees it and can read it.
  const bobSees2 = await api("GET", "/api/pages", { token: bob });
  ok(bobSees2.body.pages.some((p) => p.id === priv.id), "once added, the page appears for him");
  const bobRead2 = await api("GET", `/api/channels/${chanId}/messages`, { token: bob });
  ok(bobRead2.status === 200, `and he can read it (${bobRead2.status})`);

  // ---- 6. A manager's authority stops at the page edge --------------------
  const bobRenames = await api("PATCH", `/api/pages/${priv.id}`, { token: bob, body: { name: "The Snug" } });
  ok(bobRenames.status === 200, `a manager may rename their own page (${bobRenames.status})`);
  const bobRenamesGeneral = await api("PATCH", "/api/pages/1", { token: bob, body: { name: "Hijacked" } });
  ok(bobRenamesGeneral.status === 403, `but not a page he doesn't manage (${bobRenamesGeneral.status})`);
  const afterGeneral = (await api("GET", "/api/pages", { token: admin })).body.pages.find((p) => p.id === 1);
  ok(afterGeneral.name === "Solace General", "the main hall kept its name");

  // ---- 7. Deletion is the admin's alone, and never the main hall ----------
  const bobDeletes = await api("DELETE", `/api/pages/${priv.id}`, { token: bob });
  ok(bobDeletes.status === 403, `a manager cannot delete a page (${bobDeletes.status})`);
  // MODERATOR SCOPING (Josh, Sep 2026: "admin has full control but
  // moderators only have power in the pages they are assigned to") —
  // deletion is admin-only now, even for a page the moderator manages.
  const scratch = (await api("POST", "/api/pages", { token: admin, body: { name: "Scratch", isPublic: true } })).body.page;
  const modDeletes = await api("DELETE", `/api/pages/${scratch.id}`, { token: alice });
  ok(modDeletes.status === 403, `a moderator cannot delete a page (${modDeletes.status})`);
  await api("DELETE", `/api/pages/${scratch.id}`, { token: admin });
  const killGeneral = await api("DELETE", "/api/pages/1", { token: admin });
  ok(killGeneral.status === 403, `not even an admin may delete Solace General (${killGeneral.status})`);
  ok((await api("GET", "/api/pages", { token: admin })).body.pages.some((p) => p.id === 1), "it is still there");

  // ---- 7b. A moderator's reach stops at their own pages' edges ------------
  // A hidden page alice is NOT in reads as nonexistent to her, exactly as it
  // does to any member — and she can't manage members on a page she doesn't
  // manage, even a public one.
  {
    const vault2 = (await api("POST", "/api/pages", {
      token: admin, body: { name: "Admin Cellar", joinPolicy: "invite", discoverable: false },
    })).body.page;
    ok(!(await api("GET", "/api/pages", { token: alice })).body.pages.some((p) => p.id === vault2.id),
      "a hidden page is invisible to a moderator who isn't in it");
    ok((await api("GET", `/api/pages/${vault2.id}/members`, { token: alice })).status === 404,
      "…and probing it 404s for her like anyone else");
    const commons2 = (await api("POST", "/api/pages", {
      token: admin, body: { name: "Admin Commons", joinPolicy: "open", discoverable: true },
    })).body.page;
    ok((await api("POST", `/api/pages/${commons2.id}/members`, { token: alice, body: { userId: bobId } })).status === 403,
      "a moderator cannot manage members on a page they don't manage");
    ok((await api("POST", "/api/pages/reorder", { token: alice, body: { ids: [1] } })).status === 403,
      "reordering the rail is the admin's alone");
    await api("DELETE", `/api/pages/${vault2.id}`, { token: admin });
    await api("DELETE", `/api/pages/${commons2.id}`, { token: admin });
  }

  // ---- 8. Public pages are walk-in ----------------------------------------
  const pub = (await api("POST", "/api/pages", {
    token: admin, body: { name: "The Commons", description: "Open to all", isPublic: true },
  })).body.page;
  // …managed by alice, whose manager-hood the icon step below relies on.
  await api("POST", `/api/pages/${pub.id}/members`, { token: admin, body: { userId: aliceId, role: "manager" } });
  const carolSees = await api("GET", "/api/pages", { token: carol });
  ok(carolSees.body.pages.some((p) => p.id === pub.id), "a public page is listed to everyone");
  ok(carolSees.body.pages.find((p) => p.id === pub.id).role === null, "…without making them a member");
  const join = await api("POST", `/api/pages/${pub.id}/join`, { token: carol });
  ok(join.status === 200, `anyone may walk into a public page (${join.status})`);
  const joinPrivate = await api("POST", `/api/pages/${priv.id}/join`, { token: carol });
  ok(joinPrivate.status === 404, `but a private one can't even be found to join (${joinPrivate.status})`);

  // ---- 8b. Showing yourself out -------------------------------------------
  // Josh, Aug 2026: "give users the ability to leave any page besides the
  // solace general." No permission needed — it's your own membership — but
  // the main hall holds everything chat was, so it is not leavable.
  const leave = await api("POST", `/api/pages/${pub.id}/leave`, { token: carol });
  ok(leave.status === 200, `a member can leave a page they joined (${leave.status})`);
  const afterLeave = await api("GET", "/api/pages", { token: carol });
  const pubRow = afterLeave.body.pages.find((p) => p.id === pub.id);
  ok(pubRow && pubRow.role === null, "…and is no longer a member of it");
  ok(
    afterLeave.body.pages.find((p) => p.id === 1).role !== null,
    "…while their Solace General membership is untouched",
  );
  const leaveAgain = await api("POST", `/api/pages/${pub.id}/leave`, { token: carol });
  ok(leaveAgain.status === 400, `leaving twice is refused, not a silent no-op (${leaveAgain.status})`);
  const leaveGeneral = await api("POST", `/api/pages/1/leave`, { token: carol });
  ok(leaveGeneral.status === 400, `SOLACE GENERAL cannot be left (${leaveGeneral.status})`);
  const stillGeneral = await api("GET", "/api/pages", { token: carol });
  ok(
    stillGeneral.body.pages.find((p) => p.id === 1).role !== null,
    "…and the refusal actually kept the membership",
  );
  // A private page vanishes for whoever walks out of it.
  const bobLeaves = await api("POST", `/api/pages/${priv.id}/leave`, { token: bob });
  ok(bobLeaves.status === 200, `a member can leave a PRIVATE page (${bobLeaves.status})`);
  const bobGone = await api("GET", "/api/pages", { token: bob });
  ok(
    !bobGone.body.pages.some((p) => p.id === priv.id),
    "…and it disappears from their list entirely",
  );
  const bobReads = await api("GET", `/api/pages/${priv.id}/members`, { token: bob });
  ok(bobReads.status === 404, `…and its members 404 for them afterwards (${bobReads.status})`);
  // Put bob back so the rest of the run sees the world it expects.
  await api("POST", `/api/pages/${priv.id}/members`, { token: alice, body: { userId: bobId } });

  // ---- 9. The icon ---------------------------------------------------------
  // A 1×1 PNG, typed from its magic bytes like every other upload here.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const up = await api("POST", `/api/pages/${pub.id}/icon`, { token: alice, raw: png, type: "image/png" });
  ok(up.status === 200 && !!up.body.icon, `a manager can set the page icon (${up.status})`);
  const served = await fetch(`${BASE}/pageicons/${up.body.icon}`);
  ok(served.ok && (served.headers.get("content-type") ?? "").includes("png"), "the icon is served back");
  const junk = await api("POST", `/api/pages/${pub.id}/icon`, {
    token: alice, raw: Buffer.from("<svg/>"), type: "image/svg+xml",
  });
  ok(junk.status === 415, `a non-image is refused on its BYTES, not its header (${junk.status})`);
  const carolIcon = await api("POST", `/api/pages/${pub.id}/icon`, { token: carol, raw: png, type: "image/png" });
  ok(carolIcon.status === 403, `a plain member cannot change the icon (${carolIcon.status})`);

  // ---- 10. Deleting a page takes its channels with it ---------------------
  const doomed = (await api("POST", "/api/pages", { token: admin, body: { name: "Temp", isPublic: true } })).body.page;
  const tempCh = (await api("POST", "/api/channels", {
    token: admin, body: { name: "temp-chat", pageId: doomed.id },
  })).body.channel;
  const del = await api("DELETE", `/api/pages/${doomed.id}`, { token: admin });
  ok(del.status === 200 && del.body.channels === 1, `an admin deletes a page and its channels (${del.status})`);
  const gone = await api("GET", `/api/channels/${tempCh.id}`, { token: admin });
  ok(gone.status === 404, "its channel is gone too");

  // ---- 10b. THE LEAK SWEEP ------------------------------------------------
  // Pages broke a load-bearing old assumption — "channel history is readable
  // by everyone" — and a private page is only as private as the LAST surface
  // that still believes it. Each of these leaked before the review.
  {
    const secret = (await api("POST", "/api/pages", {
      token: admin, body: { name: "Vault", description: "hush", isPublic: false },
    })).body.page;
    const sch = (await api("POST", "/api/channels", {
      token: admin, body: { name: "hush-hush", pageId: secret.id },
    })).body.channel;
    await api("POST", `/api/channels/${sch.id}/messages`, {
      token: admin, body: { body: "pineapple codeword surprise" },
    });
    // carol is not a member and must not reach it by ANY route.
    const hits = await api("GET", "/api/search?q=pineapple", { token: carol });
    ok(!(hits.body.channels ?? []).length, `search does not return a private page's messages (${(hits.body.channels ?? []).length} hits)`);
    const adminHits = await api("GET", "/api/search?q=pineapple", { token: admin });
    ok((adminHits.body.channels ?? []).length > 0, "…but a member still finds them");

    const meta = await api("GET", `/api/channels/${sch.id}`, { token: carol });
    ok(meta.status === 404, `a private channel's name/topic is not served by id (${meta.status})`);

    const single = await api("GET", `/api/channels`, { token: carol });
    ok(!Object.keys(single.body.unread ?? {}).includes(String(sch.id)),
      "unread counts don't cover channels you can't open");

    const msgs = (await api("GET", `/api/channels/${sch.id}/messages`, { token: admin })).body.messages;
    const mid = msgs[msgs.length - 1].id;
    const react = await api("POST", `/api/messages/${mid}/react`, { token: carol, body: { code: "grinning" } });
    ok(react.status === 404, `an outsider cannot react to a private message (${react.status})`);

    // A voice room inside a private page is as private as the page.
    const vch = (await api("POST", "/api/channels", {
      token: admin, body: { name: "hush-voice", kind: "voice", pageId: secret.id },
    })).body.channel;
    const tok = await api("POST", `/api/voice/${vch.id}/token`, { token: carol, body: {} });
    ok(tok.status === 404 || tok.status === 503,
      `an outsider cannot mint a voice token for a private room (${tok.status})`);

    await api("DELETE", `/api/pages/${secret.id}`, { token: admin });
  }

  // ---- 11. The main hall still works exactly as before --------------------
  const generalChan = chans0.body.channels.find((c) => c.pageId === 1 && c.kind === "text");
  const post = await api("POST", `/api/channels/${generalChan.id}/messages`, {
    token: carol, body: { body: "still works" },
  });
  ok(post.status === 200, `an ordinary member can still post in Solace General (${post.status})`);

  // ---- 12. PRIVACY MODES (migration 77): joinPolicy × discoverable --------
  // Josh's three modes: open+discoverable, request+discoverable ("knock"),
  // invite+hidden — plus invite+discoverable for free.
  {
    // A REQUEST page: everyone sees the CARD, nobody sees inside.
    const knockP = (await api("POST", "/api/pages", {
      token: admin, body: { name: "The Parlor", joinPolicy: "request", discoverable: true },
    })).body.page;
    ok(knockP.joinPolicy === "request" && knockP.discoverable === true && knockP.isPublic === false,
      "a request page is discoverable but content-private (isPublic false)");
    const pch = (await api("POST", "/api/channels", {
      token: admin, body: { name: "parlor-talk", pageId: knockP.id },
    })).body.channel;

    const carolList = (await api("GET", "/api/pages", { token: carol })).body.pages;
    const card = carolList.find((p) => p.id === knockP.id);
    ok(!!card && card.role === null, "a non-member sees the request page's CARD in the picker");
    const carolChans = (await api("GET", "/api/channels", { token: carol })).body.channels;
    ok(!carolChans.some((c) => c.pageId === knockP.id), "…but none of its channels");
    const peek = await api("GET", `/api/channels/${pch.id}/messages`, { token: carol });
    ok(peek.status === 404, `…and its history 404s (${peek.status})`);

    // The knock: idempotent, visible to the answerers, withdrawable.
    const knock1 = await api("POST", `/api/pages/${knockP.id}/join`, { token: carol });
    ok(knock1.status === 200 && knock1.body.requested === true, "joining a request page files a knock");
    await api("POST", `/api/pages/${knockP.id}/join`, { token: carol }); // again — must not double
    const reqs1 = (await api("GET", `/api/pages/${knockP.id}/requests`, { token: admin })).body.requests;
    ok(reqs1.length === 1 && reqs1[0].user.username === "carol_pages", "the knock is listed once (idempotent)");
    ok((await api("GET", `/api/pages/${knockP.id}/requests`, { token: carol })).status === 403,
      "a non-manager cannot read the knock list");
    await api("DELETE", `/api/pages/${knockP.id}/join`, { token: carol });
    ok((await api("GET", `/api/pages/${knockP.id}/requests`, { token: admin })).body.requests.length === 0,
      "a withdrawn knock is gone");

    // Deny leaves them out; approve lets them in.
    const carolId = reqs1[0].user.id;
    await api("POST", `/api/pages/${knockP.id}/join`, { token: carol });
    const denial = await api("POST", `/api/pages/${knockP.id}/requests/${carolId}`, { token: admin, body: { approve: false } });
    ok(denial.status === 200 && denial.body.approved === false, "a knock can be denied");
    ok((await api("GET", "/api/channels", { token: carol })).body.channels
      .every((c) => c.pageId !== knockP.id), "…and the denied stay outside");
    await api("POST", `/api/pages/${knockP.id}/join`, { token: carol });
    const appr = await api("POST", `/api/pages/${knockP.id}/requests/${carolId}`, { token: admin, body: { approve: true } });
    ok(appr.status === 200 && appr.body.approved === true, "a knock can be approved");
    const inNow = (await api("GET", "/api/channels", { token: carol })).body.channels;
    ok(inNow.some((c) => c.pageId === knockP.id), "…and the approved walk in (channels visible)");

    // INVITE + DISCOVERABLE: the card shows, the door refuses.
    const velvet = (await api("POST", "/api/pages", {
      token: admin, body: { name: "Velvet Rope", joinPolicy: "invite", discoverable: true },
    })).body.page;
    const bobSees = (await api("GET", "/api/pages", { token: bob })).body.pages;
    ok(bobSees.some((p) => p.id === velvet.id), "an invite+discoverable page is listed as a card");
    ok((await api("POST", `/api/pages/${velvet.id}/join`, { token: bob })).status === 403,
      "…but joining it is refused (invite_only)");

    // INVITE + HIDDEN: the classic private page — absent entirely.
    const cellar = (await api("POST", "/api/pages", {
      token: admin, body: { name: "The Cellar", joinPolicy: "invite", discoverable: false },
    })).body.page;
    ok(!(await api("GET", "/api/pages", { token: bob })).body.pages.some((p) => p.id === cellar.id),
      "an invite+hidden page is invisible to non-members");

    // Switching a page to OPEN forces discoverable and clears the knocks.
    await api("POST", `/api/pages/${cellar.id}/join`, { token: bob }); // 404s (hidden) — harmless
    const opened = (await api("PATCH", `/api/pages/${knockP.id}`, { token: admin, body: { joinPolicy: "open", discoverable: false } })).body.page;
    ok(opened.joinPolicy === "open" && opened.isPublic === true && opened.discoverable === true,
      "switching to open forces discoverable + public content");

    // The general page's policy is immovable.
    const genTry = (await api("PATCH", "/api/pages/1", { token: admin, body: { joinPolicy: "invite" } })).body.page;
    ok(genTry.joinPolicy === "open" && genTry.isPublic === true, "Solace General stays open whatever is asked");

    await api("DELETE", `/api/pages/${knockP.id}`, { token: admin });
    await api("DELETE", `/api/pages/${velvet.id}`, { token: admin });
    await api("DELETE", `/api/pages/${cellar.id}`, { token: admin });
  }

  // ---- 13. A deleted account leaves every page (migration 78) --------------
  {
    console.log("\n-- deleted accounts leave pages --");
    const ghost = await register("ghost_pages", "Str0ng!Passw0rd#G");
    const ghostId = (await api("GET", "/api/me", { token: ghost })).body.user.id;
    const haunt = (await api("POST", "/api/pages", {
      token: admin, body: { name: "Haunt", joinPolicy: "request", discoverable: true },
    })).body.page;
    await api("POST", `/api/pages/${haunt.id}/members`, { token: admin, body: { userId: ghostId } });
    const before = (await api("GET", `/api/pages/${haunt.id}/members`, { token: admin })).body.members;
    ok(before.some((m) => m.user.id === ghostId), "the doomed account is a page member first");

    // File a knock elsewhere too — the scrub must take the pending request with it.
    const knock2 = (await api("POST", "/api/pages", {
      token: admin, body: { name: "Knock Twice", joinPolicy: "request", discoverable: true },
    })).body.page;
    await api("POST", `/api/pages/${knock2.id}/join`, { token: ghost });

    const del = await api("POST", `/api/admin/users/${ghostId}/delete`, { token: admin });
    ok(del.status === 200, "admin delete (scrub) succeeds");
    const after = (await api("GET", `/api/pages/${haunt.id}/members`, { token: admin })).body.members;
    ok(!after.some((m) => m.user.id === ghostId), "the scrubbed account is GONE from the members list");
    const generalMembers = (await api("GET", "/api/pages/1/members", { token: admin })).body.members;
    ok(!generalMembers.some((m) => m.user.id === ghostId), "…and gone from Solace General too");
    const hauntCard = (await api("GET", "/api/pages", { token: admin })).body.pages.find((p) => p.id === haunt.id);
    ok(hauntCard.members === after.length, "the picker card's member count agrees (no ghost padding)");
    ok((await api("GET", `/api/pages/${knock2.id}/requests`, { token: admin })).body.requests.length === 0,
      "the scrubbed account's pending knock is gone with it");
    // …and the ghost can't be re-added: that would recreate the exact row
    // migration 78 exists to sweep.
    const readd = await api("POST", `/api/pages/${haunt.id}/members`, { token: admin, body: { userId: ghostId } });
    ok(readd.status === 404, `a scrubbed account cannot be re-added to a page (${readd.status})`);

    await api("DELETE", `/api/pages/${haunt.id}`, { token: admin });
    await api("DELETE", `/api/pages/${knock2.id}`, { token: admin });
  }

  // ---- 14. The Sep 2026 review batch: probes, badges, the wire -------------
  {
    console.log("\n-- review batch: probes, badges, order, the wire --");
    const WebSocketC = require("ws");
    const wsOpen = (token) => new Promise((resolve, reject) => {
      const sock = new WebSocketC(`ws://127.0.0.1:${PORT}/ws?token=${token}`);
      const frames = [];
      sock.on("message", (d) => { try { frames.push(JSON.parse(d.toString())); } catch {} });
      sock.on("open", () => resolve({ sock, frames }));
      sock.on("error", reject);
    });
    const waitFrame = async (frames, pred, ms = 4000) => {
      const t0 = Date.now();
      for (;;) {
        const f = frames.find(pred);
        if (f) return f;
        if (Date.now() - t0 > ms) return null;
        await sleep(50);
      }
    };
    const carol = (await api("POST", "/api/login", {
      body: { username: "carol_pages", password: "Str0ng!Passw0rd#C" },
    })).body.token;

    // C1 — the delete route is no longer a hidden-page existence probe.
    const attic = (await api("POST", "/api/pages", {
      token: admin, body: { name: "Attic", joinPolicy: "invite", discoverable: false },
    })).body.page;
    const probe = await api("DELETE", `/api/pages/${attic.id}`, { token: carol });
    ok(probe.status === 404, `a hidden page's DELETE answers 404, not 403 (${probe.status})`);
    ok((await api("DELETE", "/api/pages/99999", { token: carol })).status === 404,
      "…indistinguishable from a missing id");

    // The landing channel, settable from the page's own settings.
    const wicket = (await api("POST", "/api/pages", {
      token: admin, body: { name: "Wicket", joinPolicy: "request", discoverable: true },
    })).body.page;
    const wch = (await api("POST", "/api/channels", {
      token: admin, body: { name: "wicket-hall", pageId: wicket.id },
    })).body.channel;
    const patched = (await api("PATCH", `/api/pages/${wicket.id}`, {
      token: admin, body: { defaultChannelId: wch.id },
    })).body.page;
    ok(patched.defaultChannelId === wch.id, "the landing channel is settable from the page's own settings");
    ok((await api("PATCH", `/api/pages/${wicket.id}`, {
      token: admin, body: { defaultChannelId: chans0.body.channels[0].id },
    })).status === 400, "another page's channel is refused as a landing spot");

    // C9 — a non-member's card of a non-public page hides the ids inside it.
    const carolCard = (await api("GET", "/api/pages", { token: carol })).body.pages.find((p) => p.id === wicket.id);
    ok(!!carolCard && carolCard.defaultChannelId === null && carolCard.createdBy === 0,
      "a non-member's card carries no landing-channel or creator id");
    const adminCard = (await api("GET", "/api/pages", { token: admin })).body.pages.find((p) => p.id === wicket.id);
    ok(adminCard?.defaultChannelId === wch.id, "…while an insider's card keeps them");

    const mem = (await api("GET", `/api/pages/${wicket.id}/members`, { token: admin })).body.members;
    ok(mem.length > 0 && mem.every((m) => typeof m.since === "number" && m.since > 0),
      "member rows carry a member-since stamp");

    // THE WIRE. A knock lights the managers' badge; a repeat knock is silent.
    const [aws, cws, bws] = await Promise.all([wsOpen(admin), wsOpen(carol), wsOpen(bob)]);
    await sleep(400); // let the ready frames land
    aws.frames.length = 0; cws.frames.length = 0;
    await api("POST", `/api/pages/${wicket.id}/join`, { token: carol });
    const knockFrame = await waitFrame(aws.frames, (f) => f.type === "page.change" && f.page?.id === wicket.id);
    ok(knockFrame?.page?.pending === 1,
      `the knock frame carries the managers' badge (pending=${knockFrame?.page?.pending})`);
    const mineFrame = await waitFrame(cws.frames, (f) => f.type === "page.change" && f.page?.id === wicket.id);
    ok(mineFrame?.page?.requested === true, "the requester's own frame says requested");
    const beforeRepeat = aws.frames.filter((f) => f.type === "page.change" && f.page?.id === wicket.id).length;
    await api("POST", `/api/pages/${wicket.id}/join`, { token: carol });
    await sleep(600);
    const afterRepeat = aws.frames.filter((f) => f.type === "page.change" && f.page?.id === wicket.id).length;
    ok(afterRepeat === beforeRepeat, "a repeat knock re-lights nobody's badge (no new frame)");

    // C2 — flipping away from "request" clears the knocks and tells the knocker.
    cws.frames.length = 0;
    await api("PATCH", `/api/pages/${wicket.id}`, { token: admin, body: { joinPolicy: "invite" } });
    const clearedFrame = await waitFrame(cws.frames, (f) => f.type === "page.change" && f.page?.id === wicket.id);
    ok(clearedFrame?.page?.requested === false, "the requester is told their knock is gone");
    await api("PATCH", `/api/pages/${wicket.id}`, { token: admin, body: { joinPolicy: "request" } });
    ok((await api("GET", `/api/pages/${wicket.id}/requests`, { token: admin })).body.requests.length === 0,
      "a request→invite flip cleared the knock for good (no resurrection)");

    // Re-file a knock, then hide the page underneath it.
    await api("POST", `/api/pages/${wicket.id}/join`, { token: carol });

    // C3 — a page turning hidden still reaches the outsiders holding its card.
    bws.frames.length = 0;
    await api("PATCH", `/api/pages/${wicket.id}`, { token: admin, body: { discoverable: false } });
    const dropFrame = await waitFrame(bws.frames, (f) => f.type === "page.change" && f.page?.id === wicket.id);
    ok(!!dropFrame && dropFrame.page.discoverable === false && dropFrame.page.role === null,
      "a page turning hidden tells the outsiders to drop its card");

    // A knock filed BEFORE the page went hidden can still be withdrawn — the
    // knocker knew it existed; a knock-less outsider still reads no page.
    const wd = await api("DELETE", `/api/pages/${wicket.id}/join`, { token: carol });
    ok(wd.status === 200, `a knock outlives the hiding and can be withdrawn (${wd.status})`);
    ok((await api("GET", `/api/pages/${wicket.id}/requests`, { token: admin })).body.requests.length === 0,
      "…and it is gone");
    ok((await api("DELETE", `/api/pages/${wicket.id}/join`, { token: bob })).status === 404,
      "…while a knock-less outsider still reads no page at all");

    // Page reordering: staff only, whole list required, and the order lands.
    const idsNow = (await api("GET", "/api/pages", { token: admin })).body.pages.map((p) => p.id);
    const swapped = [...idsNow];
    [swapped[swapped.length - 2], swapped[swapped.length - 1]] =
      [swapped[swapped.length - 1], swapped[swapped.length - 2]];
    ok((await api("POST", "/api/pages/reorder", { token: bob, body: { ids: swapped } })).status === 403,
      "a member cannot reorder pages");
    ok((await api("POST", "/api/pages/reorder", { token: admin, body: { ids: swapped.slice(1) } })).status === 400,
      "an incomplete order list is refused");
    await api("POST", "/api/pages/reorder", { token: admin, body: { ids: swapped } });
    const orderAfter = (await api("GET", "/api/pages", { token: admin })).body.pages.map((p) => p.id);
    ok(JSON.stringify(orderAfter) === JSON.stringify(swapped), "the new order lands and lists");

    // Deleting a page whose card was PUBLIC knowledge tells everyone — an
    // outsider's picker must not keep a card whose page no longer exists.
    const bill = (await api("POST", "/api/pages", {
      token: admin, body: { name: "Billboard", joinPolicy: "invite", discoverable: true },
    })).body.page;
    await sleep(300);
    bws.frames.length = 0;
    await api("DELETE", `/api/pages/${bill.id}`, { token: admin });
    const goneFrame = await waitFrame(bws.frames, (f) => f.type === "page.gone" && f.pageId === bill.id);
    ok(!!goneFrame, "deleting a discoverable page tells outsiders to drop its card");

    aws.sock.close(); cws.sock.close(); bws.sock.close();
    await api("DELETE", `/api/pages/${wicket.id}`, { token: admin });
    await api("DELETE", `/api/pages/${attic.id}`, { token: admin });
  }

  console.log(`\n${n - bad}/${n} passed`);
  stop();
  await sleep(300);
  process.exit(bad ? 1 : 0);
};

run().catch(async (e) => {
  console.error(e);
  console.log(bootLog.slice(-2000));
  stop();
  process.exit(1);
});
