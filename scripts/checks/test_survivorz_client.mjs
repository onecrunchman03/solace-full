// SOLACE SURVIVORZ — THE SHOW PAGE LASTS A MONTH: the client's long-run rules, pure, on a fake clock.
//
// The stream is one unattended browser tab for four weeks. These pin the pieces of that which are
// plain logic (the rest — a lost GPU context reloading, the socket's stall watch — are in the code's
// comments and the 24 h soak):
//  1. THE ROOMS' BUDGETS (client/src/survivorz/fx/budget.ts): kept marks, merged gore/wreckage and
//     held limbs keep at most N per room, the OLDEST going first, other rooms untouched.
//  2. THE CORPSE BUDGET: the newest settled corpses are drawn, per room and in all; older hidden.
//  3. A FAILED LOAD IS TRIED AGAIN (show/retry.ts): inside its backoff callers share the failure (no
//     hammering), after it the next caller loads afresh, the backoff doubles to a cap, a success
//     forgets the failures, and a value that loaded is never loaded twice.
//  4. A NEW RUN is a change only between two named runs (show/director.ts runOf / runChanged).
//  5. THE CAST'S FILES ASKED FOR EARLY (show/preload.ts): survivors first, each file once.
//  6. A STEP THAT NEVER COMES BACK FAILS (assetcache.ts within): a hang is a failure that's retried.
//  7. THE SHOW'S FILES KEPT ON THIS MACHINE (assetcache.ts): over a real server and a stand-in store — kept,
//     asked again with If-None-Match, a re-bake fetched, a kept copy through a restart's 502 but never a
//     403, two asks one download, a cut-off or stalled download a failure and never kept, sign-out empties it.

import { overBudget, corpsesOverBudget, DECAL_CHUNKS_PER_ROOM, KEPT_CHUNKS_PER_ROOM, LIMBS_PER_ROOM } from "../../client/src/survivorz/fx/budget.ts";
import { LoadCache, retryWait, RETRY_BASE_MS, RETRY_MAX_MS } from "../../client/src/survivorz/show/retry.ts";
import { runOf, runChanged } from "../../client/src/survivorz/show/director.ts";
import { castFiles } from "../../client/src/survivorz/show/preload.ts";
import { cachedBytes, dropAssetCache, FetchError, holdLate, useKept, within } from "../../client/src/survivorz/assetcache.ts";

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error(`  ✗ ${n}. ${name}`); } else console.log(`  ✓ ${n}. ${name}`); };

console.log("THE ROOMS' BUDGETS");
{
  // a room's chunks pushed in age order; keep adding to one room and evict as the code does
  let list = [];
  let made = 0;
  for (let i = 0; i < 40; i++) {
    const room = i % 5 === 0 ? "lab" : "hall";
    for (const old of overBudget(list, (c) => c.room === room, DECAL_CHUNKS_PER_ROOM)) list.splice(list.indexOf(old), 1);
    list.push({ room, id: made++ });
  }
  const hall = list.filter((c) => c.room === "hall"), lab = list.filter((c) => c.room === "lab");
  ok(hall.length === DECAL_CHUNKS_PER_ROOM, `a room filled without end keeps ${DECAL_CHUNKS_PER_ROOM} chunks`);
  ok(hall.every((c, i, a) => i === 0 || c.id > a[i - 1].id) && hall[hall.length - 1].id === 39, "...the newest ones (the oldest went first)");
  ok(lab.length === DECAL_CHUNKS_PER_ROOM && lab.map((c) => c.id).join() === "20,25,30,35", "another room keeps its own, untouched by the busy one");
  ok(overBudget([{ r: "a" }, { r: "a" }], (x) => x.r === "a", 3).length === 0, "under the budget nothing goes");
  ok(overBudget([{ r: "a" }, { r: "a" }, { r: "a" }], (x) => x.r === "a", 3).length === 1, "at the budget, one goes to make room");
  ok(KEPT_CHUNKS_PER_ROOM >= 1 && LIMBS_PER_ROOM >= 1, "every budget keeps at least one");
}

console.log("THE CORPSE BUDGET");
{
  const dead = [];
  for (let i = 0; i < 30; i++) dead.push({ id: i, room: i < 20 ? "lab" : `r${i}`, at: 1000 + i });
  const over = new Set(corpsesOverBudget(dead, 6, 24).map((c) => c.id));
  const drawn = dead.filter((c) => !over.has(c.id));
  ok(drawn.filter((c) => c.room === "lab").length === 6, "a room fought in for days draws its 6 newest corpses");
  ok(drawn.filter((c) => c.room === "lab").every((c) => c.id >= 14), "...the newest (oldest hidden first)");
  const tight = new Set(corpsesOverBudget(dead, 6, 12).map((c) => c.id));
  ok(dead.length - tight.size === 12 && !tight.has(29), "and no more than the total anywhere (the newest kept)");
  ok(corpsesOverBudget(dead.slice(0, 3), 6, 12).length === 0, "a few corpses: none hidden");
}

