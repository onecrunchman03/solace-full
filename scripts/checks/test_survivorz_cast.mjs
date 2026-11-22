// SOLACE SURVIVORZ — THE CAST FILES AND THE CHARACTER CREATOR (src/survivorz/cast/, phase 5).
//
// Run:  npm run build && node scripts/checks/test_survivorz_cast.mjs
//
// A character is one file, src/survivorz/cast/<id>.json, and every table the show reads is built from
// those files. What it pins:
//   1. THE FILES — every character passes the rules the server boots with; the two generated files
//      (files.ts, public.json) match the character files exactly; the page's half carries no sheet, no
//      genes and no notes (a sheet holds a secret — Dale's painkillers — and page code is public).
//   2. THE TABLES — skills, genes, kit, sheets, regard, voices, bodies, who walks in and in what
//      order, and the suited, all read straight from the files.
//   3. THE RULES — each refusal a character could hit (a skill or gene out of range, a facility
//      secret in a sheet, a body or spawn place already taken, regard of nobody, rounds with no gun).
//   4. THE CREATOR over HTTP, against a COPY of the cast: a bad character refused with nothing written,
//      a new bench character saved, the others' regard of them written into THEIR files, and both
//      generated files rebuilt to include them.
//   5. THE ADMIN PANEL'S LIST over a real server (port 8798): admin-only (a member 403, nobody 401), a
//      bad character refused with no row, a good one kept in the database (never a repo file — a
//      deploy is a git pull), a change to a character in the show marked as one, junk regard dropped,
//      removal audited; then pull-cast.mjs --local writing the list into a COPY of the cast, an unbaked
//      body written as a draft.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CAST_DIR = path.join(ROOT, "src/survivorz/cast");
const rules = await import(pathToFileURL(path.join(CAST_DIR, "rules.ts")).href);

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}`); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const files = fs.readdirSync(CAST_DIR).filter((f) => /^[a-z]{2,16}\.json$/.test(f) && f !== "public.json");
const cast = files.map((f) => JSON.parse(fs.readFileSync(path.join(CAST_DIR, f), "utf8")));
const live = cast.filter((c) => c.status !== "draft").sort((a, b) => a.order - b.order);

// ---------------------------------------------------------------------------------------------
console.log("1. the files");
{
  const bad = cast.map((c) => [c.id, rules.checkCharacter(c, cast).errors]).filter(([, e]) => e.length);
  ok(cast.length >= 7 && !bad.length, `every character passes the rules (${cast.length} files)${bad.length ? " — " + JSON.stringify(bad) : ""}`);
  ok(files.every((f) => cast.find((c) => `${c.id}.json` === f)), "every file is named for its character's id");
  ok(fs.readFileSync(path.join(CAST_DIR, "files.ts"), "utf8").replace(/\r\n/g, "\n") === rules.indexSource(cast.map((c) => c.id)), "files.ts lists exactly the character files (the creator wrote it)");
  const pub = JSON.parse(fs.readFileSync(path.join(CAST_DIR, "public.json"), "utf8"));
  ok(same(pub, live.slice().sort((a, b) => a.strip - b.strip).map((c) => rules.publicOf(c, rules.HANDMADE_SUITED.includes(c.body)))), "public.json is exactly the cast's public half, in strip order");
  ok(pub.every((p) => !("sheet" in p) && !("genes" in p) && !("notes" in p) && !("regard" in p)), "the page's half carries no sheet, genes, notes or regard");
  const raw = fs.readFileSync(path.join(CAST_DIR, "public.json"), "utf8").toLowerCase();
  ok(!/painkill|you are /.test(raw), "…and no sheet's words leak into it");
  const bodyDir = path.join(ROOT, "assets/downloads/survivorz/game");
  if (fs.existsSync(bodyDir)) {
    const baked = fs.readdirSync(bodyDir).map((f) => f.replace(/\.glb$/, ""));
    ok(live.every((c) => baked.includes(c.body)), "every character on the cast or bench has a baked body");
  }
}

// ---------------------------------------------------------------------------------------------
console.log("2. the tables read from the files");
{
  const D = (p) => require(path.join(ROOT, "dist/survivorz", p));
  const C = D("cast/index.js"), T = D("sim/tables.js"), G = D("genes.js"), S = D("talk/sheets.js"), V = D("voices.js"), W = D("sim/world.js");
  const by = (pick) => Object.fromEntries(live.map((c) => [c.id, pick(c)]));
  ok(same(G.SURVIVORS, live.map((c) => c.id)), `everyone in spawn order: ${G.SURVIVORS.join(", ")}`);
  ok(same(W.SURVIVOR_IDS, live.filter((c) => c.status === "cast").map((c) => c.id)), "who walks in on day one is the cast, in spawn order");
  ok(same(C.BENCH, live.filter((c) => c.status === "bench").map((c) => c.id)) && C.BENCH[0] === "claudia", "the bench, Claudia first in line");
  ok(same(T.STATS, by((c) => rules.skillsOf(c))) && same(G.START, by((c) => rules.genesOf(c))), "skills and starting genes");
  // THE BUNKER (BUNKER.md 15): each walks in with their own melee weapon and a little food and water, no guns
  ok(same(T.START_KIT, by((c) => ({ melee: c.kit.melee, bandage: Math.min(1, c.kit.bandage), medkit: 0, food: 1, water: 1 }))) && same(T.SKILL_START, by((c) => rules.skillsOf(c))), "starting kit (their own weapon, no guns) and skills");
  ok(same(S.SHEETS, by((c) => ({ name: c.name, short: c.short, sheet: c.sheet }))) && same(S.START_REGARD, by((c) => c.regard)), "sheets and day-one regard");
  ok(same(V.SURVIVOR_VOICES, by((c) => c.voice)) && same(C.BODY_OF, by((c) => c.body)), "voices and bodies");
  ok(same([...T.NO_BACKPACK], ["rollo"]) && rules.skillsOf(live.find((c) => c.id === "dale")).firstAid >= T.MEDIC_AT, "the sealed suit is the BODY's (Rollo's hazmat) and Dale's first aid makes him a medic");
  const M = D("maps.js");
  ok(S.worldOf("claudia") === M.SHOW_MAPS[0].world && S.worldOf("rick") === S.worldOf("claudia") && !/halcyon/i.test(S.worldOf()) && /shelter/i.test(S.worldOf()), "the minds are told the MAP's world (the bunker's), never the old Halcyon one");
  ok(!cast.some((c) => c.status === "draft") || !G.SURVIVORS.some((id) => cast.find((c) => c.id === id)?.status === "draft"), "a draft never reaches the show");
}

// ---------------------------------------------------------------------------------------------
console.log("3. the rules");
{
  const rick = cast.find((c) => c.id === "rick");
  const errs = (c, others = cast) => rules.checkCharacter(c, others).errors.map((e) => e.field);
  const draft = (patch) => ({ ...structuredClone(rick), id: "zed", status: "bench", order: 90, strip: 90, name: "Zed", short: "Zed", body: "zedbody", sheet: rick.sheet.replace(/RICK/g, "ZED").replace(/Rick/g, "Zed"), regard: {}, voice: { clone: "survivor-zed", kokoro: rick.voice.kokoro }, ...patch });
  ok(errs(draft({})).length === 0, "a fresh character copied from Rick passes");
  ok(errs(draft({ voice: { clone: rick.voice.clone, kokoro: "am_adam" } })).includes("voice.clone"), "ONE VOICE EACH: a clone another character speaks with is refused");
  // SKILLS AND GENES, NOTHING ELSE (Nov 5 2026): no body stats, no perks, no "world"
  ok(cast.every((c) => !("stats" in c) && !("perks" in c) && !("world" in c) && !("traits" in c)), "no character file carries body stats, perks or a world");
  ok(errs(draft({ stats: { combat: 5 } })).includes("stats") && errs(draft({ perks: ["medic"] })).includes("perks") && errs(draft({ world: "inside" })).includes("world"), "a body stat, a perk or a world is refused as not a field");
  ok(errs(draft({ skills: { ...rick.skills, melee: 11 } })).includes("skills.melee") && errs(draft({ skills: { ...rick.skills, firstAid: -1 } })).includes("skills.firstAid"), "a skill outside 0–10 refused");
  ok(errs(draft({ genes: { ...rick.genes, honesty: -1 } })).includes("genes.honesty") && errs(draft({ genes: { ...rick.genes, courage: 11 } })).includes("genes.courage"), "a gene outside 0–10 refused");
  ok(errs(draft({ skills: { ...rick.skills, juggling: 3 } })).includes("skills") && errs(draft({ genes: { ...rick.genes, luck: 3 } })).includes("genes"), "an unknown skill or gene refused");
  ok(rules.SKILL_KEYS.length === 16 && rules.GENE_KEYS.length === 15, "sixteen skills and fifteen genes");
  ok(rules.SKILL_KEYS.every((k) => rules.SKILL_INFO[k]?.does && rules.SKILL_GROUPS.some((g) => g.id === rules.SKILL_INFO[k].group) && Number.isInteger(rules.SKILL_INFO[k].base)), "every skill has its words, a group and a base");
  ok(same(rules.skillsOf({ skills: { electronics: 2 } }), Object.fromEntries(rules.SKILL_KEYS.map((k) => [k, k === "electronics" ? 2 : rules.SKILL_INFO[k].base]))) && rules.genesOf({ genes: {} }).courage === 5, "a skill left out reads as its base, a gene as 5");
  const max = Object.fromEntries(rules.SKILL_KEYS.map((k) => [k, 10]));
  const over = rules.checkCharacter(draft({ skills: max }), cast);
  ok(over.errors.length === 0 && over.warnings.some((w) => w.field === "skills" && /over the suggested/.test(w.error)), "past the suggested points total is a WARNING, never a refusal");
  // THE OLD SHAPE converts (a browser draft, a saved row, an exported list): the first conversion's rules
  const old = { id: "olda", stats: { combat: 7, nimble: 8, thinking: 6, creative: 9, endurance: 4 }, perks: ["medic", "marksman", "tough", "suited"], world: "inside", skills: { electronics: 3, science: 2 }, genes: { honesty: 4 } };
  const up = rules.upgradeCharacter(structuredClone(old));
  ok(up.skills.melee === 7 && up.skills.firearms === 9 && up.skills.agility === 8 && up.skills.escape === 8 && up.skills.quickLearner === 6 && up.skills.endurance === 4
    && up.skills.toughness === 10 && up.skills.firstAid === 9 && up.skills.scavenging === 8 && up.skills.electronics === 3 && up.genes.courage === 7 && up.genes.honesty === 4 && up.genes.humour === 5
    && !("stats" in up) && !("perks" in up) && !("world" in up), "an old character converts: combat → melee + firearms + courage, nimble → agility + escape, the perks into their skills");
  ok(rules.upgradeCharacter(rick) === rick, "a character already in the new shape comes back untouched");
  ok(errs(draft({ sheet: draft({}).sheet + " You know all about Lazarus." })).includes("sheet"), "a sheet naming a facility secret refused");
  ok(errs(draft({ sheet: "Zed is a " + "x".repeat(300) })).includes("sheet"), "a sheet not starting \"You are\" refused");
  ok(errs(draft({ body: "eric" })).includes("body"), "a body somebody already wears refused");
  ok(errs(draft({ order: rick.order })).includes("order"), "a spawn place already taken refused");
  ok(errs(draft({ regard: { nobody: 20 } })).includes("regard"), "regard of somebody who isn't a character refused");
  ok(errs(draft({ kit: { melee: "fists", mag: 5, bandage: 0, medkit: 0, food: 0, water: 0 } })).includes("kit.gun"), "rounds with no gun refused");
  ok(errs(draft({ short: "Rick" })).includes("short"), "a name another character goes by refused");
  ok(errs(draft({ hair: "red" })).includes("hair"), "a field that isn't part of a character refused");
  ok(errs(draft({ id: "Zed1" })).includes("id"), "an id that isn't lower-case letters refused");
  ok(errs(draft({ status: "draft", body: "eric" })).length === 0, "a DRAFT may borrow a taken body (it never reaches the show)");
}

// ---------------------------------------------------------------------------------------------
console.log("4. the creator, over HTTP, on a copy of the cast");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "creator-"));
  const tmpCast = path.join(tmp, "cast"), tmpBodies = path.join(tmp, "bodies");
  fs.mkdirSync(tmpCast); fs.mkdirSync(tmpBodies);
  for (const f of fs.readdirSync(CAST_DIR)) if (f.endsWith(".json") || f === "files.ts") fs.copyFileSync(path.join(CAST_DIR, f), path.join(tmpCast, f));
  for (const c of cast) fs.writeFileSync(path.join(tmpBodies, `${c.body}.glb`), "");
  fs.writeFileSync(path.join(tmpBodies, "marcus.glb"), "");
  const PORT = 8794;
  const kid = spawn(process.execPath, [path.join(ROOT, "scripts/survivorz/creator.mjs")], {
    env: { ...process.env, CREATOR_PORT: String(PORT), CREATOR_CAST_DIR: tmpCast, CREATOR_BODY_DIR: tmpBodies, CREATOR_OLLAMA: "http://127.0.0.1:9" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = ""; kid.stdout.on("data", (d) => { log += d; }); kid.stderr.on("data", (d) => { log += d; });
  const base = `http://127.0.0.1:${PORT}`;
  const api = async (p, body) => { const r = await fetch(base + p, body ? { method: "POST", body: JSON.stringify(body) } : {}); return { status: r.status, j: await r.json().catch(() => null) }; };
  try {
    for (let i = 0; i < 60 && !log.includes("[creator]"); i++) await sleep(100);
    const page = await fetch(base + "/");
    ok(page.ok && (await page.text()).includes("Character Creator"), "the page serves");
    const { j: data } = await api("/api/cast");
    ok(data?.cast?.length === cast.length && data.bodies.includes("marcus") && data.vocab.genes.length === 15 && data.vocab.skills.length === 16, "the cast, the baked bodies and the vocabulary come back");
    const rick = cast.find((c) => c.id === "rick");
    const marcus = { ...structuredClone(rick), id: "marcus", status: "bench", order: 50, strip: 50, name: "Marcus Bell", short: "Marcus", tag: "Night janitor", body: "marcus",
      regard: { rick: 20, sarah: -20 }, voice: { clone: "survivor-marcus", kokoro: "am_adam" },
      sheet: "You are MARCUS. Fifties, the night janitor at a downtown office tower; you were mopping the lobby when it started. " + "Slow, kind, stubborn. ".repeat(10) };
    const before = fs.readFileSync(path.join(tmpCast, "files.ts"), "utf8");
    const bad = await api("/api/save", { char: { ...marcus, skills: { ...marcus.skills, melee: 11 } } });
    ok(bad.status === 400 && bad.j.errors.some((e) => e.field === "skills.melee") && !fs.existsSync(path.join(tmpCast, "marcus.json")) && fs.readFileSync(path.join(tmpCast, "files.ts"), "utf8") === before, "a bad character is refused with nothing written");
    const chk = await api("/api/check", { char: marcus });
    ok(chk.status === 200 && chk.j.errors.length === 0, "the check agrees the good one passes");
    const saved = await api("/api/save", { char: marcus, regardIn: { rick: 10, johanna: 30 } });
    ok(saved.status === 200 && saved.j.ok && saved.j.saved.includes("marcus") && saved.j.saved.includes("rick") && saved.j.saved.includes("johanna"), "a new bench character saved, with the two others whose regard changed");
    const m = JSON.parse(fs.readFileSync(path.join(tmpCast, "marcus.json"), "utf8"));
    ok(m.name === "Marcus Bell" && m.regard.rick === 20 && m.kit.gun === rick.kit.gun && m.sheet === marcus.sheet, "their file is written as entered");
    const r2 = JSON.parse(fs.readFileSync(path.join(tmpCast, "rick.json"), "utf8")), j2 = JSON.parse(fs.readFileSync(path.join(tmpCast, "johanna.json"), "utf8"));
    ok(r2.regard.marcus === 10 && j2.regard.marcus === 30 && same(Object.keys(r2.regard).slice(0, -1), Object.keys(rick.regard)), "what the others think of them went into THEIR files (and nothing else of theirs moved)");
    const files2 = fs.readFileSync(path.join(tmpCast, "files.ts"), "utf8"), pub2 = JSON.parse(fs.readFileSync(path.join(tmpCast, "public.json"), "utf8"));
    ok(files2.includes('import c_marcus from "./marcus.json";') && pub2.some((p) => p.id === "marcus" && p.status === "bench" && !("sheet" in p)), "files.ts and public.json rebuilt to include them");
    ok(saved.j.next.some((n) => /slopbot/.test(n)) && saved.j.next.some((n) => /bible/.test(n)) && saved.j.next.some((n) => /bench/.test(n)), "the save says what's left (the voice, the bible, the bench)");
    const twin = await api("/api/save", { char: { ...marcus, id: "marcia", short: "Marcia", order: 51, strip: 51 } });
    ok(twin.status === 400 && twin.j.errors.some((e) => e.field === "body"), "a second character in the same body is refused");
    const heard = await api("/api/hear", { char: marcus, situation: "Rick asks who wants first watch." });
    ok(heard.status === 200 && heard.j.line === null, "with no model about, \"hear them\" says nothing rather than inventing a line");
    // the copy builds into a valid cast by the same rules
    const all2 = fs.readdirSync(tmpCast).filter((f) => /^[a-z]{2,16}\.json$/.test(f) && f !== "public.json").map((f) => JSON.parse(fs.readFileSync(path.join(tmpCast, f), "utf8")));
    ok(all2.every((c) => rules.checkCharacter(c, all2).errors.length === 0), "the edited cast still passes every rule");
  } finally {
    kid.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------------------
console.log("5. the Admin Panel's list, over a real server");
{
  const PORT = 8798, BASE = `http://127.0.0.1:${PORT}`;
  const DATA_DIR = path.join(ROOT, "data", "survivorz-cast-harness");
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  const FIX = path.join(DATA_DIR, "assets");
  fs.mkdirSync(path.join(FIX, "game"), { recursive: true });
  for (const c of cast) fs.writeFileSync(path.join(FIX, "game", `${c.body}.glb`), "");
  fs.writeFileSync(path.join(FIX, "game", "marcus.glb"), "");
  const ADMIN_PW = "Harness!Admin9xy";
  const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW, ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
      LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "", ROLLO_LIVE: "0", NPC_BRAIN_URL: "", NPC_BRAIN_BIG_URL: "", SURVIVORZ_ASSETS: FIX },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let slog = ""; srv.stdout.on("data", (d) => { slog += d; }); srv.stderr.on("data", (d) => { slog += d; });
  const call = async (method, url, token, body) => {
    const r = await fetch(BASE + url, { method, headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, j: await r.json().catch(() => null) };
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pullcast-"));
  try {
    let up = false;
    for (let i = 0; i < 160 && !up; i++) { try { up = (await fetch(BASE + "/health")).ok; } catch {} if (!up) await sleep(250); }
    ok(up, "the server boots" + (up ? "" : " — " + slog.slice(-400)));
    const admin = (await call("POST", "/api/login", null, { username: "admin", password: ADMIN_PW })).j?.token;
    const member = (await call("POST", "/api/register", null, { username: "zcast", password: "Sturdy!Passw0rd#9", displayName: "Cast", secret: "vault marmalade lantern quartz 47", acceptTerms: true })).j?.token;
    ok((await call("GET", "/api/admin/survivorz/cast", member)).status === 403 && (await call("GET", "/api/admin/survivorz/cast")).status === 401, "the panel's list is the admin's alone (member 403, nobody 401)");
    const g = (await call("GET", "/api/admin/survivorz/cast", admin)).j;
    ok(g?.cast?.length === cast.length && g.list.length === 0 && g.bodies.includes("marcus") && g.canHear === false, "the cast from the files, an empty list, the baked bodies, and no model about");
    const rick = cast.find((c) => c.id === "rick");
    const marcus = { ...structuredClone(rick), id: "marcus", status: "bench", order: 50, strip: 50, name: "Marcus Bell", short: "Marcus", tag: "Night janitor", body: "marcus",
      regard: { rick: 20 }, voice: { clone: "survivor-marcus", kokoro: "am_adam" },
      sheet: "You are MARCUS. Fifties, the night janitor at a downtown office tower. " + "Slow, kind, stubborn. ".repeat(10) };
    const db = () => new (require("node:sqlite").DatabaseSync)(path.join(DATA_DIR, "solace.db"), { readOnly: true });
    const rows = () => { const d = db(); const r = d.prepare("SELECT id, data, regardIn FROM survivorz_characters").all(); d.close(); return r; };
    const badSave = await call("POST", "/api/admin/survivorz/cast/save", admin, { char: { ...marcus, skills: { ...marcus.skills, melee: 11 } } });
    ok(badSave.status === 400 && badSave.j.errors.some((e) => e.field === "skills.melee") && rows().length === 0, "a bad character is refused and nothing is kept");
    // (a browser draft in the old shape is converted on save, never refused for its old fields)
    const oldDraft = { ...structuredClone(marcus), id: "olddraft", short: "Olddy", name: "Old Draft", body: "olddraftbody", status: "draft", voice: { clone: "", kokoro: "am_adam" }, stats: { combat: 4, nimble: 6, thinking: 5, creative: 5 }, perks: ["medic"], world: "outside" };
    delete oldDraft.order; delete oldDraft.strip;
    const oldChk = await call("POST", "/api/admin/survivorz/cast/check", admin, { char: oldDraft });
    ok(oldChk.status === 200 && oldChk.j.errors.length === 0, "an old-shape draft passes the check (converted, not refused)");
    ok((await call("POST", "/api/admin/survivorz/cast/save", member, { char: marcus })).status === 403, "a member can't save to the list");
    const good = await call("POST", "/api/admin/survivorz/cast/save", admin, { char: marcus, regardIn: { rick: 10, nobody: 5, sarah: 999 } });
    const row = rows().find((r) => r.id === "marcus");
    ok(good.status === 200 && row && JSON.parse(row.data).name === "Marcus Bell" && same(JSON.parse(row.regardIn), { rick: 10 }), "a good one is kept in the database, junk regard dropped");
    ok(!fs.existsSync(path.join(CAST_DIR, "marcus.json")), "…and the server never writes a repo file");
    const zed = { ...structuredClone(marcus), id: "zed", short: "Zed", name: "Zed Okoro", body: "zed", sheet: marcus.sheet.replace(/MARCUS/g, "ZED"), voice: { clone: "survivor-zed", kokoro: "am_adam" } };
    delete zed.order; delete zed.strip;   // (the creator no longer sends them: the server places a new character)
    const z = await call("POST", "/api/admin/survivorz/cast/save", admin, { char: zed });
    ok(z.status === 200 && z.j.warnings.some((w) => w.field === "body"), "a body not baked yet is saved, with a note that it needs baking");
    const zrow = JSON.parse(rows().find((r) => r.id === "zed")?.data ?? "{}");
    ok(Number.isInteger(zrow.order) && Number.isInteger(zrow.strip) && zrow.order > Math.max(...cast.map((c) => c.order)), "a new character sent without spawn/strip order is placed after everyone");
    // THE CAST IS LIVE (Josh, Nov 4 2026: "bring in without me"): a saved bench character with a baked body is
    // in the show at once; one whose body isn't baked is held, and joins the moment it is
    const showIds = async () => ((await call("GET", "/api/admin/survivorz/setup", admin)).j?.characters ?? []).map((c) => c.id);
    let sids = await showIds();
    ok(good.j.live === true && sids.includes("marcus"), "THE CAST IS LIVE: a saved bench character whose body is baked is in the show at once, no deploy");
    ok(z.j.live === false && /body/.test(z.j.held ?? "") && !sids.includes("zed"), "…one whose body isn't baked is held back, and says why");
    const tz = (await call("GET", "/api/admin/survivorz/cast", admin)).j?.todo ?? {};
    const step = (id, k) => (tz[id] ?? []).find((s) => s.key === k);
    ok(step("marcus", "body")?.done && step("marcus", "live")?.done && !step("zed", "body")?.done && /model/.test(step("zed", "body")?.note ?? "") && !step("zed", "live")?.done,
      "WHAT'S LEFT: each character's steps (marcus in the show; zed waiting on a model)");
    ok(step("rick", "pairs")?.done === true && step("marcus", "pairs")?.done === false && step("marcus", "voice")?.done === false,
      "…grabs and bites done for a hand-made body, not yet for a new one; a voice not in the library is a step left");
    fs.writeFileSync(path.join(FIX, "game", "zed.glb"), "");
    await call("POST", "/api/admin/survivorz/cast/save", admin, { char: { ...zed, order: zrow.order, strip: zrow.strip } });
    sids = await showIds();
    ok(sids.includes("zed"), "…and once their body is baked they're in the show");
    // THE SHOW PANEL'S CAST CARD (Nov 5 2026): every character with what they're good at and what's left, and one
    // click — Cast / Bench / Off — saved as the list entry the creator sees
    const ro = await call("GET", "/api/admin/survivorz/roster", admin);
    const rz = (ro.j?.roster ?? []).find((c) => c.id === "zed"), rr = (ro.j?.roster ?? []).find((c) => c.id === "rick");
    ok(ro.status === 200 && (await call("GET", "/api/admin/survivorz/roster", member)).status === 403 && rr?.top?.length > 0 && rr.top[0].label && !("sheet" in rr) && !("genes" in rr) && rz?.steps?.length > 0,
      "the roster is the admin's alone, names each character's best skills, and never carries a sheet or genes");
    ok((await call("POST", "/api/admin/survivorz/cast/zed/status", admin, { status: "nope" })).status === 400 && (await call("POST", "/api/admin/survivorz/cast/nobodyhere/status", admin, { status: "bench" })).status === 404
      && (await call("POST", "/api/admin/survivorz/cast/zed/status", member, { status: "bench" })).status === 403, "the status lever refuses a bad status, an unknown character and a member");
    const off = await call("POST", "/api/admin/survivorz/cast/zed/status", admin, { status: "draft" });
    sids = await showIds();
    ok(off.status === 200 && !sids.includes("zed") && JSON.parse(rows().find((r) => r.id === "zed").data).status === "draft", "OFF takes a character out of the show, kept as a draft in the list");
    const on = await call("POST", "/api/admin/survivorz/cast/zed/status", admin, { status: "bench" });
    sids = await showIds();
    ok(on.status === 200 && on.j.live === true && sids.includes("zed"), "…and BENCH puts them straight back in");
    fs.rmSync(path.join(FIX, "game", "zed.glb"));   // (the pull below still finds zed unbaked)
    const rickEdit = await call("POST", "/api/admin/survivorz/cast/save", admin, { char: { ...rick, tag: "Former deputy, now in charge" } });
    const g2 = (await call("GET", "/api/admin/survivorz/cast", admin)).j;
    const st = Object.fromEntries(g2.list.map((e) => [e.char.id, e.state]));
    ok(rickEdit.status === 200 && st.marcus === "new" && st.zed === "new" && st.rick === "changed", "the list marks new characters and a change to one in the show");
    ok((await call("DELETE", "/api/admin/survivorz/cast/rick", admin)).status === 200 && (await call("DELETE", "/api/admin/survivorz/cast/rick", admin)).status === 404, "a list entry can be removed, once");
    const d = db(); const aud = d.prepare("SELECT action FROM audit WHERE action LIKE 'survivorz.character%'").all().map((r) => r.action); d.close();
    ok(aud.includes("survivorz.character_saved") && aud.includes("survivorz.character_removed"), "saving and removing are audited");
    // DELETING A CHARACTER (Josh, Nov 3 2026): a show character is marked, a list-only one is gone
    const victim = Object.keys(rick.regard).find((k) => k !== "rollo" && cast.some((c) => c.id === k));
    ok((await call("POST", `/api/admin/survivorz/cast/${victim}/delete`, member)).status === 403
      && (await call("POST", "/api/admin/survivorz/cast/NOPE/delete", admin)).status === 400
      && (await call("POST", "/api/admin/survivorz/cast/nobodyhere/delete", admin)).status === 404, "deleting is the admin's alone, and refuses a bad or unknown id");
    const del = await call("POST", `/api/admin/survivorz/cast/${victim}/delete`, admin);
    const g3 = (await call("GET", "/api/admin/survivorz/cast", admin)).j;
    const ve = g3.list.find((e) => e.char.id === victim);
    ok(del.status === 200 && del.j.pending === false && ve?.deleted === true && ve.state === "deleted" && ve.char.name === cast.find((c) => c.id === victim).name,
      "a show character is marked deleted on the list, named");
    ok(!(await showIds()).includes(victim), "…and is out of the show at once");
    ok(fs.existsSync(path.join(CAST_DIR, `${victim}.json`)), "…and the server leaves the repo file alone");
    const chk = (await call("POST", "/api/admin/survivorz/cast/check", admin, { char: rick })).j;
    ok(chk && !chk.errors.some((e) => e.field === "regard"), "what the others think of somebody deleted goes quietly (no regard error)");
    ok((await call("DELETE", `/api/admin/survivorz/cast/${victim}`, admin)).status === 409
      && (await call("GET", "/api/admin/survivorz/cast", admin)).j.list.some((e) => e.char.id === victim && e.deleted) && !(await showIds()).includes(victim), "a deletion is for good: it can't be undone, and they stay out of the show");
    const yan = { ...structuredClone(zed), id: "yan", short: "Yan", name: "Yan Li", body: "yan", sheet: zed.sheet.replace(/ZED/g, "YAN"), voice: { clone: "survivor-yan", kokoro: "am_adam" } };
    const ys = await call("POST", "/api/admin/survivorz/cast/save", admin, { char: yan });
    const yd = await call("POST", "/api/admin/survivorz/cast/yan/delete", admin);
    ok(ys.status === 200 && yd.status === 200 && yd.j.pending === false && !rows().some((r) => r.id === "yan"), "a character only on the list is deleted outright");
    const d2 = db(); const aud2 = d2.prepare("SELECT action FROM audit WHERE action = 'survivorz.character_deleted'").all(); d2.close();
    ok(aud2.length >= 2, "deleting is audited");
    // pull the list into a copy of the cast
    const tmpCast = path.join(tmp, "cast");
    fs.mkdirSync(tmpCast);
    for (const f of fs.readdirSync(CAST_DIR)) if (f.endsWith(".json") || f === "files.ts") fs.copyFileSync(path.join(CAST_DIR, f), path.join(tmpCast, f));
    const out = await new Promise((resolve) => {
      const k = spawn(process.execPath, [path.join(ROOT, "scripts/survivorz/pull-cast.mjs"), "--local", path.join(DATA_DIR, "solace.db")],
        { env: { ...process.env, PULL_CAST_DIR: tmpCast, PULL_BODY_DIR: path.join(FIX, "game") }, stdio: ["ignore", "pipe", "pipe"] });
      let o = ""; k.stdout.on("data", (x) => { o += x; }); k.stderr.on("data", (x) => { o += x; }); k.on("exit", (code) => resolve({ code, o }));
    });
    const m = fs.existsSync(path.join(tmpCast, "marcus.json")) && JSON.parse(fs.readFileSync(path.join(tmpCast, "marcus.json"), "utf8"));
    const zz = fs.existsSync(path.join(tmpCast, "zed.json")) && JSON.parse(fs.readFileSync(path.join(tmpCast, "zed.json"), "utf8"));
    const r3 = JSON.parse(fs.readFileSync(path.join(tmpCast, "rick.json"), "utf8"));
    ok(out.code === 0 && m && m.status === "bench" && r3.regard.marcus === 10, "pull-cast writes the list into the cast, the others' regard into their files" + (out.code ? " — " + out.o.slice(-1500) : ""));
    ok(zz && zz.status === "draft" && /bake the body/.test(out.o), "a character whose body isn't baked is written as a draft, and the pull says to bake it");
    const files3 = fs.readFileSync(path.join(tmpCast, "files.ts"), "utf8");
    const all3 = fs.readdirSync(tmpCast).filter((f) => /^[a-z]{2,16}\.json$/.test(f) && f !== "public.json").map((f) => JSON.parse(fs.readFileSync(path.join(tmpCast, f), "utf8")));
    ok(files3.includes('"./marcus.json"') && files3.includes('"./zed.json"') && all3.every((c) => rules.checkCharacter(c, all3).errors.length === 0), "files.ts lists them and the pulled cast passes every rule");
    ok(!fs.existsSync(path.join(tmpCast, `${victim}.json`)) && !files3.includes(`"./${victim}.json"`) && all3.every((c) => !(victim in (c.regard ?? {})))
      && new RegExp(`deleted: ${victim}`).test(out.o), "pull-cast removes a deleted character's file and everyone's regard of them, and says so");
  } finally {
    const gone = new Promise((r) => srv.once("exit", r));
    srv.kill("SIGINT");
    await Promise.race([gone, sleep(5000)]);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
}

console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
