// EGO — the goopy shot under Sterling's counter (Josh, Aug 2026).
//
// Pinned, in the order it can hurt:
//  1. THE MONEY. 800 a shot, BURNED; refusals free; haggling ignored; 401 anon.
//  2. THE PROGRAMME. A continuous swell: +1 per shot, draining a dose per four
//     minutes, with the head scale, the fisheye and the baritone all reading
//     the SAME number — so sobering is smooth by construction (Josh: the lens
//     "gradually returns to normal as you sober"). Three is the line; the
//     creak escalates monotonically and pops at eight seconds exactly.
//  3. THE WIRE. Quarter-dose swell relays and PERSISTS, garbage clamps, the
//     shot glass is a legal hold, and egopop lands one seed on every screen —
//     with the graves table untouched (the gun's death, never the Wheel's).

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";
import { WebSocket } from "ws";
import {
  EGO_DOSE_MS, EGO_MAX, EGO_CREAK_MS, EGO_BOOZE_DRAIN,
  egoDecay, egoShot, egoHeadScale, egoFish, egoPitch, egoQuant, egoFromWire, egoCreak,
} from "../../client/src/casino/ego.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8490;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "ego-harness");
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
{
  ok(EGO_DOSE_MS === 240_000 && EGO_MAX === 3, "a dose drains over four minutes, three is the line");
  ok(EGO_CREAK_MS === 8_000, "critical mass creaks for eight seconds");

  // The swell: shots add, the drain is continuous, never negative.
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  ok(near(egoShot(0), 1) && near(egoShot(1.5), 2.5), "a shot is one dose on the meter");
  ok(near(egoDecay(1, EGO_DOSE_MS), 0), "…and one dose drains in exactly four minutes");
  ok(near(egoDecay(2, EGO_DOSE_MS / 2), 1.5), "…continuously, not in steps");
  ok(egoDecay(0.1, EGO_DOSE_MS) === 0, "…and never below sober");

  // LIQUOR PRESERVES CONFIDENCE (Josh, Aug 2026): drunk, the swell drains at
  // half speed — and the two-arg call every original caller makes is unchanged.
  ok(EGO_BOOZE_DRAIN === 0.5, "drink halves the drain, no more");
  ok(near(egoDecay(2, EGO_DOSE_MS, true), 1.5), "a drinking head holds its swell twice as long");
  ok(near(egoDecay(2, EGO_DOSE_MS, false), 1) && near(egoDecay(2, EGO_DOSE_MS), 1),
    "…and sober drains exactly as it always did (two- and three-arg agree)");

  // The head: +40% per dose, CONTINUOUS in the swell — the deflate is smooth.
  ok(near(egoHeadScale(0), 1) && near(egoHeadScale(1), 1.4) && near(egoHeadScale(3), 2.2),
    "the head is 1.0 / 1.4 / 2.2× at zero, one and three doses");
  ok(near(egoHeadScale(1.5), 1.6), "…and every value between (the deflate never ticks)");

  // The lens tracks the swell and dies with it — Josh's "gradually returns".
  ok(egoFish(0) === 0 && egoFish(EGO_MAX) === 1, "the fisheye runs flat to full across the swell");
  {
    let last = -1, slips = 0;
    for (let s = 0; s <= EGO_MAX + 1e-9; s += 0.05) {
      const f = egoFish(s);
      if (f < last - 1e-9) slips++;
      last = f;
    }
    ok(slips === 0, "…monotone: as the head shrinks the lens only ever flattens (61 samples)");
  }
  ok(egoFish(1) < 0.35, "…eased: the first shot is a suggestion, not an aquarium");

  // The voice: deeper per dose, gentle, silent at zero. Composes with star
  // dust's helium by multiplication and must stay inside the shifter's rails.
  ok(egoPitch(0) === 1, "sober voices keep their own pitch");
  ok(egoPitch(1) < 1 && egoPitch(2) < egoPitch(1) && egoPitch(3) < egoPitch(2),
    `deeper and grander per dose (${egoPitch(1).toFixed(3)} → ${egoPitch(3).toFixed(3)})`);
  ok(egoPitch(3) * 1 >= 0.45 && egoPitch(3) * 1.66 <= 1.9,
    "…and composed with full star dust it stays inside the worklet's rails");

  // The wire: quarter-doses, clamped, round-tripping close enough to draw.
  ok(egoQuant(1) === 4 && egoQuant(3) === 12 && egoQuant(99) === 12, "swell rides as quarter-doses, clamped");
  ok(near(egoFromWire(egoQuant(1.75)), 1.75), "…and a quarter-dose survives the round trip");

  // The creak: monotone strain, pops at eight seconds exactly.
  {
    let last = -1, slips = 0;
    for (let ms = 0; ms <= EGO_CREAK_MS; ms += 100) {
      const c2 = egoCreak(ms);
      if (c2.strain < last - 1e-9) slips++;
      last = c2.strain;
    }
    ok(slips === 0, "the creak only ever worsens (81 samples)");
  }
  ok(!egoCreak(EGO_CREAK_MS - 1).done && egoCreak(EGO_CREAK_MS).done, "…and the head goes at eight seconds exactly");
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
  const PRICE = shop.body.egoPrice;
  ok(PRICE === 800, `the counter advertises ${PRICE} a shot`);

  const broke = await api("POST", "/api/shop/ego", { token: alice });
  ok(broke.status === 402, "no silver, no confidence (402)");
  const beforeRefusal = totalCoins();
  await api("POST", "/api/shop/ego", { token: alice });
  ok(totalCoins() === beforeRefusal, "…and a refusal costs nothing at all");

  await api("POST", "/api/admin/coins", { token: admin, body: { userId: aliceId, amount: PRICE + 25 } });
  const before = totalCoins();
  const buy = await api("POST", "/api/shop/ego", { token: alice });
  ok(buy.status === 200, "with silver in hand, Sterling pours");
  ok(buy.body.coins === 25, `the buyer is down exactly ${PRICE} (${buy.body.coins} left)`);
  ok(totalCoins() === before - PRICE, "…and the world's silver is down the same — BURNED, not paid to anyone");

  const haggle = await api("POST", "/api/shop/ego", { token: alice, body: { price: 1 } });
  ok(haggle.status === 402, "nobody talks Sterling down (the body is ignored; 25 silver is not 800)");

  const anon = await fetch(BASE + "/api/shop/ego", { method: "POST" });
  ok(anon.status === 401, "a stranger can't buy confidence (401)");

  // ---- 3. THE WIRE ------------------------------------------------------------
  const A = await floorClient(alice);
  const B = await floorClient(bob);
  A.send({ type: "enter", suit: "yellow" });
  B.send({ type: "enter", suit: "yellow" });
  await A.waitFor("welcome");
  await B.waitFor("welcome");
  await sleep(150);

  A.clear();
  B.send({ type: "hold", id: "ego" });
  const held = await A.waitFor("hold");
  ok(held?.hold === "ego" && held?.id === bobId, "the shot glass rides the hold wire");

  A.clear();
  B.send({ type: "ego", v: 4 });
  const e1 = await A.waitFor("ego");
  ok(e1?.v === 4 && e1?.id === bobId, "a swelling head reaches the room");

  A.clear();
  B.send({ type: "ego", v: 4 });
  await sleep(200);
  ok(!A.last("ego"), "…but a no-change frame stays off the wire");

  A.clear();
  B.send({ type: "ego", v: 99 });
  const clamped = await A.waitFor("ego");
  ok(clamped?.v === 12, "a garbage swell is CLAMPED, never believed (99 → 12)");

  // PERSISTED: the newcomer meets the hat size and the shot glass.
  B.send({ type: "ego", v: 8 });
  await sleep(150);
  const C = await floorClient(await register("carol", pw));
  C.send({ type: "enter", suit: "yellow" });
  const welcome = await C.waitFor("welcome");
  const seen = welcome?.peers?.find((p) => p.id === bobId);
  ok(seen?.eg === 8, `a newcomer finds the head already two doses up (eg=${seen?.eg})`);
  ok(seen?.hold === "ego", "…with the glass still in the hand");

  // THE POP. One seed, every observer; and the drugs all clear together.
  B.send({ type: "stardust", hits: 1 }); // riding both, because someone will
  await sleep(120);
  A.clear();
  C.clear();
  B.send({ type: "egopop" });
  const popA = await A.waitFor("egopop");
  const popC = await C.waitFor("egopop");
  ok(popA?.id === bobId, "the room watches the head go");
  ok(!!popA?.seed && popA.seed === popC?.seed, "…the SAME confetti on every screen (one seed)");
  ok(typeof popA?.x === "number" && typeof popA?.y === "number", "…where they were standing");

  A.clear();
  B.send({ type: "egopop" });
  await sleep(250);
  ok(!A.last("egopop"), "a body already on the carpet cannot pop again");

  const D = await floorClient(await register("dave", pw));
  D.send({ type: "enter", suit: "yellow" });
  const w2 = await D.waitFor("welcome");
  const bobNow = w2?.peers?.find((p) => p.id === bobId);
  ok(bobNow?.eg === 0 && bobNow?.sd === 0, "…and EVERY drug is cleared with the head");
  ok(bobNow?.p === 3, "…the body is down");

  ok(graves() === 0, "nobody died: a pop is the gun's death, not the Wheel's");
  const bobShop = await api("GET", "/api/shop", { token: bob });
  ok(bobShop.status === 200, "…and the freshly-modest can still use their account");

  // ---- 4. THE STERLING SPECIAL (Josh, Aug 2026) -------------------------------
  // Drunk + tripping + gassed + swollen AT ONCE earns "The Pharmacist" — the
  // server detects it off the floor's own relay state, so it's asserted here
  // over the same wire. Three of four must NOT be enough.
  const achOf = async (id) =>
    ((await api("GET", `/api/users/${id}/profile`, { token: alice })).body?.achievements ?? []);
  ok(!(await achOf(aliceId)).some((a) => a.id === "pharmacist"),
    "a secret badge is absent before it's earned");
  A.send({ type: "slorp", stage: 1 });
  A.send({ type: "stardust", hits: 1 });
  A.send({ type: "ego", v: 4 });
  await sleep(250);
  ok(!(await achOf(aliceId)).some((a) => a.id === "pharmacist"),
    "three vices out of four is merely a Tuesday — no badge");
  A.send({ type: "move", x: 13, y: 11.6, yaw: 0, p: 0, d: 1, pt: 0 });
  await sleep(300);
  const pharm = (await achOf(aliceId)).find((a) => a.id === "pharmacist");
  ok(!!pharm, "…the fourth — drunk — completes the cocktail: THE PHARMACIST lands");
  ok(pharm?.tier === "gold" && !!pharm?.earnedAt, "…a gold badge, stamped when it happened");
  // …and Sterling slides a note under the door the moment it lands.
  const dms = (await api("GET", "/api/dm", { token: alice })).body?.conversations ?? [];
  ok(dms.some((c) => c.otherUser?.isBot), "…and Sterling's personal note arrived by DM");

  for (const c of [A, B, C, D]) c.ws.close();
  await sleep(150);
};

run()
  .catch((e) => { console.error(e); bad++; })
  .finally(async () => {
    stop();
    await sleep(200);
    console.log(`\n${n - bad}/${n} ego asserts passed`);
    process.exit(bad ? 1 : 0);
  });
