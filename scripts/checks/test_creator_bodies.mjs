// THE CHARACTER CREATOR'S BODIES (docs/survivorz/CREATOR.md, migration 118), over a real server on
// port 8613: the admin drops a model in, the worker on Josh's PC claims it, reports its steps and
// sends the packed body back into game/.
//  1. THE DROP: admin only; FBX (binary and ASCII), GLB and zip taken by their bytes, anything else
//     415; a bad id 400; an id a baked body, a zombie or a queued body has 409; queued with its
//     height, licence and credit; the model kept on disk byte for byte.
//  2. THE WORKER'S DOOR: shut (401) without SURVIVORZ_WORKER_TOKEN configured, 401 for no token, a
//     wrong one or an admin's session; the stream token opens nothing here.
//  3. THE BAKE: the oldest queued body claimed once (a second worker gets nothing), the same worker
//     asking again gets its body back (a crash resumes); the model downloads byte for byte;
//     progress keeps only the checklist's shape; a failed bake is marked failed with its reason and
//     re-queued by the admin; a non-GLB refused; the packed body lands in game/<id>.glb, the row
//     "ready", the gun seat merged into props/guns/cal.json beside the others; the panel's list
//     shows the worker seen and the body baked, and never the file's name on disk.
//  4. REMOVING: refused while a character wears the body; otherwise the row, the model and the
//     packed body all go.

process.env.EXCHANGE_PROVIDER = "off";
process.env.ALPACA_KEY_ID = "";
process.env.ALPACA_SECRET_KEY = "";

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = 8613;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "creator-bodies-harness");
const ASSETS = path.join(DATA_DIR, "survivorz");
// (the creator writes under the data dir, the only place the hardened service may: survivorz-assets.ts creatorRoot)
const SHELF = path.join(DATA_DIR, "survivorz-creator");
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(ASSETS, "game"), { recursive: true });
fs.mkdirSync(path.join(ASSETS, "props", "guns"), { recursive: true });
// a baked body and a zombie already there, and another body's gun seat that must survive the merge
const GLB = (extra = 0) => { const b = Buffer.alloc(64 + extra); b.writeUInt32LE(0x46546c67, 0); b.writeUInt32LE(2, 4); b.writeUInt32LE(b.length, 8); return b; };
fs.writeFileSync(path.join(ASSETS, "game", "eric.glb"), GLB());
fs.writeFileSync(path.join(ASSETS, "game", "zombie-m01.glb"), GLB());
fs.writeFileSync(path.join(ASSETS, "props", "guns", "cal.json"), JSON.stringify({ eric: { reach: 0.5 } }));

const TOKEN = "creator-worker-harness-token-0123456789";
const STREAM = "creator-stream-harness-token-0123456789";
const ADMIN_PW = "Harness!Admin9xy";
const boot = async (extra = {}) => {
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW, ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "", ROLLO_LIVE: "0", NPC_BRAIN_URL: "", NPC_BRAIN_BIG_URL: "",
    SURVIVORZ_ASSETS: ASSETS, SURVIVORZ_STREAM_TOKEN: STREAM, SURVIVORZ_WORKER_TOKEN: "", ...extra,
  };
  const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], { env, stdio: ["ignore", "ignore", "ignore"] });
  let up = false;
  for (let i = 0; i < 160 && !up; i++) { try { up = (await fetch(BASE + "/health")).ok; } catch {} if (!up) await sleep(250); }
  return { srv, up };
};
const stop = async (srv) => { const gone = new Promise((r) => srv.once("exit", r)); srv.kill("SIGINT"); await Promise.race([gone, sleep(5000)]); };
const req = async (method, url, token, body, raw) => {
  const headers = { ...(token ? { authorization: "Bearer " + token } : {}) };
  if (raw) headers["content-type"] = "application/octet-stream";
  else if (body) headers["content-type"] = "application/json";
  const r = await fetch(BASE + url, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const buf = Buffer.from(await r.arrayBuffer());
  let j = null; try { j = JSON.parse(buf.toString("utf8")); } catch {}
  return { status: r.status, body: j, buf };
};
const login = async (u, p) => (await req("POST", "/api/login", null, { username: u, password: p })).body?.token;

const FBX = Buffer.concat([Buffer.from("Kaydara FBX Binary  \0\x1a\0", "latin1"), Buffer.alloc(2000, 7)]);
const FBX_ASCII = Buffer.from("; FBX 7.4.0 project file\n; ----\nFBXHeaderExtension: {\n}\n", "latin1");
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100)]);