console.log("A FAILED LOAD IS TRIED AGAIN");
{
  ok(retryWait(1) === RETRY_BASE_MS && retryWait(2) === RETRY_BASE_MS * 2 && retryWait(99) === RETRY_MAX_MS, "the backoff doubles from the base to the cap");
  let clock = 0;
  const cache = new LoadCache(() => clock);
  let calls = 0, fail = true;
  const load = () => { calls++; return fail ? Promise.reject(new Error("502")) : Promise.resolve(`body#${calls}`); };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  await cache.get("zombie-m05", load).catch(() => {});
  await settle();
  ok(calls === 1, "the first ask loads");
  await cache.get("zombie-m05", load).catch(() => {});
  clock += RETRY_BASE_MS - 1;
  await cache.get("zombie-m05", load).catch(() => {});
  ok(calls === 1, "inside the backoff every caller shares the failure (no hammering)");
  ok(cache.waitFor("zombie-m05") === 1, "waitFor says how long until it may be tried again");
  clock += 1;
  await cache.get("zombie-m05", load).catch(() => {});
  await settle();
  ok(calls === 2, "after the backoff the next caller loads afresh (a 502 isn't forever)");
  clock += RETRY_BASE_MS;
  await cache.get("zombie-m05", load).catch(() => {});
  ok(calls === 2, "a second failure in a row backs off twice as long");
  clock += RETRY_BASE_MS;
  fail = false;
  const v = await cache.get("zombie-m05", load);
  ok(calls === 3 && v === "body#3", "the deploy over, the load succeeds");
  await settle();
  clock += 1e9;
  const v2 = await cache.get("zombie-m05", load);
  ok(calls === 3 && v2 === "body#3" && cache.waitFor("zombie-m05") === 0, "a value that loaded is kept and never loaded again");
}

console.log("A NEW RUN");
{
  ok(runOf({ type: "snap", run: "seed-7" }) === "seed-7" && runOf({ type: "snap" }) === null, "the snapshot's run is read (absent on an older server)");
  ok(runOf({ type: "snap", run: 42 }) === "42", "a numeric run id reads as its string");
  ok(!runChanged(null, "a") && !runChanged("a", null) && !runChanged("a", "a"), "the first run seen, a run-less snapshot, and the same run are not changes");
  ok(runChanged("a", "b"), "a different run is a change");
}

console.log("THE CAST'S FILES, ASKED FOR EARLY");
{
  const files = castFiles([
    { kind: "zombie", body: "zombie-m05" }, { kind: "survivor", body: "carla" }, { kind: "zombie", body: "zombie-m05" },
    { kind: "survivor", body: "eric", turned: "z:9" }, { kind: "zombie", body: "eric" }, { kind: "survivor", body: "rollo", escaped: true },
    { kind: "survivor", body: "manuel" }, { kind: "zombie", body: "zombie-f01" },
  ]);
  ok(files.join() === "carla,manuel,zombie-m05,eric,zombie-f01", "the survivors' bodies first, then the dead's, each file once (a turned or escaped survivor isn't drawn as themselves)");
}

console.log("A STEP THAT NEVER COMES BACK FAILS");
{
  ok((await within(Promise.resolve(7), 50, "x")) === 7, "a step that answers in time is its answer");
  let why = "";
  await within(new Promise(() => {}), 30, "the decode").catch((e) => { why = e.message; });
  ok(why === "timed out: the decode", "one that never answers is a failure the caller retries (never pending for good)");
}

