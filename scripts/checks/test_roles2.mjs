// PAGE ROLES (Josh, Sep 2026, migration 90) over a real server — the
// permission matrix, the hierarchy, the channel gates on HTTP + the wire,
// @everyone, and the cleanups.
//
// Run: node scripts/checks/test_roles2.mjs        (needs `npm run build`)

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, mkdirSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const WebSocket = require("ws");
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));
const { DEFAULT_EVERYONE_PERMS, PERMS } = require(path.join(ROOT, "dist", "roles.js"));

const PORT = 8502;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(ROOT, "data", "roles2-harness");
const DB = path.join(DATA, "solace.db");

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });

const server = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_PASSWORD: "Adm1n!Passw0rd#Q",
    ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
  },
  stdio: ["ignore", "ignore", "pipe"],
});
server.stderr.on("data", (d) => process.env.VERBOSE && console.error(String(d)));
const stop = () => { try { server.kill("SIGINT"); } catch { /* gone */ } };

const api = async (method, url, { token, body, headers = {} } = {}) => {
  const h = { ...headers };
  if (token) h.authorization = "Bearer " + token;
  if (body !== undefined) h["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
};
let regSeq = 0;
const register = async (username) => {
  regSeq++;
  const r = await api("POST", "/api/register", {
    body: { username, password: "Str0ng!Passw0rd#Z", displayName: username, secret: `vault marmalade lantern quartz ${regSeq} 47`, acceptTerms: true },
    headers: { "x-forwarded-for": `10.80.0.${10 + regSeq}` },
  });
  return { token: r.body?.token, id: r.body?.user?.id };
};
const socket = (token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(token)}`);
    const frames = [];
    const c = { ws, frames, of: (t) => frames.filter((f) => f.type === t), send: (m) => ws.send(JSON.stringify(m)) };
    ws.on("message", (m) => { try { frames.push(JSON.parse(String(m))); } catch { /* junk */ } });
    ws.on("open", () => resolve(c));
    ws.on("error", reject);
  });

const run = async () => {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch { /* booting */ }
    await sleep(250);
  }
  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: "Adm1n!Passw0rd#Q" } })).body?.token;
  const A = await register("alice");   // will hold the senior role
  const B = await register("bob");     // will hold the junior role
  const D = await register("dave");    // @everyone only
  const E = await register("erin");    // outsider, added later
  ok(!!admin && A.token && B.token && D.token && E.token, "admin + four members");
  const st = new Store(DB);

  // ---- the migration's baseline ----
  console.log("\n— @everyone —");
  const gen = (await api("GET", "/api/pages/1/roles", { token: D.token })).body;
  ok(gen.roles.length === 1 && gen.roles[0].isEveryone && gen.roles[0].name === "everyone", "Solace General has its @everyone from the migration");
  ok(JSON.stringify(gen.roles[0].perms) === JSON.stringify(DEFAULT_EVERYONE_PERMS) && DEFAULT_EVERYONE_PERMS.includes("post") && !DEFAULT_EVERYONE_PERMS.includes("manage_roles"),
    "…carrying exactly what members could already do");
  ok(JSON.stringify(gen.mine.slice().sort()) === JSON.stringify(DEFAULT_EVERYONE_PERMS.slice().sort()), "a plain member's effective set IS the baseline");
  ok(PERMS.length === 8, "eight permissions in the vocabulary");

  // ---- a page to play in ----
  const P = (await api("POST", "/api/pages", { token: admin, body: { name: "Guild Hall", joinPolicy: "open" } })).body.page;
  for (const u of [A, B, D]) await api("POST", `/api/pages/${P.id}/join`, { token: u.token });
  const C = (await api("POST", "/api/channels", { token: admin, body: { name: "war-room", pageId: P.id } })).body.channel;
  const lobby = (await api("POST", "/api/channels", { token: admin, body: { name: "lobby", pageId: P.id } })).body.channel;
  ok(P?.id > 1 && C?.id && lobby?.id, "a page with two channels, three members inside");
  const fresh = (await api("GET", `/api/pages/${P.id}/roles`, { token: admin })).body;
  ok(fresh.roles.some((r) => r.isEveryone) && fresh.mine === "all", "a new page is born with @everyone; the admin's standing is 'all'");

  // ---- creating roles: validation + who may ----
  console.log("\n— creating roles —");
  const bad1 = await api("POST", `/api/pages/${P.id}/roles`, { token: admin, body: { name: "everyone", perms: [] } });
  const bad2 = await api("POST", `/api/pages/${P.id}/roles`, { token: admin, body: { name: "x", color: "red", perms: [] } });
  const bad3 = await api("POST", `/api/pages/${P.id}/roles`, { token: admin, body: { name: "x", perms: ["fly"] } });
  ok(bad1.status === 400 && bad2.status === 400 && bad3.status === 400, "a reserved name, a bad colour and an unknown permission are refused");
  const memberTry = await api("POST", `/api/pages/${P.id}/roles`, { token: B.token, body: { name: "Coup", perms: ["manage_roles"] } });
  ok(memberTry.status === 403, "a plain member can't create roles");
  const officers = (await api("POST", `/api/pages/${P.id}/roles`, { token: admin, body: { name: "Officers", color: "#FF3355", perms: ["post", "attach", "gif", "manage_channels", "manage_roles", "mention_everyone"] } })).body.role;
  ok(officers?.id && officers.color === "#ff3355" && officers.position === 1, "the admin creates Officers (colour lowercased, position 1)");
  const assign = await api("PATCH", `/api/pages/${P.id}/members/${A.id}/roles`, { token: admin, body: { roleIds: [officers.id] } });
  ok(assign.status === 200, "…and hands it to alice");
  const aliceView = (await api("GET", `/api/pages/${P.id}/roles`, { token: A.token })).body;
  ok(Array.isArray(aliceView.mine) && aliceView.mine.includes("manage_roles") && aliceView.mine.includes("create_channels") && aliceView.top === 1,
    "alice's effective set is @everyone ∪ Officers, top 1");

  // ---- the hierarchy binds a role-manager ----
  console.log("\n— the hierarchy —");
  const escalate = await api("POST", `/api/pages/${P.id}/roles`, { token: A.token, body: { name: "Kings", perms: ["manage_members"] } });
  ok(escalate.status === 403 && escalate.body.error === "cannot_grant", "alice can't grant manage_members — she doesn't hold it");
  const scouts = (await api("POST", `/api/pages/${P.id}/roles`, { token: A.token, body: { name: "Scouts", color: "#22aa88", perms: ["post", "attach"] } })).body.role;
  ok(scouts?.id && scouts.position === 2, "alice creates Scouts with what she holds (position 2 — newest on top)");
  // Newest sits above Officers now; alice (top 1) can't touch it — reorder it below.
  const touchAbove = await api("PATCH", `/api/pages/${P.id}/roles/${scouts.id}`, { token: A.token, body: { name: "Scouts II" } });
  ok(touchAbove.status === 403, "…but a role above her own top is out of reach, even one she made");
  const reorderByAlice = await api("POST", `/api/pages/${P.id}/roles/reorder`, { token: A.token, body: { ids: [officers.id, scouts.id] } });
  ok(reorderByAlice.status === 403, "reordering is the manager's/admin's alone");
  const reorder = await api("POST", `/api/pages/${P.id}/roles/reorder`, { token: admin, body: { ids: [officers.id, scouts.id] } });
  const afterOrder = (await api("GET", `/api/pages/${P.id}/roles`, { token: admin })).body.roles;
  ok(reorder.status === 200 && afterOrder[0].id === officers.id && afterOrder[1].id === scouts.id && afterOrder[0].position > afterOrder[1].position,
    "the admin puts Officers above Scouts");
  const editBelow = await api("PATCH", `/api/pages/${P.id}/roles/${scouts.id}`, { token: A.token, body: { name: "Rangers", color: null } });
  ok(editBelow.status === 200 && editBelow.body.role.name === "Rangers" && editBelow.body.role.color === null, "now alice may edit Scouts → Rangers");
  const selfEdit = await api("PATCH", `/api/pages/${P.id}/roles/${officers.id}`, { token: A.token, body: { perms: ["post"] } });
  ok(selfEdit.status === 403, "she can't edit Officers (not below her)");
  const giveUp = await api("PATCH", `/api/pages/${P.id}/members/${D.id}/roles`, { token: A.token, body: { roleIds: [officers.id] } });
  ok(giveUp.status === 403, "nor hand Officers to dave");
  const giveDown = await api("PATCH", `/api/pages/${P.id}/members/${B.id}/roles`, { token: A.token, body: { roleIds: [scouts.id] } });
  ok(giveDown.status === 200, "…but Rangers to bob, yes");
  const everyoneRename = await api("PATCH", `/api/pages/${P.id}/roles/${fresh.roles.find((r) => r.isEveryone).id}`, { token: admin, body: { name: "all" } });
  ok(everyoneRename.status === 400 && everyoneRename.body.error === "everyone_fixed", "@everyone can't be renamed");
  const everyoneDel = await api("DELETE", `/api/pages/${P.id}/roles/${fresh.roles.find((r) => r.isEveryone).id}`, { token: admin });
  ok(everyoneDel.status === 400, "…or deleted");

  // ---- the baseline turned down ----
  console.log("\n— the baseline —");
  const evId = fresh.roles.find((r) => r.isEveryone).id;
  const quiet = await api("PATCH", `/api/pages/${P.id}/roles/${evId}`, { token: admin, body: { perms: ["attach"] } });
  ok(quiet.status === 200, "the admin strips post + create_channels from @everyone");
  const davePost = await api("POST", `/api/channels/${lobby.id}/messages`, { token: D.token, body: { body: "hello?" } });
  const bobPost = await api("POST", `/api/channels/${lobby.id}/messages`, { token: B.token, body: { body: "ranger here" } });
  ok(davePost.status === 403 && davePost.body.error === "locked" && bobPost.status === 200, "dave (baseline only) can't post; bob (Rangers) can");
  const daveCreate = await api("POST", "/api/channels", { token: D.token, body: { name: "daves-room", pageId: P.id } });
  const aliceCreate = await api("POST", "/api/channels", { token: A.token, body: { name: "alices-room", pageId: P.id } });
  ok(daveCreate.status === 403 && aliceCreate.status === 403, "nobody without create_channels may add a room (Officers lacks it too)");
  const adminCreate = await api("POST", "/api/channels", { token: admin, body: { name: "admins-room", pageId: P.id } });
  ok(adminCreate.status === 200, "…the admin always can");
  const daveVoice = await api("POST", `/api/voice/${lobby.id}/token`, { token: D.token });
  ok(daveVoice.status === 404 || daveVoice.status === 403 || daveVoice.status === 503, "the voice gate rides the same rule (dave refused)");
  const bobManage = await api("PATCH", `/api/channels/${lobby.id}`, { token: B.token, body: { topic: "mine now" } });
  const aliceManage = await api("PATCH", `/api/channels/${lobby.id}`, { token: A.token, body: { topic: "officers' lobby" } });
  ok(bobManage.status === 403 && aliceManage.status === 200, "manage_channels: alice may retopic the lobby, bob may not");

  // ---- channel gates ----
  console.log("\n— channel gates —");
  const wsB = await socket(B.token);
  const wsD = await socket(D.token);
  await sleep(200);
  const gate = await api("PATCH", `/api/channels/${C.id}/roles`, { token: A.token, body: { view: [scouts.id], post: [] } });
  ok(gate.status === 200 && gate.body.view.length === 1, "alice gates war-room to Rangers");
  const listB = (await api("GET", "/api/channels", { token: B.token })).body;
  const listD = (await api("GET", "/api/channels", { token: D.token })).body;
  ok(listB.channels.some((c) => c.id === C.id) && listB.channels.find((c) => c.id === C.id).viewRoles[0] === scouts.id, "bob lists war-room (with its view roles)");
  ok(!listD.channels.some((c) => c.id === C.id) && listD.unread[C.id] === undefined, "dave doesn't — not in the list, not in the unread map");
  const histD = await api("GET", `/api/channels/${C.id}/messages`, { token: D.token });
  ok(histD.status === 404, "…and its history 404s for him");
  const secret = await api("POST", `/api/channels/${C.id}/messages`, { token: B.token, body: { body: "the zebra plan" } });
  ok(secret.status === 200, "bob posts inside");
  await sleep(300);
  ok(wsB.of("message").some((f) => f.message.id === secret.body.message.id), "bob's socket hears it");
  ok(!wsD.of("message").some((f) => f.message.id === secret.body.message.id), "dave's socket never does");
  const searchD = (await api("GET", "/api/search?q=zebra", { token: D.token })).body;
  const searchB = (await api("GET", "/api/search?q=zebra", { token: B.token })).body;
  ok(!(searchD.channels ?? []).some((m) => m.channelId === C.id) && (searchB.channels ?? []).some((m) => m.channelId === C.id), "search keeps the gated words from dave and shows them to bob");
  // A SUB-CHANNEL inherits its parent's view gate (Oct 2026 review): its
  // messages used to stream to the whole page under a gated parent.
  {
    const sub = (await api("POST", "/api/channels", { token: admin, body: { name: "war-room-annex", parentId: C.id, pageId: P.id } })).body.channel;
    const subMsg = await api("POST", `/api/channels/${sub.id}/messages`, { token: B.token, body: { body: "the okapi plan" } });
    await sleep(300);
    ok(subMsg.status === 200 && wsB.of("message").some((f) => f.message.id === subMsg.body.message.id), "bob posts in the gated room's sub-channel and hears it");
    ok(!wsD.of("message").some((f) => f.message.id === subMsg.body.message.id), "…dave's socket never does");
    ok((await api("GET", `/api/channels/${sub.id}/messages`, { token: D.token })).status === 404 &&
      !(await api("GET", "/api/channels", { token: D.token })).body.channels.some((c) => c.id === sub.id),
      "…and for dave the sub-channel doesn't exist: history 404, not in his list");
  }
  // A gated channel's EDITS reach only who may see it (Oct 2026 review): a
  // retopic used to go to the whole page, name, topic and allow-list included.
  wsB.frames.length = 0; wsD.frames.length = 0;
  await api("PATCH", `/api/channels/${C.id}`, { token: admin, body: { topic: "the zebra room" } });
  await sleep(300);
  ok(wsB.of("channel.update").some((f) => f.channel.id === C.id && f.channel.topic === "the zebra room"), "a gated channel's retopic reaches bob");
  ok(!wsD.of("channel.update").some((f) => f.channel?.id === C.id) && !JSON.stringify(wsD.frames).includes("zebra room"),
    "…and never dave's socket — not the frame, not the words");
  ok(wsD.of("channel.delete").some((f) => f.channelId === C.id), "…who gets only the bare 'drop it' frame");
  // A stream in a gated VOICE room (Oct 2026 review): stream.viewers was a
  // blanket broadcast, and stream.watch checked nothing about the watcher.
  {
    const vr = await api("POST", "/api/channels", { token: admin, body: { name: "ranger-voice", kind: "voice", pageId: P.id } });
    const V = vr.body.channel;
    await api("PATCH", `/api/channels/${V.id}/roles`, { token: admin, body: { view: [scouts.id], post: [] } });
    wsB.send({ type: "voice.join", channelId: V.id });
    await sleep(200);
    wsB.send({ type: "voice.media", cam: false, screen: true });
    await sleep(200);
    wsB.frames.length = 0; wsD.frames.length = 0;
    wsD.send({ type: "stream.watch", streamerId: B.id, watching: true });
    await sleep(300);
    ok(vr.status === 200 && !wsB.of("stream.viewers").some((f) => (f.viewers ?? []).includes(D.id)),
      "an outsider can't join a gated room's stream audience");
    const self = await socket(admin);
    const adminId = (await api("GET", "/api/me", { token: admin })).body.user.id;
    self.send({ type: "stream.watch", streamerId: B.id, watching: true });
    await sleep(300);
    ok(wsB.of("stream.viewers").some((f) => (f.viewers ?? []).includes(adminId)), "…while somebody who may enter the room can, and the streamer is told");
    ok(!wsD.of("stream.viewers").length, "…and none of it ever reaches the outsider's socket");
    wsB.send({ type: "voice.leave" });
    self.ws.close();
  }
  // the gate widened to nobody → dave sees it again
  await api("PATCH", `/api/channels/${C.id}/roles`, { token: admin, body: { view: [], post: [] } });
  await sleep(200);
  ok((await api("GET", "/api/channels", { token: D.token })).body.channels.some((c) => c.id === C.id), "clearing the view roles shows it to dave again");
  ok(wsD.of("channel.update").some((f) => f.channel.id === C.id && f.channel.viewRoles.length === 0), "…and the channel.update reached his socket");

  // lock + post roles + the allow-list override
  const lock = await api("PATCH", `/api/channels/${C.id}`, { token: admin, body: { locked: true } });
  await api("PATCH", `/api/channels/${C.id}/roles`, { token: admin, body: { view: [], post: [scouts.id] } });
  await api("PATCH", `/api/pages/${P.id}/roles/${evId}`, { token: admin, body: { perms: ["post", "attach"] } }); // dave may post again in general
  const bobLocked = await api("POST", `/api/channels/${C.id}/messages`, { token: B.token, body: { body: "ranger in" } });
  const daveLocked = await api("POST", `/api/channels/${C.id}/messages`, { token: D.token, body: { body: "dave in?" } });
  ok(lock.status === 200 && bobLocked.status === 200 && daveLocked.status === 403, "locked: a Ranger posts, dave is refused");
  await api("PATCH", `/api/channels/${C.id}/allow`, { token: admin, body: { userIds: [D.id] } });
  const daveAllowed = await api("POST", `/api/channels/${C.id}/messages`, { token: D.token, body: { body: "dave in!" } });
  ok(daveAllowed.status === 200, "…until the allow-list names him (the per-person override)");
  // Editing is posting (Oct 2026 review): off the allow-list, dave may delete
  // what he wrote but not rewrite it.
  await api("PATCH", `/api/channels/${C.id}/allow`, { token: admin, body: { userIds: [] } });
  const daveEdit = await api("PATCH", `/api/messages/${daveAllowed.body.message.id}`, { token: D.token, body: { body: "dave rewrote it" } });
  ok(daveEdit.status === 403, "a member locked out of a channel can't edit his old message there");
  await api("PATCH", `/api/channels/${C.id}/allow`, { token: admin, body: { userIds: [D.id] } });

  // ---- @everyone ----
  console.log("\n— @everyone —");
  const daveEv = await api("POST", `/api/channels/${lobby.id}/messages`, { token: D.token, body: { body: "@everyone look" } });
  const aliceEv = await api("POST", `/api/channels/${lobby.id}/messages`, { token: A.token, body: { body: "@everyone muster" } });
  const adminEv = await api("POST", `/api/channels/${lobby.id}/messages`, { token: admin, body: { body: "@everyone house" } });
  ok(daveEv.body.message.everyone === false && aliceEv.body.message.everyone === true && adminEv.body.message.everyone === true,
    "the server stamps `everyone` only for a role that may (alice) and the house (admin)");
  const hist = (await api("GET", `/api/channels/${lobby.id}/messages`, { token: B.token })).body.messages;
  ok(hist.find((m) => m.id === aliceEv.body.message.id)?.everyone === true, "…and the flag survives into history");

  // ---- manage_members via a role ----
  console.log("\n— manage_members —");
  const addBefore = await api("POST", `/api/pages/${P.id}/members`, { token: B.token, body: { userId: E.id } });
  ok(addBefore.status === 403, "bob can't add erin");
  await api("PATCH", `/api/pages/${P.id}/roles/${scouts.id}`, { token: admin, body: { perms: ["post", "attach", "manage_members"] } });
  const addAfter = await api("POST", `/api/pages/${P.id}/members`, { token: B.token, body: { userId: E.id } });
  ok(addAfter.status === 200 && st.pageRole(P.id, E.id) === "member", "…until Rangers carries manage_members");
  const promote = await api("PATCH", `/api/pages/${P.id}/members/${E.id}`, { token: B.token, body: { role: "manager" } });
  ok(promote.status === 403, "promotion to MANAGER stays the staff rule");
  // The ADD route promoted too, with no further check (Oct 2026 review): a
  // manage_members role holder could make himself a manager.
  const selfPromote = await api("POST", `/api/pages/${P.id}/members`, { token: B.token, body: { userId: B.id, role: "manager" } });
  ok(selfPromote.status === 403 && st.pageRole(P.id, B.id) !== "manager", "…by the add route too: bob can't make himself a manager");
  const altPromote = await api("POST", `/api/pages/${P.id}/members`, { token: B.token, body: { userId: E.id, role: "manager" } });
  ok(altPromote.status === 403 && st.pageRole(P.id, E.id) === "member", "…nor anybody else");
  await api("PATCH", `/api/pages/${P.id}/members/${E.id}`, { token: admin, body: { role: "manager" } });
  const unseat = await api("DELETE", `/api/pages/${P.id}/members/${E.id}`, { token: B.token });
  ok(unseat.status === 403 && st.pageRole(P.id, E.id) === "manager", "…and he can't remove a manager from the page");
  await api("PATCH", `/api/pages/${P.id}/members/${E.id}`, { token: admin, body: { role: "member" } });

  // ---- deletion cleans up ----
  console.log("\n— cleanup —");
  const del = await api("DELETE", `/api/pages/${P.id}/roles/${scouts.id}`, { token: admin });
  ok(del.status === 200 && st.memberRoleIds(P.id, B.id).length === 0 && st.channelRoleIds(C.id, "post").length === 0, "deleting Rangers clears bob's assignment and the channel gate");
  const bobAfter = await api("POST", `/api/channels/${C.id}/messages`, { token: B.token, body: { body: "still here?" } });
  ok(bobAfter.status === 403, "…so bob can no longer post in the locked room");
  const remove = await api("DELETE", `/api/pages/${P.id}/members/${A.id}`, { token: admin });
  ok(remove.status === 200 && st.memberRoleIds(P.id, A.id).length === 0, "removing alice from the page drops her roles");
  const pageDel = await api("DELETE", `/api/pages/${P.id}`, { token: admin });
  const left = st.db.prepare("SELECT COUNT(*) AS c FROM page_roles WHERE pageId = ?").get(P.id).c;
  ok(pageDel.status === 200 && left === 0, "deleting the page takes its roles with it");

  wsB.ws.close();
  wsD.ws.close();
  st.close?.();
};

run()
  .catch((e) => { console.error(e); bad++; })
  .finally(() => {
    stop();
    console.log(`\n${n - bad}/${n} passed`);
    setTimeout(() => process.exit(bad ? 1 : 0), 300);
  });