console.log("THE DROP");
let { srv, up } = await boot();
process.on("exit", () => { try { srv.kill("SIGINT"); } catch {} });
ok(up, "the server boots without a worker token");
const admin = await login("admin", ADMIN_PW);
await req("POST", "/api/register", null, { username: "member_cb", password: "Harness!Member9xy", secret: "copper lantern drifting slowly home", acceptTerms: true });
const member = await login("member_cb", "Harness!Member9xy");
ok((await req("POST", "/api/admin/survivorz/bodies?id=dale-b&name=dale.fbx", member, null, FBX)).status === 403, "a member can't drop a model in (403)");
ok((await req("POST", "/api/admin/survivorz/bodies?id=Bad%20Id", admin, null, FBX)).status === 400, "a bad id is refused (400)");
ok((await req("POST", "/api/admin/survivorz/bodies?id=eric", admin, null, FBX)).status === 409, "an id a baked body has is refused (409)");
ok((await req("POST", "/api/admin/survivorz/bodies?id=zombie-m09", admin, null, FBX)).status === 409, "a zombie's id is refused (409)");
ok((await req("POST", "/api/admin/survivorz/bodies?id=junk", admin, null, Buffer.from("hello world, not a model"))).status === 415, "bytes that aren't a model are refused (415)");
const drop = await req("POST", "/api/admin/survivorz/bodies?id=dale-b&name=dale.fbx&height=1.81&licence=CC-BY-4.0&credit=Someone", admin, null, FBX);
ok(drop.status === 200 && drop.body?.body?.status === "queued", "a binary FBX is taken and queued");
ok(drop.body?.body?.heightM === 1.81 && drop.body.body.licence === "CC-BY-4.0" && drop.body.body.credit === "Someone", "height, licence and credit kept");
ok(drop.body?.body && !("sourceFile" in drop.body.body), "the file's name on disk never goes out");
ok((await req("POST", "/api/admin/survivorz/bodies?id=dale-b", admin, null, FBX)).status === 409, "an id already queued is refused (409)");
ok((await req("POST", "/api/admin/survivorz/bodies?id=ascii-b&name=a.fbx", admin, null, FBX_ASCII)).status === 200, "an ASCII FBX is taken");
ok((await req("POST", "/api/admin/survivorz/bodies?id=zip-b&name=pack.zip&height=9", admin, null, ZIP)).body?.body?.heightM === null, "a zip is taken; a height outside the adult range is dropped");
ok((await req("POST", "/api/admin/survivorz/bodies?id=glb-b&name=m.glb", admin, null, GLB(100))).status === 200, "a GLB is taken");
const models = fs.readdirSync(path.join(DATA_DIR, "uploads", "survivorz-models"));
ok(models.length === 4 && models.some((f) => fs.readFileSync(path.join(DATA_DIR, "uploads", "survivorz-models", f)).equals(FBX)), "each model kept on disk, byte for byte");

console.log("THE WORKER'S DOOR");
ok((await req("GET", "/api/survivorz/worker/next", TOKEN)).status === 401, "shut without a worker token configured (401)");
await stop(srv);
({ srv, up } = await boot({ SURVIVORZ_WORKER_TOKEN: TOKEN }));
ok(up, "the server boots with the worker token");
const admin2 = await login("admin", ADMIN_PW);
ok((await req("GET", "/api/survivorz/worker/next")).status === 401, "no token: 401");
ok((await req("GET", "/api/survivorz/worker/next", "wrong-token-wrong-token-wrong-token")).status === 401, "a wrong token: 401");
ok((await req("GET", "/api/survivorz/worker/next", admin2)).status === 401, "an admin's session isn't the worker: 401");
ok((await req("GET", "/api/survivorz/worker/next", STREAM)).status === 401, "the stream token opens nothing here: 401");

