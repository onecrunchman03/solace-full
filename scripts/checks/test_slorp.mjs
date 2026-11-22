// SLORP — the vial under Sterling's counter (Josh, Aug 2026).
//
// Three things worth pinning, in the order they can hurt:
//
//  1. THE MONEY. 1,500 silver, BURNED. The price is the server's, a refusal
//     costs nothing, and the total supply goes down by exactly the price and
//     not a coin more — nobody's wallet grows because somebody took a drug.
//  2. THE PROGRAMME. Ten minutes, three stages, and a schedule that only ever
//     climbs. slorp.ts imports nothing precisely so this can assert the whole
//     timeline without a browser, a GPU or a clock.
//  3. THE WIRE. A stage relays and PERSISTS (a newcomer nine minutes late sees
//     it), garbage is clamped rather than believed, the pop lands the same
//     seeded body on every screen, and a body already on the carpet can't pop
//     again.
//
// What is deliberately NOT here: anything about the account. A pop is the
// gun's death — ten seconds down, a walk back from the entrance — so there is
// no tombstone, no Wake, no estate to test. The one assert about that is at
// the bottom, and it checks the graves table never moves.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, readFileSync } from "node:fs";
import { WebSocket } from "ws";
import {
  SLORP_MS, STAGE_2_AT, STAGE_3_AT, slorpPhase, slorpPitch, slorpNoiseGap, slorpAmp,
} from "../../client/src/casino/slorp.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8494;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "slorp-harness");
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
    LIVEKIT_URL: "",
    LIVEKIT_API_KEY: "",
    LIVEKIT_API_SECRET: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
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

