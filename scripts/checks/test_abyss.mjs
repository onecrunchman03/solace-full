// THE STONE OF THE ABYSS (Josh, Sep 2026 — src/abyss.ts) over a real server
// on a throwaway port.
//
//  · THE RULES (pure): the abyss tier is BOUND, the stone outranks every
//    tier as an heirloom, the box's stone choice is the one repeatable
//    choice and never runs out.
//  · THE SEED: the stone is in the catalog under its own tier, and its art
//    serves from the repo's bundled dir when the server's emoji folder
//    lacks it (a pull deploys it).
//  · THE STONE IS BOUND: Sterling won't buy it, the Forge won't melt it OR
//    upgrade it, a trade won't carry it on EITHER side, an auction won't list
//    it, a chess stake refuses it — every door before anything moves — a
//    self-revival's burn never picks it, and a real sealGrave carries it out
//    of the grave to the next generation without handing it to the heir.
//  · THE PHRASE: a member without the stone is refused (403, no row); the
//    admin lever hands one over (idempotent, audited); with it in hand the
//    page carries the phrase; saying it opens THE PORTAL once — the frame
//    reaches the speaker's socket and not a bystander's; saying it again is
//    harmless; the lever's revoke takes the stone AND shuts the portal; the
//    admin may hold one; a member is refused the lever.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, mkdirSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const WebSocket = require("ws");
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));
const { ABYSS_TIER, STONE_CODE, STONE_CHOICE, ABYSS_PHRASE, isBound } = require(path.join(ROOT, "dist", "abyss.js"));
const { PANDORA_CHOICES, choiceAvailable } = require(path.join(ROOT, "dist", "pandora.js"));
const { heirlooms } = require(path.join(ROOT, "dist", "mortality.js"));

const PORT = 8512;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(ROOT, "data", "abyss-harness");
const DB = path.join(DATA, "solace.db");

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(DATA, { recursive: true, force: true });
mkdirSync(path.join(DATA, "no-emoji"), { recursive: true });