console.log("THE BAKE");
const first = await req("GET", "/api/survivorz/worker/next?worker=pc", TOKEN);
ok(first.status === 200 && first.body?.body?.id === "dale-b" && first.body.body.kind === "fbx" && first.body.body.heightM === 1.81, "the oldest queued body is claimed, with what the bake needs");
const other = await req("GET", "/api/survivorz/worker/next?worker=laptop", TOKEN);
ok(other.body?.body?.id !== "dale-b", "a second worker never gets the same body");
const again = await req("GET", "/api/survivorz/worker/next?worker=pc", TOKEN);
ok(again.body?.body?.id === "dale-b", "the same worker asking again gets its body back (a crash resumes)");
const model = await req("GET", "/api/survivorz/worker/model/dale-b", TOKEN);
ok(model.status === 200 && model.buf.equals(FBX), "the model downloads byte for byte");
ok((await req("GET", "/api/survivorz/worker/model/dale-b", admin2)).status === 401, "the model isn't downloadable without the token");
const prog = await req("POST", "/api/survivorz/worker/dale-b/progress", TOKEN, {
  steps: { intake: { state: "done", startedAt: 1, endedAt: 2 }, retarget: { state: "running", startedAt: 3, junk: "x" }, "Bad Step": { state: "done" }, odd: { state: "exploded" } },
  report: { height: 1.81, family: "mixamo" },
});
ok(prog.status === 200, "progress is taken");
let list = (await req("GET", "/api/admin/survivorz/bodies", admin2)).body;
let row = list?.bodies?.find((b) => b.id === "dale-b");
ok(row?.status === "baking" && row.steps.intake?.state === "done" && row.steps.retarget?.state === "running" && !row.steps.retarget.junk && !row.steps["Bad Step"] && !row.steps.odd, "progress keeps only the checklist's shape");
ok(row?.report?.family === "mixamo", "the intake's report reaches the panel");
await req("POST", "/api/survivorz/worker/dale-b/progress", TOKEN, { steps: { intake: { state: "done", startedAt: 1, endedAt: 2 }, retarget: { state: "running", startedAt: 3, progress: 0.42, expectMs: 300000 }, build: { state: "pending", expectMs: 1500000 }, pack: { state: "pending", expectMs: -5, progress: 7 } } });
row = (await req("GET", "/api/admin/survivorz/bodies", admin2)).body.bodies.find((b) => b.id === "dale-b");
ok(row?.steps.retarget?.progress === 0.42 && row.steps.retarget.expectMs === 300000 && row.steps.build?.state === "pending" && row.steps.build.expectMs === 1500000, "TIME LEFT: a running step's progress and every step's expected time reach the panel");
ok(row?.steps.pack && row.steps.pack.expectMs === undefined && row.steps.pack.progress === 1, "a nonsense expected time is dropped and a progress over 1 is held to 1");
ok(list?.worker?.configured === true && list.worker.seenAt > 0 && list.worker.name === "pc", "the panel sees the worker");
// GRABS, BITES AND RESCUES (Nov 4 2026): each zombie's halves as a small glb, then the table, while baking
const half = GLB(300);
ok((await req("POST", "/api/survivorz/worker/dale-b/pairclip?zombie=zombie-m01", null, null, half)).status === 401
  && (await req("POST", "/api/survivorz/worker/dale-b/pairclip?zombie=../eric", TOKEN, null, half)).status === 400
  && (await req("POST", "/api/survivorz/worker/dale-b/pairclip?zombie=zombie-m01", TOKEN, null, FBX)).status === 415, "PAIRS: a zombie's halves need the token, a real zombie id and a GLB");
ok((await req("POST", "/api/survivorz/worker/dale-b/pairclip?zombie=zombie-m01", TOKEN, null, half)).status === 200
  && fs.readFileSync(path.join(SHELF, "pairclips", "dale-b", "zombie-m01.glb")).equals(half), "…and land on the shelf whole");
