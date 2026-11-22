// THE PORTAL — the hall behind the stone (PORTAL.md; src/portal/) over a real
// server on a throwaway port (8590).
//
//  · THE DOOR: no portal, no hall (403); coming through files you once, with
//    the next keystone after the hall's own (75), and your stone reads one
//    mark of "onnith" for everyone.
//  · THE WIRE GIVES NOTHING AWAY: a room is glyph ids and separators — no
//    English, no romanised Eshai — and the only sounds sent are the cracked
//    glyphs'. A word's meaning arrives once the reader knows its roots; a
//    post's English once every word in it is readable, and only for them.
//  · THE ROSTER: sixty ghosts, every one with the broken count mark, and you.
//  · DECIPHERING: a wrong glyph claim costs one of three tries a day, a right
//    one cracks it for EVERYONE (and Sterling says so in #general); a word
//    claim needs the word's glyphs cracked and teaches that reader alone.
//  · THE SOURCES ACROSS THE HUB: an etched relic carried through reads its
//    mark (credited, announced, once); a relic outside never does; Sterling
//    hands the Foundry's three to someone who has been through, and only
//    once; saying the words gets his note pointing at /sterling portal.
//  · THE CLAIM WALL: all 34 marks, who read each and how; nothing locked leaks.
//  · THE SURVEY: six galaxies whose catalogues give periods as numeral glyph
//    ids (never digits, never the answer), each with exactly one reading a
//    reader who knows no numeral could believe; the Hiccup and the stopped one
//    in their places; a wrong chart costs one of three tries a day, a right
//    one reads that galaxy's numeral for everyone (credited, announced) or
//    nothing if it is read already; the fold weather only once all six are
//    charted, for that reader alone.
//  · THE NOTATION (kaal-ith's second cipher): letters go out as notation
//    marks until a mark is cracked; a claim names the script glyph (a numeral
//    named is simply wrong, never a free refusal); a right claim cracks it
//    for everyone; the primer read in full is its first crack.
//  · THE GLITCHES: a ghost post re-filed and marked new in a dead room (once),
//    a dead row online for one look, a word unmade — each filed in Tharvend's
//    log as a repair.
//  · ISHAAL: the recorded game replays legally and stands at Paelu's move;
//    Paelu's move is made once, legally, and filed; the hall's players answer
//    every move, and a win reads ONE mark per opponent, ever; live boards
//    between members, guarded by whose move it is.
//  · THE BENCH: only the first exercise open; a run finished too fast, or one
//    whose bleeds would have dropped the fold, pays nothing; a real hold reads
//    a mark and opens the next exercise.
//  · THE VOICE ROOMS: who sits where; no SFU, no token; the playback fault
//    only with clips on disk, filed as a repair.
//  · THE LAST ROOM: shut until every mark is read, then the last pleas,
//    read-only, unreactable; Sterling says something opened.
//  · SPEAKING: only cracked glyphs, only words you know; your post is stamped
//    on the Eshai clock about fifty-four million years after the last plea.
//  · REACTIONS toggle; the hall's changes reach open readers only; the
//    admin's glyph lever is the admin's alone, and audited.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const WebSocket = require("ws");
const { Store } = require(path.join(ROOT, "dist", "db", "store.js"));
const { GLYPH_ID, GLYPH_SOUND, NUMERAL_IDS } = require(path.join(ROOT, "dist", "portal", "glyph-ids.js"));
const { tokenize, SEP, normalise } = require(path.join(ROOT, "dist", "portal", "script.js"));
const { archiveTicks, nowTicks } = require(path.join(ROOT, "dist", "portal", "clock.js"));
const { transliterate } = require(path.join(ROOT, "dist", "portal", "translit.js"));
const { ETCHED_RELICS, STERLING_MARKS } = require(path.join(ROOT, "dist", "portal", "sources.js"));
const { LEVEL_RELIC_SETS, SUBURB_RELICS } = require(path.join(ROOT, "dist", "backrooms", "relics.js"));
const { CHARTS, GALAXIES, SURVEY_REWARD, readings } = require(path.join(ROOT, "dist", "portal", "survey.js"));
const { NOTATION_GLYPH, MARK_OF, NOTATION_BASE } = require(path.join(ROOT, "dist", "portal", "notation-ids.js"));
const R = require(path.join(ROOT, "dist", "portal", "ishaal-rules.js"));
const { botMove } = require(path.join(ROOT, "dist", "portal", "games.js"));
const { BenchState, BENCH } = require(path.join(ROOT, "dist", "portal", "bench-sim.js"));

const PORT = 8590;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = path.join(ROOT, "data", "portal-harness");
const DB = path.join(DATA, "solace.db");
const ARCHIVE = JSON.parse(readFileSync(path.join(ROOT, "assets", "portal", "archive.json"), "utf8"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(DATA, { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });
// The voice rooms' clips, as empty stand-ins: the fault only fires for clips on disk.
const CLIPS = path.join(DATA, "clips");
mkdirSync(CLIPS, { recursive: true });
for (const c of ["ren-taan-1", "ren-taan-2", "keth-ren-1"]) writeFileSync(path.join(CLIPS, `${c}.ogg`), "");
const server = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_PASSWORD: "Adm1n!Passw0rd#Q", ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
    LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "", PORTAL_CLIPS_DIR: CLIPS,
    // only the glitches the harness forces: a random one on any look broke the
    // "nobody else saw it" and repair-count asserts now and then
    PORTAL_GLITCH_CHANCE: "0" },
  stdio: ["ignore", "ignore", "pipe"],
});
server.stderr.on("data", (d) => process.env.VERBOSE && console.error(String(d)));
const stop = () => { try { server.kill("SIGINT"); } catch { /* gone */ } };

