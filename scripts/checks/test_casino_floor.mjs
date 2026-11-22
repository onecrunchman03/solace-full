// THE FLOOR harness — the casino's presence wire (/ws-casino, C2).
//
// Drives a REAL server on a throwaway port. What it pins down:
//   · auth: no token = no upgrade
//   · the suit rule: yellow free for everyone; any other color must be OWNED
//     in the backrooms locker (read-only — entering burns nothing)
//   · presence: enter → welcome w/ peers, join/pos/bye fan-out
//   · positions clamp to the hall and relay with pose
//   · seats: first-come, a second claim is refused, MOVING STANDS YOU UP,
//     range-guarded, and standing frees the seat for the next body
//   · emotes: catalog ids only, refused while seated
//   · one body per person: a second socket replaces the first
//   · the wire is presence-only: nothing persisted (a fresh look at the DB
//     after all of it shows no new tables/rows for the floor)

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, readFileSync, existsSync } from "node:fs";
import { WebSocket } from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8493;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "casino-harness");
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
    // pin voice OFF regardless of the repo .env — the 503-when-on-floor
    // assert depends on it (empty strings beat .env: set keys are never
    // overridden by env.ts)
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

const api = async (method, url, { token, body } = {}) => {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
};

let secretSeq = 0;
const register = async (username, password) => {
  const secret = `vault marmalade lantern ${["quartz", "thistle", "harbour", "ember"][secretSeq++ % 4]} 47`;
  const r = await api("POST", "/api/register", { body: { username, password, displayName: username, secret, acceptTerms: true } });
  return r.body?.token ?? null;
};