const tbl = await req("POST", "/api/survivorz/worker/dale-b/pairs", TOKEN, { table: {
  chains: { "zombie-m01": { "dale-b": { front: "fzfzfz", back: "nope" }, eric: { front: "fzfzfz" } }, "not-a-zombie": { "dale-b": { front: "fzfzfz" } } },
  bites: { "zombie-m01": { "dale-b": { forearm: [0.1, 0.2, 180], shoulder: "bad" } } },
  pull: { "dale-b": { "zombie-m01": [-0.75, -0.9, 0], nope: [1, 2, 3] }, eric: { "zombie-m01": [1, 1, 1] } },
} });
ok(tbl.status === 200 && (await req("POST", "/api/survivorz/worker/dale-b/pairs", null, { table: {} })).status === 401, "the pairs table is taken (and needs the token)");
const kept = JSON.parse(fs.readFileSync(path.join(SHELF, "pairs", "dale-b.json"), "utf8"));
ok(kept.chains["zombie-m01"]["dale-b"].front === "fzfzfz" && !kept.chains["zombie-m01"]["dale-b"].back && !kept.chains["zombie-m01"].eric && !kept.chains["not-a-zombie"]
  && kept.bites["zombie-m01"]["dale-b"].forearm?.[2] === 180 && !kept.bites["zombie-m01"]["dale-b"].shoulder
  && kept.pull["dale-b"]["zombie-m01"]?.[0] === -0.75 && !kept.pull["dale-b"].nope && !kept.pull.eric, "…cleaned to this body, real zombies and the shapes the show reads (a hand-made body's rows never)");