console.log("THE SHOW'S FILES KEPT ON THIS MACHINE");
{
  ok(useKept(304) && useKept("network") && useKept(502) && useKept(503), "a kept copy answers a 304, and stands in while the server can't answer (a restart)");
  ok(!useKept(401) && !useKept(403) && !useKept(404) && !useKept(200), "...but never a refused, gone or changed file");
  // a stand-in for the Cache Storage API (Node has none): what the store holds, by URL
  const held = new Map();
  globalThis.caches = {
    open: async () => ({
      match: async (u) => (held.has(u) ? new Response(held.get(u).bytes.slice(0), { headers: held.get(u).headers }) : undefined),
      put: async (u, r) => { held.set(u, { bytes: new Uint8Array(await r.arrayBuffer()), headers: Object.fromEntries(r.headers) }); },
      delete: async (u) => held.delete(u),
    }),
    delete: async () => { held.clear(); return true; },
  };
  // a real server: an ETag'd file, a 304 on a match, a door that can be shut, a stall, a short body
  const http = await import("node:http");
  let ver = "a", body = Buffer.alloc(300_000, 7), mode = "ok";
  const seen = [];
  const srv = http.createServer((req, res) => {
    seen.push({ url: req.url, inm: req.headers["if-none-match"] ?? null, auth: req.headers.authorization ?? null });
    if (mode === "down") { res.writeHead(502); return res.end(); }
    if (mode === "shut") { res.writeHead(403); return res.end(); }
    const etag = `"${ver}"`;
    if (req.headers["if-none-match"] === etag) { res.writeHead(304, { etag }); return res.end(); }
    res.writeHead(200, { etag, "content-length": body.length, "content-type": "model/gltf-binary" });
    if (mode === "stall") { res.write(body.subarray(0, 1000)); return; }   // and then nothing, ever
    if (mode === "short") { res.write(body.subarray(0, 1000)); return void setTimeout(() => res.destroy(), 20); }
    res.end(body);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${srv.address().port}/api/survivorz/asset/body/carla.glb`;
  const H = { headers: { authorization: "Bearer t" } };
  const len = (b) => b.byteLength;

  let prog = 0;
  const a = await cachedBytes(url, { ...H, onProgress: (f) => (prog = f) });
  ok(len(a) === 300_000 && new Uint8Array(a)[299_999] === 7 && prog === 1, "a first watch downloads the file (its progress said)");
  await new Promise((r) => setTimeout(r, 20));
  ok(held.has(url) && seen[0].auth === "Bearer t" && seen[0].inm === null, "...with the session, and keeps it");
  const b = await cachedBytes(url, H);
  ok(len(b) === 300_000 && seen[1].inm === '"a"' && seen.length === 2, "the next watch asks with its ETag and is told it's current: the kept copy, no download");
  ver = "b"; body = Buffer.alloc(300_000, 9);
  const c = await cachedBytes(url, H);
  await new Promise((r) => setTimeout(r, 20));
  ok(new Uint8Array(c)[0] === 9 && held.get(url).headers.etag === '"b"', "a re-bake (a new ETag) is downloaded and kept in the old one's place");
  mode = "down";
  const d = await cachedBytes(url, H);
  ok(new Uint8Array(d)[0] === 9, "while the server is restarting (a 502) the kept copy stands in");
  mode = "shut";
  let refused = null;
  await cachedBytes(url, H).catch((e) => { refused = e; });
  await new Promise((r) => setTimeout(r, 20));
  ok(refused instanceof FetchError && refused.status === 403 && !held.has(url), "a door that's shut (off air, a member's session) is refused, and the kept copy goes");
  mode = "ok";
  const [x, y] = await Promise.all([cachedBytes(url, H), cachedBytes(url, H)]);
  ok(len(x) === 300_000 && len(y) === 300_000 && seen.filter((s) => !s.inm).length === 2, "two asking at once is one download (the second reads the kept copy)");
  mode = "short";
  held.clear();
  let short = null;
  await cachedBytes(url.replace("carla", "eric"), H).catch((e) => { short = e; });
  ok(short instanceof FetchError && /short|download/.test(short.message), "a download cut off part way (an HTTP/2 stream reset) fails, never a half file");
  mode = "stall";
  let stalled = null;
  const t0 = Date.now();
  await cachedBytes(url.replace("carla", "nathan"), { ...H, stallMs: 150 }).catch((e) => { stalled = e; });
  ok(stalled instanceof FetchError && /stalled/.test(stalled.message) && Date.now() - t0 < 2000, "a download that stops sending is dropped after its stall time (a hang becomes a failure that's retried)");
  ok(!held.has(url.replace("carla", "eric")) && !held.has(url.replace("carla", "nathan")), "...and neither half file is kept");
  mode = "ok";
  // THE DEAD WAIT FOR THE PICTURE (Nov 13 2026, the review's H5: holdLate). Unpacking a body is seconds of the
  // page's one thread; the dead's were unpacked beside the room and the survivors the picture waits for.
  {
    const z = (name) => url.replace("carla", name);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    holdLate(true);
    let lateIn = false, earlyIn = false, peekIn = false;
    const late = cachedBytes(z("zombie-m01"), { ...H, priority: 2 }).then(() => (lateIn = true));
    const peek = cachedBytes(z("zombie-m02"), { ...H, priority: 2, peek: true }).then(() => (peekIn = true));
    const early = cachedBytes(z("rick"), { ...H, priority: 1 }).then(() => (earlyIn = true));
    await Promise.all([early, peek]);
    await wait(60);
    ok(earlyIn && peekIn && !lateIn, "while the show loads, a survivor's body loads and the dead's are fetched into the store, but none of the dead is unpacked");
    holdLate(false);
    await late;
    ok(lateIn, "...and they go the moment the picture is up");
    holdLate(true, 80);
    let late2 = false;
    const l2 = cachedBytes(z("zombie-m03"), { ...H, priority: 2 }).then(() => (late2 = true));
    await wait(30);
    const before = late2;
    await l2;
    ok(!before && late2, "a hold lets go by itself (a load that never finishes doesn't keep the dead out)");
    // a file already here costs the line nothing: it doesn't queue behind three downloads
    await wait(20);
    mode = "stall";
    const stuck = ["a1", "a2", "a3"].map((name) => cachedBytes(z(name), { ...H, priority: 0, stallMs: 400 }).catch(() => "failed"));
    await wait(40);
    const tk = Date.now();
    const kept = await cachedBytes(z("rick"), { ...H, priority: 0 });
    ok(len(kept) === 300_000 && Date.now() - tk < 300, "a file already kept here doesn't wait behind three downloads for its turn");
    await Promise.all(stuck);
    mode = "ok";
  }
  await dropAssetCache();
  ok(held.size === 0, "signing out empties the store");
  srv.closeAllConnections?.();
  srv.close();
  delete globalThis.caches;
}

console.log(`\n${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