const floorClient = (token) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-casino?token=${encodeURIComponent(token)}`);
    const frames = [];
    const c = {
      ws,
      frames,
      send: (m) => ws.send(JSON.stringify(m)),
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
    };
    ws.on("message", (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
    ws.on("open", () => resolve(c));
    ws.on("error", reject);
  });

// ---- 2. THE PROGRAMME (pure, no server needed) --------------------------------
// Run first: if the schedule is wrong, nothing downstream is worth booting for.
{
  ok(SLORP_MS === 600_000, "the trip is ten minutes");
  const at = (frac) => slorpPhase(SLORP_MS * frac);

  ok(slorpPhase(0).stage === 1, "it starts at stage 1");
  ok(at(0.39).stage === 1 && at(0.41).stage === 2, `stage 2 opens at ${STAGE_2_AT * 10} minutes`);
  ok(at(0.89).stage === 2 && at(0.91).stage === 3, `stage 3 opens at ${STAGE_3_AT * 10} minutes`);
  ok(!slorpPhase(SLORP_MS - 1).done && slorpPhase(SLORP_MS).done, "and it ends at ten minutes exactly");
  ok(slorpPhase(SLORP_MS + 60_000).done, "…and stays ended");
  ok(slorpPhase(SLORP_MS).stage === 0, "a finished trip reports no stage");

  // MONOTONIC: nothing about this ever gets better. Sampled every two seconds
  // across the whole ten minutes.
  let colour = -1, bend = -1, fear = -1, slips = 0;
  for (let ms = 0; ms < SLORP_MS; ms += 2000) {
    const p = slorpPhase(ms);
    if (p.colour < colour - 1e-9 || p.bend < bend - 1e-9 || p.fear < fear - 1e-9) slips++;
    colour = p.colour; bend = p.bend; fear = p.fear;
  }
  ok(slips === 0, "every intensity only ever climbs (300 samples, no slips)");

  // The three effects belong to their stages.
  ok(at(0.05).colour > 0 && at(0.05).bend === 0 && at(0.05).fear === 0, "stage 1 is colour alone");
  ok(at(0.5).bend > 0.1 && at(0.5).fear === 0, "stage 2 bends the room and nothing worse");
  ok(at(0.96).fear > 0.5, "stage 3 is well into the fear");
  ok(at(0.99).colour > 0.9 && at(0.99).bend > 0.9, "…on top of everything before it, not instead");
  // The bend starts BEFORE stage 2 is announced — a drug you notice having
  // already begun (see the comment in slorp.ts).
  ok(at(0.37).bend > 0 && at(0.37).stage === 1, "the room starts moving before stage 2 is called");

  // THE PITCH SLIDE: high, then low, then never settling.
  const early = slorpPitch(at(0.03), 0);
  const mid = slorpPitch(at(0.3), 0);
  ok(early > 1.15, `voices come up sharp first (${early.toFixed(2)}×)`);
  ok(mid < 0.95, `…and sag below where they belong (${mid.toFixed(2)}×)`);
  ok(early > mid, "high to low, in that order (Josh's brief)");
  let lo = 9, hi = 0;
  for (let ms = 0; ms < SLORP_MS; ms += 1000) {
    for (const t of [0, 1234, 5678]) {
      const v = slorpPitch(slorpPhase(ms), t);
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
  }
  ok(lo >= 0.45 && hi <= 1.7, `the pitch stays inside its rails (${lo.toFixed(2)}..${hi.toFixed(2)})`);
  ok(slorpPitch(slorpPhase(SLORP_MS), 0) === 1, "a finished trip pitches nothing");

  // The noises are stage 3 only, and they tighten.
  ok(slorpNoiseGap(at(0.5)) === 0, "no slorping before stage 3");
  ok(slorpNoiseGap(at(0.93)) > slorpNoiseGap(at(0.99)), "…and they come faster as the end does");

  // THE TRIP DOESN'T RESPECT YOUR OTHER PURCHASES (Josh, Aug 2026): slorp
  // amplifies the other drugs' visuals with the bend — 1 exactly with no
  // trip, up to 1.5 and never past it, and monotone with the trip's clock.
  ok(slorpAmp(null) === 1 && slorpAmp(slorpPhase(SLORP_MS)) === 1, "no trip, no amplifier (null and a finished trip)");
  ok(slorpAmp(at(0.05)) === 1, "…and early stage 1 amplifies nothing (the bend hasn't started)");
  {
    let last = 0, slips = 0, top = 0;
    for (let f = 0; f < 1; f += 0.01) {
      const a = slorpAmp(at(f));
      if (a < last - 1e-9) slips++;
      last = a; top = Math.max(top, a);
    }
    ok(slips === 0, "the amplifier only ever climbs with the trip (100 samples)");
    ok(top <= 1.5 + 1e-9 && top > 1.45, `…to 1.5× at the top and never past it (${top.toFixed(3)})`);
  }
}

const run = async () => {
  for (let i = 0; i < 160; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }

  const { DatabaseSync } = await import("node:sqlite");
  const dbPath = path.join(DATA_DIR, "solace.db");
  const db = () => new DatabaseSync(dbPath, { readOnly: true });
  const totalCoins = () => {
    const d = db();
    const t = d.prepare("SELECT COALESCE(SUM(coins),0) AS t FROM users").get().t;
    d.close();
    return t;
  };
  const graves = () => {
    const d = db();
    const t = d.prepare("SELECT COUNT(*) AS t FROM users WHERE disabled = 1").get().t;
    d.close();
    return t;
  };

  const pw = "Sturdy!Passw0rd#9";
  const adminLogin = await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } });
  const admin = adminLogin.body?.token;
  const alice = await register("alice", pw);
  const bob = await register("bob", pw);
  ok(admin && alice && bob, "admin + two accounts");

  const idOf = async (token) => (await api("GET", "/api/me", { token })).body.user.id;
  const aliceId = await idOf(alice);
  const bobId = await idOf(bob);

  // ---- 1. THE MONEY -----------------------------------------------------------
  const shop = await api("GET", "/api/shop", { token: alice });
  const PRICE = shop.body.slorpPrice;
  ok(PRICE === 1500, `the counter advertises ${PRICE} silver`);

  const broke = await api("POST", "/api/shop/slorp", { token: alice });
  ok(broke.status === 402, "no silver, no vial (402)");
  const beforeRefusal = totalCoins();
  await api("POST", "/api/shop/slorp", { token: alice });
  ok(totalCoins() === beforeRefusal, "…and a refusal costs nothing at all");

  await api("POST", "/api/admin/coins", { token: admin, body: { userId: aliceId, amount: PRICE * 2 + 40 } });
  const before = totalCoins();
  const buy = await api("POST", "/api/shop/slorp", { token: alice });
  ok(buy.status === 200, "with silver in hand, Sterling sells it");
  ok(buy.body.coins === PRICE + 40, `the buyer is down exactly ${PRICE} (${buy.body.coins} left)`);
  ok(totalCoins() === before - PRICE, "…and the world's silver is down the same — BURNED, not paid to anyone");

  // The price is the server's. Ask for a cheaper one and you get the real one.
  const before2 = totalCoins();
  const haggle = await api("POST", "/api/shop/slorp", { token: alice, body: { price: 1, amount: 1, coins: 1 } });
  ok(haggle.status === 200 && totalCoins() === before2 - PRICE, "nobody talks Sterling down (the body is ignored)");

  const nowBroke = await api("POST", "/api/shop/slorp", { token: alice });
  ok(nowBroke.status === 402, "…and the third one is refused: 40 silver is not 1,500");

  const anon = await fetch(BASE + "/api/shop/slorp", { method: "POST" });
  ok(anon.status === 401, "a stranger can't buy one (401)");

  // ---- 3. THE WIRE ------------------------------------------------------------
  const A = await floorClient(alice);
  const B = await floorClient(bob);
  A.send({ type: "enter", suit: "yellow" });
  B.send({ type: "enter", suit: "yellow" });
  await A.waitFor("welcome");
  await B.waitFor("welcome");
  await sleep(150);

  A.clear();
  B.send({ type: "slorp", stage: 1 });
  const st1 = await A.waitFor("slorp");
  ok(st1?.stage === 1 && st1?.id === bobId, "a stage change reaches the room");

  A.clear();
  B.send({ type: "slorp", stage: 1 });
  await sleep(200);
  ok(!A.last("slorp"), "…but a no-change frame stays off the wire");

  A.clear();
  B.send({ type: "slorp", stage: 99 });
  const clamped = await A.waitFor("slorp");
  ok(clamped?.stage === 3, "a garbage stage is CLAMPED, never believed (99 → 3)");
  A.clear();
  B.send({ type: "slorp", stage: "everywhere" });
  const junk = await A.waitFor("slorp", 600);
  ok(junk === undefined || junk?.stage === 0, "…and a non-number reads as no trip");

  // PERSISTED: somebody walking in late sees the state the room has watched
  // build, exactly like the bottle in somebody's hand.
  B.send({ type: "slorp", stage: 2 });
  await sleep(150);
  const C = await floorClient(await register("carol", pw));
  C.send({ type: "enter", suit: "yellow" });
  const welcome = await C.waitFor("welcome");
  const seen = welcome?.peers?.find((p) => p.id === bobId);
  ok(seen?.sl === 2, `a newcomer finds the trip already running (sl=${seen?.sl})`);

  // THE POP. The server stamps the consequences; every screen gets the seed.
  A.clear();
  C.clear();
  B.send({ type: "pop" });
  const boomA = await A.waitFor("boom");
  const boomC = await C.waitFor("boom");
  ok(boomA?.id === bobId, "the room watches them come apart");
  ok(!!boomA?.seed && boomA.seed === boomC?.seed, "…the SAME body on every screen (one seed)");
  ok(typeof boomA?.x === "number" && typeof boomA?.y === "number", "…where they were standing");
  ok(boomA?.suit === "yellow", "…wearing what they were wearing");

  A.clear();
  B.send({ type: "pop" });
  await sleep(250);
  ok(!A.last("boom"), "a body already on the carpet cannot pop again");

  // The pop clears the trip: a fresh arrival sees a corpse, not a tripper.
  const D = await floorClient(await register("dave", pw));
  D.send({ type: "enter", suit: "yellow" });
  const w2 = await D.waitFor("welcome");
  const bobNow = w2?.peers?.find((p) => p.id === bobId);
  ok(bobNow?.sl === 0, "…and the trip is over: the stage is cleared with it");
  ok(bobNow?.p === 3, "…the body is down");

  // ---- the account is untouched -------------------------------------------
  ok(graves() === 0, "nobody died: a pop is the gun's death, not the Wheel's");
  const bobShop = await api("GET", "/api/shop", { token: bob });
  ok(bobShop.status === 200, "…and the dead-on-the-carpet can still use their account");

  for (const c of [A, B, C, D]) c.ws.close();
  await sleep(150);

  // ---- EVERY UNIFORM WRITTEN IS A UNIFORM DECLARED -------------------------
  // The freeze bug (Aug 2026): slorp added uEncode to DRUNK_FRAG and to the
  // frame loop's writes, but not to drunkMat's uniforms object — so the first
  // drink threw "cannot set 'value' of undefined" every frame, after the
  // scene rendered into the target and before the quad wrote the canvas: a
  // frozen screen until the meter decayed. Pure-function asserts can't see a
  // material declaration, so this is a SOURCE sweep: every
  // `<mat>.uniforms.<name>.value =` write in CasinoGame.svelte must have
  // `<name>:` declared inside that material's ShaderMaterial block.
  {
    const src = readFileSync(
      path.join(ROOT, "client", "src", "casino", "CasinoGame.svelte"),
      "utf8",
    );
    const writes = [...src.matchAll(/(\w+)\.uniforms\.(\w+)\.value\s*=/g)].map((m) => ({
      mat: m[1],
      uniform: m[2],
    }));
    ok(writes.length >= 8, `the frame loop writes uniforms (${writes.length} sites found)`);
    const missing = [];
    for (const w of writes) {
      const decl = src.indexOf(`const ${w.mat} = new THREE.ShaderMaterial({`);
      if (decl < 0) { missing.push(`${w.mat} (no ShaderMaterial block found)`); continue; }
      const block = src.slice(decl, src.indexOf("})", decl));
      if (!new RegExp(`\\b${w.uniform}\\s*:`).test(block)) missing.push(`${w.mat}.${w.uniform}`);
    }
    ok(
      missing.length === 0,
      `every written uniform is declared on its material${missing.length ? ` — MISSING: ${missing.join(", ")}` : ""}`,
    );
  }
};

run()
  .catch((e) => { console.error(e); bad++; })
  .finally(async () => {
    stop();
    await sleep(200);
    console.log(`\n${n - bad}/${n} slorp asserts passed`);
    process.exit(bad ? 1 : 0);
  });