ok((await req("POST", "/api/survivorz/worker/dale-b/guncal", TOKEN, { cal: { reach: 0.62, z: [1, 0, 0] } })).status === 200, "the gun seat is taken");
const seats = (await req("GET", "/api/survivorz/asset/gun/cal.json", admin2)).body;
ok(seats?.["dale-b"]?.reach === 0.62 && seats.eric?.reach === 0.5, "the gun seats the show reads carry it beside the other bodies");
ok(!("dale-b" in JSON.parse(fs.readFileSync(path.join(ASSETS, "props", "guns", "cal.json"), "utf8"))), "the tree's cal.json is untouched");
// HOW FAST ITS LOOPS GO (the bake's "speeds" step, realism round 10): token-only, checked, kept on the shelf, served
ok((await req("POST", "/api/survivorz/worker/dale-b/loopspeed", null, { speeds: { "ual1-walk-loop": 0.95 } })).status === 401, "loop speeds without the worker token: 401");
ok((await req("POST", "/api/survivorz/worker/dale-b/loopspeed", TOKEN, { speeds: { "ual1-walk-loop": "fast" } })).status === 400, "a speed that isn't a number is refused");
ok((await req("POST", "/api/survivorz/worker/dale-b/loopspeed", TOKEN, { speeds: { "../x": 1 } })).status === 400, "a clip name that isn't one is refused");
ok((await req("POST", "/api/survivorz/worker/dale-b/loopspeed", TOKEN, { speeds: { "ual1-walk-loop": 0.951, "ual1-jog-fwd-loop": 5.62 } })).status === 200, "the loop speeds are taken");
const speeds = (await req("GET", "/api/survivorz/asset/body/loopspeed.json", admin2)).body;
ok(speeds?.["ual1-walk-loop"]?.["dale-b"] === 0.951 && speeds["ual1-jog-fwd-loop"]?.["dale-b"] === 5.62, "the show reads them as { clip: { body: speed } }");
ok(fs.existsSync(path.join(SHELF, "loopspeed.json")) && !fs.existsSync(path.join(ASSETS, "loopspeed.json")), "kept on the creator's shelf, never in the tree");
// WHAT IT CARRIES (the bake's "kit" step, Nov 12 2026): its pack and stow fits — token-only, checked, on the shelf, served
const FIT = { packs: { "backpack-small": { back: 0.21, up: -0.2, tilt: 4, scale: 1, push: { "ual1-jog-fwd-loop": 0.04 } } }, stow: { holster: { frame: "hip", at: [0.1, 0, -0.17], y: [1, 0, 0], z: [0, -1, 0], pivot: [0, 0.02, 0.06] }, "back:hk416": { frame: "chest", at: [0, -0.12, -0.2], y: [0, 0, -1], z: [-0.5, 0.86, 0], pivot: [0, 0.06, 0.17] } } };
const kf = (fit, tok = TOKEN) => req("POST", "/api/survivorz/worker/dale-b/kitfit", tok, { fit });
ok((await kf(FIT, null)).status === 401, "pack and holster fits without the worker token: 401");
ok((await kf({})).status === 400 && (await kf({ packs: {}, stow: {} })).status === 400, "an empty fit is refused");
ok((await kf({ packs: { "backpack-huge": FIT.packs["backpack-small"] } })).status === 400, "a pack the show doesn't have is refused");
ok((await kf({ packs: { "backpack-small": { ...FIT.packs["backpack-small"], back: 9 } } })).status === 400 && (await kf({ packs: { "backpack-small": { ...FIT.packs["backpack-small"], push: { "../x": 0.1 } } } })).status === 400, "a pack 9 m off the back, or a push for a clip that isn't one, is refused");
ok((await kf({ stow: { holster: { ...FIT.stow.holster, frame: "head" } } })).status === 400 && (await kf({ stow: { holster: { ...FIT.stow.holster, at: [0, "x", 0] } } })).status === 400 && (await kf({ stow: { holster: { ...FIT.stow.holster, at: [0, 0, 40] } } })).status === 400, "a stow fit on a frame the show doesn't have, or with a place that isn't three sane numbers, is refused");
ok(!fs.existsSync(path.join(SHELF, "kitfit.json")), "…and none of the refusals kept anything");
ok((await kf({ ...FIT, extra: { evil: true }, stow: { ...FIT.stow, holster: { ...FIT.stow.holster, extra: "x" } } })).status === 200, "the fits are taken");
const kitfit = (await req("GET", "/api/survivorz/asset/body/kitfit.json", admin2)).body;
ok(kitfit?.packs?.["dale-b"]?.["backpack-small"]?.back === 0.21 && kitfit.packs["dale-b"]["backpack-small"].push["ual1-jog-fwd-loop"] === 0.04 && kitfit.stow?.["dale-b"]?.holster?.frame === "hip" && kitfit.stow["dale-b"]["back:hk416"].at[2] === -0.2, "the show reads them as { packs: { body }, stow: { body } }");
ok(!("extra" in kitfit) && !("extra" in kitfit.stow["dale-b"].holster), "…only the fields the show reads are kept");
ok(fs.existsSync(path.join(SHELF, "kitfit.json")) && !fs.existsSync(path.join(ASSETS, "kitfit.json")), "kept on the creator's shelf, never in the tree");
// (taken only while the body is baking: sent after it went ready, they would change a body already in the show)
ok((await req("POST", "/api/survivorz/worker/dale-b/body", TOKEN, null, FBX)).status === 415, "a body that isn't a GLB is refused (415)");
const packed = GLB(5000);
ok((await req("POST", "/api/survivorz/worker/dale-b/body", TOKEN, null, packed)).status === 200, "the packed body is taken");
ok(fs.readFileSync(path.join(SHELF, "game", "dale-b.glb")).equals(packed), "it lands on the creator's shelf (data dir), whole");
ok(!fs.existsSync(path.join(ASSETS, "game", "dale-b.glb")), "the read-only tree is never written");
ok(!fs.readdirSync(path.join(SHELF, "game")).some((f) => f.includes(".part")), "no half-written file left behind");
const served = await req("GET", "/api/survivorz/asset/body/dale-b.glb", admin2);
ok(served.status === 200 && served.buf.equals(packed), "the show loads it through the ordinary body route");
const listed = (await req("GET", "/api/survivorz/assets", admin2)).body?.bodies ?? [];
ok(listed.some((b) => b.id === "dale-b" && b.kind === "survivor") && listed.some((b) => b.id === "eric"), "the asset list carries it beside the tree's bodies");
list = (await req("GET", "/api/admin/survivorz/bodies", admin2)).body;
row = list?.bodies?.find((b) => b.id === "dale-b");
ok(row?.status === "ready" && row.baked === true, "the row reads ready and baked");
ok((await req("POST", "/api/survivorz/worker/dale-b/guncal", TOKEN, { cal: { reach: 0.1 } })).status === 409 && (await req("POST", "/api/survivorz/worker/dale-b/loopspeed", TOKEN, { speeds: { "ual1-walk-loop": 3 } })).status === 409 && (await kf(FIT)).status === 409, "a gun seat, loop speeds or kit fits for a body already ready are refused (409)");
ok(row?.pairs === true, "…with its grabs, bites and rescues");
const merged = (await req("GET", "/api/survivorz/asset/pairs/pairs.json", admin2)).body;
ok(merged?.chains?.["zombie-m01"]?.["dale-b"]?.front === "fzfzfz" && merged.clips?.["zombie-m01"]?.includes("dale-b") && merged.pull?.["dale-b"]?.["zombie-m01"], "the show reads the creator bodies' pairs, and which zombies carry halves for them");
const hc = await req("GET", "/api/survivorz/asset/pairclip/dale-b~zombie-m01.glb", admin2);
ok(hc.status === 200 && hc.buf.equals(half) && (await req("GET", "/api/survivorz/asset/pairclip/eric~zombie-m01.glb", admin2)).status === 404
  && (await req("GET", "/api/survivorz/asset/pairclip/..~zombie-m01.glb", admin2)).status === 404, "…and loads a zombie's halves by name, nothing else");