const api = async (method, url, { token, body, headers = {} } = {}) => {
  const h = { ...headers };
  if (token) h.authorization = "Bearer " + token;
  if (body !== undefined) h["content-type"] = "application/json";
  const res = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* empty */ }
  return { status: res.status, body: json, text };
};
let regSeq = 0;
const register = async (username) => {
  regSeq++;
  const r = await api("POST", "/api/register", {
    body: { username, password: "Str0ng!Passw0rd#Z", displayName: username, secret: `the far shore answers ${regSeq} 93`, acceptTerms: true },
    headers: { "x-forwarded-for": `10.85.0.${10 + regSeq}` },
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
  for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/health")).ok) return; } catch { /* not yet */ } await sleep(250); }
  throw new Error("server never came up");
};
/** The post in a room response whose tokens spell this Eshai. */
const findPost = (room, eshai) => { const want = JSON.stringify(tokenize(eshai).tokens); return room.posts.find((p) => JSON.stringify(p.tokens) === want); };
const decodeStamp = (tokens) => BigInt("0o" + tokens.filter((t) => t >= 0).map((g) => GLYPH_SOUND[g]).join(""));

const run = async () => {
  await waitUp();
  const st = new Store(DB);
  const adminLogin = await api("POST", "/api/login", { body: { username: "admin", password: "Adm1n!Passw0rd#Q" }, headers: { "x-forwarded-for": "10.85.0.2" } });
  const admin = adminLogin.body.token;
  const A = await register("reader");
  const B = await register("outsider");

  console.log("— the door —");
  ok((await api("GET", "/api/portal", { token: A.token })).status === 403, "no portal, no hall");
  await api("POST", "/api/admin/abyss/stone", { token: admin, body: { userId: A.id } });
  await api("POST", "/api/abyss/speak", { token: A.token });
  const wsA = await openWs(A.token), wsB = await openWs(B.token);
  const o1 = await api("GET", "/api/portal", { token: A.token });
  const o2 = await api("GET", "/api/portal", { token: A.token });
  ok(o1.status === 200 && o1.body.first === true && o1.body.keystone === 0o75 && o2.body.first === false && o2.body.keystone === 0o75,
    "coming through files you once, with keystone 75 — the first after the hall's own");
  const onnith = new Set(tokenize("onnith").tokens);
  const g0 = st.portalGlyphs();
  ok(g0.length === 1 && g0[0].source === "stone" && onnith.has(g0[0].glyph), "your stone reads one mark of \"onnith\", for everyone");
  ok(Object.keys(o1.body.sounds).length === 1 && Object.values(o1.body.sounds)[0] === GLYPH_SOUND[g0[0].glyph], "the only sound sent is that one");
  ok(o1.body.rooms.length === ARCHIVE.rooms.length && o1.body.rooms.find((r) => r.id === "last").name === null, "every room is listed; the last room has no name to spell");

  console.log("\n— the wire gives nothing away —");
  const nr = await api("GET", "/api/portal/rooms/naa-ren", { token: A.token });
  const leaks = ["Digest 13741", "THERUUN", "Heard, and set down", "Naa-ren", "vhaal-maar", "shiu-ren", "Oruun"];
  ok(nr.status === 200 && !leaks.some((w) => nr.text.includes(w)), "a room carries no English and no romanised Eshai");
  ok(nr.body.posts.length === ARCHIVE.posts.filter((p) => p.room === "naa-ren").length && nr.body.posts.every((p) => p.tokens.every((t) => Number.isInteger(t) && t >= -6 && t < 34)),
    "every digest is there, as glyph ids and separators");
  ok(nr.body.posts.every((p) => p.en === null && p.glosses.every((g) => g === null)), "nothing is readable yet");
  const d0 = nr.body.posts[0];
  ok(decodeStamp(d0.stamp) === archiveTicks(0), "the first digest's stamp is the printed one, in numeral glyphs");
  ok((await api("GET", "/api/portal/rooms/last", { token: A.token })).body.locked === true, "the last room is shut");
  const bigRoll = nr.body.posts.find((p) => p.tokens.length > 8000);
  ok(!!bigRoll, "the Fleet roll is in its digest, every name");

  console.log("\n— the roster —");
  const ro = (await api("GET", "/api/portal/roster", { token: A.token })).body.roster;
  const ghosts = ro.filter((r) => r.kind === "ghost"), me = ro.find((r) => r.you);
  ok(ghosts.length === 60 && ghosts.every((g) => g.mark === "ENTRY-X" && !g.online), "sixty ghosts, each with the broken count mark, all offline");
  ok(!!me && me.online && me.mark === null && JSON.stringify(me.name) === JSON.stringify(tokenize(transliterate("reader")).tokens) && transliterate("reader") === "reeder", "and you, online, your name written by sound (\"reeder\")");
  const prof = (await api("GET", "/api/portal/profile/" + encodeURIComponent("g:Iru Vaas"), { token: A.token })).body;
  ok(prof && prof.bio.en === null && prof.bio.tokens.length > 10, "a ghost's profile: its bio in glyphs, unread");

  console.log("\n— deciphering a glyph —");
  const target = GLYPH_ID["a"];
  const wrongs = ["e", "o", "u", "i"].filter((s) => GLYPH_SOUND[target] !== s);
  const r1 = await api("POST", "/api/portal/guess/glyph", { token: A.token, body: { glyph: target, sound: wrongs[0] } });
  const r2 = await api("POST", "/api/portal/guess/glyph", { token: A.token, body: { glyph: target, sound: wrongs[1] } });
  const r3 = await api("POST", "/api/portal/guess/glyph", { token: A.token, body: { glyph: target, sound: wrongs[2] } });
  const r4 = await api("POST", "/api/portal/guess/glyph", { token: A.token, body: { glyph: target, sound: "a" } });
  ok(r1.body.right === false && r1.body.left === 2 && r3.body.left === 0 && r4.status === 429, "three wrong claims a day, then no more — even the right one waits");
  ok(!st.portalGlyphs().some((g) => g.glyph === target), "…and nothing was cracked by guessing");
  const C = await register("cracker");
  await api("POST", "/api/admin/abyss/stone", { token: admin, body: { userId: C.id } });
  await api("POST", "/api/abyss/speak", { token: C.token });
  await api("GET", "/api/portal", { token: C.token });
  const before = wsA.frames.length, beforeB = wsB.frames.length;
  const rc = await api("POST", "/api/portal/guess/glyph", { token: C.token, body: { glyph: target, sound: "A" } });
  await sleep(400);
  ok(rc.body.right === true && st.portalGlyphs().some((g) => g.glyph === target && g.source === "deduction"), "a right claim cracks it — for everyone");
  ok(wsA.frames.slice(before).some((f) => f.type === "portal.changed") && !wsB.frames.slice(beforeB).some((f) => f.type === "portal.changed"), "open readers hear it; an outsider does not");
  const gen = st.db.prepare("SELECT body FROM messages WHERE body LIKE '%cracked a mark in the Portal%'").get();
  ok(!!gen, "Sterling says so in #general");
  ok((await api("POST", "/api/portal/guess/glyph", { token: C.token, body: { glyph: target, sound: "a" } })).status === 409, "a cracked glyph can't be claimed again");

  console.log("\n— the sources across the hub —");
  const etchedIds = Object.values(ETCHED_RELICS), allSources = [...etchedIds, ...STERLING_MARKS];
  const relicSlugs = new Set([...LEVEL_RELIC_SETS.flat(), ...SUBURB_RELICS].map((r) => r.slug));
  ok(new Set(allSources).size === allSources.length && allSources.every((g) => !NUMERAL_IDS.includes(g) && !onnith.has(g))
    && Object.keys(ETCHED_RELICS).every((s) => relicSlugs.has(s)) && Object.keys(ETCHED_RELICS).length === 10,
    "ten etched relics (one a level) and Sterling's three: thirteen different marks, none a numeral, none the stone's own");
  ok(tokenize("Vhaal'ith").tokens.filter((g) => g >= 0).every((g) => onnith.has(g) || STERLING_MARKS.includes(g)), "the stone's marks and Sterling's three spell the door's word, Vhaal'ith");
  st.db.prepare("INSERT INTO backrooms_relics (userId, relicId, unlockedAt) VALUES (?, ?, ?)").run(A.id, "alien-tech", Date.now());
  st.db.prepare("INSERT INTO backrooms_relics (userId, relicId, unlockedAt) VALUES (?, ?, ?)").run(B.id, "cog-of-truth", Date.now());
  const oe = await api("GET", "/api/portal", { token: A.token });
  await sleep(300);
  ok(oe.body.etched?.length === 1 && oe.body.etched[0] === ETCHED_RELICS["alien-tech"] && st.portalGlyphs().some((g) => g.glyph === ETCHED_RELICS["alien-tech"] && g.source === "relic:alien-tech"),
    "an etched relic carried through the Portal reads its mark — credited to its carrier");
  ok(!st.portalGlyphs().some((g) => g.glyph === ETCHED_RELICS["cog-of-truth"]), "a relic held by someone who has never been through reads nothing");
  ok(!!st.db.prepare("SELECT body FROM messages WHERE body LIKE '%carried Alien Tech through the Portal%'").get(), "Sterling names the relic in #general");
  ok((await api("GET", "/api/portal", { token: A.token })).body.etched.length === 0, "…once");
  for (const slug of ["the-blank-book", "the-conch-shell"]) st.db.prepare("INSERT INTO backrooms_relics (userId, relicId, unlockedAt) VALUES (?, ?, ?)").run(C.id, slug, Date.now());
  const two = await api("GET", "/api/portal", { token: C.token });
  await sleep(300);
  const counts = st.db.prepare("SELECT body FROM messages WHERE body LIKE '%carried The Blank Book%' OR body LIKE '%carried The Conch Shell%' ORDER BY id").all()
    .map((m) => Number(/(\d+) of 34/.exec(m.body)?.[1]));
  ok(two.body.etched.length === 2 && counts.length === 2 && counts[1] === counts[0] + 1, "two relics read on one visit are announced one count apart");
  const general = (await api("GET", "/api/channels", { token: A.token })).body.channels.find((c) => c.name === "general");
  const ask = async (who) => {
    const sent = await api("POST", `/api/channels/${general.id}/messages`, { token: who.token, body: { body: "/sterling portal" } });
    await sleep(1500);
    return st.db.prepare("SELECT body FROM messages WHERE userId = (SELECT id FROM users WHERE username = 'sterling') AND id > ? ORDER BY id LIMIT 1").get(sent.body?.message?.id ?? 0)?.body ?? "";
  };
  const D = await register("knocker");
  await api("POST", "/api/admin/abyss/stone", { token: admin, body: { userId: D.id } });
  await api("POST", "/api/abyss/speak", { token: D.token });
  await sleep(1200);
  ok(!!st.db.prepare("SELECT m.body FROM dm_messages m JOIN dm_conversations c ON c.id = m.conversationId WHERE (c.userA = ? OR c.userB = ?) AND m.body LIKE '%/sterling portal%'").get(D.id, D.id),
    "saying the words gets a note from Sterling pointing at /sterling portal");
  ok(/door you haven't opened|other side of it/.test(await ask(B)), "an outsider asking Sterling about the portal gets nothing");
  ok(/go through/.test(await ask(D)) && !STERLING_MARKS.some((g) => st.portalGlyphs().some((x) => x.glyph === g)), "an opener who hasn't been through is sent through first");
  const said = await ask(A);
  const fromSterling = st.portalGlyphs().filter((g) => g.source === "sterling");
  ok(/Three marks/.test(said) && fromSterling.length === 3 && fromSterling.every((g) => g.userId === A.id && STERLING_MARKS.includes(g.glyph)), "Sterling hands a reader who's been through the Foundry's three, together");
  ok(/already|Somebody/.test(await ask(C)) && st.portalGlyphs().filter((g) => g.source === "sterling").length === 3, "three is all there ever were");

  console.log("\n— the claim wall —");
  const wall = await api("GET", "/api/portal/wall", { token: A.token });
  const cracked = new Set(st.portalGlyphs().map((g) => g.glyph));
  const cells = wall.body.wall;
  ok(cells.length === 34 && cells.every((c) => cracked.has(c.glyph) ? c.sound === GLYPH_SOUND[c.glyph] : c.sound === null && c.who === null && c.source === null && c.stamp === null),
    "every mark on the wall; a read one shows its sound, a locked one nothing at all");
  const meName = JSON.stringify(tokenize(transliterate("reader")).tokens);
  const cell = (g) => cells.find((c) => c.glyph === g);
  ok(cell(ETCHED_RELICS["alien-tech"]).source === "relic" && cell(ETCHED_RELICS["alien-tech"]).relic === "alien-tech" && JSON.stringify(cell(ETCHED_RELICS["alien-tech"]).who) === meName
    && cell(STERLING_MARKS[0]).source === "sterling" && cell(GLYPH_ID["a"]).source === "deduction" && cell(g0[0].glyph).source === "stone",
    "…credited: who read it (in their own glyphs) and how — the stone, a relic, Sterling, or deduction");
  ok(!/"[a-z]{1,2}"/.test(JSON.stringify(cells.filter((c) => !cracked.has(c.glyph)))) && (await api("GET", "/api/portal/wall", { token: B.token })).status === 403,
    "no locked sound leaks; an outsider is refused the wall");

  console.log("\n— the survey —");
  const sv = await api("GET", "/api/portal/survey", { token: A.token });
  const gal = (id) => sv.body.galaxies.find((g) => g.id === id);
  ok(sv.status === 200 && sv.body.galaxies.length === 6 && sv.body.galaxies.every((g) => !g.charted) && sv.body.left === 3 && sv.body.weather === null,
    "six galaxies, none charted, three tries, no fold weather yet");
  ok(sv.body.galaxies.every((g) => g.catalogue.every((e) => e.period === null || e.period.every((t) => NUMERAL_IDS.includes(t))))
    && !/"answer"/.test(JSON.stringify(sv.body)) && sv.body.galaxies.every((g) => g.match === null && g.catalogue.every((e) => Object.keys(e).join() === "id,period,mark")),
    "catalogue periods are numeral glyph ids, and nothing on the wire says which entry is which");
  ok(GALAXIES.every((g) => readings(CHARTS[g].sources, CHARTS[g].entries).length === 1),
    "every catalogue has exactly one reading a reader who knows no numeral could believe");
  ok(gal("Yulenai").sources.some((x) => x.kind === "hiccup" && x.period === 8)
    && gal("Yulenai").catalogue.some((e) => e.mark === "stutter" && JSON.stringify(e.period) === JSON.stringify(tokenize("10").tokens)),
    "Yulenai holds the Hiccup: eight ticks, written 10, with a stutter");
  ok(gal("Maalith").sources.some((x) => x.kind === "stopped" && x.period === 0) && gal("Maalith").catalogue.some((e) => e.mark === "pause" && e.period === null),
    "Maalith keeps the one that stopped, marked with a pause");
  ok(sv.body.turns.length === 82 && decodeStamp(sv.body.turns[0]) === archiveTicks(0) && decodeStamp(sv.body.turns[81]) === archiveTicks(80.17),
    "the timeline runs the survey's window on the Eshai clock, t0 to the last drop");
  const chart = (token, galaxy, pairs) => api("POST", "/api/portal/survey/chart", { token, body: { galaxy, pairs } });
  const ans = (g) => ({ ...CHARTS[g].answer });
  const theWrong = (() => { const a = ans("Theruun"), k = Object.keys(a); const t = a[k[0]]; a[k[0]] = a[k[1]]; a[k[1]] = t; return a; })();
  const half = ans("Theruun"); delete half[Object.keys(half)[0]];
  const twice = ans("Theruun"); twice[Object.keys(twice)[1]] = twice[Object.keys(twice)[0]];
  ok((await chart(B.token, "Yulenai", ans("Yulenai"))).status === 403 && (await chart(A.token, "Khaa", {})).body.error === "bad_galaxy"
    && (await chart(A.token, "Theruun", half)).body.error === "bad_chart" && (await chart(A.token, "Theruun", twice)).body.error === "bad_chart",
    "refused: an outsider, a galaxy that isn't one, a chart with a source missing or two on one entry");
  const cw = await chart(A.token, "Theruun", theWrong);
  ok(cw.status === 200 && cw.body.right === false && cw.body.left === 2 && cw.body.cracked === null, "a wrong chart costs a try and reads nothing");
  const marksBefore = st.portalGlyphs().length;
  const cy = await chart(A.token, "Yulenai", ans("Yulenai"));
  const yRow = st.portalGlyphs().find((g) => g.glyph === SURVEY_REWARD.Yulenai);
  ok(cy.body.right === true && cy.body.cracked === SURVEY_REWARD.Yulenai && cy.body.left === 2 && yRow?.source === "survey:Yulenai" && yRow.userId === A.id
    && st.portalGlyphs().length === marksBefore + 1, "Yulenai charted: its numeral reads for everyone, credited to the charter, and the try is kept");
  await sleep(300);
  ok(!!st.db.prepare("SELECT body FROM messages WHERE body LIKE '%matched a whole galaxy of pulses%'").get(), "…and Sterling says so in #general");
  ok((await chart(A.token, "Yulenai", ans("Yulenai"))).status === 409, "a galaxy is charted once");
  await api("POST", "/api/admin/portal/glyph", { token: admin, body: { glyph: SURVEY_REWARD.Paaruk } });
  const cp = await chart(A.token, "Paaruk", ans("Paaruk"));
  ok(cp.body.right === true && cp.body.cracked === null, "a galaxy whose numeral is already read charts, and reads nothing new");
  await chart(A.token, "Theruun", theWrong); await chart(A.token, "Theruun", theWrong);
  const out = await chart(A.token, "Senwe", ans("Senwe"));
  ok(out.status === 429 && out.body.error === "no_tries", "three wrong charts and the instrument is shut for the day, right answer or not");
  for (const g of GALAXIES) await chart(C.token, g, ans(g));
  const svC = (await api("GET", "/api/portal/survey", { token: C.token })).body, svA = (await api("GET", "/api/portal/survey", { token: A.token })).body;
  ok(svC.galaxies.every((g) => g.charted) && svC.weather?.links.length === 5 && svC.weather.links[0].a === "Theruun" && svC.weather.links[4].b === "Maalith"
    && svC.weather.knot.galaxy === "Theruun" && svA.weather === null && svA.galaxies.filter((g) => g.charted).length === 2,
    "all six charted: the fold weather opens down the chain — for that reader, not the one who has charted two");
  ok(svA.galaxies.every((g) => g.charted ? JSON.stringify(g.match) === JSON.stringify(CHARTS[g.id].answer) : g.match === null),
    "a reader is shown their own chart of a galaxy they charted, and nothing of one they haven't");
  const swall = (await api("GET", "/api/portal/wall", { token: A.token })).body.wall.find((c) => c.glyph === SURVEY_REWARD.Yulenai);
  ok(swall.source === "survey" && JSON.stringify(swall.galaxy) === JSON.stringify(tokenize("Yulenai").tokens), "the wall credits the survey, and names the galaxy in glyphs");

  console.log("\n— the notation —");
  const kr = (await api("GET", "/api/portal/rooms/kaal-ith", { token: A.token })).body;
  const kaalPosts = ARCHIVE.posts.filter((p) => p.room === "kaal-ith");
  const allTok = kr.posts.flatMap((p) => p.tokens);
  ok(kr.notation === true && kr.posts.length === kaalPosts.length && allTok.some((t) => t >= NOTATION_BASE) && !allTok.some((t) => t >= 0 && t < 34 && t in MARK_OF),
    "kaal-ith's letters go out as notation marks — not one script letter shows through");
  ok(allTok.filter((t) => t >= 0 && t < 34).every((t) => NUMERAL_IDS.includes(t)) && allTok.some((t) => NUMERAL_IDS.includes(t)), "its numbers are the common numerals (the primer says so)");
  ok(kr.pinned.length === 1 && kr.pinned[0].tokens.every((t) => t < NOTATION_BASE), "the primer is pinned in the common script");
  const mark = MARK_OF[GLYPH_ID.k];
  const nWrong = (NOTATION_GLYPH[mark] === GLYPH_ID.t) ? GLYPH_ID.p : GLYPH_ID.t;
  const n1 = await api("POST", "/api/portal/guess/notation", { token: A.token, body: { mark, glyph: NUMERAL_IDS[3] } });
  const n2 = await api("POST", "/api/portal/guess/notation", { token: A.token, body: { mark, glyph: nWrong } });
  ok(n1.status === 200 && n1.body.right === false && n1.body.left === 2 && n2.body.left === 1, "naming a numeral is simply wrong — it costs a try, it tells nothing");
  ok((await api("POST", "/api/portal/guess/notation", { token: A.token, body: { mark: 99, glyph: 1 } })).status === 400, "a mark that isn't one is refused");
  const nr1 = await api("POST", "/api/portal/guess/notation", { token: C.token, body: { mark, glyph: NOTATION_GLYPH[mark] } });
  await sleep(400);
  ok(nr1.body.right === true && st.portalNotation().some((x) => x.mark === mark && x.userId === C.id), "a right claim cracks the mark for everyone, credited");
  ok(!!st.db.prepare("SELECT body FROM messages WHERE body LIKE '%shorthand their researchers wrote in%'").get(), "…and Sterling counts it in #general");
  const kr2 = (await api("GET", "/api/portal/rooms/kaal-ith", { token: A.token })).body;
  const kTok = kr2.posts.flatMap((p) => p.tokens);
  ok(kTok.includes(GLYPH_ID.k) && !kTok.includes(NOTATION_BASE + mark), "now that letter shows through as its script glyph, everywhere in the room");
  ok((await api("POST", "/api/portal/guess/notation", { token: C.token, body: { mark, glyph: NOTATION_GLYPH[mark] } })).status === 409, "a cracked mark can't be claimed again");

  console.log("\n— the glitches —");
  const repairs0 = st.portalRepairs().length;
  await api("POST", "/api/admin/portal/glitch", { token: admin, body: { kind: "ghost", userId: A.id } });
  const og = (await api("GET", "/api/portal", { token: A.token })).body;
  const ghostRoom = og.rooms.find((r) => r.ghost);
  ok(!!ghostRoom && ["theruun", "oshkaa", "paaruk", "senwe", "yulenai", "maalith"].includes(ghostRoom.id), "a dead galaxy's room lights up with a pip");
  const gr = (await api("GET", `/api/portal/rooms/${ghostRoom.id}`, { token: A.token })).body;
  const ghostPost = gr.posts[gr.posts.length - 1];
  ok(ghostPost.ghost === true && Math.abs(Number(decodeStamp(ghostPost.stamp) - nowTicks()) / 1_420_405_751.768) < 120, "…an old post re-filed at the bottom, stamped now");
  const gr2 = (await api("GET", `/api/portal/rooms/${ghostRoom.id}`, { token: A.token })).body;
  ok(!gr2.posts.some((p) => p.ghost) && !(await api("GET", "/api/portal", { token: A.token })).body.rooms.some((r) => r.ghost), "…met once, then gone");
  const ghostC = (await api("GET", "/api/portal", { token: C.token })).body;
  ok(!ghostC.rooms.some((r) => r.ghost), "a glitch is the reader's own — nobody else saw it");
  await api("POST", "/api/admin/portal/glitch", { token: admin, body: { kind: "presence", userId: A.id } });
  const rosterG = (await api("GET", "/api/portal/roster", { token: A.token })).body.roster.filter((r) => r.kind === "ghost" && r.online);
  const rosterG2 = (await api("GET", "/api/portal/roster", { token: A.token })).body.roster.filter((r) => r.kind === "ghost" && r.online);
  ok(rosterG.length === 1 && rosterG2.length === 0, "a dead row reads online for one look");
  await api("POST", "/api/admin/portal/glitch", { token: admin, body: { kind: "corrupt", userId: A.id } });
  const cr = (await api("GET", "/api/portal/rooms/shenai", { token: A.token })).body;
  ok(cr.glitch?.kind === "corrupt" && cr.posts.some((p) => p.key === cr.glitch.key) && !(await api("GET", "/api/portal/rooms/shenai", { token: A.token })).body.glitch,
    "a word comes apart for a moment, once");
  const logRows = (await api("GET", "/api/portal/rooms/tharvend", { token: A.token })).body.posts;
  const repairSign = 4; // REPAIR, in STATUS order
  const recent = logRows.filter((p) => p.sign === repairSign && Math.abs(Number(decodeStamp(p.stamp) - nowTicks()) / 1_420_405_751.768) < 600);
  ok(st.portalRepairs().length === repairs0 + 3 && recent.length >= 3, "every glitch is filed in Tharvend's log as a repair, at the moment it happened");
  ok((await api("POST", "/api/admin/portal/glitch", { token: A.token, body: { kind: "ghost" } })).status === 403, "the glitch lever is the admin's");

  console.log("\n— ishaal —");
  const ish = (await api("GET", "/api/portal/ishaal", { token: A.token })).body;
  const recMoves = ARCHIVE.ishaal.map(([, nn, , , ring, spoke]) => ({ n: nn, ring, spoke }));
  const recSt = R.replay(recMoves);
  ok(ish.recorded.ply === 0o757 && recSt && R.sideToMove(recMoves.length) === "even" && R.verdict(recSt, recMoves.length) === null && ish.recorded.mine === null,
    "the recorded game replays legally to move 757: Paelu to move, nobody has won");
  ok(!/Tamruk|Nemaai|Paelu/.test(JSON.stringify(ish.recorded.names)) && ish.opponents.length === 4, "names on the board are glyphs; four old players to sit across from");
  ok((await api("POST", "/api/portal/ishaal/paelu", { token: A.token, body: { move: { n: 1, ring: 1, spoke: 0 } } })).status === 400, "an illegal move for Paelu is refused");
  const pm = R.moves(recSt, "even")[0];
  const pOk = await api("POST", "/api/portal/ishaal/paelu", { token: A.token, body: { move: { n: pm.stone.n, ring: pm.ring, spoke: pm.spoke } } });
  const pAgain = await api("POST", "/api/portal/ishaal/paelu", { token: A.token, body: { move: { n: pm.stone.n, ring: pm.ring, spoke: pm.spoke } } });
  const ish2 = (await api("GET", "/api/portal/ishaal", { token: A.token })).body;
  ok(pOk.status === 200 && pAgain.status === 409 && ish2.recorded.mine?.n === pm.stone.n && ish2.recorded.moves.length === recMoves.length, "Paelu's move is made once — and nobody answers it");
  const filedLog = (await api("GET", "/api/portal/rooms/tharvend", { token: A.token })).body.posts.filter((p) => p.sign === 5 && Math.abs(Number(decodeStamp(p.stamp) - nowTicks()) / 1_420_405_751.768) < 600);
  ok(filedLog.length >= 1, "Tharvend files it");
  ok((await api("POST", "/api/portal/ishaal/start", { token: A.token, body: { opp: "Sterling" } })).status === 400, "only the hall's own players");
  const playOut = async (who, opp) => {
    await api("POST", "/api/portal/ishaal/start", { token: who.token, body: { opp } });
    let last = null;
    for (let i = 0; i < 200; i++) {
      const v = (await api("GET", "/api/portal/ishaal", { token: who.token })).body.bot;
      if (v.done) return { done: v.done, you: v.you, last };
      const stones = R.replay(v.moves);
      const mv = botMove(stones, v.you, "Nemaai", v.moves.length, []);
      last = await api("POST", "/api/portal/ishaal/move", { token: who.token, body: { move: { n: mv.stone.n, ring: mv.ring, spoke: mv.spoke } } });
      if (last.body.done) return { done: last.body.done, you: v.you, last };
    }
    return { done: null };
  };
  const bad = await api("POST", "/api/portal/ishaal/move", { token: A.token, body: { move: { n: 9, ring: 9, spoke: 9 } } });
  ok(bad.status === 400, "no board, no move");
  const marks0 = st.portalGlyphs().length;
  const w1g = await playOut(A, "Paelu");
  await sleep(300);
  const ishRow = st.portalGlyphs().find((x) => x.source === "ishaal:Paelu");
  ok(w1g.done === w1g.you && w1g.last.body.cracked != null && ishRow?.userId === A.id && st.portalGlyphs().length === marks0 + 1, "beat Paelu: one mark reads for everyone, credited to the winner");
  ok(!!st.db.prepare("SELECT body FROM messages WHERE body LIKE '%beat one of the old players%'").get(), "…and Sterling says so");
  const w2g = await playOut(C, "Paelu");
  ok(w2g.done === w2g.you && w2g.last.body.cracked == null && st.portalGlyphs().length === marks0 + 1, "beating Paelu again, anybody, reads nothing: one mark an opponent, ever");
  const opened = await api("POST", "/api/portal/ishaal/open", { token: A.token });
  const joinSelf = await api("POST", "/api/portal/ishaal/join", { token: A.token, body: { id: opened.body.id } });
  const joined = await api("POST", "/api/portal/ishaal/join", { token: C.token, body: { id: opened.body.id } });
  ok(opened.status === 200 && joinSelf.status === 409 && joined.status === 200, "a board opened by one member, joined by another (not by its opener)");
  const first = R.moves(R.opening(), "odd")[0];
  const wrongTurn = await api("POST", "/api/portal/ishaal/play", { token: A.token, body: { id: opened.body.id, move: { n: first.stone.n, ring: first.ring, spoke: first.spoke } } });
  const rightTurn = await api("POST", "/api/portal/ishaal/play", { token: C.token, body: { id: opened.body.id, move: { n: first.stone.n, ring: first.ring, spoke: first.spoke } } });
  ok(wrongTurn.status === 400 && wrongTurn.body.error === "not_your_move" && rightTurn.status === 200, "odd moves first, and only on their own move");
  const res1 = await api("POST", "/api/portal/ishaal/resign", { token: A.token, body: { id: opened.body.id } });
  ok(res1.status === 200 && st.portalIshaalGame(opened.body.id).winner === "odd", "conceding hands the board to the other side");

  console.log("\n— the bench —");
  const bv = (await api("GET", "/api/portal/bench", { token: A.token })).body;
  ok(bv.exercises.length === 5 && bv.exercises[0].open && bv.exercises.slice(1).every((e) => !e.open), "five exercises; only the first is open");
  ok((await api("POST", "/api/portal/bench/start", { token: A.token, body: { id: "15" } })).status === 403, "the next one waits for the last");
  const autoBleed = (seed, id) => {
    const sim = new BenchState(id, seed); const bleeds = []; let next = 0;
    for (let k = 0; k < BENCH[id].steps && sim.failed === null; k++) {
      const b = [];
      if (k >= next) { let hi = -1, hv = 0.72; sim.loads.forEach((l, i) => { if (l > hv) { hv = l; hi = i; } }); if (hi >= 0) { b.push(hi); bleeds.push([k, hi]); next = k + 3; } }
      sim.tick(b);
    }
    return { bleeds, held: sim.failed === null };
  };
  const s1 = (await api("POST", "/api/portal/bench/start", { token: A.token, body: { id: "14" } })).body;
  const fast = await api("POST", "/api/portal/bench/finish", { token: A.token, body: { bleeds: autoBleed(s1.seed, "14").bleeds } });
  ok(fast.body.held === false, "a run finished faster than the fold holds pays nothing");
  const s2 = (await api("POST", "/api/portal/bench/start", { token: A.token, body: { id: "14" } })).body;
  await sleep(BENCH["14"].steps * 100 + 200);
  const none = await api("POST", "/api/portal/bench/finish", { token: A.token, body: { bleeds: [] } });
  ok(none.body.held === false, "a fold nobody bled drops — the server replays it and sees");
  const s3 = (await api("POST", "/api/portal/bench/start", { token: A.token, body: { id: "14" } })).body;
  const plan = autoBleed(s3.seed, "14");
  await sleep(BENCH["14"].steps * 100 + 200);
  const held = await api("POST", "/api/portal/bench/finish", { token: A.token, body: { bleeds: plan.bleeds } });
  await sleep(300);
  ok(plan.held && held.body.held === true && held.body.cracked != null && st.portalGlyphs().some((x) => x.source === "bench:14" && x.userId === A.id),
    "a real hold, really that long: the bench prints its result and a mark reads");
  ok((await api("GET", "/api/portal/bench", { token: A.token })).body.exercises[1].open === true, "…and the next exercise opens");

  console.log("\n— the voice rooms —");
  const vt = await api("POST", `/api/portal/voice/${encodeURIComponent("ren-ta'an")}/token`, { token: A.token });
  ok(vt.status === 503, "no SFU, no token (and no crash)");
  const vb = await api("POST", `/api/portal/voice/${encodeURIComponent("ren-ta'an")}/beat`, { token: A.token });
  const vc = await api("POST", `/api/portal/voice/${encodeURIComponent("ren-ta'an")}/beat`, { token: C.token });
  ok(vb.body.here.length === 1 && vb.body.here[0].you && vc.body.here.length === 2, "who is sitting in a room");
  ok((await api("POST", "/api/portal/voice/nowhere/beat", { token: A.token })).status === 404, "only the two rooms");
  const rep0 = st.portalRepairs().length;
  const vf = await api("POST", "/api/admin/portal/voice-fault", { token: admin, body: { room: "keth-ren" } });
  const vs = (await api("GET", "/api/portal/voice/keth-ren", { token: A.token })).body;
  ok(vf.status === 200 && vf.body.clip === "keth-ren-1" && vs.fault?.clip === "keth-ren-1" && st.portalRepairs().length === rep0 + 1 && st.portalRepairs()[0].kind === "voice",
    "the playback fault plays a clip that is really there, stamped, and filed as a repair");

  console.log("\n— reading a word —");
  const yesPostRoom = (await api("GET", "/api/portal/rooms/shenai", { token: A.token })).body;
  const yes = findPost(yesPostRoom, "Ae-esh.");
  ok(!!yes, "Kiru's \"Ae-esh.\" is in shenai as glyphs");
  const w0 = await api("POST", "/api/portal/guess/word", { token: A.token, body: { target: yes.key, word: 0, piece: 0, meaning: "yes" } });
  ok(w0.status === 400 && w0.body.error === "glyph_locked", "a word can't be learned before its marks are read");
  for (let g = 0; g < 34; g++) await api("POST", "/api/admin/portal/glyph", { token: admin, body: { glyph: g } });
  ok(st.portalGlyphs().length === 34, "the admin's lever cracks the rest (testing)");
  ok((await api("POST", "/api/admin/portal/glyph", { token: A.token, body: {} })).status === 403 && st.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'portal.glyph'").get().n === st.portalGlyphs().filter((g) => g.source === "admin").length,
    "…a member is refused it, and every pull is audited");
  const ww = await api("POST", "/api/portal/guess/word", { token: A.token, body: { target: yes.key, word: 0, piece: 0, meaning: "banana" } });
  const w1 = await api("POST", "/api/portal/guess/word", { token: A.token, body: { target: yes.key, word: 0, piece: 0, meaning: "yes" } });
  const w2 = await api("POST", "/api/portal/guess/word", { token: A.token, body: { target: yes.key, word: 0, piece: 1, meaning: "to see" } });
  ok(ww.body.right === false && w1.body.right === true && w1.body.learned === "ae" && w2.body.learned === "esh", "a wrong meaning costs a try; \"yes\" and \"to see\" are learned");
  const after = findPost((await api("GET", "/api/portal/rooms/shenai", { token: A.token })).body, "Ae-esh.");
  ok(after.en === "Yes." && after.glosses[0] !== null, "every word known: the English arrives — \"Yes.\"");
  const forC = findPost((await api("GET", "/api/portal/rooms/shenai", { token: C.token })).body, "Ae-esh.");
  ok(forC.en === null, "…for that reader alone");

  console.log("\n— speaking —");
  const toks = tokenize("Ae-esh.").tokens;
  const bad1 = await api("POST", "/api/portal/rooms/shenai/posts", { token: C.token, body: { tokens: toks } });
  ok(bad1.status === 400 && bad1.body.error === "word_unknown", "you can't say a word you haven't learned");
  ok((await api("POST", "/api/portal/rooms/shenai/posts", { token: A.token, body: { tokens: [999] } })).body.error === "glyph_locked", "a mark that isn't one is refused");
  ok((await api("POST", "/api/portal/rooms/tharvend/posts", { token: A.token, body: { tokens: toks } })).status === 400, "Tharvend's log takes no posts");
  const good = await api("POST", "/api/portal/rooms/shenai/posts", { token: A.token, body: { tokens: toks } });
  ok(good.status === 200, "a post in words you know is filed");
  const mine = (await api("GET", "/api/portal/rooms/shenai", { token: A.token })).body.posts.find((p) => p.key === `p:${good.body.id}`);
  const ticks = decodeStamp(mine.stamp);
  const years = Number(ticks - archiveTicks(80.19)) / 1_420_405_751.768 / (365.25 * 86400);
  ok(mine.mine && Math.abs(Number(ticks - nowTicks()) / 1_420_405_751.768) < 120 && years > 53.9e6 && years < 54.2e6,
    "stamped now on their clock — about fifty-four million years after the last plea");
  ok(st.db.prepare("SELECT text FROM portal_posts WHERE id = ?").get(good.body.id).text === "ae-esh.", "stored in romanised Eshai, server-side only");

  console.log("\n— reactions —");
  const rx1 = await api("POST", "/api/portal/react", { token: A.token, body: { target: yes.key, sign: "onn" } });
  const rx2 = await api("POST", "/api/portal/react", { token: A.token, body: { target: yes.key, sign: "onn" } });
  ok(rx1.body.on === true && rx2.body.on === false, "a sign toggles on and off");
  ok((await api("POST", "/api/portal/react", { token: A.token, body: { target: yes.key, sign: "lol" } })).status === 400
    && (await api("POST", "/api/portal/react", { token: A.token, body: { target: "a:99999", sign: "ren" } })).status === 404, "only the six signs, only on posts that exist");

  console.log("\n— the last room —");
  const last = (await api("GET", "/api/portal/rooms/last", { token: A.token })).body;
  const lastPosts = ARCHIVE.posts.filter((p) => p.room === "last");
  ok(last.locked === false && last.posts.length === lastPosts.length && last.posts.every((p) => p.reacts.length === 0), "every mark read: the last room opens on the last pleas");
  ok((await api("GET", "/api/portal", { token: A.token })).body.rooms.find((r) => r.id === "last").open === true, "the room list says so");
  ok((await api("POST", "/api/portal/react", { token: A.token, body: { target: last.posts[0].key, sign: "onn" } })).status === 404
    && (await api("POST", "/api/portal/rooms/last/posts", { token: A.token, body: { tokens: toks } })).status === 400, "nobody reacts to them; nobody posts");
  await sleep(1800);
  ok(!!st.db.prepare("SELECT body FROM messages WHERE body LIKE '%Every mark over there is read now%'").get(), "Sterling says something opened");

  console.log("\n— the primer —");
  for (const w of ARCHIVE.lexicon) st.portalLearn(A.id, normalise(w.word));
  await api("GET", "/api/portal/rooms/kaal-ith", { token: A.token });
  await sleep(300);
  ok(st.portalNotation().some((x) => x.source === "primer" && x.userId === A.id), "read in full, the primer gives the notation its first crack");
  const wallN = (await api("GET", "/api/portal/wall", { token: A.token })).body.notation;
  ok(wallN.length === 26 && wallN.filter((c) => c.glyph !== null).length === st.portalNotation().length && wallN.filter((c) => c.glyph === null).every((c) => c.who === null),
    "the wall's second half: all 26 notation marks, the cracked ones with their glyph and reader");

  wsA.ws.close(); wsB.ws.close();
  st.db.close();
};

run().catch((e) => { bad++; console.error(e); }).finally(() => {
  stop();
  console.log(`\n${n - bad}/${n} passed`);
  process.exit(bad ? 1 : 0);
});
