// SOLACE SURVIVORZ — the asset door (src/routes/survivorz-assets.ts).
//
// Run:  npm run build && node scripts/survivorz/test-assets.mjs
//
// The bodies, guns and sounds are bought or licensed, so the whole feature is
// a claim about WHO can read WHAT. Driven against a real server with a
// fixture tree (never the real assets — the bakes rewrite those mid-run):
//   · anonymous 401, a member 403 — admin-only until the show is validated
//   · the index lists bodies (survivor / zombie), guns, props and the manifest
//   · a file streams exactly its bytes, with no-cache + an ETag; a matching
//     If-None-Match gets 304, and a RE-BAKE changes the ETag and the bytes
//   · nothing outside the fixed areas: unknown or prototype-named areas,
//     wrong extensions, hidden files, a directory, encoded traversal into a
//     sibling area or out of the tree — all 404
//   · a missing tree is an honest 404 "not_available"
// It lives in scripts/survivorz, not scripts/checks, while Survivorz is
// uncommitted: run-all treats an undocumented harness as a red run.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8611;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "survivorz-assets-harness");
const FIX = path.join(ROOT, "data", "survivorz-assets-fixture");
const TREE = path.join(FIX, "survivorz");
for (const d of [DATA_DIR, FIX]) try { fs.rmSync(d, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the fixture tree -------------------------------------------------------
const put = (rel, content) => {
  const p = path.join(FIX, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};
const BODY = Buffer.from("glTF-carla-" + "x".repeat(5000));
put("survivorz/game/carla.glb", BODY);
put("survivorz/game/zombie-f01.glb", "glTF-zombie");
put("survivorz/game/.hidden.glb", "hidden");
put("survivorz/game/notes.json", "{}");
fs.mkdirSync(path.join(TREE, "game", "dir.glb"), { recursive: true });
put("survivorz/props/guns/hk416.glb", "glTF-gun");
put("survivorz/props/guns/cal.json", '{"cal":1}');
put("survivorz/props/guns/tex/hk416-base.jpg", "jpeg");
put("survivorz/props/shotgun.glb", "glTF-shotgun");
put("survivorz/sound/final/game/step-concrete/a.ogg", "OggS-step");
put("survivorz/sound/final/game/step-concrete/a.wav", "RIFF");
put("survivorz/sound/final/manifest.json", JSON.stringify({ sounds: { "step-concrete": { group: "footsteps", kind: "one", music: false, files: [{ file: "a.ogg" }] } } }));
put("survivorz/fx/sheet.webp", "RIFF-sheet");
put("survivorz/fx/blood/decals/splat.png", "PNG-splat");
put("survivorz/fx/a/b/c/deep.ktx2", "KTX-deep");
put("survivorz/fx/a/b/c/d/too-deep.png", "PNG-too-deep");
put("survivorz/fx/pieces/arm.glb", "glTF-arm");
put("survivorz/fx/.hidden/x.png", "PNG-hidden");
put("survivorz/fx/notes.txt", "text");
put("survivorz/secret.glb", "SECRET-root");
put("outside.glb", "SECRET-outside");

const ADMIN_PW = "Harness!Admin9xy";
const ENV = {
  ...process.env,
  PORT: String(PORT),
  DATA_DIR,
  SURVIVORZ_ASSETS: TREE,
  ADMIN_PASSWORD: ADMIN_PW,
  ALLOW_REGISTRATION: "true",
  REQUIRE_INVITE: "false",
  LIVEKIT_URL: "",
  LIVEKIT_API_KEY: "",
  LIVEKIT_API_SECRET: "",
};
let srv = null;
let bootLog = "";
const stop = () => { try { srv?.kill("SIGINT"); } catch {} };
process.on("exit", stop);

const raw = (url, token, headers = {}) =>
  fetch(BASE + url, { headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...headers } });
const api = async (method, url, { token, body } = {}) => {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
};

const run = async () => {
  srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], { env: ENV, stdio: ["ignore", "pipe", "pipe"] });
  srv.stdout.on("data", (d) => { bootLog += d; });
  srv.stderr.on("data", (d) => { bootLog += d; });
  let up = false;
  for (let i = 0; i < 160 && !up; i++) {
    try { up = (await fetch(BASE + "/health")).ok; } catch {}
    if (!up) await sleep(250);
  }
  ok(up, "server booted");

  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  ok(!!admin, "admin signed in");
  const reg = await api("POST", "/api/register", {
    body: { username: "zedwatcher", password: "Sturdy!Passw0rd#9", displayName: "zedwatcher", secret: "vault marmalade lantern quartz 47", acceptTerms: true },
  });
  const member = reg.body?.token;
  ok(!!member, "a member registered");

  // ---- WHO ---------------------------------------------------------------
  const urls = ["/api/survivorz/assets", "/api/survivorz/asset/body/carla.glb", "/api/survivorz/sound/step-concrete/a.ogg"];
  for (const u of urls) {
    ok((await raw(u)).status === 401, `anonymous refused 401: ${u}`);
    ok((await raw(u, member)).status === 403, `a member refused 403: ${u}`);
  }

  // ---- THE INDEX ---------------------------------------------------------
  const idx = await api("GET", "/api/survivorz/assets", { token: admin });
  ok(idx.status === 200, "the admin reads the index");
  const bodies = idx.body?.bodies ?? [];
  ok(bodies.length === 2, "two bodies listed (no hidden file, no json, no directory)");
  ok(bodies.find((b) => b.id === "carla")?.kind === "survivor", "carla is a survivor");
  ok(bodies.find((b) => b.id === "zombie-f01")?.kind === "zombie", "zombie-f01 is a zombie");
  ok(bodies.find((b) => b.id === "carla")?.bytes === BODY.length, "…with its real size");
  ok((idx.body?.guns ?? []).map((g) => g.file).join() === "hk416.glb", "guns list only the gun model");
  ok((idx.body?.props ?? []).map((g) => g.file).join() === "shotgun.glb", "props list only props/*.glb");
  ok(idx.body?.sounds?.sounds?.["step-concrete"]?.group === "footsteps", "the sound manifest rides along");
  ok(!JSON.stringify(idx.body).includes("secret") && !JSON.stringify(idx.body).includes("outside"), "nothing outside the areas is named");

  // ---- A FILE ------------------------------------------------------------
  const r1 = await raw("/api/survivorz/asset/body/carla.glb", admin);
  const b1 = Buffer.from(await r1.arrayBuffer());
  ok(r1.status === 200 && b1.equals(BODY), "a body streams exactly its bytes");
  ok(r1.headers.get("content-type") === "model/gltf-binary", "…as model/gltf-binary");
  ok(/no-cache/.test(r1.headers.get("cache-control") ?? "") && !/immutable/.test(r1.headers.get("cache-control") ?? ""), "…no-cache, never immutable (bodies are re-baked)");
  const etag = r1.headers.get("etag");
  ok(!!etag, "…with an ETag");
  ok((await raw("/api/survivorz/asset/body/carla.glb", admin, { "if-none-match": etag })).status === 304, "a matching If-None-Match gets 304");
  await sleep(20);
  const BODY2 = Buffer.from("glTF-carla-rebaked-" + "y".repeat(6000));
  fs.writeFileSync(path.join(TREE, "game", "carla.glb"), BODY2);
  const r2 = await raw("/api/survivorz/asset/body/carla.glb", admin, { "if-none-match": etag });
  const b2 = Buffer.from(await r2.arrayBuffer());
  ok(r2.status === 200 && b2.equals(BODY2) && r2.headers.get("etag") !== etag, "a RE-BAKE is served fresh under a new ETag");
  const g = await raw("/api/survivorz/asset/gun/cal.json", admin);
  ok(g.status === 200 && (await g.text()) === '{"cal":1}', "a gun's calibration json is served");
  const s = await raw("/api/survivorz/sound/step-concrete/a.ogg", admin);
  ok(s.status === 200 && s.headers.get("content-type") === "audio/ogg" && (await s.text()) === "OggS-step", "a sound take streams as audio/ogg");
  const tex = await raw("/api/survivorz/asset/guntex/hk416-base.jpg", admin);
  ok(tex.status === 200 && tex.headers.get("content-type") === "image/jpeg", "a gun texture is served");

  // ---- THE EFFECTS FOLDER (subfolders allowed) ----------------------------
  const fx = async (u) => { const r = await raw("/api/survivorz/fx/" + u, admin); return { status: r.status, text: await r.text(), type: r.headers.get("content-type") }; };
  ok((await raw("/api/survivorz/fx/sheet.webp")).status === 401, "fx: anonymous refused 401");
  ok((await raw("/api/survivorz/fx/sheet.webp", member)).status === 403, "fx: a member refused 403");
  let f = await fx("sheet.webp");
  ok(f.status === 200 && f.text === "RIFF-sheet" && f.type === "image/webp", "fx: a sheet at the top level");
  f = await fx("blood/decals/splat.png");
  ok(f.status === 200 && f.text === "PNG-splat", "fx: a decal two folders down");
  f = await fx("a/b/c/deep.ktx2");
  ok(f.status === 200 && f.text === "KTX-deep" && f.type === "image/ktx2", "fx: three folders down, .ktx2");
  f = await fx("pieces/arm.glb");
  ok(f.status === 200 && f.text === "glTF-arm", "fx: a cut piece (.glb)");
  for (const [u, what] of [
    ["a/b/c/d/too-deep.png", "four folders down (past the limit)"],
    [".hidden/x.png", "a hidden folder"],
    ["notes.txt", "a .txt"],
    ["..%2Fsecret.glb", "encoded ../ out of fx"],
    ["blood/..%2F..%2Fsecret.glb", "encoded ../ from a subfolder"],
    ["..%2Fgame/carla.glb", "a dot-dot folder into another area"],
    ["blood%2Fdecals/splat.png", "an encoded slash inside a segment"],
    ["blood/decals", "a folder, not a file"],
  ]) {
    f = await fx(u);
    ok(f.status === 404 && !/SECRET|glTF|PNG|KTX/.test(f.text), `fx: 404, nothing leaked: ${what}`);
  }

  // ---- NOTHING ELSE ------------------------------------------------------
  const refused = [
    ["/api/survivorz/asset/nope/carla.glb", "an unknown area"],
    ["/api/survivorz/asset/constructor/carla.glb", "a prototype-named area"],
    ["/api/survivorz/asset/__proto__/carla.glb", "__proto__ as an area"],
    ["/api/survivorz/asset/body/notes.json", "a json in the bodies area"],
    ["/api/survivorz/asset/body/.hidden.glb", "a hidden file"],
    ["/api/survivorz/asset/body/dir.glb", "a directory named like a file"],
    ["/api/survivorz/asset/body/missing.glb", "a file that isn't there"],
    ["/api/survivorz/asset/body/..%2Fsecret.glb", "encoded ../ to the tree root"],
    ["/api/survivorz/asset/body/..%2F..%2Foutside.glb", "encoded ../../ out of the tree"],
    ["/api/survivorz/asset/body/%2E%2E%2Fprops%2Fshotgun.glb", "encoded traversal into a sibling area"],
    ["/api/survivorz/asset/body/..%5Csecret.glb", "a backslash traversal"],
    ["/api/survivorz/asset/prop/guns", "a folder name with no extension"],
    ["/api/survivorz/asset/prop/..%2Fsecret.glb", "traversal from the props area"],
    ["/api/survivorz/sound/step-concrete/a.wav", "a sound that isn't .ogg"],
    ["/api/survivorz/sound/..%2F..%2F..%2F/secret.glb", "a traversing sound id"],
    ["/api/survivorz/sound/../manifest.json", "a dot-dot sound id"],
    ["/api/survivorz/sound/step.concrete/a.ogg", "a sound id with a dot"],
  ];
  for (const [u, what] of refused) {
    const r = await raw(u, admin);
    const t = await r.text();
    ok(r.status === 404 && !t.includes("SECRET") && !t.includes("glTF") && !t.includes("RIFF"), `404, nothing leaked: ${what}`);
  }

  // ---- THE FACILITY SANDBOX (admin) --------------------------------------
  ok((await raw("/api/survivorz/facility")).status === 401, "facility: anonymous refused 401");
  ok((await raw("/api/survivorz/facility", member)).status === 403, "facility: a member refused 403");
  ok((await api("POST", "/api/survivorz/facility/sandbox", { token: member, body: { op: "reset" } })).status === 403, "facility sandbox: a member refused 403");
  const fv = await api("GET", "/api/survivorz/facility?keycard=0&nimble=5", { token: admin });
  ok(fv.status === 200 && fv.body?.problems?.length === 0 && fv.body?.map?.rooms?.length > 40, "the admin reads the facility: the draft map, no problems");
  ok(fv.body?.reach?.includes("reception") && !fv.body?.reach?.includes("labs-corridor"), "no card: the lobby is reachable and the labs aren't");
  const wk = await api("GET", "/api/survivorz/facility?keycard=1&nimble=5", { token: admin });
  ok(wk.status === 200 && wk.body?.reach?.includes("labs-corridor"), "a tier 1 card earns the labs (no calendar)");
  ok((await api("POST", "/api/survivorz/facility/sandbox", { token: admin, body: { op: "week", week: 2 } })).status === 400, "the old week lever is gone");
  const dr = await api("POST", "/api/survivorz/facility/sandbox", { token: admin, body: { op: "door", door: "res-bunks-a", action: "close", at: "res-corridor" } });
  ok(dr.body?.result?.ok && dr.body?.state?.doors?.["res-bunks-a"]?.open === false, "a sandbox door shuts");
  const zh = await api("POST", "/api/survivorz/facility/sandbox", { token: admin, body: { op: "door", door: "safe-res-door", action: "hit", at: "res-corridor", as: "outside", damage: 9999 } });
  ok(zh.body?.result?.ok === false && zh.body?.state?.doors?.["safe-res-door"]?.health === 300, "a zombie's blow on the safe door does nothing");
  ok((await api("POST", "/api/survivorz/facility/sandbox", { token: admin, body: { op: "nope" } })).status === 400, "an unknown op is a 400");
  ok((await api("POST", "/api/survivorz/facility/sandbox", { token: admin, body: { op: "power", zone: "__proto__" } })).status === 400, "power for a zone that doesn't exist is a 400");
  await api("POST", "/api/survivorz/facility/sandbox", { token: admin, body: { op: "reset" } });

  // ---- A MISSING TREE ----------------------------------------------------
  fs.renameSync(TREE, TREE + "-away");
  const gone = await api("GET", "/api/survivorz/assets", { token: admin });
  ok(gone.status === 404 && gone.body?.error === "not_available", "no tree = an honest 404 not_available");
  ok((await raw("/api/survivorz/asset/body/carla.glb", admin)).status === 404, "…and its files 404");
  fs.renameSync(TREE + "-away", TREE);
};

run()
  .catch((e) => { bad++; console.error(e); })
  .finally(() => {
    stop();
    console.log(`\n${n - bad}/${n} passed`);
    if (bad) console.error(bootLog.split("\n").slice(-20).join("\n"));
    setTimeout(() => {
      for (const d of [DATA_DIR, FIX]) try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
      process.exit(bad ? 1 : 0);
    }, 500);
  });
