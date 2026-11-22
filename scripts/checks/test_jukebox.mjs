// THE JUKEBOX harness — the casino's record player, driven against a REAL
// server on a throwaway port.
//
//   npm run build && node scripts/checks/test_jukebox.mjs
//
// A pick costs silver, so this is a money path and gets money-path treatment.
// What it pins down:
//   · a pick costs exactly QUEUE_PRICE and the silver is BURNED — global
//     conservation: the payer's wallet drops by 60 and NO other wallet rises
//   · every refusal is checked BEFORE the wallet: a broke player, a duplicate
//     pick, the record already spinning and the per-person cap all leave the
//     balance untouched (the classic "charged for nothing" bug)
//   · the skip vote is 40% of the people ACTUALLY ON THE FLOOR, one vote each,
//     and a vote from someone who then leaves doesn't count toward it
//   · the clock only runs while somebody is in the room, and a paid pick
//     survives an empty hall rather than being burned through
//   · the wire never carries a balance
//   · the library is admin-only to change and open to read; renames don't
//     touch files, removals do
//   · /music refuses traversal, serves byte ranges (arriving mid-song is a
//     seek), and 404s an unknown name
//   · the duration in the library is the file's REAL length, parsed from its
//     frames — the queue advances on that number


import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { WebSocket } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8496;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "jukebox-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PRICE = 60;
const SKIP_PRICE = 20;

// ---- a synthetic MP3 whose true length we know -------------------------------
// 96 kbps, 44.1 kHz, MPEG1 Layer III: 384-byte frames, 1152 samples each.
// Building the file by hand is the only way to assert the parser reads a
// duration rather than inventing one.
// Header bytes: FF FB = MPEG1 Layer III, no CRC. Byte 2 = 0x94 → bitrate index
// 9 (128 kbps), sample-rate index 1 (48 kHz), no padding.
const HDR = [0xff, 0xfb, 0x94, 0xc4];
const BR_TABLE = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const RATES = [44100, 48000, 32000];

/** What the FORMAT says about this header — the stride the frames must be
 *  written at, and therefore the length the parser has to arrive at. Derived,
 *  not typed: a hand-written stride that disagrees with the header is exactly
 *  what a real decoder refuses (and did, on the first cut of this harness). */
function frameSpec() {
  const bitrate = BR_TABLE[(HDR[2] >> 4) & 0x0f] * 1000;
  const sampleRate = RATES[(HDR[2] >> 2) & 0x03];
  const pad = (HDR[2] >> 1) & 1;
  return { bitrate, sampleRate, frameLen: Math.floor((144 * bitrate) / sampleRate) + pad };
}

function fakeMp3(frames) {
  const { frameLen } = frameSpec();
  const buf = Buffer.alloc(frames * frameLen);
  for (let i = 0; i < frames; i++) {
    const o = i * frameLen;
    buf[o] = HDR[0];
    buf[o + 1] = HDR[1];
    buf[o + 2] = HDR[2];
    buf[o + 3] = HDR[3];
  }
  return buf;
}

function expectedMs(buf) {
  const { sampleRate, frameLen, bitrate } = frameSpec();
  const frames = Math.floor(buf.length / frameLen);
  return { ms: Math.round((frames * 1152 * 1000) / sampleRate), frameLen, bitrate, sampleRate };
}

const ADMIN_PW = "Harness!Admin9xy";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR,
    ADMIN_PASSWORD: ADMIN_PW,
    ALLOW_REGISTRATION: "true",
    REQUIRE_INVITE: "false",
    LIVEKIT_URL: "",
    LIVEKIT_API_KEY: "",
    LIVEKIT_API_SECRET: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let bootLog = "";
srv.stdout.on("data", (d) => { bootLog += d; });
srv.stderr.on("data", (d) => { bootLog += d; });
const stop = () => { try { srv.kill("SIGINT"); } catch {} };
process.on("exit", stop);