ok((await req("POST", "/api/admin/survivorz/bodies/dale-b/pairs", member)).status === 403, "a member can't queue a pairs bake (403)");
ok((await req("POST", "/api/survivorz/worker/dale-b/progress", TOKEN, { steps: {} })).status === 409, "a body no longer baking takes no more progress (409)");

// a failed bake, and the admin putting it back in the queue
const second = await req("GET", "/api/survivorz/worker/next?worker=pc", TOKEN);
const sid = second.body?.body?.id;
ok(!!sid && sid !== "dale-b", "the next body is claimed");
await req("POST", `/api/survivorz/worker/${sid}/progress`, TOKEN, { status: "failed", error: "retarget: the skeleton has no hips" });
row = (await req("GET", "/api/admin/survivorz/bodies", admin2)).body.bodies.find((b) => b.id === sid);
ok(row?.status === "failed" && /no hips/.test(row.error), "a failed bake is marked failed, with the reason");
ok((await req("POST", `/api/admin/survivorz/bodies/${sid}/rebake`, member)).status === 403, "a member can't re-queue (403)");
const re = await req("POST", `/api/admin/survivorz/bodies/${sid}/rebake`, admin2);
ok(re.body?.body?.status === "queued" && !re.body.body.error && Object.keys(re.body.body.steps).length === 0, "the admin re-queues it, clean");
const ed = await req("PATCH", `/api/admin/survivorz/bodies/${sid}`, admin2, { licence: "Mixamo", heightM: 1.7 });
ok(ed.body?.body?.licence === "Mixamo" && ed.body.body.heightM === 1.7, "licence and height can be put right afterwards");