const server = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: {
    ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_PASSWORD: "Adm1n!Passw0rd#Q",
    ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "",
    // An EMPTY emoji folder: the stone's art must come from the bundled dir.
    EMOJI_DIR: path.join(DATA, "no-emoji"),
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
  return { status: res.status, body: json, headers: res.headers };
};
let regSeq = 0;
const register = async (username) => {
  regSeq++;
  const r = await api("POST", "/api/register", {
    body: { username, password: "Str0ng!Passw0rd#Z", displayName: username, secret: `the far shore answers ${regSeq} 91`, acceptTerms: true },
    headers: { "x-forwarded-for": `10.84.0.${10 + regSeq}` },
  });
  return { token: r.body?.token, id: r.body?.user?.id };
};
const openWs = (token) => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(token)}`);
  const frames = [];
  ws.on("message", (d) => { try { frames.push(JSON.parse(String(d))); } catch { /* skip */ } });
  ws.on("open", () => resolve({ ws, frames, of: (t) => frames.filter((f) => f.type === t) }));
  ws.on("error", reject);
});

const waitUp = async () => {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(BASE + "/health")).ok) return; } catch { /* not yet */ }
    await sleep(250);
  }
  throw new Error("server never came up");
};

const run = async () => {
  await waitUp();
  const st = new Store(DB);

  console.log("— the rules —");
  ok(isBound(ABYSS_TIER) && !isBound("mythic") && !isBound("talisman") && !isBound(undefined), "the abyss tier is bound; nothing else is");
  ok(heirlooms([{ code: "m1", tier: "mythic" }, { code: "t", tier: "talisman" }, { code: STONE_CODE, tier: ABYSS_TIER }, { code: "l1", tier: "legendary" }, { code: "c1", tier: "common" }, { code: "c2", tier: "common" }], 1)[0] === STONE_CODE,
    "the stone outranks every tier as an heirloom — it always comes out of the grave");
  const stoneChoice = PANDORA_CHOICES.find((c) => c.id === STONE_CHOICE);
  ok(!!stoneChoice && stoneChoice.once === false && PANDORA_CHOICES.filter((c) => !c.once).length === 1, "the stone is the box's one repeatable choice");
  ok(choiceAvailable(STONE_CHOICE, [STONE_CHOICE, STONE_CHOICE]) && !choiceAvailable("destroy-goblins", ["destroy-goblins"]), "…and never runs out, while a regime choice does");
  ok(typeof ABYSS_PHRASE === "string" && ABYSS_PHRASE.length > 10, "the phrase exists");

  console.log("\n— the seed —");
  const row = st.getEmoji(STONE_CODE);
  ok(!!row && row.tier === ABYSS_TIER, "the stone is in the catalog under the abyss tier");
  const art = await fetch(`${BASE}/emoji/${row.file}`);
  ok(art.status === 200 && (art.headers.get("content-type") || "").includes("image/png") && (await art.arrayBuffer()).byteLength > 10_000,
    "its art serves from the bundled dir with the server's emoji folder empty");
  ok((await fetch(`${BASE}/emoji/abyss/..%2F..%2Fpackage.json`)).status === 404, "the bundled root is traversal-guarded too");

  console.log("\n— a member without the stone —");
  const adminLogin = await api("POST", "/api/login", { body: { username: "admin", password: "Adm1n!Passw0rd#Q" }, headers: { "x-forwarded-for": "10.84.0.2" } });
  const admin = adminLogin.body.token;
  const A = await register("seeker");
  const B = await register("bystander");
  const a0 = (await api("GET", "/api/abyss", { token: A.token })).body;
  ok(a0.stone === false && a0.phrase === null && a0.opened === false, "no stone, no phrase, no portal");
  const s0 = await api("POST", "/api/abyss/speak", { token: A.token });
  ok(s0.status === 403 && s0.body.error === "no_stone" && st.db.prepare("SELECT COUNT(*) AS n FROM abyss_portal").get().n === 0, "speaking without the stone is refused, nothing recorded");
  ok((await api("POST", "/api/admin/abyss/stone", { token: A.token, body: { userId: A.id } })).status === 403, "a member is refused the lever");

  console.log("\n— the lever —");
  const g1 = await api("POST", "/api/admin/abyss/stone", { token: admin, body: { userId: A.id } });
  const g2 = await api("POST", "/api/admin/abyss/stone", { token: admin, body: { userId: A.id } });
  ok(g1.status === 200 && g1.body.granted === true && g2.body.granted === false && st.ownsEmoji(A.id, STONE_CODE), "the admin hands a stone over — once; the second call finds it held");
  ok(st.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'abyss.stone_grant'").get().n === 2, "…audited");
  const a1 = (await api("GET", "/api/abyss", { token: A.token })).body;
  ok(a1.stone === true && a1.phrase === ABYSS_PHRASE && a1.opened === false && a1.code === STONE_CODE, "with the stone in hand the page carries the phrase");
  const prof = (await api("GET", `/api/users/${A.id}/profile`, { token: B.token })).body;
  ok((prof.inventory ?? []).some((e) => e.code === STONE_CODE && e.tier === ABYSS_TIER), "it shows in the inventory under its tier");

  console.log("\n— the stone is bound —");
  const sell = await api("POST", "/api/shop/sell", { token: A.token, body: { codes: [STONE_CODE] } });
  ok(sell.status === 400 && st.ownsEmoji(A.id, STONE_CODE) && st.getCoins(A.id) === 0, "Sterling will not buy it");
  const melt = await api("POST", "/api/forge/melt", { token: A.token, body: { codes: [STONE_CODE] } });
  ok(melt.status === 400 && st.ownsEmoji(A.id, STONE_CODE), "the Forge will not melt it");
  const trade = await api("POST", "/api/trades", { token: A.token, body: { toUser: B.id, offered: [STONE_CODE], requested: [] } });
  ok(trade.status === 400 && trade.body.error === "bad_items", "a trade will not carry it");
  const auc = await api("POST", "/api/auctions", { token: A.token, body: { code: STONE_CODE, startPrice: 10, hours: 1 } });
  ok(auc.status === 400 && auc.body.error === "bound" && st.ownsEmoji(A.id, STONE_CODE), "an auction will not list it");
  const chess = await api("POST", "/api/chess/challenge", { token: A.token, body: { kind: "emoji", code: STONE_CODE, minutes: 3 } });
  ok(chess.status >= 400 && chess.body.error === "bound" && st.ownsEmoji(A.id, STONE_CODE), "a chess stake refuses it");
  const wanted = await api("POST", "/api/trades", { token: B.token, body: { toUser: A.id, offered: [], requested: [STONE_CODE] } });
  ok(wanted.status === 400 && st.ownsEmoji(A.id, STONE_CODE), "…and nobody can DEMAND it in a trade either");
  const up = await api("POST", "/api/forge/upgrade", { token: A.token, body: { code: STONE_CODE } });
  ok(up.status >= 400 && st.ownsEmoji(A.id, STONE_CODE), "the Forge will not upgrade it — there is no rung above the abyss");
  // A self-revival burns a third of the collection — never the stone. In
  // process, on a member of its own (a death ends every session): a stone,
  // a purse and nine commons, kill, buy back.
  const M = await register("mortal");
  st.addEmoji(M.id, STONE_CODE);
  const commons = st.emojiInTier("common").slice(0, 9).map((e) => e.code);
  for (const c of commons) st.addEmoji(M.id, c);
  st.addCoins(M.id, 500);
  st.killUser(M.id, "wheel");
  const rev = st.selfRevive(M.id);
  ok(rev.ok === true && rev.burned.length === 3 && !rev.burned.includes(STONE_CODE) && st.ownsEmoji(M.id, STONE_CODE),
    "a self-revival burns a third of the collection and never the stone");

  // THE GRAVE GIVES IT BACK. The claim in src/abyss.ts ("the rarest thing a
  // grave can hold, so the next generation always carries it out") rests on
  // TIER_WEIGHT.abyss, far from where it is felt — drive the real sealing.
  const H = await register("heir");
  const G = await register("grave");
  st.addEmoji(G.id, STONE_CODE);
  for (const c of st.emojiInTier("mythic").slice(0, 6).map((e) => e.code)) st.addEmoji(G.id, c);
  st.setLegacy(G.id, { willBeneficiaryId: H.id });
  st.killUser(G.id, "wheel");
  const sealed = st.sealGrave(G.id);
  ok(sealed.sealed === true && st.ownsEmoji(G.id, STONE_CODE), "a sealed grave carries the stone into the next generation");
  ok(!st.ownsEmoji(H.id, STONE_CODE), "…and the will's heir never receives it, however rich the estate");

  console.log("\n— the phrase —");
  const wsA = await openWs(A.token);
  const wsB = await openWs(B.token);
  await sleep(200);
  const say = await api("POST", "/api/abyss/speak", { token: A.token });
  await sleep(300);
  ok(say.status === 200 && say.body.opened === true && say.body.first === true, "saying it opens the portal");
  ok(wsA.of("abyss.opened").length === 1 && wsB.of("abyss.opened").length === 0, "…the frame reaches the speaker and not a bystander");
  const a2 = (await api("GET", "/api/abyss", { token: A.token })).body;
  ok(a2.opened === true && a2.openedAt === say.body.openedAt && st.abyssOpenedAt(A.id) === say.body.openedAt, "the page reads the portal open");
  const again = await api("POST", "/api/abyss/speak", { token: A.token });
  await sleep(200);
  ok(again.status === 200 && again.body.first === false && again.body.openedAt === say.body.openedAt && wsA.of("abyss.opened").length === 1 && st.db.prepare("SELECT COUNT(*) AS n FROM abyss_portal").get().n === 1,
    "saying it again is harmless — one row, no second frame");

  console.log("\n— the revoke, and the house —");
  const rv = await api("POST", "/api/admin/abyss/stone", { token: admin, body: { userId: A.id, revoke: true } });
  const a3 = (await api("GET", "/api/abyss", { token: A.token })).body;
  ok(rv.status === 200 && rv.body.revoked === true && !st.ownsEmoji(A.id, STONE_CODE) && a3.stone === false && a3.opened === false && st.abyssOpenedAt(A.id) === null,
    "the revoke takes the stone and shuts the portal with it");
  ok((await api("POST", "/api/abyss/speak", { token: A.token })).status === 403, "…and the phrase is refused again");
  const adminMe = (await api("GET", "/api/me", { token: admin })).body.user;
  const ga = await api("POST", "/api/admin/abyss/stone", { token: admin, body: { userId: adminMe.id } });
  ok(ga.status === 200 && ga.body.granted === true && (await api("GET", "/api/abyss", { token: admin })).body.stone === true, "the admin may hold one (Josh tests with it)");

  wsA.ws.close();
  wsB.ws.close();
  st.close?.();
};

run()
  .catch((e) => { console.error(e); bad++; })
  .finally(() => {
    stop();
    console.log(`\n${n - bad}/${n} passed${bad ? ` — ${bad} FAILED` : ""}`);
    process.exit(bad ? 1 : 0);
  });