const api = async (method, url, { token, body, raw, headers: extra } = {}) => {
  const headers = { ...(extra ?? {}) };
  if (token) headers.authorization = "Bearer " + token;
  if (body !== undefined) headers["content-type"] = "application/json";
  if (raw !== undefined) headers["content-type"] = "audio/mpeg";
  const res = await fetch(BASE + url, {
    method,
    headers,
    body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("json")) { try { json = await res.json(); } catch {} }
  return { status: res.status, body: json, headers: res.headers, res };
};

let secretSeq = 0;
const register = async (username, password) => {
  const secret = `vault marmalade lantern ${["quartz", "thistle", "harbour", "ember"][secretSeq++ % 4]} 47`;
  const r = await api("POST", "/api/register", { body: { username, password, displayName: username, secret, acceptTerms: true } });
  return r.body?.token ?? null;
};

const floorClient = (token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-casino?token=${encodeURIComponent(token)}`);
    const frames = [];
    const c = {
      ws, frames,
      send: (m) => ws.send(JSON.stringify(m)),
      last: (type) => [...frames].reverse().find((f) => f.type === type),
      async waitFor(type, ms = 3000) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
          const f = this.last(type);
          if (f) return f;
          await sleep(25);
        }
        return null;
      },
      clear: () => frames.splice(0),
    };
    ws.on("message", (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
    ws.on("open", () => resolve(c));
    ws.on("error", reject);
  });

const run = async () => {
  for (let i = 0; i < 160; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }

  const { DatabaseSync } = await import("node:sqlite");
  const dbPath = path.join(DATA_DIR, "solace.db");
  const wallets = () => {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare("SELECT id, coins FROM users").all();
    db.close();
    return new Map(rows.map((r) => [r.id, r.coins]));
  };
  const totalCoins = () => [...wallets().values()].reduce((a, b) => a + b, 0);

  const pw = "Sturdy!Passw0rd#9";
  const adminLogin = await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } });
  const admin = adminLogin.body?.token;
  const alice = await register("alice", pw);
  const bob = await register("bob", pw);
  const carol = await register("carol", pw);
  const dan = await register("dan", pw);
  const erin = await register("erin", pw);
  ok(admin && alice && bob && carol && dan && erin, "admin + five accounts");

  // ---- the library: only the house may change it -----------------------------
  const mp3 = fakeMp3(400);
  const truth = expectedMs(mp3);
  const asMember = await api("POST", "/api/admin/jukebox?title=Nope&artist=Nobody", { token: alice, raw: mp3 });
  ok(asMember.status === 403, "a member can't add a record (403)");

  const added = [];
  for (const [title, artist] of [["Alpha", "The Firsts"], ["Beta", "The Seconds"], ["Gamma", "The Thirds"], ["Delta", "The Fourths"], ["Epsilon", "The Fifths"]]) {
    const r = await api("POST", `/api/admin/jukebox?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`, { token: admin, raw: mp3 });
    if (r.status === 200) added.push(r.body.song);
  }
  ok(added.length === 5, `five records added (${added.length})`);
  ok(
    added.length === 5 && added.every((s) => s.durationMs === truth.ms),
    `duration is READ FROM THE FILE — ${added[0]?.durationMs}ms vs the format's ${truth.ms}ms`,
  );

  const notAudio = await api("POST", "/api/admin/jukebox?title=Fake", { token: admin, raw: Buffer.from("this is a text file, not a song") });
  ok(notAudio.status === 415, "a non-MP3 is refused by its bytes (415)");
  const noTitle = await api("POST", "/api/admin/jukebox?title=", { token: admin, raw: mp3 });
  ok(noTitle.status === 400, "a record needs a title (400)");

  const lib = await api("GET", "/api/jukebox", { token: alice });
  ok(lib.status === 200 && lib.body.library.length === 5, "anyone on the floor can READ the library");
  ok(lib.body.price === PRICE, `a pick is advertised at ${PRICE} silver`);

  // ---- the money path --------------------------------------------------------
  // Nobody is on the floor yet, so nothing is playing and nothing is consumed.
  ok(lib.body.state.now === null, "an empty hall plays nothing");

  const seed = async (token, coins) => {
    const me = await api("GET", "/api/me", { token });
    await api("POST", "/api/admin/coins", { token: admin, body: { userId: me.body.user.id, amount: coins } });
    return me.body.user.id;
  };
  const aliceId = await seed(alice, 500);
  const bobId = await seed(bob, 500);
  await seed(carol, 500);
  await seed(dan, 10); // deliberately too poor for a pick OR a vote
  await seed(erin, 2000); // she drains the queue on her own later

  const before = wallets();
  const totalBefore = totalCoins();

  const q1 = await api("POST", "/api/jukebox/queue", { token: alice, body: { songId: added[0].id } });
  ok(q1.status === 200, "alice queues a record");
  const afterOne = wallets();
  ok(before.get(aliceId) - afterOne.get(aliceId) === PRICE, `it cost exactly ${PRICE}`);
  ok(
    [...afterOne.entries()].every(([id, c]) => id === aliceId || c === before.get(id)),
    "…and nobody else's balance moved — the silver is BURNED, not paid to anyone",
  );
  ok(totalCoins() === totalBefore - PRICE, "global conservation: the supply fell by exactly the price");

  // every refusal, and none of them charge
  const beforeRefusals = wallets().get(aliceId);
  const dup = await api("POST", "/api/jukebox/queue", { token: alice, body: { songId: added[0].id } });
  ok(dup.status === 409 && dup.body.error === "already_queued", "the same record twice is refused (409)");
  const ghost = await api("POST", "/api/jukebox/queue", { token: alice, body: { songId: 99999 } });
  ok(ghost.status === 409 && ghost.body.error === "no_song", "a record that doesn't exist is refused");
  const junk = await api("POST", "/api/jukebox/queue", { token: alice, body: { songId: "nine" } });
  ok(junk.status === 400, "a non-numeric id is refused (400)");
  ok(wallets().get(aliceId) === beforeRefusals, "NONE of the refusals took a coin");

  const poorBefore = totalCoins();
  const broke = await api("POST", "/api/jukebox/queue", { token: dan, body: { songId: added[1].id } });
  ok(broke.status === 402 && broke.body.error === "insufficient", "a player who can't afford it gets 402");
  ok(totalCoins() === poorBefore, "…and the supply didn't move");

  // the per-person cap
  await api("POST", "/api/jukebox/queue", { token: alice, body: { songId: added[1].id } });
  await api("POST", "/api/jukebox/queue", { token: alice, body: { songId: added[2].id } });
  const capBefore = wallets().get(aliceId);
  const over = await api("POST", "/api/jukebox/queue", { token: alice, body: { songId: added[3].id } });
  ok(over.status === 409 && over.body.error === "your_limit", "one wallet can't own the whole evening");
  ok(wallets().get(aliceId) === capBefore, "…and the refused pick was free");

  const queued = (await api("GET", "/api/jukebox", { token: alice })).body.state.queue;
  ok(queued.length === 3, `three picks are waiting (${queued.length})`);
  ok(queued.every((e) => e.by === "alice"), "the queue says who paid");
  ok(
    !JSON.stringify(queued).includes("coins") && !JSON.stringify(lib.body.state).includes("coins"),
    "no balance rides the jukebox state",
  );

  // ---- the room's clock ------------------------------------------------------
  const stillWaiting = (await api("GET", "/api/jukebox", { token: alice })).body.state;
  ok(stillWaiting.now === null, "an empty hall still plays nothing — a paid pick isn't burned through");

  const cA = await floorClient(alice);
  cA.send({ type: "enter", suit: "yellow" });
  const welcome = await cA.waitFor("welcome");
  ok(!!welcome, "alice walks onto the floor");
  const jukeFrame = await cA.waitFor("juke");
  ok(!!jukeFrame || !!welcome?.juke, "the welcome frame (or the first push) carries the jukebox");

  await sleep(600);
  const playing = (await api("GET", "/api/jukebox", { token: alice })).body.state;
  ok(playing.now !== null, "somebody in the room starts the music");
  ok(playing.now.id === added[0].id, "…and it's the record that was paid for first");
  ok(playing.now.by === "alice", "…credited to whoever picked it");
  ok(typeof playing.now.posMs === "number" && playing.now.posMs >= 0, "the wire carries a PLAYHEAD, not a start time");
  ok(typeof playing.now.file === "string" && playing.now.file.endsWith(".mp3"), "…and the file to play");
  ok(playing.queue.length === 2, "the record left the queue when it started");

  // ---- the skip vote ---------------------------------------------------------
  ok(playing.listeners === 1 && playing.need === 1, "alone on the floor, one vote is the whole electorate");

  const cB = await floorClient(bob);
  cB.send({ type: "enter", suit: "yellow" });
  await cB.waitFor("welcome");
  const cC = await floorClient(carol);
  cC.send({ type: "enter", suit: "yellow" });
  await cC.waitFor("welcome");
  await sleep(300);

  const three = (await api("GET", "/api/jukebox", { token: alice })).body.state;
  ok(three.listeners === 3, "three on the floor");
  ok(three.need === Math.max(1, Math.ceil(3 * 0.4)), `40% of three is ${three.need} vote(s)`);

  ok(three.skipPrice === SKIP_PRICE, `a vote is advertised at ${SKIP_PRICE} silver`);

  const nowId = three.now.id;
  const beforeVote = wallets();
  const supplyBeforeVote = totalCoins();
  const v1 = await api("POST", "/api/jukebox/skip", { token: alice });
  ok(v1.status === 200 && v1.body.skipped === false, "one vote of two isn't enough");
  const afterVote = wallets();
  ok(beforeVote.get(aliceId) - afterVote.get(aliceId) === SKIP_PRICE, `a vote costs ${SKIP_PRICE}`);
  ok(
    [...afterVote.entries()].every(([id, c]) => id === aliceId || c === beforeVote.get(id)),
    "…and that silver is BURNED too — nobody is paid to be outvoted",
  );
  ok(totalCoins() === supplyBeforeVote - SKIP_PRICE, "global conservation across a vote");

  // The one that matters: a second vote must be REFUSED, not re-billed. A
  // charge-then-dedupe would let an impatient finger drain a wallet on a
  // vote that was already counted.
  const beforeRepeat = wallets().get(aliceId);
  const vRepeat = await api("POST", "/api/jukebox/skip", { token: alice });
  ok(vRepeat.status === 409 && vRepeat.body.error === "already_voted", "voting twice is refused (409)");
  ok(wallets().get(aliceId) === beforeRepeat, "…and costs nothing the second time");
  const stillOne = (await api("GET", "/api/jukebox", { token: alice })).body.state;
  ok(stillOne.votes === 1, "…and is still one vote");

  const v2 = await api("POST", "/api/jukebox/skip", { token: bob });
  ok(v2.body.skipped === true, "the second voter carries it");
  const afterSkip = (await api("GET", "/api/jukebox", { token: alice })).body.state;
  ok(afterSkip.now && afterSkip.now.id !== nowId, "…and the record actually changed");
  ok(afterSkip.votes === 0, "votes reset with the new record");

  // …a vote from OFF the floor is refused, free, before the wallet (Sep
  // 2026 review: "40% of the people ACTUALLY ON THE FLOOR" — a hub vote used
  // to count toward a quorum it wasn't part of)
  const danId = (await api("GET", "/api/me", { token: dan })).body.user.id;
  const offFloorBefore = wallets().get(danId);
  const offFloor = await api("POST", "/api/jukebox/skip", { token: dan });
  ok(offFloor.status === 409 && offFloor.body?.error === "not_on_floor", "a vote from off the floor is refused — the electorate is the room");
  ok(wallets().get(danId) === offFloorBefore, "…and it cost nothing");
  const cD = await floorClient(dan);
  cD.send({ type: "enter", suit: "yellow" });
  await cD.waitFor("welcome");
  await sleep(200);
  // …and someone who can't afford a vote doesn't get one
  const brokeVote = await api("POST", "/api/jukebox/skip", { token: dan });
  ok(brokeVote.status === 402, "a player who can't afford a vote gets 402");
  const afterBroke = (await api("GET", "/api/jukebox", { token: alice })).body.state;
  ok(afterBroke.votes === 0, "…and their vote wasn't counted");
  cD.ws.close();
  await sleep(300);

  // a vote from someone who then leaves stops counting
  await api("POST", "/api/jukebox/skip", { token: carol });
  const withCarol = (await api("GET", "/api/jukebox", { token: alice })).body.state;
  ok(withCarol.votes === 1, "carol's vote is counted while she's here");
  cC.ws.close();
  await sleep(2600); // the engine's tick prunes departed voters
  const withoutCarol = (await api("GET", "/api/jukebox", { token: alice })).body.state;
  ok(withoutCarol.listeners === 2, "carol left");
  ok(withoutCarol.votes === 0, "…and her skip vote left with her");

  // ---- the hall empties ------------------------------------------------------
  const queuedBefore = withoutCarol.queue.length;
  const playingBefore = withoutCarol.now;
  cA.ws.close();
  cB.ws.close();
  await sleep(2600);
  const empty = (await api("GET", "/api/jukebox", { token: alice })).body.state;
  ok(empty.now === null, "the last person out parks the music");
  ok(empty.queue.length === queuedBefore + (playingBefore ? 1 : 0), "…and the paid queue survives an empty hall");
  // …and so does the record that was PLAYING (Oct 2026 review): parking used
  // to throw it away, a lone listener's page refresh included.
  ok(!playingBefore || empty.queue[0]?.id === playingBefore.id, "…the record that was playing goes back to the front of the queue, not into the bin");

  // ---- NOTHING PLAYS THAT NOBODY PAID FOR ------------------------------------
  // Josh's rule: no house shuffle. Drain the paid queue and the machine goes
  // QUIET — the price buys the music, not merely the choice of it.
  const cE = await floorClient(erin);
  cE.send({ type: "enter", suit: "yellow" });
  await cE.waitFor("welcome");
  await sleep(600);
  let s = (await api("GET", "/api/jukebox", { token: erin })).body.state;
  const played = [];
  for (let i = 0; i < 8 && s.now; i++) {
    played.push(s.now.by);
    await api("POST", "/api/jukebox/skip", { token: erin }); // alone → 1 vote skips
    await sleep(200);
    s = (await api("GET", "/api/jukebox", { token: erin })).body.state;
  }
  ok(s.now === null, "past the last paid pick the machine falls SILENT");
  ok(s.queue.length === 0, "…with an empty queue");
  ok(played.length > 0 && played.every((by) => by !== null), "every record that played was somebody's pick");
  await sleep(2600); // a few engine ticks with an empty queue
  const stillQuiet = (await api("GET", "/api/jukebox", { token: erin })).body.state;
  ok(stillQuiet.now === null, "…and it stays silent — the house never puts one on itself");

  // …and one more pick wakes it straight back up, without waiting for a tick.
  const wake = await api("POST", "/api/jukebox/queue", { token: erin, body: { songId: added[1].id } });
  ok(wake.status === 200 && wake.body.state.now !== null, "a pick in a silent room starts it immediately");
  ok(wake.body.state.now.id === added[1].id, "…playing exactly what was picked");
  // EXACTLY ENOUGH IS ENOUGH (Oct 2026 review): spendCoins returns the new
  // balance, and the route read a 0 left as a refusal — the silver burned
  // and the answer was "insufficient", with no record queued.
  {
    const erinId = (await api("GET", "/api/me", { token: erin })).body.user.id;
    const w = new DatabaseSync(dbPath);
    w.prepare("UPDATE users SET coins = ? WHERE id = ?").run(60, erinId);
    w.close();
    const exact = await api("POST", "/api/jukebox/queue", { token: erin, body: { songId: added[2].id } });
    ok(exact.status === 200 && wallets().get(erinId) === 0, `a pick with exactly 60 in the purse goes through (${exact.status}, ${wallets().get(erinId)} left)`);
  }
  cE.ws.close();
  await sleep(200);

  // ---- serving the records ---------------------------------------------------
  const file = added[0].file ?? (await api("GET", "/api/admin/jukebox", { token: admin })).body.songs[0].file;
  const whole = await fetch(`${BASE}/music/${file}`);
  ok(whole.status === 200, "a record serves");
  ok(whole.headers.get("accept-ranges") === "bytes", "…advertising byte ranges (arriving mid-song is a seek)");
  ok((whole.headers.get("cache-control") ?? "").includes("immutable"), "…cache-forever, like every other UUID-named upload");
  const part = await fetch(`${BASE}/music/${file}`, { headers: { range: "bytes=100-199" } });
  const partBuf = Buffer.from(await part.arrayBuffer());
  ok(part.status === 206 && partBuf.length === 100, "a range request gets exactly that range (206)");
  // PERCENT-ENCODED dots, not literal ones: fetch (and curl, and every proxy in
  // between) normalises "../" out of a path before it is ever sent, so the
  // obvious spelling of this test silently asserts nothing. The router
  // decodeURIComponent's its params, so this is the form that actually arrives
  // at the route carrying a traversal.
  const nope = await fetch(`${BASE}/music/%2e%2e%2f%2e%2e%2fsolace.db`);
  const nopeBody = Buffer.from(await nope.arrayBuffer());
  ok(nope.status === 404, "an encoded traversal out of the music folder is refused");
  ok(
    !nopeBody.subarray(0, 16).toString("latin1").startsWith("SQLite"),
    "…and certainly never hands back the database",
  );
  const notMp3 = await fetch(`${BASE}/music/solace.db`);
  ok(notMp3.status === 404, "a name that isn't an .mp3 is refused");
  const missing = await fetch(`${BASE}/music/00000000-0000-0000-0000-000000000000.mp3`);
  ok(missing.status === 404, "an unknown record 404s");

  // ---- rename + remove -------------------------------------------------------
  const memberRename = await api("PATCH", `/api/admin/jukebox/${added[4].id}`, { token: alice, body: { title: "Mine now" } });
  ok(memberRename.status === 403, "a member can't rename a record");
  const renamed = await api("PATCH", `/api/admin/jukebox/${added[4].id}`, { token: admin, body: { title: "Epsilon (remaster)", artist: "The Fifths" } });
  ok(renamed.status === 200 && renamed.body.song.title === "Epsilon (remaster)", "the house renames a record");
  const musicDir = path.join(DATA_DIR, "uploads", "music");
  ok(existsSync(path.join(musicDir, added[4].file)), "…without touching the file");

  const memberDel = await api("DELETE", `/api/admin/jukebox/${added[4].id}`, { token: alice });
  ok(memberDel.status === 403, "a member can't remove a record");
  const filesBefore = readdirSync(musicDir).length;
  const del = await api("DELETE", `/api/admin/jukebox/${added[4].id}`, { token: admin });
  ok(del.status === 200, "the house removes a record");
  await sleep(150);
  ok(readdirSync(musicDir).length === filesBefore - 1, "…and the MP3 goes with the row");
  const after = await api("GET", "/api/jukebox", { token: alice });
  ok(!after.body.library.some((x) => x.id === added[4].id), "…and it's out of the library");

  // ---- the per-listener preference ------------------------------------------
  const badVol = await api("PATCH", "/api/me/prefs", { token: alice, body: { jukebox: { volume: 9 } } });
  ok(badVol.status === 400, "a volume outside 0..1 is refused");
  const setPref = await api("PATCH", "/api/me/prefs", { token: alice, body: { jukebox: { muted: true, volume: 0.25 } } });
  ok(setPref.status === 200 && setPref.body.prefs.jukebox.muted === true && setPref.body.prefs.jukebox.volume === 0.25,
    "muting the jukebox is stored on the ACCOUNT, so it follows a login");

  console.log(`\n${n - bad}/${n} jukebox asserts passed`);
  if (bad) {
    console.error("\n--- boot log tail ---\n" + bootLog.slice(-2500));
    process.exitCode = 1;
  }
  stop();
};

run().catch((e) => {
  console.error(e);
  console.error("\n--- boot log tail ---\n" + bootLog.slice(-2500));
  stop();
  process.exitCode = 1;
});