console.log("PAUSE");
const pj = await req("GET", "/api/survivorz/worker/next?worker=pc", TOKEN);
const pid = pj.body?.body?.id;
ok(!!pid, "a body is claimed to pause");
ok((await req("POST", `/api/admin/survivorz/bodies/${pid}/pause`, member)).status === 403, "a member can't pause (403)");
const pz = await req("POST", `/api/admin/survivorz/bodies/${pid}/pause`, admin2);
ok(pz.body?.body?.status === "paused" && pz.body.body.paused === "me", "the admin pauses a bake");
const told = await req("POST", `/api/survivorz/worker/${pid}/progress`, TOKEN, { steps: { intake: { state: "done" }, retarget: { state: "running" } } });
ok(told.body?.pause === true, "the worker hears it on its next report");
await req("POST", `/api/survivorz/worker/${pid}/progress`, TOKEN, { resumeFrom: "retarget" });
ok((await req("POST", `/api/survivorz/worker/${pid}/progress`, TOKEN, { resumeFrom: "../bad step" })).status === 200, "a bad step name is ignored, not stored");
let prow = (await req("GET", "/api/admin/survivorz/bodies", admin2)).body.bodies.find((b) => b.id === pid);
ok(prow?.resumeFrom === "retarget" && prow.status === "paused", "it remembers the step it stopped at");
ok((await req("GET", "/api/survivorz/worker/next?worker=pc", TOKEN)).body?.body?.id !== pid, "a body the admin paused isn't handed out");
const rs = await req("POST", `/api/admin/survivorz/bodies/${pid}/resume`, admin2);
ok(rs.body?.body?.status === "queued" && rs.body.body.resumeFrom === "retarget", "Resume puts it back in the queue, step kept");
ok((await req("POST", `/api/admin/survivorz/bodies/${pid}/resume`, admin2)).status === 409, "resuming what isn't paused is refused (409)");
// let the claims of anything ahead of it go by, then the worker takes it up at its step
let back = null;
for (let i = 0; i < 6 && back?.id !== pid; i++) {
  back = (await req("GET", "/api/survivorz/worker/next?worker=resumer", TOKEN)).body?.body ?? null;
  if (back && back.id !== pid) await req("POST", `/api/survivorz/worker/${back.id}/progress`, TOKEN, { status: "failed", error: "set aside" });
}
ok(back?.id === pid && back.resumeFrom === "retarget", "the worker gets it back with the step to resume from");
const gp = await req("POST", `/api/survivorz/worker/${pid}/progress`, TOKEN, { paused: "game", resumeFrom: "build" });
ok(gp.body?.pause === false, "a game pause isn't a stop order");
prow = (await req("GET", "/api/admin/survivorz/bodies", admin2)).body.bodies.find((b) => b.id === pid);
ok(prow?.status === "paused" && prow.paused === "game" && prow.resumeFrom === "build", "a game pauses it, at its step");
ok((await req("POST", `/api/admin/survivorz/bodies/${pid}/resume`, admin2)).status === 409, "the admin can't resume over a running game (409)");
ok((await req("DELETE", `/api/admin/survivorz/bodies/${pid}`, admin2)).status === 409, "a body a game is holding can't be removed out from under the worker (409)");
ok((await req("GET", "/api/survivorz/worker/next?worker=resumer", TOKEN)).body?.body?.id === pid, "the worker that holds it still owns it while the game runs (a restart finds it)");
await req("POST", `/api/survivorz/worker/${pid}/progress`, TOKEN, { paused: null });
prow = (await req("GET", "/api/admin/survivorz/bodies", admin2)).body.bodies.find((b) => b.id === pid);
ok(prow?.status === "baking" && prow.paused === null, "the game closes: baking again");
await req("POST", `/api/survivorz/worker/${pid}/progress`, TOKEN, { paused: "game" });
await req("POST", `/api/admin/survivorz/bodies/${pid}/pause`, admin2);
prow = (await req("GET", "/api/admin/survivorz/bodies", admin2)).body.bodies.find((b) => b.id === pid);
ok(prow?.paused === "me", "pausing over a game makes it the admin's pause");
await req("POST", `/api/survivorz/worker/${pid}/progress`, TOKEN, { paused: null });
ok((await req("GET", "/api/admin/survivorz/bodies", admin2)).body.bodies.find((b) => b.id === pid)?.status === "paused", "and the game closing doesn't lift the admin's pause");
// (Nov 10 2026 review) a Pause pressed while the worker is SENDING a finished bake doesn't turn it into a failure
ok((await req("POST", `/api/survivorz/worker/${pid}/body`, TOKEN, null, packed)).status === 200, "a finished body is still taken when Pause lands mid-sending");
prow = (await req("GET", "/api/admin/survivorz/bodies", admin2)).body.bodies.find((b) => b.id === pid);
ok(prow?.status === "ready" && prow.paused === null, "…and reads ready, the pause gone");

console.log("THE QUEUE");
// three more bodies wait in line; the admin puts the last one first and the worker takes it first
for (const q of ["q-a", "q-b", "q-c"]) await req("POST", `/api/admin/survivorz/bodies?id=${q}&name=${q}.fbx`, admin2, null, FBX);
let qrows = (await req("GET", "/api/admin/survivorz/bodies", admin2)).body.bodies;
const qo = (id) => qrows.find((b) => b.id === id)?.queueOrder;
ok(qo("q-a") < qo("q-b") && qo("q-b") < qo("q-c"), "dropped bodies join the back of the queue in order");
ok((await req("POST", "/api/admin/survivorz/bodies/queue", member, { ids: ["q-c", "q-a", "q-b"] })).status === 403, "a member can't reorder the queue (403)");
ok((await req("POST", "/api/admin/survivorz/bodies/queue", admin2, { ids: ["q-a", "q-a"] })).status === 400, "a list naming a body twice is refused (400)");
const notWaiting = qrows.find((b) => b.status === "ready" || b.status === "baking" || b.status === "failed");
ok(!!notWaiting && (await req("POST", "/api/admin/survivorz/bodies/queue", admin2, { ids: [notWaiting.id] })).status === 409, "a body that isn't waiting can't be put in line (409)");
ok((await req("POST", "/api/admin/survivorz/bodies/queue", admin2, { ids: ["q-c", "q-a", "q-b"] })).status === 200, "the admin reorders the queue");
qrows = (await req("GET", "/api/admin/survivorz/bodies", admin2)).body.bodies;
ok(qo("q-c") < qo("q-a") && qo("q-a") < qo("q-b"), "the new order is kept");
ok((await req("GET", "/api/survivorz/worker/next?worker=qworker", TOKEN)).body?.body?.id === "q-c", "the worker takes the first in line, not the oldest");
await req("POST", "/api/admin/survivorz/bodies?id=q-d&name=q-d.fbx", admin2, null, FBX);
qrows = (await req("GET", "/api/admin/survivorz/bodies", admin2)).body.bodies;
ok(qrows.filter((b) => b.id !== "q-d").every((b) => (b.queueOrder ?? -1) < qo("q-d")), "a body dropped after a reorder still goes to the back");

