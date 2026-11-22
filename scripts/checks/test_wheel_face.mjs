// THE WHEEL'S FACE — the wedge you land on is the prize you get.
//
// Run:  npm run build && node scripts/checks/test_wheel_face.mjs
//
// Josh, Aug 2026: "it spins and says it's about to land on what looks like a
// bunny emoji, and when it lands on the bunny what I win is a different emoji
// of the same tier. The wheel and the backend are not synchronised."
//
// They weren't: the client rolled its own random unowned emoji per wedge while
// the server rolled the award separately, so the two only ever agreed by
// accident — and every player saw a different wheel. The face is decided
// server-side now (src/wheel.ts buildFace) and this harness holds it to the
// promise, over a large sample of REAL spins against a REAL server:
//   · the face is 32 long and null exactly where a wedge has no prize
//   · every prize wedge shows an emoji of ITS OWN tier
//   · the LANDED wedge carries exactly the emoji that spin awarded — the
//     assert that would have caught the rabbit
//   · a fresh face every spin (it re-randomises, and isn't frozen)
//   · the wedges advertise prizes you don't already own

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8497;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = path.join(ROOT, "data", "wheelface-harness");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN_PW = "Harness!Admin9xy";
const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW,
    ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
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

// the physical wheel, from src/wheel.ts — a prize wedge is common/rare/
// legendary/talisman; blank, death and mystery advertise nothing
const SLOTS = [
  "mystery", "common", "blank", "common", "rare", "blank", "common", "blank",
  "legendary", "common", "blank", "common", "rare", "blank", "common", "blank",
  "death", "common", "blank", "common", "rare", "blank", "common", "blank",
  "talisman", "common", "blank", "common", "rare", "blank", "common", "blank",
];
const PRIZE = new Set(["common", "rare", "legendary", "talisman"]);