/** A tiny floor client: collects every frame, exposes waits. */
const floorClient = (token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-casino?token=${encodeURIComponent(token)}`);
    const frames = [];
    const c = {
      ws,
      frames,
      send: (m) => ws.send(JSON.stringify(m)),
      /** newest-first find */
      last: (type) => [...frames].reverse().find((f) => f.type === type),
      async waitFor(type, ms = 2500) {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
          const f = this.last(type);
          if (f) return f;
          await sleep(25);
        }
        return null;
      },
      clear: () => frames.splice(0),
      closed: false,
    };
    ws.on("message", (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
    ws.on("open", () => resolve(c));
    ws.on("close", () => { c.closed = true; });
    ws.on("error", reject);
  });

const run = async () => {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }

  const pw = "Sturdy!Passw0rd#9";
  const alice = await register("alice", pw);
  const bob = await register("bob", pw);
  const carol = await register("carol", pw);
  ok(alice && bob && carol, "three accounts registered");

  // ---- auth --------------------------------------------------------------
  const noAuth = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-casino`);
    ws.on("open", () => resolve("opened"));
    ws.on("error", () => resolve("refused"));
    ws.on("unexpected-response", () => resolve("refused"));
  });
  ok(noAuth === "refused", "no token, no upgrade (401)");

  // ---- the suit rule -------------------------------------------------------
  const a1 = await floorClient(alice);
  a1.send({ type: "enter", suit: "blue" });
  const w0 = await a1.waitFor("welcome");
  ok(w0?.you?.suit === "yellow" && !a1.last("denied"), "an unowned suit color walks in yellow, never turned away");
  a1.clear();
  a1.send({ type: "enter", suit: "yellow" });
  const w1 = await a1.waitFor("welcome");
  ok(!!w1, "yellow is free for everyone");
  ok(Array.isArray(w1?.peers) && w1.peers.length === 0, "first body in sees an empty floor");

  // ---- presence fan-out ------------------------------------------------------
  const b1 = await floorClient(bob);
  b1.send({ type: "enter", suit: "yellow" });
  const wb = await b1.waitFor("welcome");
  ok(wb?.peers?.length === 1 && wb.peers[0].name === "alice", "second body sees the first in the welcome");
  const join = await a1.waitFor("join");
  ok(join?.peer?.name === "bob", "the first body hears the join");

  a1.clear(); b1.clear();
  b1.send({ type: "move", x: 10, y: 8, yaw: 1.5, p: 1 });
  const pos = await a1.waitFor("pos");
  ok(pos && pos.x === 10 && pos.y === 8 && pos.p === 1, "positions relay with pose");
  ok(!b1.last("pos"), "your own move does not echo back");

  await sleep(60); // clear the move rate limit
  b1.send({ type: "move", x: 999, y: -4, yaw: 0, p: 0 });
  const clamped = await a1.waitFor("pos", 1500);
  ok(clamped && clamped.x <= 31 && clamped.y >= 0, "positions clamp to the hall (east wing included)");

  // AIRBORNE is pose 2 (the jump, Aug 2026) — it must survive the relay, or a
  // jumping peer stands still on everyone else's screen. And the clamp has to
  // hold at the new edge: anything that isn't 1 or 2 reads as standing.
  await sleep(60);
  a1.clear();
  b1.send({ type: "move", x: 10.5, y: 8, yaw: 1.5, p: 2 });
  const air = await a1.waitFor("pos", 1500);
  ok(air?.p === 2, "airborne (pose 2) relays — peers see the jump clip");
  await sleep(60);
  a1.clear();
  b1.send({ type: "move", x: 10.6, y: 8, yaw: 1.5, p: 7 });
  const junk = await a1.waitFor("pos", 1500);
  ok(junk?.p === 0, "an out-of-range pose clamps to standing, never relays raw");

  // ---- seats -------------------------------------------------------------------
  a1.clear(); b1.clear();
  a1.send({ type: "sit", seat: 3 });
  const s1 = await a1.waitFor("seat");
  ok(s1?.seat === 3 && s1?.id === w1.you.id, "a free seat is claimed (and confirmed to the sitter)");
  const s1b = await b1.waitFor("seat");
  ok(s1b?.seat === 3, "the room sees the claim");

  b1.clear();
  b1.send({ type: "sit", seat: 3 });
  await sleep(300);
  ok(!b1.frames.some((f) => f.type === "seat" && f.id === wb.you.id), "a taken seat is silently refused");
  b1.send({ type: "sit", seat: 999 });
  await sleep(200);
  ok(!b1.frames.some((f) => f.type === "seat" && f.id === wb.you.id), "seat ids are range-guarded");

  // moving stands you up
  a1.clear(); b1.clear();
  await sleep(60);
  a1.send({ type: "move", x: 12, y: 10, yaw: 0, p: 0 });
  const stood = await b1.waitFor("seat");
  ok(stood?.id === w1.you.id && stood?.seat === null, "moving stands you up (server-enforced)");
  b1.clear();
  b1.send({ type: "sit", seat: 3 });
  const retaken = await b1.waitFor("seat");
  ok(retaken?.seat === 3 && retaken?.id === wb.you.id, "a freed seat can be taken by the next body");

  // ---- emotes --------------------------------------------------------------------
  a1.clear();
  b1.send({ type: "em", id: "hiphop" });
  await sleep(300);
  ok(!a1.frames.some((f) => f.type === "em"), "no dancing in a chair");
  b1.send({ type: "sit", seat: null });
  await b1.waitFor("seat");
  a1.clear();
  b1.send({ type: "em", id: "hiphop" });
  const em = await a1.waitFor("em");
  ok(em?.emote === "hiphop", "a standing emote relays");
  a1.clear();
  b1.send({ type: "em", id: "macarena" });
  await sleep(250);
  ok(!a1.frames.some((f) => f.type === "em"), "unknown emote ids never touch the wire");

  // THE CATALOG IS THE SAME CATALOG IN FOUR PLACES. A dance lives in the
  // client's EMOTES list, in BOTH server relays' id sets, and as a file on
  // disk — and the failure of forgetting one is silent and one-sided: the
  // dancer dances, the room sees nothing (or, missing the file, the room
  // watches a statue). Read the lists out of the source rather than trusting
  // that whoever added the last one updated all four.
  {
    const src = (p) => readFileSync(path.join(ROOT, p), "utf8");
    const ids = (text, start) => {
      const from = text.indexOf(start);
      const body = text.slice(from, text.indexOf("]", from));
      return [...body.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    };
    const wheel = [...src("client/src/backrooms/world.ts")
      .slice(src("client/src/backrooms/world.ts").indexOf("export const EMOTES"))
      .slice(0, 900)
      .matchAll(/id: "([a-z]+)"/g)].map((m) => m[1]);
    const floorIds = ids(src("src/casino/floor.ts"), "const EMOTE_IDS");
    const brIds = ids(src("src/backrooms/net.ts"), "const EMOTE_IDS");
    ok(wheel.length >= 11, `the emote wheel carries every dance (${wheel.length})`);
    ok(wheel.join() === floorIds.join(), "the casino relay's id set matches the wheel");
    ok(wheel.join() === brIds.join(), "the backrooms relay's id set matches the wheel");
    for (const id of wheel) {
      ok(
        existsSync(path.join(ROOT, "client/public/assets/hazmat/emote", `${id}.fbx`)),
        `${id} has its clip on disk`,
      );
    }
    // …and every one of them actually crosses the wire, which is the part a
    // source-text check can't prove.
    let relayed = 0;
    for (const id of wheel) {
      a1.clear();
      b1.send({ type: "em", id });
      const f = await a1.waitFor("em");
      if (f?.emote === id) relayed++;
    }
    ok(relayed === wheel.length, `every catalog dance relays to the room (${relayed}/${wheel.length})`);
  }

  // ---- the bar, as everyone else sees it -------------------------------------------
  // A bottle in somebody's hand is presentation, but it is presentation OTHER
  // PEOPLE depend on: the whole point of moving the drink off the camera and
  // onto the right-hand bone is that a hall full of people getting visibly
  // drunk shouldn't have empty hands.
  a1.clear();
  b1.send({ type: "hold", id: "beer" });
  const held = await a1.waitFor("hold");
  ok(held?.hold === "beer" && held?.id === wb.you.id, "picking up a bottle relays to the room");

  a1.clear();
  b1.send({ type: "hold", id: "absinthe" });
  await sleep(250);
  ok(!a1.frames.some((f) => f.type === "hold"), "an off-catalogue drink never touches the wire");

  a1.clear();
  b1.send({ type: "hold", id: "beer" });
  await sleep(250);
  ok(!a1.frames.some((f) => f.type === "hold"), "re-sending the same hold is not rebroadcast");

  a1.clear();
  b1.send({ type: "drink" });
  const swig = await a1.waitFor("drink");
  ok(swig?.id === wb.you.id, "a swig relays as a one-shot");

  // (That HOLD IS STATE rather than a one-shot — a newcomer's welcome carrying
  // the bottle already in somebody's hand — is asserted on the existing
  // walk-in further down, where a body is already standing around to be found.)
  a1.clear();
  b1.send({ type: "hold", id: "" });
  const emptied = await a1.waitFor("hold");
  ok(emptied?.hold === "", "emptying your hand relays too");
  a1.clear();
  b1.send({ type: "drink" });
  await sleep(250);
  ok(
    !a1.frames.some((f) => f.type === "drink"),
    "drinking with an empty hand is refused — no miming a bottle you don't have",
  );

  // ---- one body per person ----------------------------------------------------------
  const a2 = await floorClient(alice);
  a2.send({ type: "enter", suit: "yellow" });
  await a2.waitFor("welcome");
  const replaced = await a1.waitFor("denied");
  ok(replaced?.error === "replaced", "a second window replaces the first body");

  // ---- bye on disconnect ---------------------------------------------------------------
  b1.clear();
  a2.ws.close();
  const bye = await b1.waitFor("bye", 3000);
  ok(bye?.id === w1.you.id, "a dropped socket leaves the floor");

  // ---- carol never entered — her frames are ignored until enter -------------------------
  const c1 = await floorClient(carol);
  c1.send({ type: "move", x: 5, y: 5, yaw: 0, p: 0 });
  c1.send({ type: "sit", seat: 7 });
  await sleep(250);
  b1.clear();
  await sleep(250);
  ok(!b1.frames.some((f) => f.type === "pos" || f.type === "seat"), "frames before enter are ignored");

  // ---- the voice-token gate (dev env has no LiveKit creds → 503; the REAL
  // assert is the 403 ordering: not-on-floor must refuse before any grant) ---
  const vOff = await api("POST", "/api/casino/voice-token", { token: carol });
  ok(vOff.status === 403, "voice token 403s for a user not on the floor");
  c1.send({ type: "enter", suit: "yellow" });
  await c1.waitFor("welcome");
  const vOn = await api("POST", "/api/casino/voice-token", { token: carol });
  // no LiveKit creds in the harness env — on-floor answers 503 (disabled),
  // never 403: proves the roster gate reads the live floor
  ok(vOn.status === 503, "on the floor: only the LiveKit config stands between you and a grant");
  const vAnon = await api("POST", "/api/casino/voice-token", {});
  ok(vAnon.status === 401, "voice token requires auth");

  // ---- nothing persisted -----------------------------------------------------------------
  // ---- C4: the stage wheel + the stage death mirror a REAL spin ------------
  // The floor's only server-pushed events. Presentational — the spin has
  // already been applied through /api/wheel by the time these fire.
  {
    const dave = await register("dave_c4", "Rt7#mzQp2Lke");
    const erin = await register("erin_c4", "Kw4$vnBt9Xdq");
    const d1 = await floorClient(dave);
    d1.send({ type: "enter", suit: "yellow" });
    await d1.waitFor("welcome");
    const e1 = await floorClient(erin);
    e1.send({ type: "enter", suit: "yellow" });
    await e1.waitFor("welcome");
    await sleep(120);
    d1.clear();
    e1.clear();

    // Dave spins the real wheel while standing on the floor.
    const spin = await api("POST", "/api/wheel/spin", { token: dave });
    ok(spin.status === 200, "a floor member can spin the real wheel");
    const slot = spin.body?.slotIndex;
    ok(Number.isInteger(slot) && slot >= 0 && slot < 32, `the spin returned a slot index (${slot})`);

    const wheelSelf = await d1.waitFor("wheel", 3000);
    const wheelPeer = await e1.waitFor("wheel", 3000);
    ok(!!wheelSelf, "the spinner's own stage wheel turns");
    ok(!!wheelPeer, "everyone else on the floor sees the same wheel turn");
    ok(wheelSelf?.slot === slot, "the stage wheel is told the SERVER's slot, not a guess");
    ok(wheelPeer?.slot === slot, "both clients get the identical slot");
    ok(wheelSelf?.by === wheelPeer?.by, "the frame names who spun");

    // ---- the SLOTS mirror: a pull shows its payline to the room --------------
    // Symbols only — the frame must never carry the payout or a balance.
    {
      const adminLogin = await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } });
      const daveId = (await api("GET", "/api/me", { token: dave })).body?.user?.id;
      await api("POST", "/api/admin/coins", {
        token: adminLogin.body?.token,
        body: { userId: daveId, amount: 200 },
      });
      d1.clear();
      e1.clear();
      const pull = await api("POST", "/api/slots/pull", { token: dave });
      ok(pull.status === 200, `a funded floor member can pull slots (${pull.status})`);
      const slotsSelf = await d1.waitFor("slots", 3000);
      const slotsPeer = await e1.waitFor("slots", 3000);
      ok(!!slotsSelf && !!slotsPeer, "the pull's payline reaches every floor client");
      ok(
        Array.isArray(slotsPeer?.reels) && slotsPeer.reels.length === 3 &&
          JSON.stringify(slotsPeer?.reels) === JSON.stringify(pull.body?.reels),
        "the frame carries the SERVER's three symbols exactly",
      );
      ok(slotsPeer?.coins === undefined && slotsPeer?.payout === undefined && slotsPeer?.result === undefined,
        "the slots frame carries symbols only — no payout, no balance");

      // THE STAKES (Oct 2026): a cabinet's denomination rides the pull. A
      // stake off the list is refused before the wallet is touched.
      const purse = async () => (await api("GET", "/api/slots", { token: dave })).body;
      const p0 = await purse();
      ok(JSON.stringify(p0?.stakes) === JSON.stringify([10, 20, 50, 100]), `GET /api/slots lists the stakes (${JSON.stringify(p0?.stakes)})`);
      for (const bad of [25, 1000, "lots", 0]) {
        const r = await api("POST", "/api/slots/pull", { token: dave, body: { stake: bad } });
        ok(r.status === 400 && r.body?.error === "bad_stake", `a pull at stake ${JSON.stringify(bad)} is refused bad_stake (${r.status})`);
      }
      ok((await purse())?.coins === p0?.coins, "every refused stake left the wallet untouched");
      const big = await api("POST", "/api/slots/pull", { token: dave, body: { stake: 20 } });
      const won = big.body?.result?.type === "win" ? big.body.result.payout : 0;
      ok(big.status === 200 && big.body?.stake === 20, `a pull at stake 20 plays (${big.status})`);
      ok(big.body?.coins === p0.coins - 20 + won, `it costs 20 and pays at that stake (${p0.coins} -> ${big.body?.coins}, won ${won})`);
    }

    // A spin by someone NOT on the floor must not turn the stage wheel — else
    // the hall's centrepiece spins all day for people who aren't in the room.
    // Same account, walked OFF the floor: the cleanest form of the test, and it
    // avoids a sixth registration from one IP (the register rate limit is real
    // and returned 401 with a null token when this used a fresh account).
    d1.ws.close();
    await sleep(200);
    e1.clear();
    const offFloor = await api("POST", "/api/wheel/spin", { token: dave });
    ok(offFloor.status === 200, `the same member can still spin after leaving (${offFloor.status})`);
    await sleep(400);
    ok(!e1.last("wheel"), "a spin by someone off the floor does NOT turn the stage wheel");
    // …and neither does an off-floor slots pull reach the room
    const offPull = await api("POST", "/api/slots/pull", { token: dave });
    ok(offPull.status === 200, `the same member can still pull after leaving (${offPull.status})`);
    await sleep(400);
    ok(!e1.last("slots"), "a pull by someone off the floor shows nothing in the hall");

    // The death frame carries what the ragdoll needs, and only rides a death.
    ok(!e1.last("death"), "no death frame is emitted for an ordinary spin");

    e1.ws.close();
    await sleep(120);
  }

  // ---- POSE 3: OUT COLD (the bar's pass-out, Aug 2026) ---------------------
  // The room has to SEE you go down. Before this the wire clamped anything
  // above 2 to "standing", so a drunk politely stayed on their feet.
  const dA = await floorClient(alice);
  dA.send({ type: "enter", suit: "yellow" });
  await dA.waitFor("welcome");
  const dB = await floorClient(bob);
  dB.send({ type: "enter", suit: "yellow" });
  await dB.waitFor("welcome");
  await sleep(150);
  dA.send({ type: "move", x: 9, y: 9, yaw: 0, p: 3 });
  await sleep(150);
  const downFrame = dB.last("pos");
  ok(downFrame?.p === 3, "a passed-out body relays pose 3 (got " + downFrame?.p + ")");
  dA.send({ type: "move", x: 9.1, y: 9, yaw: 0, p: 9 });
  await sleep(150);
  ok(dB.last("pos")?.p === 0, "…and a garbage pose still reads as standing");
  dA.send({ type: "move", x: 9.2, y: 9, yaw: 0, p: 3 });
  // …with a bottle still in their hand. HOLD IS STATE, NOT A ONE-SHOT: it has
  // to ride the welcome, or somebody walking in mid-evening finds a hall of
  // people getting visibly drunk with nothing in their hands.
  dA.send({ type: "hold", id: "whisky" });
  await sleep(150);
  const late = await floorClient(carol);
  late.send({ type: "enter", suit: "yellow" });
  const wel = await late.waitFor("welcome");
  ok(
    (wel?.peers ?? []).some((pr) => pr.p === 3),
    "…and someone walking in finds them still on the carpet",
  );
  ok(
    (wel?.peers ?? []).some((pr) => pr.hold === "whisky"),
    "…still holding what they were holding",
  );
  late.ws.close();
  dA.ws.close();
  dB.ws.close();
  await sleep(150);

  // ---- THE DRUNK FLAG (Josh's drunk locomotion set, Aug 2026) ---------------
  // `d` rides beside the pose on the same terms: it only decides which
  // locomotion clips a body plays. It has to REACH the room, survive being
  // switched off again, and be there in the welcome snapshot — a peer who
  // starts drinking before you arrive should already be swaying when you do.
  const kA = await floorClient(alice);
  kA.send({ type: "enter", suit: "yellow" });
  await kA.waitFor("welcome");
  const kB = await floorClient(bob);
  kB.send({ type: "enter", suit: "yellow" });
  await kB.waitFor("welcome");
  await sleep(150);
  kA.send({ type: "move", x: 8, y: 8, yaw: 0, p: 0, d: 1 });
  await sleep(150);
  ok(kB.last("pos")?.d === 1, "a drinker's body relays the drunk flag");
  const kLate = await floorClient(carol);
  kLate.send({ type: "enter", suit: "yellow" });
  const kWel = await kLate.waitFor("welcome");
  ok(
    (kWel?.peers ?? []).some((pr) => pr.d === 1),
    "…and someone walking in finds them already swaying",
  );
  kA.send({ type: "move", x: 8.2, y: 8, yaw: 0, p: 0, d: 0 });
  await sleep(150);
  ok(kB.last("pos")?.d === 0, "…and it clears when they sober up");
  kA.send({ type: "move", x: 8.4, y: 8, yaw: 0, p: 0, d: "yes" });
  await sleep(150);
  ok(kB.last("pos")?.d === 0, "…and a garbage value reads as sober, never as an exception");
  kLate.ws.close();
  kA.ws.close();
  kB.ws.close();
  await sleep(150);

  // ---- ONE APPEARANCE, EVERY OBSERVER (the pitch + fold-seed wire, Aug 2026)
  // Josh's core law: what you see of yourself is what the room sees of you.
  // Two fields carry it here: `pt` (look pitch — peers lean the head and tilt
  // a raised pistol with it) and `ds` (the pose-3 ragdoll seed — the fall's
  // OWN move frame names the fold, so every observer, newcomers included,
  // replays the identical collapse instead of each rolling their own).
  const pA = await floorClient(alice);
  pA.send({ type: "enter", suit: "yellow" });
  await pA.waitFor("welcome");
  const pB = await floorClient(bob);
  pB.send({ type: "enter", suit: "yellow" });
  await pB.waitFor("welcome");
  await sleep(150);
  pA.send({ type: "move", x: 7, y: 7, yaw: 0.4, p: 0, pt: -0.6 });
  await sleep(150);
  ok(pB.last("pos")?.pt === -0.6, "look pitch relays — the room's copy of a body leans where its owner looks");
  pA.send({ type: "move", x: 7.1, y: 7, yaw: 0.4, p: 0, pt: 9 });
  await sleep(150);
  ok(pB.last("pos")?.pt === 1.5, "…clamped to a human neck, never relayed raw");
  pA.send({ type: "move", x: 7.2, y: 7, yaw: 0.4, p: 0, pt: "up" });
  await sleep(150);
  ok(pB.last("pos")?.pt === 0, "…and a garbage pitch reads as level, never as an exception");
  // The fold seed: rides the pass-out's own pose-3 frame…
  pA.send({ type: "move", x: 7.3, y: 7, yaw: 0.4, p: 3, pt: 0, ds: 123456789 });
  await sleep(150);
  const foldPos = pB.last("pos");
  ok(foldPos?.p === 3 && foldPos?.ds === 123456789, "the pass-out's fold seed rides its own pose-3 frame");
  // …persists for whoever walks in mid-collapse…
  const pLate = await floorClient(carol);
  pLate.send({ type: "enter", suit: "yellow" });
  const pWel = await pLate.waitFor("welcome");
  ok(
    (pWel?.peers ?? []).some((pr) => pr.p === 3 && pr.ds === 123456789),
    "…and a newcomer's welcome carries it — mid-collapse arrivals fold the same body",
  );
  // …and dies the moment the body stands, so the NEXT fall can't replay it.
  pA.send({ type: "move", x: 7.4, y: 7, yaw: 0.4, p: 0, pt: 0 });
  await sleep(150);
  const upPos = pB.last("pos");
  ok(upPos?.p === 0 && upPos?.ds === 0, "standing up clears the fold seed — the next fall names its own");
  pLate.ws.close();
  pA.ws.close();
  pB.ws.close();
  await sleep(150);

  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"), { readOnly: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  // The RELAY persists nothing — no roster, no positions, no presence table.
  // (casino_inv/casino_locker are the ITEM DRAWER, migration 69 — the gun and
  // the locker are durable purchases, deliberately unlike the bottles. The
  // doctrine this assert guards is that a crash loses nobody anything but
  // where they were standing, and items survive a crash BECAUSE they're rows.)
  ok(!tables.some((t) => /floor|presence|occupant/i.test(t)), "the relay persists NOTHING (no roster tables)");
  ok(tables.includes("casino_inv") && tables.includes("casino_locker"), "the item drawer's tables exist (migration 69)");
  db.close();

  console.log(`\n${n - bad}/${n} casino floor asserts passed`);
  if (bad) {
    console.error("\n--- boot log tail ---\n" + bootLog.slice(-2000));
    process.exitCode = 1;
  }
  stop();
};

run().catch((e) => {
  console.error(e);
  console.error("\n--- boot log tail ---\n" + bootLog.slice(-2000));
  stop();
  process.exitCode = 1;
});