console.log("NOT BAKED YET");
const sarahFile = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "survivorz", "cast", "sarah.json"), "utf8"));
const unb = (await req("GET", "/api/admin/survivorz/bodies", admin2)).body.unbaked;
ok(Array.isArray(unb) && unb.some((u) => u.body === sarahFile.body && u.characters.some((c) => c.name === sarahFile.name)), "a character whose body isn't baked is listed, with who wears it");
ok(!unb.some((u) => u.body === "eric"), "a body on the shelf isn't listed (Rick wears eric)");

console.log("REMOVING");
// a character on the panel's list wearing dale-b holds it (Sarah's file, renamed, as a draft)
const sarah = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "survivorz", "cast", "sarah.json"), "utf8"));
const saved = await req("POST", "/api/admin/survivorz/cast/save", admin2, { char: { ...sarah, id: "testdale", name: "Test Dale", short: "TDale", status: "draft", body: "dale-b", voice: { clone: "survivor-testdale", kokoro: "am_adam" } } });
ok(saved.status === 200, "a draft character wearing the new body is saved to the list" + (saved.status !== 200 ? " (" + JSON.stringify(saved.body).slice(0, 200) + ")" : ""));
const busy = await req("DELETE", "/api/admin/survivorz/bodies/dale-b", admin2);
ok(busy.status === 409 && busy.body?.name === "Test Dale", "a body a character wears can't be removed (409, naming them)");
const glbBody = (await req("GET", "/api/admin/survivorz/bodies", admin2)).body.bodies.find((b) => b.id === "glb-b");
ok((await req("DELETE", "/api/admin/survivorz/bodies/glb-b", member)).status === 403, "a member can't remove a body (403)");
ok((await req("DELETE", "/api/admin/survivorz/bodies/glb-b", admin2)).status === 200 && !!glbBody, "a body nobody wears is removed");
await sleep(200);
ok(!(await req("GET", "/api/admin/survivorz/bodies", admin2)).body.bodies.some((b) => b.id === "glb-b"), "its row is gone");
const left = fs.readdirSync(path.join(DATA_DIR, "uploads", "survivorz-models"));
ok(left.length === 7 && !left.some((f) => f.endsWith(".glb")), "its model is gone from disk" + (left.length !== 7 ? " (" + left.join(",") + ")" : ""));

console.log("GRABS AND BITES FOR A BODY BAKED BEFORE THEM");
const pq = await req("POST", "/api/admin/survivorz/bodies/dale-b/pairs", admin2);
ok(pq.status === 200 && pq.body?.body?.status === "queued" && pq.body.body.resumeFrom === "pairs" && pq.body.body.steps.intake?.state === "done" && !pq.body.body.steps.verify,
  "a ready body goes back in line from the pairs step, its earlier steps kept");
ok((await req("POST", "/api/admin/survivorz/bodies/dale-b/pairs", admin2)).status === 409, "…once (it isn't ready while it waits)");
await req("POST", "/api/admin/survivorz/cast/testdale/delete", admin2);
const gone = await req("DELETE", "/api/admin/survivorz/bodies/dale-b", admin2);
ok(gone.status === 200 && !fs.existsSync(path.join(SHELF, "pairs", "dale-b.json")) && !fs.existsSync(path.join(SHELF, "pairclips", "dale-b")), "a removed body takes its grabs, bites and rescues with it");
ok(!JSON.stringify((await req("GET", "/api/survivorz/asset/body/loopspeed.json", admin2)).body ?? {}).includes("dale-b"), "…and its loop speeds");
ok(!JSON.stringify((await req("GET", "/api/survivorz/asset/body/kitfit.json", admin2)).body ?? {}).includes("dale-b"), "…and its pack and holster fits");

await stop(srv);
fs.rmSync(DATA_DIR, { recursive: true, force: true });
console.log(`\n${n - bad}/${n} creator-body asserts passed`);
process.exit(bad ? 1 : 0);