const run = async () => {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + "/health"); if (r.ok) break; } catch {}
    await sleep(250);
  }
  const admin = (await api("POST", "/api/login", { body: { username: "admin", password: ADMIN_PW } })).body?.token;
  const reg = await api("POST", "/api/register", {
    body: { username: "spinner", password: "Sturdy!Passw0rd#9", displayName: "spinner", secret: "vault marmalade lantern quartz 47", acceptTerms: true },
  });
  const tok = reg.body?.token;
  ok(!!admin && !!tok, "admin and a member are signed in");
  // The long run spins as the ADMIN on purpose: the house can't die (wheel.ts
  // immunity), and at 1.5% a mortal is dead long before 200 spins.
  const uid = (await api("GET", "/api/me", { token: admin })).body?.user?.id;
  ok(!!uid, "the house account is the one doing the spinning");

  // ---- the resting face ----------------------------------------------------
  const st = (await api("GET", "/api/wheel", { token: tok })).body;
  ok(Array.isArray(st.face) && st.face.length === 32, `the resting wheel carries 32 wedges (${st.face?.length})`);
  ok(
    st.face.every((f, i) => (PRIZE.has(SLOTS[i]) ? !!f?.file : f === null)),
    "…a prize on every prize wedge, nothing on blank/death/mystery",
  );
  ok(st.face[24]?.code === "talisman", "…and the talisman wedge shows the talisman");

  // the catalog, so a wedge's tier can be checked against its slot
  const cat = (await api("GET", "/api/catalog", { token: tok })).body.catalog;
  const tierOf = new Map();
  for (const [tier, list] of Object.entries(cat)) for (const e of list) tierOf.set(e.code, tier);
  ok(
    st.face.every((f, i) => !f || SLOTS[i] === "talisman" || tierOf.get(f.code) === SLOTS[i]),
    "every wedge advertises an emoji of its OWN tier",
  );

  // ---- the promise, over a long run ---------------------------------------
  const SPINS = 220;
  let emojiWins = 0, mismatches = 0, offTier = 0, ownedShown = 0, sameFace = 0, nearMiss = 0;
  let prevKey = null;
  const seenOnLanded = new Set();
  for (let i = 0; i < SPINS; i++) {
    await api("POST", "/api/admin/spins/reset", { token: admin, body: { userId: uid } });
    const r = await api("POST", "/api/wheel/spin", { token: admin });
    if (r.status !== 200) break;
    const { result, slotIndex, face } = r.body;
    if (!Array.isArray(face) || face.length !== 32) { mismatches++; continue; }
    // the face must never repeat verbatim — it is re-drawn per spin
    const key = face.map((f) => f?.code ?? "-").join("|");
    if (key === prevKey) sameFace++;
    prevKey = key;
    // tiers stay honest on every wedge
    for (let k = 0; k < 32; k++) {
      const f = face[k];
      if (!f) continue;
      // The LANDED wedge is exempt: it carries what was actually paid, and the
      // legendary slot deliberately pays a rare half the time (the near-miss).
      // Showing that rare on the legendary wedge is the wheel telling the
      // truth, which is the whole point of this file.
      if (k === slotIndex) continue;
      if (SLOTS[k] !== "talisman" && tierOf.get(f.code) !== SLOTS[k]) offTier++;
    }
    // THE PROMISE
    if (result.type === "emoji" && result.emoji) {
      emojiWins++;
      if (face[slotIndex]?.code !== result.emoji.code) mismatches++;
      else seenOnLanded.add(result.emoji.tier);
    }
    if (result.type === "talisman" && face[slotIndex]?.code !== "talisman") mismatches++;
    if (SLOTS[slotIndex] === "legendary" && result.type === "emoji" && result.tier === "rare") nearMiss++;
  }
  ok(emojiWins > 30, `the sample actually won emoji (${emojiWins} of ${SPINS} spins)`);
  ok(mismatches === 0, `THE LANDED WEDGE IS THE PRIZE, every time (${mismatches} disagreements)`);
  ok(offTier === 0, `no wedge ever advertised the wrong tier (${offTier} slips)`);
  ok(sameFace === 0, `the face is re-drawn every spin (${sameFace} repeats)`);
  ok(seenOnLanded.size >= 2, `…proven across tiers (${[...seenOnLanded].sort().join(", ")})`);
  // the near-miss is a FEATURE, and the wheel is honest about it
  ok(nearMiss > 0, `the legendary near-miss showed its real (rare) prize (${nearMiss} times)`);

  // ---- the wedges advertise things you don't own --------------------------
  const inv = (await api("GET", "/api/inventory", { token: admin })).body.emoji ?? [];
  const owned = new Set(inv.map((e) => e.code));
  const fresh = (await api("GET", "/api/wheel", { token: admin })).body.face ?? [];
  for (const f of fresh) {
    if (!f || f.code === "talisman") continue;
    if (owned.has(f.code)) ownedShown++;
  }
  ok(owned.size > 20, `the spinner has a collection to exclude (${owned.size} emoji)`);
  ok(ownedShown === 0, `no wedge advertises a prize already collected (${ownedShown} did)`);

  // ---- the mystery box's talisman, in-process ------------------------------
  // ~1 spin in 640 over the wire, so it gets its own deterministic check
  // (Oct 2026 review: the box paid a talisman with a "?" under the pointer).
  {
    const { createRequire } = await import("node:module");
    const req = createRequire(path.join(ROOT, "package.json"));
    const { buildFace, WHEEL_SLOTS } = req(path.join(ROOT, "dist", "wheel.js"));
    const em = (code) => ({ code, name: code, file: `common/${code}.png`, tier: "common" });
    const stub = {
      unownedInTier: () => [em("a"), em("b"), em("c"), em("d"), em("e"), em("f"), em("g"), em("h"), em("i"), em("j"), em("k"), em("l"), em("m")],
      emojiInTier: () => [],
      getEmoji: (c) => (c === "talisman" ? { code: "talisman", name: "Talisman", file: "special/talisman.png", tier: "special" } : null),
    };
    const mi = WHEEL_SLOTS.indexOf("mystery");
    const box = buildFace(stub, { id: 1 }, mi, { type: "talisman", mystery: true });
    ok(box[mi]?.code === "talisman", "a talisman out of the mystery box is shown on the mystery wedge");
    const spins = buildFace(stub, { id: 1 }, mi, { type: "mystery_spins", spins: 2 });
    ok(spins[mi] === null, "…while a box of spins leaves the wedge its own art");
  }

  console.log("");
  if (bad) {
    console.log(bootLog.split("\n").slice(-12).join("\n"));
    console.log(`${n - bad} passed, ${bad} FAILED`);
    process.exit(1);
  }
  console.log(`${n}/${n} wheel-face asserts passed`);
};

run()
  .catch((e) => {
    console.error(e);
    console.log(bootLog.split("\n").slice(-15).join("\n"));
    process.exit(1);
  })
  .finally(() => {
    stop();
    setTimeout(() => process.exit(bad ? 1 : 0), 300);
  });
