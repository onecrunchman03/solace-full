// SOLACE SURVIVORZ — THE TALK + CHOICE LAYER (src/survivorz/talk/), driven against a FAKE model.
//
// Run:  npm run build && node scripts/checks/test_survivorz_talk.mjs
//
// The real model is shared with the casino regulars and isn't deterministic, so this stands up its
// own Ollama-shaped server (/api/chat, /api/ps) that answers by what it's asked and RECORDS every
// request — which is what lets it prove what the model was and wasn't shown.
//
// What it pins:
//   1. THE CHECKS — THE LINE (the regex, and the second read failing CLOSED when it can't be had),
//      an invented number retried then refused, a percentage allowed (odds are opinion), markdown
//      and stage directions stripped, a worn phrase sent back once.
//   2. NO BRAIN = THE SIM UNCHANGED: model down, or the admin's switch off — the same seed plays the
//      same show to the event, and nothing is said or asked.
//   3. FACTS ONLY: in a live run, no prompt ever names a room the survivor it's for doesn't know,
//      and no keycard spot is ever named; every line prompt carries FACTS and the moment.
//   4. PACING: one speaker at a time in a room (a line holds the floor for its length), at most
//      ROOM_PER_MIN lines a minute in a room; a survivor's choice is asked at most once per gap.
//   5. CHOICES: a pick on the menu is taken (and remembered with its why); one OFF the menu is
//      ignored; an urgent menu is code's alone; a pick no longer on the menu is dropped.
//   6. MEETINGS: the group together in a safe room → the leader proposes, every other present
//      survivor answers, one closes, a plan with roles stands, and it reaches `choose`.
//   7. MEMORY: the diary at the main sleep, notes on the others, kept per world, fresh on reset.
//   8. END TO END over a real server: the switch admin-only and audited, and a `say` frame reaching
//      a watcher's socket — and a `think`, and the standing thoughts handed to a socket that joins late.
//   9. THE THOUGHTS (the cast cards' line, Josh Oct 28 2026): code's thought on every living card
//      with the brain off, never asking the model; the sim the SAME event for event with thoughts on
//      or off; in a live run the model's thoughts paced per survivor (the gap, a moment's pull never
//      closer than MIN_MS, one written at a time and only with two slots free), checked like a line
//      (a thought over THE LINE never shown), short; and a secret bite never in a thought — left
//      out of every thought prompt and refused coming out — while one about the dead is fine once
//      no bite is secret.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const D = (p) => require(path.join(ROOT, "dist", p));
const { SimWorld, CHOICE_WAIT } = D("survivorz/sim/world.js");
const { SurvivorMinds, TALK, THINK, canSpeak } = D("survivorz/talk/minds.js");
const { VOICE, agentSeen, voiceTake, resetVoices } = D("survivorz/voices.js");
const { codeThought, BITE_WORDS } = D("survivorz/talk/thoughts.js");
const { talkWorld } = D("survivorz/talk/show.js");
const { endpointModel } = D("survivorz/talk/model.js");
const { cleanLine, writeChecked, holdsLine, pickChecked, echoes } = D("survivorz/talk/lines.js");
const { KV_MINDS } = D("survivorz/talk/memory.js");
const { SITE_9 } = D("survivorz/facility-map.js");
const { WebSocket } = require(path.join(ROOT, "node_modules", "ws"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  ✗ " + name); } else console.log("  ✓ " + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = 8588, FAKE_PORT = 8589;
const MODEL = "fake-survivor:1b";

// ---------------------------------------------------------------------------------------------
// THE FAKE MODEL

const reqs = [];
const mode = { line: "ok", choice: "b", gateDown: false, plan: "a", thought: "ok", goal: null };
const GOALS = ["Get everyone back to the safe room alive.", "Find a way out of this place.", "Keep the kid close and fed.", "Find food before tomorrow.", "Stay away from Dale."];
let gi = 0;
/** set by the in-process parts: called as each request arrives, to judge it against the live world */
let onReq = null;
const LINES = [
  "Hold up, I hear something down there.", "Okay, nobody goes anywhere alone.", "Well that's just fucking great.",
  "Keep your voice down, they hear everything.", "I need a drink and about nine years of sleep.", "Copy that, moving.",
  "Look at me, breathe, we're fine.", "Bro, that door is not holding.", "Somebody tell me that was the pipes.",
  "Fine, but I'm not carrying your ass back.", "We stick together and we live.", "Shit, shit, shit — move!",
];
let li = 0;
const THOUGHTS = [
  "Nobody here sleeps right, me least of all.", "That door won't hold forever.", "Keep the kid close. She's not ready.",
  "Rick's carrying too much and won't say so.", "Don't freeze. Not now, not in front of them.", "Somebody opened that vault. Why?",
  "I'd kill for a cold beer and a real bed.", "Stay quiet, stay alive.", "Is anybody coming for us at all?",
  "Dale's hiding something. I'd bet on it.", "One more room, then back.", "This place smells like a hospital that died.",
];
let ti = 0;
const fake = createServer((req, res) => {
  let raw = "";
  req.on("data", (d) => { raw += d; });
  req.on("end", () => {
    const send = (obj, code = 200) => { try { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); } catch {} };
    if (req.url === "/api/ps") return send({ models: [{ name: MODEL, model: MODEL }] });
    if (req.url !== "/api/chat") { res.writeHead(404); return res.end(); }
    const body = JSON.parse(raw || "{}");
    const msgs = body.messages ?? [];
    const system = msgs.find((m) => m.role === "system")?.content ?? "";
    const user = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
    const props = body.format?.properties ?? {};
    const kind = props.kind ? "gate" : props.choice ? "choice" : props.diary ? "diary" : props.goal ? "goal" : body.format ? "other" : /Your private thought now/.test(user) ? "thought" : "line";
    const rec = { at: Date.now(), kind, system, user, format: body.format, who: (system.match(/^You are ([A-Z]+)/) ?? [])[1]?.toLowerCase() ?? null };
    reqs.push(rec);
    try { onReq?.(rec); } catch (e) { console.error(e); }
    if (kind === "gate") {
      if (mode.gateDown) return send({ error: "down" }, 500);
      return send({ message: { content: JSON.stringify({ kind: /FORBIDLINE/.test(user) ? "forbidden" : "chat", other: "none" }) } });
    }
    if (kind === "choice") {
      const en = props.choice.enum;
      const isPlan = /THE PLANS:/.test(user);
      const c = isPlan ? (en.includes(mode.plan) ? mode.plan : en[0]) : mode.choice === "zz" ? "zz" : en.includes(mode.choice) ? mode.choice : en[0];
      return send({ message: { content: JSON.stringify({ why: mode.why ?? "because it feels right", choice: c }) } });
    }
    if (kind === "goal") return send({ message: { content: JSON.stringify({ goal: mode.goal ?? GOALS[gi++ % GOALS.length], why: "it's what matters" }) } });
    if (kind === "diary") {
      const names = Object.keys(props.notes?.properties ?? {});
      const notes = Object.fromEntries(names.map((x) => [x, `${x} pulled their weight today.`]));
      return send({ message: { content: JSON.stringify({ diary: "Long day. We're still here.", notes }) } });
    }
    const retried = /rejected|you've been saying that/.test(system);
    if (mode.line === "stock") return send({ message: { content: /Still the same line/.test(system) ? (mode.stockRetry2 ?? mode.stockRetry ?? "Not today, you rotten thing.") : /said down here already/.test(system) ? (mode.stockRetry ?? "Not today, you rotten thing.") : "Get your hands off me, you bastard!" } });
    if (kind === "thought") {
      let th = THOUGHTS[ti++ % THOUGHTS.length];
      if (mode.thought === "line") th = "That little kid is naked and sexy.";
      else if (mode.thought === "bite") th = rec.who === "dale" ? "Nobody can know I got bitten." : "Dale got bit, I saw it.";
      else if (mode.thought === "dead") th = "They bite through anything, those things.";
      return send({ message: { content: th } });
    }
    let out = LINES[li++ % LINES.length];
    if (mode.line === "line") out = "That little kid is naked and sexy.";
    else if (mode.line === "forbid") out = "FORBIDLINE something awful.";
    else if (mode.line === "number") out = retried ? "We've got enough, I think." : "We have 4471 cans in the box.";
    else if (mode.line === "same") out = "Same old crap, same old crap.";
    else if (mode.line === "markdown") out = '"*sighs* **Rick:** okay (looks around) we move."';
    send({ message: { content: out } });
  });
});
await new Promise((r) => fake.listen(FAKE_PORT, "127.0.0.1", r));
const EP = { name: "steady", url: `http://127.0.0.1:${FAKE_PORT}`, model: MODEL, numCtx: 4096 };
const model = endpointModel(EP);
const since = (t, kind) => reqs.filter((r) => r.at >= t && (!kind || r.kind === kind));

// ---------------------------------------------------------------------------------------------
console.log("1. the checks");
{
  ok(!cleanLine("That little kid is naked.", "Rick", "").ok, "THE LINE's regex refuses a line with a minor word and a sex word");
  ok(cleanLine("I give that door forty percent — no, 40%.", "Rollo", "").ok, "a percentage is opinion, not an invented fact");
  ok(!cleanLine("We've got 4471 cans.", "Rick", "FACTS: 12 food").ok, "a number nobody was shown is refused");
  ok(cleanLine("We've got 12 food.", "Rick", "FACTS: 12 food").ok, "a number from FACTS passes");
  const c = cleanLine('"*sighs* Rick: okay (looks around) we move."', "Rick", "");
  ok(c.ok && !/[*()]/.test(c.text) && !/^Rick:/.test(c.text), "markdown, stage directions, quotes and a name prefix are stripped: " + JSON.stringify(c.text));
  let t0 = Date.now();
  mode.line = "forbid";
  ok((await writeChecked(model, "SYS", "USER", "Rick", [], 3000)) === null, "a line the second read calls forbidden is never said");
  mode.line = "ok"; mode.gateDown = true;
  ok((await writeChecked(model, "SYS", "USER", "Rick", [], 3000)) === null, "a second read that can't be had FAILS CLOSED");
  ok(!(await holdsLine(model, "Hello there.", 3000)), "holdsLine is false when the classifier is down");
  mode.gateDown = false;
  mode.line = "number"; t0 = Date.now();
  const nl = await writeChecked(model, "SYS", "USER with 12 food", "Rick", [], 3000);
  ok(nl === "We've got enough, I think.", "an invented number is retried with the reason, and the clean retry is said");
  ok(since(t0, "line").some((r) => /isn't in FACTS/.test(r.system)), "…the retry told the model why");
  mode.line = "line";
  ok((await writeChecked(model, "SYS", "USER", "Rick", [], 3000)) === null, "a draft over THE LINE, twice, says nothing");
  mode.line = "same"; t0 = Date.now();
  await writeChecked(model, "SYS", "USER", "Ben", ["Same old crap, same old crap.", "Same old crap again."], 3000);
  ok(since(t0, "line").some((r) => /you've been saying that/.test(r.system)), "a worn opening is sent back once");
  mode.line = "ok";
  const p = await pickChecked(model, "SYS", "USER", ["a", "b"], 3000);
  ok(p?.id === "b" && p.why.length > 0, "a pick on the menu comes back with its why");
  mode.choice = "zz";
  ok((await pickChecked(model, "SYS", "USER", ["a", "b"], 3000)) === null, "a pick OFF the menu is ignored");
  mode.choice = "b";
}

// ---------------------------------------------------------------------------------------------
console.log("2. no brain = the sim unchanged");
{
  const SEED = 424242, START = 1_800_000_000_000;
  const run = (w) => { const said = []; w.onFrame((f) => { if (f.type === "say") said.push(f); }); for (let i = 0; i < 20 * 60; i++) w.tick(1000); return said; };
  const plain = new SimWorld({ seed: SEED, start: START });
  run(plain);
  const t0 = Date.now();
  const offModel = endpointModel(EP, () => false);
  const m1 = new SurvivorMinds({ model: offModel, allowed: () => true });
  const w1 = talkWorld(new SimWorld({ seed: SEED, start: START, hooks: m1.hooks }), m1);
  const s1 = run(w1);
  const m2 = new SurvivorMinds({ model, allowed: () => false });
  const w2 = talkWorld(new SimWorld({ seed: SEED, start: START, hooks: m2.hooks }), m2);
  const s2 = run(w2);
  const sig = (w) => JSON.stringify({ t: w.t, ev: w.stats.events, s: w.survivors.map((s) => [s.who, Math.round(s.x * 100), Math.round(s.z * 100), Math.round(s.hp), s.mode, s.job?.kind]) });
  ok(sig(w1.sim) === sig(plain), "model down: the same seed plays the same show, event for event");
  ok(sig(w2.sim) === sig(plain), "the admin's switch off: the same show too");
  ok(s1.length === 0 && s2.length === 0, "…and nobody says anything");
  ok(since(t0).length === 0, "…and the model is never asked");
  ok(Object.values(plain.stats.events).reduce((a, b) => a + b, 0) > 50, "(the comparison is over a real stretch of show: " + Object.values(plain.stats.events).reduce((a, b) => a + b, 0) + " events)");

  // THE THOUGHTS with no brain: code's, on every living card; and the show the same with them off
  console.log("9a. thoughts with no brain");
  const frames = (w) => { const out = { sim: [], think: [] }; w.onFrame((f) => { (f.type === "think" ? out.think : out.sim).push(f); }); for (let i = 0; i < 20 * 60; i++) w.tick(1000); return out; };
  const t1 = Date.now();
  const mOn = new SurvivorMinds({ model: offModel, allowed: () => true });
  const wOn = talkWorld(new SimWorld({ seed: SEED, start: START, hooks: mOn.hooks }), mOn);
  const fOn = frames(wOn);
  const mOff = new SurvivorMinds({ model: offModel, allowed: () => true, thoughts: false });
  const wOff = talkWorld(new SimWorld({ seed: SEED, start: START, hooks: mOff.hooks }), mOff);
  const fOff = frames(wOff);
  ok(JSON.stringify(fOn.sim) === JSON.stringify(fOff.sim) && sig(wOn.sim) === sig(plain), `thoughts on or off: the sim's frames are identical, frame for frame (${fOn.sim.length} frames), and match the hook-less show`);
  ok(fOff.think.length === 0 && fOn.think.length > 0, `thoughts off sends none; on, code's thoughts go out (${fOn.think.length})`);
  const living = wOn.sim.survivors.filter((x) => x.alive);
  const shown = new Map(); for (const f of fOn.think) shown.set(f.by, f.text);
  ok(living.every((x) => (shown.get(x.id) ?? "").length > 0), `every living card has a thought with the brain off (${living.length} of ${living.length})`);
  ok(mOn.thinkLog.every((l) => l.src === "code") && since(t1).length === 0, "…all of them code's, and the model is never asked");
  ok(fOn.think.every((f) => f.text.length <= THINK.MAX_CHARS && /^s:/.test(f.by) && !BITE_WORDS.test(f.text)), "code's thoughts are short, name a body, and never a bite");
  // a thought stands until what drives them changes: no flicker
  const perWho = new Map(); for (const l of mOn.thinkLog) { const a = perWho.get(l.who) ?? []; a.push(l); perWho.set(l.who, a); }
  let flicker = 0;
  for (const a of perWho.values()) for (let i = 1; i < a.length; i++) if (a[i].t - a[i - 1].t < THINK.CHECK_MS) flicker++;
  ok(flicker === 0, `a card's thought changes at most once a check (${mOn.thinkLog.length} over 20 sim min)`);
  const lateJoin = mOn.thoughtFrames(wOn.sim);
  ok(lateJoin.length === living.length && lateJoin.every((f) => f.type === "think" && f.text === shown.get(f.by)), "the standing thoughts can be handed to a watcher who joins late");
}

// ---------------------------------------------------------------------------------------------
console.log("3-5. a live run: facts only, pacing, choices");
const kvStore = new Map();
const kv = { kvGet: (k) => kvStore.get(k) ?? null, kvSet: (k, v) => { kvStore.set(k, v); } };
{
  TALK.MEETINGS = false;     // meetings are part 6's
  const minds = new SurvivorMinds({ model, allowed: () => true, kv });
  const sim = new SimWorld({ seed: 777001, start: 1_800_000_000_000, hooks: minds.hooks });
  const w = talkWorld(sim, minds);
  const says = [];
  const roomOf = (id) => { const s = sim.survivors.find((x) => x.id === id); return s ? (s.room >= 0 ? `r${s.room}` : `f${s.floor}:${Math.round(s.x / 12)}:${Math.round(s.z / 12)}`) : "?"; };
  w.onFrame((f) => { if (f.type === "say") says.push({ ...f, room: roomOf(f.by) }); });
  const thinks = [];
  let maxAsking = 0, maxThinking = 0, thoughtPrompts = 0, thoughtFactsAll = true, biteInPrompt = 0;
  w.onFrame((f) => { if (f.type === "think") thinks.push(f); });
  const decides = [], goalFr = [];
  w.onFrame((f) => { if (f.type === "decide") decides.push(f); if (f.type === "goal") goalFr.push(f); });
  // a watcher's view of the same frames (the broadcast fans exactly these)
  // what each prompt may name: the rooms that survivor knows, the room they stand in, the zone and
  // door names they can read; every other room's name is unseen
  const spotIds = SITE_9.rooms.flatMap((r) => r.spots.filter((s) => s.kind === "keycard").map((s) => s.id));
  const leaks = [], choiceAt = new Map();
  let linePrompts = 0, factsInAll = true;
  onReq = (rec) => {
    if (!rec.who) return;
    const s = sim.survivors.find((x) => x.who === rec.who);
    if (!s) return;
    const text = rec.system + "\n" + rec.user;
    const k = s.know;
    const allowed = new Set();
    for (let r = 0; r < sim.nav.rooms.length; r++) if ((k && k.room[r]) || r === s.room) { allowed.add(sim.nav.rooms[r].name); }
    for (const z of SITE_9.zones) allowed.add(z.name);
    for (let d = 0; d < sim.nav.doors.length; d++) if (k && k.door[d] && sim.nav.doors[d].name) allowed.add(sim.nav.doors[d].name);
    for (const sh of ["Halcyon Site 9"]) allowed.add(sh);
    for (let r = 0; r < sim.nav.rooms.length; r++) {
      const R = sim.nav.rooms[r];
      if (allowed.has(R.name)) continue;
      if (text.includes(R.name)) { leaks.push(`${rec.who} shown unseen room "${R.name}"`); if (process.env.TALK_DEBUG) console.log("    LEAK " + rec.who + ": " + text.split("\n").filter((l) => l.includes(R.name)).join(" | ")); }
      // (only the ids that can't be ordinary words — "kitchen" and "outside" can)
      if (R.id.includes("-") && new RegExp(`\\b${R.id}\\b`).test(text)) leaks.push(`${rec.who} shown room id "${R.id}"`);
    }
    for (const id of spotIds) if (text.includes(id)) leaks.push(`${rec.who} shown keycard spot "${id}"`);
    if (rec.kind === "line" && !/^You keep/.test(rec.system)) { linePrompts++; if (!/FACTS:/.test(rec.user) || !/WHAT JUST HAPPENED/.test(rec.user)) factsInAll = false; }
    if (rec.kind === "thought") {
      thoughtPrompts++;
      if (!/FACTS:/.test(rec.user) || !/WHAT'S DRIVING YOU/.test(rec.user) || !/HOW YOU THINK/.test(rec.system)) thoughtFactsAll = false;
      // a SECRET bite (the talk layer's own rule, minds.biteHidden): bitten, and the broadcast shows no known
      // infection — since the infection round (Oct 30 2026) a bite somebody saw, or owned up to, is known
      if (sim.survivors.some((x) => x.alive && x.bitten && !sim.vitals(x).infected) && /you've been BITTEN|You were bitten|hid the bite/.test(text)) biteInPrompt++;
    }
    if (rec.kind === "choice" && !/THE PLANS:|nobody saw it happen/.test(rec.user)) { const a = choiceAt.get(rec.who) ?? []; a.push(sim.t); choiceAt.set(rec.who, a); }
  };
  const t0 = Date.now();
  const SIM_MIN = 50;
  for (let i = 0; i < SIM_MIN * 60; i++) {
    w.tick(1000);
    maxThinking = Math.max(maxThinking, minds.status().thinking);
    maxAsking = Math.max(maxAsking, minds.asking);
    if (i === 600) sim.down("s:ben");          // a big moment, and a witness or two
    if (i === 1500) sim.kill("s:sarah");
    if (i % 2 === 0) await sleep(2);
  }
  // let the last writes land
  for (let i = 0; i < 40; i++) { w.tick(500); await sleep(5); }
  onReq = null;
  const lr = since(t0, "line").length;
  if (process.env.TALK_DEBUG) console.log("    meetings", minds.status().meetings, "plan", minds.plan?.kind);
  ok(says.length >= 3, `the survivors talk: ${says.length} lines said over ${SIM_MIN} sim minutes (${lr} line requests)`);
  ok(linePrompts > 0 && factsInAll, `every line prompt carries FACTS and the moment (${linePrompts})`);
  ok(leaks.length === 0, "no prompt ever names a room its survivor hasn't seen, a room id, or a keycard spot" + (leaks.length ? ": " + [...new Set(leaks)].slice(0, 4).join("; ") : ""));
  ok(says.every((s) => LINES.includes(s.text)), "what's said is what the model wrote, after the checks");
  ok(says.every((s) => /^s:/.test(s.by) && (!s.to || /^s:/.test(s.to))), "say frames name bodies (by / to are body ids)");
  // one speaker per room: a line holds the floor for its length
  const hold = (t) => Math.min(TALK.HOLD_MAX_MS, Math.max(TALK.HOLD_MIN_MS, t.length * TALK.HOLD_PER_CHAR_MS)) + TALK.GAP_MS;
  let overlap = 0, overCap = 0;
  const byRoom = new Map();
  for (const s of minds.log) { const a = byRoom.get(s.room) ?? []; a.push(s); byRoom.set(s.room, a); }
  for (const a of byRoom.values()) {
    for (let i = 1; i < a.length; i++) if (a[i].t < a[i - 1].t + hold(a[i - 1].text)) overlap++;
    // (an urgent line — a grab, going down, a death — may go past the cap; nothing else may)
    for (let i = 0; i < a.length; i++) if (a[i].prio > 0 && !a[i].meeting && a.filter((x) => x.t > a[i].t - 60_000 && x.t <= a[i].t).length > TALK.ROOM_PER_MIN) { overCap++; if (process.env.TALK_DEBUG) console.log("    OVER", JSON.stringify(a.filter((x) => x.t > a[i].t - 60_000 && x.t <= a[i].t).map((x) => [x.t % 1e6, x.who, x.prio, x.meeting]))); }
  }
  ok(minds.log.length === says.length, "every line said went out as a say frame");
  ok(overlap === 0, "never two survivors talking over each other in a room");
  ok(overCap === 0, `at most ${TALK.ROOM_PER_MIN} lines a minute in a room (bar the urgent)`);
  let tooSoon = 0;
  for (const a of choiceAt.values()) for (let i = 1; i < a.length; i++) if (a[i] - a[i - 1] < TALK.MIN_ASK_MS - 4_000) tooSoon++;   // (receipt lags the ask: the sim runs ~500x real here, so a few ms of event loop is seconds of sim)
  ok(choiceAt.size >= 3 && tooSoon === 0, `the model is asked each survivor's choices, never twice at once (${[...choiceAt.values()].flat().length} asks, ${choiceAt.size} survivors)`);
  const st = minds.status();
  const share = st.thinksAi / Math.max(1, st.thinksAi + st.thinksCode);
  ok(share >= 0.9, `the model decides the thinks, code only when it can't (${Math.round(share * 100)}% of ${st.thinksAi + st.thinksCode})`);
  ok(maxAsking <= TALK.MAX_ASKS, `at most ${TALK.MAX_ASKS} choices asked at once (${maxAsking})`);
  ok(minds.stats.choicesTaken > 0 && Object.values(minds.minds).some((m) => m.choices.some((c) => c.why)), `picks are taken and remembered with their why (${minds.stats.choicesTaken})`);
  // ---- THEIR OWN GOALS ----
  const goalReqs = since(t0, "goal");
  const withGoal = Object.values(minds.minds).filter((m) => m.goal && GOALS.includes(m.goal.text)).length;
  ok(withGoal >= 4, `the survivors set their own goals, in their own words (${withGoal} with a goal, ${goalReqs.length} asked)`);
  ok(goalReqs.length > 0 && goalReqs.every((r) => /FACTS:/.test(r.user)), "every goal prompt carries FACTS");
  ok(since(t0, "choice").some((r) => /YOUR GOAL \(you set it yourself\): /.test(r.system) && /pick what serves it/.test(r.user)), "a goal rides the choices that follow it");
  ok(minds.status().goals && Object.keys(minds.status().goals).length >= 4, "the show's status names each survivor's goal");
  // ---- PHASE 4: what the screen shows of it ----
  ok(decides.length >= 3 && decides.every((f) => /^s:/.test(f.by) && f.did && f.reason === "because it feels right"), `the AI's choices go on screen with their reason (${decides.length} DECIDED captions)`);
  let decBad = 0;
  const lastDec = new Map();
  for (const f of decides) { if (f.kind) continue; const p = lastDec.get(f.by); if (p !== undefined && f.t - p < TALK.DECIDE_GAP_MS) decBad++; lastDec.set(f.by, f.t); }
  ok(decBad === 0, `one survivor's caption at most every ${TALK.DECIDE_GAP_MS / 1000}s (a turn on somebody aside)`);
  // (every LIVING survivor's goal is on their card: the run has the dead in it, so by the end some may have died)
  const carded = sim.survivors.filter((x) => x.alive && minds.minds[x.who].goal?.screen).length;
  ok(goalFr.length >= 4 && goalFr.every((f) => GOALS.includes(f.text)) && minds.goalFrames(sim).length === carded, `their goals reach the cast cards once read twice (${goalFr.length} goal frames, ${carded} on living cards)`);
  const sh = minds.status().share;
  ok(sh.pct !== null && sh.pct >= 90 && sh.ai + sh.code > 0, `the admin's counter: the AI made ${sh.pct}% of the choices in the last hour`);
  ok(says.some((s) => s.by === "s:ben") || reqs.some((r) => r.at >= t0 && r.who === "ben" && /went DOWN/.test(r.user)), "going down is a moment the survivor speaks to");

  // ---- the thoughts in a live run ----
  const modelThoughts = minds.thinkLog.filter((l) => l.src === "model");
  ok(modelThoughts.length >= 6 && modelThoughts.every((l) => THOUGHTS.includes(l.text)), `the model's thoughts reach the cards, as written after the checks (${modelThoughts.length} of ${minds.thinkLog.length} shown)`);
  ok(thinks.length === minds.thinkLog.length && thinks.every((f) => /^s:/.test(f.by) && f.text.length <= THINK.MAX_CHARS), "every thought shown went out as a `think` frame, short, naming a body");
  ok(thoughtPrompts > 0 && thoughtFactsAll, `every thought prompt carries FACTS, what drives them, and the inner voice's rules (${thoughtPrompts})`);
  let gapBad = 0, pullBad = 0;
  const lastModel = new Map();
  for (const l of modelThoughts) {
    const prev = lastModel.get(l.who);
    if (prev !== undefined) { if (l.pull ? l.t - prev < THINK.MIN_MS - 2_000 : l.t - prev < THINK.GAP_MS[0] - 2_000) (l.pull ? pullBad++ : gapBad++); }
    lastModel.set(l.who, l.t);
  }
  ok(gapBad === 0 && pullBad === 0, `paced per survivor: ${THINK.GAP_MS[0] / 60000}+ sim min between thoughts, a moment's pull never inside ${THINK.MIN_MS / 1000}s (${modelThoughts.filter((l) => l.pull).length} pulled)`);
  ok(maxThinking <= THINK.AT_ONCE && modelThoughts.every((l) => (l.load ?? 0) <= TALK.MAX_WRITING - 1), `speech first: at most ${THINK.AT_ONCE} thought written at a time, and only with a slot left for a line`);
  const perSurv = new Set(modelThoughts.map((l) => l.who));
  ok(perSurv.size >= 4, `thoughts go round the cast (${perSurv.size} survivors thought)`);
  ok(biteInPrompt === 0, "no thought prompt carries a secret bite");

  // ---- THE DEAD SAY NOTHING (Nov 2026 — Josh: "someone died and kept saying their lines") ----
  const sarah = sim.survivors.find((x) => x.who === "sarah");
  ok(!!sarah?.deadAt && !says.some((f) => f.by === "s:sarah" && f.t >= sarah.deadAt), "nobody says a line after they die (Sarah, killed mid-run)");
  {
    // a line held for its voice (voices.ts waits up to 16 s): its speaker dies in the wait, and it never goes out
    const oldTake = VOICE.takeWaitMs, oldRender = VOICE.renderWaitMs;
    VOICE.takeWaitMs = 60; VOICE.renderWaitMs = 60;
    agentSeen();
    const mH = new SurvivorMinds({ model, allowed: () => true, kv });
    const simH = new SimWorld({ seed: 777002, start: 1_800_000_000_000, hooks: mH.hooks });
    const wH = talkWorld(simH, mH);
    wH.tick(1000);
    const [a, b] = simH.survivors.filter((x) => canSpeak(x));
    const out = [];
    wH.onFrame((f) => { if (f.type === "say") out.push(f); });
    const emit = (by, text) => { for (const cb of mH.listeners) cb({ type: "say", t: simH.t, by, text }); };
    emit(a.id, "held line from the soon dead");
    emit(b.id, "held line from the living");
    simH.kill(a.id);
    const pending = voiceTake().map((x) => x.text);
    await sleep(400);
    ok(pending.includes("held line from the living") && !pending.includes("held line from the soon dead") && !out.some((f) => f.text === "held line from the soon dead"), "a line held for its voice is dropped when its speaker dies in the wait — never voiced, never sent");
    ok(out.some((f) => f.by === b.id && f.text === "held line from the living"), "…while the living's held line still goes out");
    resetVoices();
    emit(a.id, "a line from the dead, straight out");
    await sleep(20);
    ok(!out.some((f) => f.text === "a line from the dead, straight out"), "a line from the dead with no voice to wait for never goes out either");
    VOICE.takeWaitMs = oldTake; VOICE.renderWaitMs = oldRender;
  }

  // ---- choices, directly ----
  TALK.MIN_ASK_MS = 0;
  // (the dead are dangerous now: a 50-minute run can leave nobody but Ben standing — the admin's
  // revive lever brings Rick back for the direct checks rather than the harness depending on luck)
  if (!sim.survivors.some((s) => s.alive && s.who !== "ben" && s.who !== "sarah")) sim.revive("s:rick");
  const live = sim.survivors.find((s) => s.alive && s.who !== "ben" && s.who !== "sarah");
  live.mode = "job";
  const menu = [{ id: "explore:a", label: "explore the hall you came through", score: 60 }, { id: "rest:b", label: "rest", score: 50 }];
  mode.choice = "zz";
  ok(minds.hooks.choose(sim, live.who, menu) === CHOICE_WAIT, "a choice waits for the model's answer");
  await sleep(40);
  ok(minds.hooks.choose(sim, live.who, menu) === undefined, "a pick OFF the menu is ignored: code picks for a while");
  sim.t += TALK.FAIL_MS;
  mode.choice = "b";
  minds.hooks.choose(sim, live.who, menu); await sleep(40);
  ok(minds.hooks.choose(sim, live.who, menu) === "rest:b", "a pick ON the menu is taken");
  ok(minds.hooks.choose(sim, live.who, [{ id: "explore:a", label: "x", score: 60 }, { id: "loot:c", label: "y", score: 55 }]) === CHOICE_WAIT, "a pick that's no longer on the menu is dropped, and they're asked again");
  await sleep(40);
  const before = since(0, "choice").length;
  const urgent = minds.hooks.choose(sim, live.who, [{ id: "revive", label: "go back for Ben", score: 300 }, { id: "rest:b", label: "rest", score: 20 }]);
  await sleep(40);
  ok(urgent === CHOICE_WAIT && since(0, "choice").length > before, "an urgent menu (a friend down) is the model's call too");
  const offered = since(0, "choice").filter((r) => r.who === live.who && /explore the hall/.test(r.user)).pop();
  ok(offered && !/explore:a|rest:b/.test(offered.user) && /explore the hall you came through/.test(offered.user), "the model is offered the menu's labels behind letters, never the ids");
  const twelve = Array.from({ length: 12 }, (_, i) => ({ id: `rest:${i}`, label: `option ${i}`, score: 100 - i * 30 }));
  minds.hooks.choose(sim, live.who, twelve); await sleep(40);
  const all = since(0, "choice").filter((r) => r.who === live.who).pop();
  ok(all && /option 0/.test(all.user) && /option 11/.test(all.user), "the whole menu is offered, the long shots too (nothing filtered out by code's score)");
  TALK.MIN_ASK_MS = 5_000;

  // ---- goals, directly ----
  {
    const gm = minds.minds[live.who];
    const keepGoal = gm.goal;
    const others = sim.survivors.filter((o) => o.who !== live.who).map((o) => [o.who, minds.minds[o.who].goal]);
    for (const [o] of others) minds.minds[o].goal = { text: "hold", why: "", at: sim.t + 1e12 };
    TALK.GOAL_MIN_MS = 0;
    const gAsk = async () => { gm.goal = null; minds.goaling = false; minds.goalAsk.clear(); minds.asking = 0; minds.lastPump = -Infinity; minds.pump(sim); await sleep(60); };
    mode.goal = "That little kid is naked and sexy.";
    await gAsk();
    ok(gm.goal === null, "a goal over THE LINE is never kept");
    const unseen = sim.nav.rooms.find((R, r) => R.name && !live.know.room[r] && r !== live.room && !sim.nav.rooms.some((Q, q) => Q.name === R.name && (live.know.room[q] || q === live.room)));
    // (THE BUNKER: everyone knows every room from the start — BUNKER.md — so there may be none they haven't seen)
    if (unseen) {
      mode.goal = `Get into the ${unseen.name} first.`;
      await gAsk();
      ok(gm.goal === null, `a goal naming a room they've never seen is dropped ("${unseen.name}")`);
    } else ok(sim.nav.rooms.every((R, r) => live.know.room[r] || r === live.room || !R.name), "(every room is known from the start, so no goal can name an unseen one)");
    mode.goal = "Find a way out of this place.";
    await gAsk();
    ok(gm.goal?.text === "Find a way out of this place.", "a good goal is kept as written");
    const before = gm.goal.at;
    minds.needAt = sim.t + 1; sim.t += 2; minds.goalAsk.clear(); minds.lastPump = -Infinity; minds.pump(sim); await sleep(60);
    ok(since(0, "goal").filter((r) => r.who === live.who).length >= 3 && gm.goal.at > before, "a big moment after a goal makes them reconsider it");
    mode.goal = null; TALK.GOAL_MIN_MS = 10 * 60_000;
    if (keepGoal) gm.goal = keepGoal;
    for (const [o, g] of others) minds.minds[o].goal = g;
  }

  // ---- memory: the diary at the main sleep, kept per world ----
  const dale = sim.survivors.find((s) => s.who === "dale" && s.alive) ?? sim.survivors.find((s) => s.alive && s.who !== "ben");
  minds.minds[dale.who].diaryAt = 0;
  minds.hooks.say(sim, dale.who, "sleep", {});
  await sleep(80);
  const mind = minds.minds[dale.who];
  ok(mind.diary.length === 1 && /still here/.test(mind.diary[0].text), "the main sleep writes a diary entry");
  ok(Object.values(mind.notes).filter(Boolean).length >= 4, "…and rewrites their notes on the others");
  for (let i = 0; i < 70; i++) w.tick(1000);
  const saved = JSON.parse(kvStore.get(KV_MINDS) ?? "{}");
  ok(saved.id === `${sim.seed}:${sim.startedAt}` && saved.minds?.[dale.who]?.diary?.length === 1, "memories are kept in app_kv under the world's identity");
  const m3 = new SurvivorMinds({ model, allowed: () => true, kv });
  const sim3 = new SimWorld({ seed: 9, start: 1_800_000_000_000, hooks: m3.hooks });
  const w3 = talkWorld(sim3, m3);
  w3.tick(1000);
  ok(m3.minds && m3.minds[dale.who].diary.length === 0, "a new world (a reset) starts with fresh memories");
}

// ---------------------------------------------------------------------------------------------
console.log("6. a meeting");
// THE BUNKER has no safe room (BUNKER.md: one shelter, nowhere to retreat to), so no meeting is ever staged: the
// section runs only on a map that has one
if (!new SimWorld({ seed: 1 }).nav.rooms.some((R) => R.kind === "safe")) ok(true, "(the bunker has no safe room: no meetings)");
else {
  TALK.MEETINGS = true; TALK.MEETING_GAP_MS = 0;
  const minds = new SurvivorMinds({ model, allowed: () => true });
  const sim = new SimWorld({ seed: 31337, start: 1_800_000_000_000, hooks: minds.hooks, director: false });
  const w = talkWorld(sim, minds);
  const says = [];
  w.onFrame((f) => { if (f.type === "say") says.push(f); });
  // the group together, awake, in the dormitory safe room
  const safe = sim.nav.roomIdx.get("safe-res") ?? sim.nav.roomIdx.get("common");
  sim.survivors.forEach((s, i) => { sim.place(s, sim.nav.cellInRoom(safe, 0, 0.25 + 0.1 * i, 0.5)); s.mode = "job"; s.job = null; });
  const t0 = Date.now();
  // advance only the talk layer's clock (the sim is held so the group stays put)
  for (let i = 0; i < 400 && (minds.status().meetings === 0 || minds.plan === null); i++) { sim.t += 500; minds.pump(sim); await sleep(3); }
  ok(minds.status().meetings === 1, "the group together in a safe room holds a meeting");
  ok(says.length >= 1 && says[0].by === "s:rick", "the leader (Rick, at the start) speaks first");
  const present = new Set(says.map((s) => s.by));
  ok(present.size >= 5, `every other survivor answers (${present.size} spoke)`);
  ok(since(t0, "choice").some((r) => /THE PLANS:/.test(r.user) && r.who === "rick"), "the leader picked which plan to put from a menu code built");
  ok(since(t0, "line").some((r) => /put a plan|Put your plan/.test(r.user)), "…and was asked to put it in their own voice");
  ok(since(t0, "line").filter((r) => /You AGREE|You DON'T/.test(r.user)).length >= 4, "the others were told their stance (the genes roll it; the model voices it)");
  const plan = minds.plan;
  ok(plan && Object.keys(plan.roles).length === 6 && ["push", "scavenge", "hold"].includes(plan.kind), `a plan stands with a part for everyone present (${plan?.kind}: ${plan?.label})`);
  let overlap = 0;
  const hold = (t) => Math.min(TALK.HOLD_MAX_MS, Math.max(TALK.HOLD_MIN_MS, t.length * TALK.HOLD_PER_CHAR_MS)) + TALK.GAP_MS;
  for (let i = 1; i < says.length; i++) if (says[i].t < says[i - 1].t + hold(says[i - 1].text)) overlap++;
  ok(overlap === 0, "a meeting is one speaker at a time");
  // the plan reaches the game through choose
  const member = Object.entries(plan.roles).find(([w, r]) => r !== "stay" && !plan.refused.includes(w)) ?? Object.entries(plan.roles).find(([w]) => !plan.refused.includes(w));
  const role = member[1];
  const menu = [{ id: "explore:x", label: "explore", score: 40 }, { id: "loot:y", label: "loot", score: 45 }, { id: "rest:z", label: "rest", score: 50 }];
  const tc = Date.now();
  const ms = sim.survivors.find((x) => x.who === member[0]); ms.mode = "job";
  ok(minds.hooks.choose(sim, member[0], menu) === CHOICE_WAIT, `the plan doesn't pick for ${member[0]}: they decide`);
  await sleep(40);
  const asked = since(tc, "choice").find((r) => r.who === member[0]);
  ok(asked && /THE GROUP'S PLAN/.test(asked.user) && /Your part:/.test(asked.user) && /up to you/.test(asked.user), `…with the plan and their part (${role}) in what they're told`);
  // (everyone IN the show: a newcomer on the bench has a mind waiting but wasn't at the meeting)
  ok(sim.survivors.every((x) => minds.minds[x.who].events.some((e) => /meeting/.test(e.what))), "everyone remembers the meeting");
  TALK.MEETING_GAP_MS = 30 * 60_000;
}

// ---------------------------------------------------------------------------------------------
console.log("7. THE LINE in a live run");
{
  mode.line = "line"; mode.thought = "line";
  const minds = new SurvivorMinds({ model, allowed: () => true });
  const sim = new SimWorld({ seed: 5150, start: 1_800_000_000_000, hooks: minds.hooks });
  const w = talkWorld(sim, minds);
  const says = [];
  w.onFrame((f) => { if (f.type === "say") says.push(f); });
  const t0 = Date.now();
  for (let i = 0; i < 20 * 60; i++) { w.tick(1000); if (i === 100) sim.down("s:rick"); if (i % 2 === 0) await sleep(2); }
  for (let i = 0; i < 30; i++) { w.tick(500); await sleep(5); }
  ok(since(t0, "line").length > 0 && says.length === 0, `a model that crosses THE LINE is never heard (${since(t0, "line").length} drafts, ${says.length} said)`);
  ok(since(t0, "thought").length > 0 && !minds.thinkLog.some((l) => l.src === "model") && minds.thinkLog.every((l) => !/kid|naked/.test(l.text)),
    `…nor is it ever thought: ${since(t0, "thought").length} thought drafts, none shown`);
  ok(sim.survivors.filter((x) => x.alive).every((x) => minds.thoughtFrames(sim).some((f) => f.by === x.id && f.text)), "…and the cards still carry code's thoughts");
  mode.line = "ok"; mode.thought = "ok";
}

// ---------------------------------------------------------------------------------------------
console.log("9b. a secret bite never reaches a thought");
{
  THINK.GAP_MS = [20_000, 30_000]; THINK.FIRST_MS = 2_000; THINK.STAGGER_MS = 1_000; THINK.MIN_MS = 10_000;
  const minds = new SurvivorMinds({ model, allowed: () => true });
  const sim = new SimWorld({ seed: 6061, start: 1_800_000_000_000, hooks: minds.hooks, zombies: 0 });
  sim.setTrickle(0);
  const w = talkWorld(sim, minds);
  const thinks = [];
  w.onFrame((f) => { if (f.type === "think") thinks.push(f); });
  const dale = sim.survivors.find((x) => x.who === "dale");
  dale.bitten = true;                                   // bitten, and nobody knows (the broadcast shows no infection)
  mode.thought = "bite";
  const t0 = Date.now();
  for (let i = 0; i < 6 * 60; i++) { w.tick(1000); if (i === 30) minds.hooks.say(sim, "dale", "fight", {}); if (i % 2 === 0) await sleep(2); }
  for (let i = 0; i < 20; i++) { w.tick(500); await sleep(5); }
  const tq = since(t0, "thought");
  ok(tq.length >= 3, `thoughts were asked for while the bite was secret (${tq.length})`);
  ok(tq.every((r) => !/you've been BITTEN|You were bitten|hid the bite|got BITTEN/.test(r.system + r.user)), "the bite is left out of every thought prompt — the bitten one's and everyone else's");
  ok(thinks.length > 0 && thinks.every((f) => !BITE_WORDS.test(f.text)), `no thought on the wire names a bite (${thinks.length} shown) — "I got bitten" and "Dale got bit, I saw it" both refused`);
  ok(thinks.some((f) => f.by === "s:dale"), "…and Dale's card still carries a thought (code's, which never reads the bite)");
  ok(sim.survivors.every((x) => !BITE_WORDS.test(codeThought(sim, x).text)), "code's thought never names a bite");
  // with no secret bite, a thought about the dead biting is just a thought
  dale.bitten = false;
  mode.thought = "dead";
  const t1 = Date.now();
  for (let i = 0; i < 3 * 60; i++) { w.tick(1000); if (i % 2 === 0) await sleep(2); }
  for (let i = 0; i < 20; i++) { w.tick(500); await sleep(5); }
  ok(since(t1, "thought").length > 0 && minds.thinkLog.some((l) => l.src === "model" && /bite through/.test(l.text)), "with no secret bite, a thought about the dead biting is shown (the refusal is the secret's, not a blanket mute)");
  mode.thought = "ok";
  THINK.GAP_MS = [120_000, 240_000]; THINK.FIRST_MS = 20_000; THINK.STAGGER_MS = 15_000; THINK.MIN_MS = 30_000;
}

// ---------------------------------------------------------------------------------------------
console.log("9c. what they do to each other");
{
  const setup = (allowed) => {
    const minds = new SurvivorMinds({ model, allowed: () => allowed });
    const sim = new SimWorld({ seed: 7171, start: 1_800_000_000_000, hooks: minds.hooks, director: false, zombies: 0 });
    sim.setTrickle(0);
    const w = talkWorld(sim, minds);
    const safe = sim.nav.roomIdx.get("safe-res") ?? sim.nav.roomIdx.get("common");
    const [a, b, c] = sim.survivors;
    sim.survivors.forEach((s, i) => { sim.place(s, sim.nav.cellInRoom(safe, 0, 0.3 + 0.06 * i, 0.5)); s.mode = "job"; s.job = null; });
    const menus = {}, forced = {};
    // (the bystanders stand where they're put — CHOICE_WAIT, the sim's own "keep at it": the section is about what
    // the forced survivor does to them, and their own job picks used to walk them out of the room first)
    sim.hooks.choose = (ww, who, menu) => { menus[who] = menu; const f = forced[who]; if (f) { delete forced[who]; return f; } return allowed ? CHOICE_WAIT : undefined; };
    const decide = async (s, id) => { forced[s.who] = id; s.job = null; s.retryAt = 0; s.rethink = true; for (let i = 0; i < 40; i++) { w.tick(500); if (i % 4 === 0) await sleep(2); } };
    return { minds, sim, w, a, b, c, menus, decide };
  };
  // no brain: none of it is offered, and the honesty roll is the sim's as ever
  {
    const { sim, a, b, menus, decide } = setup(false);
    a.pack.food = 6; b.pack.food = 0;
    await decide(a, undefined);
    ok(!(menus[a.who] ?? []).some((m) => /^(give|steal|confess|attack|finish)/.test(m.id)), "with no mind deciding, nobody is offered giving, stealing, owning up or attacking (the show runs as it always did)");
  }
  const { minds, sim, w, a, b, c, menus, decide } = setup(true);
  a.pack.food = 6; b.pack.food = 0; a.pack.medkit = 0; b.pack.medkit = 2;
  await decide(a, undefined);
  const am = menus[a.who] ?? [];
  ok(am.some((m) => m.id.startsWith("give:") && /give .* food/.test(m.label)) && am.some((m) => m.id.startsWith("steal:")), `a mind is offered giving and stealing with the people beside them (${am.filter((m) => /^(give|steal)/.test(m.id)).map((m) => m.label).join("; ")})`);
  ok(am[0] && !/^(give|steal|confess)/.test(am[0].id), "…far under code's own options, so a model that's down never picks one");
  a.pack.food = 6; b.pack.food = 0;
  const r0 = minds.minds[b.who].regard[a.who] ?? 0;
  const evs = [];
  w.onFrame((f) => { if (f.type === "ev" && /give|steal/.test(f.event)) evs.push(f); });
  const giftsBefore = minds.minds[b.who].events.length;
  await decide(a, `give:${b.who}`);
  ok(evs.some((f) => f.event === "survivor.give" && f.what === "food" && f.n === 3), `a gift changes hands (${a.who} gave ${b.who} ${evs.find((f) => f.event === "survivor.give")?.n ?? 0} food)`);
  ok((minds.minds[b.who].regard[a.who] ?? 0) === Math.min(100, r0 + 8) && minds.minds[b.who].events.slice(giftsBefore).some((e) => /gave you some of their food/.test(e.what)), "…and the one given to warms to the giver and remembers it");
  const before = minds.minds[b.who].regard[a.who] ?? 0;
  const wit = sim.survivors.find((x) => x !== a && x !== b);
  const witBefore = minds.minds[wit.who].regard[a.who] ?? 0;
  b.pack.food = 6; a.pack.food = 0; b.pack.medkit = 0; a.pack.medkit = 1;
  await decide(a, `steal:${b.who}`);
  ok(evs.some((f) => f.event === "survivor.steal" && f.what === "food" && f.seen), `a theft changes hands, and is seen (${JSON.stringify(evs.filter((f) => f.event === "survivor.steal").map((f) => [f.what, f.n]))})`);
  ok((minds.minds[b.who].regard[a.who] ?? 0) <= before - 25 && minds.minds[b.who].events.some((e) => /caught them at it/.test(e.what)), "…an awake victim catches the thief and turns on them");
  ok((minds.minds[wit.who].regard[a.who] ?? 0) < witBefore && minds.minds[wit.who].events.some((e) => /You saw .* steal/.test(e.what)), "…and anybody who saw it thinks worse of the thief");
  // a theft from a sleeper nobody sees
  sim.survivors.forEach((x) => { if (x !== a) { x.mode = "sleep"; } });
  b.pack.medkit = 2; a.pack.medkit = 0;
  const sleptBefore = minds.minds[b.who].regard[a.who] ?? 0;
  await decide(a, `steal:${b.who}`);
  ok(a.pack.medkit >= 1 && (minds.minds[b.who].regard[a.who] ?? 0) === sleptBefore && minds.minds[a.who].events.some((e) => /nobody saw/.test(e.what)), "a theft from a sleeper nobody sees costs the thief nothing — they just know it");
  sim.survivors.forEach((x) => { if (x.mode === "sleep") x.mode = "job"; });
  // a bite nobody saw: their own call, now or later
  c.infected = true; c.infectedAt = sim.t; c.bitten = true; c.infKnown = false;
  mode.choice = "b";
  await minds.decideBite(sim, c);
  ok(!c.infKnown && minds.minds[c.who].events.some((e) => /hid the bite/.test(e.what)) && since(0, "choice").some((r) => /nobody saw it happen/.test(r.user)), "a bite nobody saw: the mind is asked, and hides it — the group doesn't know");
  await decide(c, undefined);
  ok((menus[c.who] ?? []).some((m) => m.id === "confess" && /bitten/.test(m.label)), "…and owning up stays on their menu, for when they choose");
  await decide(c, "confess");
  ok(c.infKnown, "…picking it tells the group");
  const d = sim.survivors.find((x) => x !== a && x !== b && x !== c);
  d.infected = true; d.infectedAt = sim.t; d.bitten = true; d.infKnown = false;
  mode.choice = "a";
  await minds.decideBite(sim, d);
  ok(d.infKnown, "a mind that chooses to tell them straight away tells them");
  mode.choice = "b";
  // ---- turning on one of their own ----
  const by = (who) => sim.survivors.find((x) => x.who === who);
  const rick = by("rick"), sarah = by("sarah"), dale = by("dale");
  const safe = sim.nav.roomIdx.get("safe-res") ?? sim.nav.roomIdx.get("common");
  sim.survivors.forEach((x, i) => { if (!x.alive) return; x.mode = "job"; x.onBed = false; x.job = null; x.hp = x.hpMax; x.bleeding = 0; sim.place(x, sim.nav.cellInRoom(safe, 0, 0.3 + 0.06 * i, 0.5)); });
  await decide(rick, undefined);
  ok((menus.rick ?? []).some((m) => m.id === "attack:sarah" && /attack Sarah/.test(m.label)), "a mind is offered attacking the people beside them");
  const ev2 = [];
  w.onFrame((f) => { if (f.type === "ev" && /survivor\.(attack|down|dead)/.test(f.event)) ev2.push(f); });
  const regardBefore = Object.fromEntries(sim.survivors.map((x) => [x.who, minds.minds[x.who].regard.rick ?? 0]));
  {
    let ran = false;
    const f = "attack:sarah";
    rick.job = null; rick.retryAt = 0; rick.rethink = true;
    sim.hooks.choose = ((orig) => (ww, who, menu) => { if (who === "rick" && f && !rick.job) return f; return orig(ww, who, menu); })(sim.hooks.choose);
    for (let i = 0; i < 160 && sarah.mode !== "down" && sarah.alive; i++) { w.tick(250); if (sarah.job?.kind === "run") ran = true; if (rick.job?.kind !== "attack" && i > 4) break; if (i % 8 === 0) await sleep(2); }
    ok(ev2.some((e) => e.event === "survivor.attack" && e.by === "s:rick" && e.victim === "s:sarah"), "an attack happens: the attacker closes in and strikes");
    ok(ran || sarah.mode === "down", `one who can't fight runs from it (${ran ? "ran" : "went down first"})`);
  }
  ok(minds.minds.sarah.events.some((e) => /Rick attacked you/.test(e.what)) && (minds.minds.sarah.regard.rick ?? 0) <= regardBefore.sarah - 40, "the one attacked remembers it and turns on the attacker");
  const sawIt = sim.survivors.filter((x) => x !== rick && x !== sarah && minds.minds[x.who].events.some((e) => /You saw Rick attack Sarah/.test(e.what)));
  ok(sawIt.length > 0 && sawIt.every((x) => (minds.minds[x.who].regard.rick ?? 0) <= regardBefore[x.who] - 30), `…and so does everyone who saw it (${sawIt.map((x) => x.who).join(", ")})`);
  // a fighter hits back
  sim.survivors.forEach((x) => { if (x.alive && x.mode !== "down") { x.job = null; x.hp = x.hpMax; } });
  rick.job = { kind: "attack", ally: dale.i, cell: dale.cell, since: sim.t, phase: 0, until: sim.t + 60_000 };
  rick.rethink = false; dale.rethink = false;
  let hitBack = false;
  for (let i = 0; i < 80 && !hitBack; i++) { w.tick(250); if (dale.job?.kind === "attack" && dale.job.ally === rick.i) hitBack = true; if (i % 8 === 0) await sleep(2); }
  ok(hitBack, "one who can fight hits back (fight-or-flight is code's)");
  // finishing somebody is its own choice
  rick.job = null; dale.job = null;
  if (sarah.alive && sarah.mode !== "down") sim.down("s:sarah");
  rick.hp = rick.hpMax; rick.retryAt = 0; rick.rethink = true;
  sim.hooks.choose = ((orig) => (ww, who, menu) => { if (who === "rick" && menu.some((m) => m.id === "finish:sarah")) { menus.rick = menu; return "finish:sarah"; } return orig(ww, who, menu); })(sim.hooks.choose);
  for (let i = 0; i < 120 && sarah.alive; i++) { w.tick(250); if (i % 8 === 0) await sleep(2); }
  ok((menus.rick ?? []).some((m) => m.id === "finish:sarah" && /finish Sarah off/.test(m.label)), "somebody down in the room can be finished — a choice on the menu, beside helping them up");
  ok(!sarah.alive && /killed by Rick/.test(sarah.cause), `…and a mind that picks it kills them (${sarah.alive ? "still alive" : sarah.cause})`);
  const sawKill = sim.survivors.filter((x) => x.alive && x !== rick && minds.minds[x.who].events.some((e) => /You saw Rick kill Sarah/.test(e.what)));
  ok(sawKill.length > 0, `everyone who saw the killing remembers it (${sawKill.map((x) => x.who).join(", ")})`);
}

// ---------------------------------------------------------------------------------------------
console.log("9d. what the screen may show of a decision");
{
  const minds = new SurvivorMinds({ model, allowed: () => true });
  const sim = new SimWorld({ seed: 7272, start: 1_800_000_000_000, hooks: minds.hooks, director: false });
  const w = talkWorld(sim, minds);
  w.tick(500);
  const frames = [];
  w.onFrame((f) => { if (f.type === "decide" || f.type === "goal") frames.push(f); });
  const [a, b] = sim.survivors;
  const settle = async () => { for (let i = 0; i < 20; i++) { await sleep(5); } };
  // a reason over THE LINE: the choice still goes up, the reason doesn't
  minds.lastDecide.clear(); minds.lastDecideAny = -Infinity; minds.lastDecideOf.clear();
  minds.decided(sim, a, "explore:x", "check the far corridor", "FORBIDLINE something awful");
  await settle();
  const f1 = frames.find((f) => f.type === "decide" && f.by === a.id);
  ok(f1 && f1.did === "check the far corridor" && f1.reason === "", "a reason the second read calls forbidden never reaches the screen — the choice still does");
  // a bite nobody's been told about stays off the screen
  b.infected = true; b.bitten = true; b.infectedAt = sim.t; b.infKnown = false;
  frames.length = 0;
  minds.lastDecide.clear(); minds.lastDecideAny = -Infinity; minds.lastDecideOf.clear();   // (the tick above may have captioned a real pick)
  minds.decided(sim, a, "rest:x", "rest and hide this bite", "nobody can know");
  minds.decided(sim, b, "loot:x", "look for antiviral", "my arm is burning up");
  await settle();
  const f2 = frames.find((f) => f.by === b.id);
  ok(!frames.some((f) => f.by === a.id) && f2 && f2.reason === "", `while a bite is secret, no caption names it: a choice about it is dropped, a reason about it cut (${JSON.stringify(frames)})`);
  frames.length = 0;
  minds.decided(sim, b, "confess", "tell the others they've been bitten", "they deserve to know");
  await settle();
  ok(frames.some((f) => f.by === b.id && /bitten/.test(f.did) && f.reason === "they deserve to know"), "…owning up is the exception: that caption is the reveal");
  // a goal over THE LINE: kept in their head, never on the card — and it clears the card
  b.infected = false; b.bitten = false;
  frames.length = 0;
  mode.goal = "FORBIDLINE something awful";
  minds.goalAsk.clear(); minds.goaling = false;
  minds.minds[a.who].goal = null;
  for (const s of sim.survivors) if (s !== a) minds.minds[s.who].goal = { text: "x", why: "", at: sim.t, screen: true };
  minds.maybeGoal(sim);
  for (let i = 0; i < 40 && !frames.some((f) => f.type === "goal"); i++) await sleep(5);
  ok(minds.minds[a.who].goal?.text.startsWith("FORBIDLINE") && !minds.minds[a.who].goal.screen && frames.some((f) => f.type === "goal" && f.by === a.id && f.text === "") && !minds.goalFrames(sim).some((f) => f.by === a.id),
    "a goal the second read calls forbidden stays in their head, never on the card (the card clears)");
  mode.goal = null;
}

// ---------------------------------------------------------------------------------------------
console.log("9e. strangers until they meet; a search is one decision; gifts don't bounce (the Nov 12 2026 review)");
{
  const { socialOptions, socialAct } = D("survivorz/sim/social.js");
  const { SHEETS } = D("survivorz/talk/sheets.js");
  const minds = new SurvivorMinds({ model, allowed: () => true });
  const sim = new SimWorld({ seed: 9191, start: 1_800_000_000_000, hooks: minds.hooks, director: false });
  const w = talkWorld(sim, minds);
  w.tick(500);
  const [a, b, c] = sim.survivors;
  const short = (x) => SHEETS[x.who].short;
  // ---- STRANGERS ----
  for (const x of sim.survivors) x.met.clear();
  const others = sim.survivors.filter((x) => x !== a).map(short);
  const named = (text) => others.filter((n) => new RegExp("\\b" + n + "\\b").test(text));
  let p = minds.prompt(sim, a, "You just woke up.", undefined);
  ok(named(p.system + "\n" + p.user).length === 0, "somebody who has met nobody is shown no name but their own — sheet, THE OTHERS, FACTS (" + (named(p.system + "\n" + p.user).join(", ") || "none") + ")");
  ok(/haven't met anybody/.test(p.system), "…and is told they've met nobody yet");
  const tp = minds.thoughtPrompt(sim, a, { text: "find a way out", key: "x" }, false);
  ok(named(tp.system + "\n" + tp.user).length === 0, "a thought's prompt too");
  p = minds.prompt(sim, a, short(b) + " just DIED, right in front of you.", b.who, short(b) + ": hello there");
  ok(named(p.system + "\n" + p.user).length === 0 && /a stranger|somebody you haven't met/.test(p.user), "a moment, a line heard and the one they're talking to are a stranger until they've met");
  ok(minds.namesUnmet(a, "Find " + short(b) + " and the others") && !minds.namesUnmet(a, "Find the others"), "a line, goal or reason naming somebody unmet is known as one");
  a.met.add(b.who); b.met.add(a.who);
  p = minds.prompt(sim, a, "You're catching your breath.", b.who);
  const now = named(p.system + "\n" + p.user);
  ok(now.includes(short(b)) && now.length === 1 && /may be others/.test(p.system), "once two have met, that one name is there (and only that one)");
  ok(!minds.namesUnmet(a, "Stay close, " + short(b)) && minds.namesUnmet(a, "Where's " + short(c) + "?"), "…and may be said; a third they haven't met still may not");
  // ---- THE CAPTIONS ----
  const frames = [];
  w.onFrame((fr) => { if (fr.type === "decide") frames.push(fr); });
  const settle = async () => { for (let i = 0; i < 20; i++) await sleep(5); };
  const fresh = () => { minds.lastDecide.clear(); minds.lastDecideAny = -Infinity; minds.lastDecideOf.clear(); minds.reasons.clear(); frames.length = 0; };
  fresh();
  minds.decided(sim, a, "loot:x1", "search the lockers", "there might be bandages in these", { kind: "loot", room: 3 });
  minds.decided(sim, b, "clear:r2", "sweep the hall", "I want to know what's out there", { kind: "clear", room: 2 });
  await settle();
  ok(frames.length === 1 && frames[0].by === a.id, "two survivors' captions never land together (one every " + TALK.DECIDE_ANY_GAP_MS / 1000 + " s at most)");
  fresh();
  minds.decided(sim, a, "loot:x1", "search the lockers", "there might be bandages in these", { kind: "loot", room: 3 });
  minds.lastDecide.clear(); minds.lastDecideAny = -Infinity;
  minds.decided(sim, a, "loot:x2", "search the crate", "maybe a weapon in here somewhere", { kind: "loot", room: 3 });
  minds.lastDecide.clear(); minds.lastDecideAny = -Infinity;
  minds.decided(sim, a, "loot:y1", "search the desk", "there has to be a key card around", { kind: "loot", room: 4 });
  await settle();
  ok(frames.length === 2 && frames[1].did === "search the desk", "more of the same in the same room isn't a new caption; another room is");
  fresh();
  minds.decided(sim, a, "clear:r1", "sweep the stores", "I gotta see what's in that crate before the dead come knocking", { kind: "clear", room: 1 });
  minds.lastDecide.clear(); minds.lastDecideAny = -Infinity;
  minds.decided(sim, a, "rest:x", "take a breather", "I gotta see what's in that crate before the dead come knocking on my skull", { kind: "rest", room: 1 });
  minds.lastDecide.clear(); minds.lastDecideAny = -Infinity;
  minds.decided(sim, a, "guard:x", "keep watch", "Where's " + short(c) + " got to, I need to find them", { kind: "guard", room: 1 });
  await settle();
  const why = (did) => frames.find((x) => x.did === did)?.reason;
  ok(frames.length === 3 && why("sweep the stores") && why("take a breather") === "" && why("keep watch") === "", "a reason said again, or one naming somebody unmet, isn't shown: the choice still is");
  // ---- THE PICK COMES FIRST ----
  const before = reqs.length;
  await pickChecked(model, "You are RICK.", "YOUR OPTIONS:\n- a: one\n- b: two", ["a", "b"], 3000).catch(() => null);
  const fmt = reqs.slice(before).find((r) => r.format?.properties?.choice)?.format;
  ok(fmt && Object.keys(fmt.properties)[0] === "choice" && fmt.required[0] === "choice", "a pick is asked for before its reason (the reason is for THAT pick)");
  // ---- A SEARCH IS ONE DECISION ----
  minds.picks.set(a.who, { id: "loot:gone", at: sim.t, why: "w", label: "search the lockers", sig: "", kind: "loot", room: 5 });
  a.mode = "job"; a.job = null;
  const asked = minds.stats.choicesAsked;
  const menu = [{ id: "clear:r9", kind: "clear", label: "sweep the hall", score: 50, room: 9 }, { id: "loot:next", kind: "loot", label: "search the crate", score: 40, room: 5 }, { id: "loot:far", kind: "loot", label: "search the desk", score: 45, room: 6 }];
  const got = minds.hooks.choose(sim, a.who, menu);
  ok(got === "loot:next" && minds.stats.choicesAsked === asked, "a search carries on through the same room's next container without another ask");
  minds.picks.set(a.who, { id: "loot:gone", at: sim.t - TALK.ROOM_SEARCH_MS - 1000, why: "w", label: "search the lockers", sig: "", kind: "loot", room: 5 });
  const got2 = minds.hooks.choose(sim, a.who, menu);
  ok(got2 === CHOICE_WAIT && minds.stats.choicesAsked === asked + 1, "…for " + TALK.ROOM_SEARCH_MS / 60000 + " minutes; after that the model is asked again");
  // ---- GIFTS DON'T BOUNCE ----
  const opts = (x) => { const out = []; socialOptions(sim, x, (score, label, job, id) => out.push({ label, job, id })); return out; };
  for (const x of sim.survivors) { x.mode = "job"; x.pack.food = 0; x.pack.water = 0; x.pack.bandage = 0; x.pack.medkit = 0; x.gaveAt = undefined; x.gotFrom = undefined; }
  b.room = a.room; b.floor = a.floor; b.x = a.x + 0.8; b.z = a.z; b.cell = a.cell;
  for (const x of sim.survivors) if (x !== a && x !== b) x.room = -1;
  a.pack.food = 4; b.pack.food = 1;
  ok(!opts(a).some((o) => /^give:/.test(o.id)), "nothing is given to somebody who has some of it already");
  b.pack.food = 0;
  const g = opts(a).find((o) => o.id === "give:" + b.who);
  ok(!!g && new RegExp("give " + short(b) + " some of your food").test(g.label), "somebody with none of it can be given some");
  a.job = { ...g.job, since: sim.t, phase: 0, until: sim.t + 60_000 };
  socialAct(sim, a);
  ok(b.pack.food === 2 && a.pack.food === 2 && a.gaveAt === sim.t && b.gotFrom?.[a.who] === sim.t, "the gift changes hands (half), and both remember when");
  a.pack.water = 4; a.pack.food = 0; b.pack.food = 4;
  ok(!opts(b).some((o) => o.id === "give:" + a.who), "the one given to doesn't hand it straight back");
  ok(!opts(a).some((o) => /^give:/.test(o.id)), "…and the giver gives nothing more for a while");
  a.gaveAt = sim.t - 6 * 60_000;
  ok(opts(a).some((o) => o.id === "give:" + b.who && /water/.test(o.label)), "five minutes on, they may give again");
  // ---- GOALS ARE LOOKED AT AGAIN WHEN THE THING IS DONE ----
  for (const x of sim.survivors) { minds.minds[x.who].goal = { text: "find the keycard", why: "", at: sim.t, screen: true }; minds.goalAsk.set(x.who, sim.t - TALK.GOAL_MIN_MS - 1000); }
  minds.goaling = false;
  const g0 = minds.stats.goalsAsked;
  minds.maybeGoal(sim);
  ok(minds.stats.goalsAsked === g0, "a goal just set isn't asked about again");
  sim.t += 1000;
  minds.onSimFrame(sim, { type: "ev", event: "keycard.found", t: sim.t, seed: 1, by: a.id });
  minds.maybeGoal(sim);
  ok(minds.stats.goalsAsked === g0 + 1 && minds.goalAsk.get(a.who) === sim.t, "their own find puts their goal up for another look (it may be done)");
  await settle(); minds.goaling = false;
  sim.t += 1000;
  minds.onSimFrame(sim, { type: "ev", event: "door.sealed", t: sim.t, seed: 2, by: b.id, door: "blast" });
  minds.maybeGoal(sim);
  ok(minds.stats.goalsAsked === g0 + 2, "an objective done puts everybody's up");
  ok(TALK.GOAL_MS <= 15 * 60_000 && TALK.DECIDE_GAP_MS >= 40_000, "the dials are an hour-long show's (a goal reconsidered inside " + TALK.GOAL_MS / 60000 + " min, a survivor's caption every " + TALK.DECIDE_GAP_MS / 1000 + " s at most)");
}

// ---------------------------------------------------------------------------------------------
console.log("9f. nobody says somebody else's line (the Nov 12 2026 review, RUBRIC E7)");
{
  const NAMES = ["Rick", "Johanna", "Dale", "Ben", "Sarah", "Rollo"];
  const stock = "Get your hands off me, you bastard!";
  // ---- the rule, on its own ----
  ok(echoes(stock, ["Get your hands off me, you bastard."], NAMES)?.exact === true, "the same words are an echo, word for word");
  ok(echoes("Get your hands off me, Rollo, you bastard!", [stock], NAMES)?.exact === true, "…a name put in doesn't make it a new line");
  const run = echoes("Get your hands off me, you dead piece of shit!", [stock], NAMES);
  ok(run && !run.exact && /get your hands off me/.test(run.phrase), `four words running that somebody already said are an echo ("${run?.phrase}")`);
  ok(echoes("Get your damn hands off me, you piece of shit!", ["Get your filthy hands off me, you piece of garbage!"], NAMES)?.close === true && echoes("I swear it had hold of the door.", ["It had hold of my leg."], NAMES)?.close === false, "a line with a word or two swapped is CLOSE; four shared words in a different sentence are not");
  ok(!!echoes("You bastard, get those hands off me right now!", [stock], NAMES), "three-quarters of the same words, in any order, are an echo");
  ok(!echoes("Piece of shit door.", ["You piece of shit!"], NAMES) && !!echoes("Die, you piece of shit!", ["You piece of shit!", "Back off, piece of shit."], NAMES), "three words running are one once two people have said them, not before");
  ok(!echoes("No!", ["No!"], NAMES) && !echoes("Run, Ben!", ["Run, Sarah!"], NAMES), "a word or two — No, Run, a name — anybody may say");
  let clash = 0;
  for (let i = 0; i < LINES.length; i++) if (echoes(LINES[i], LINES.filter((_, j) => j !== i), NAMES)) clash++;
  ok(clash === 0, `twelve different lines are no echo of each other (${clash})`);
  // ---- the writer ----
  mode.line = "stock"; mode.stockRetry = null;
  let t0 = Date.now();
  ok((await writeChecked(model, "SYS", "USER", "Ben", [], 3000)) === stock, "with nobody else's lines to read against, the line stands");
  t0 = Date.now();
  const mine = await writeChecked(model, "SYS", "USER", "Ben", [], 3000, { said: ["Get your hands off me, you bastard — Rollo owes me money!"], names: NAMES });
  const retry = since(t0, "line").find((r) => /said down here already/.test(r.system));
  ok(mine === "Not today, you rotten thing." && !!retry, "a draft that echoes somebody else's line is sent back once, and the fresh retry is what's said");
  ok(!!retry && /get your hands off me you bastard/.test(retry.system) && !/owes me money/.test(retry.system), "…the retry is shown only the words the draft itself used: nothing of a line said out of earshot");
  mode.stockRetry = stock;
  ok((await writeChecked(model, "SYS", "USER", "Ben", [], 3000, { said: [stock], names: NAMES })) === null, "somebody else's line, word for word, twice over: nothing is said");
  mode.stockRetry = "Get your filthy hands off me, you dead bastard!"; mode.stockRetry2 = "Christ, its breath — somebody, please!";
  t0 = Date.now();
  ok((await writeChecked(model, "SYS", "USER", "Ben", [], 3000, { said: [stock], names: NAMES })) === mode.stockRetry2 && since(t0, "line").some((r) => /Still the same line/.test(r.system)), "the same line with a word swapped is sent back a second time, told that plainly");
  mode.stockRetry2 = "Get your stinking hands off me, you bastard thing!";
  ok((await writeChecked(model, "SYS", "USER", "Ben", [], 3000, { said: [stock], names: NAMES })) === null, "…and one that is still that line with a word changed isn't said (there are screams for that)");
  mode.stockRetry = "I swear it had hold of the door."; mode.stockRetry2 = null;
  ok((await writeChecked(model, "SYS", "USER", "Ben", [], 3000, { said: [stock, "It had hold of my leg."], names: NAMES })) === mode.stockRetry, "a retry that only shares a few words with something said may stand");
  mode.line = "ok"; mode.stockRetry = null; mode.stockRetry2 = null;
  // ---- on the show ----
  const minds = new SurvivorMinds({ model, allowed: () => true });
  const sim = new SimWorld({ seed: 9292, start: 1_800_000_000_000, hooks: minds.hooks, director: false });
  const w = talkWorld(sim, minds);
  w.tick(500);
  const [a, b] = sim.survivors;
  const frames = [];
  w.onFrame((fr) => { if (fr.type === "say") frames.push(fr); });
  minds.log.push({ t: sim.t - TALK.ECHO_MS - 5_000, who: b.who, room: "r", prio: 0, meeting: false, text: "An old line nobody remembers now." });
  minds.log.push({ t: sim.t, who: b.who, room: "r", prio: 0, meeting: false, text: stock });
  ok(minds.saidLately(sim).length === 1 && minds.saidLately(sim)[0] === stock, `a draft is read against what anybody said in the last ${TALK.ECHO_MS / 60000} minutes, no further back`);
  const room = minds.roomKey(a);
  minds.air.delete(room);
  const e0 = minds.stats.echoes ?? 0;
  frames.length = 0;
  minds.queue.push({ who: a.who, prio: 0, t: sim.t - 1_000, room, text: stock, seq: 9_001, ex: 1 });
  minds.pump(sim);
  ok(minds.stats.echoes === e0 + 1 && !frames.some((fr) => fr.text === stock), "two grabbed in the same breath: the line the other one got out first isn't said again");
  minds.queue.push({ who: a.who, prio: 0, t: sim.t - 1_000, room, text: "Christ, it's got my arm!", seq: 9_002, ex: 1 });
  minds.pump(sim);
  ok(frames.some((fr) => fr.text === "Christ, it's got my arm!"), "…their own words are");
  ok(/sound like YOU and nobody else/.test(D("survivorz/talk/sheets.js").RULES), "the rules tell every one of them to sound like themselves when grabbed, hurt or scared");
}

// ---------------------------------------------------------------------------------------------
console.log("8. end to end over a real server");
{
  const DATA_DIR = path.join(ROOT, "data", "survivorz-talk-harness");
  try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  const ADMIN_PW = "Harness!Admin9xy";
  const AGENT_SECRET = "survivorz-voice-harness-secret-0123456789";
  const BASE = `http://127.0.0.1:${PORT}`;
  let log = "";
  const srv = spawn(process.execPath, [path.join(ROOT, "dist", "index.js")], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR, ADMIN_PASSWORD: ADMIN_PW, ALLOW_REGISTRATION: "true", REQUIRE_INVITE: "false",
      LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "", ROLLO_LIVE: "0",
      NPC_BRAIN_URL: `http://127.0.0.1:${FAKE_PORT}`, NPC_BRAIN_MODEL: MODEL, NPC_BRAIN_BIG_URL: "", NPC_AGENT_SECRET: AGENT_SECRET, SURVIVORZ_COUNTDOWN_MS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  srv.stdout.on("data", (d) => { log += d; });
  srv.stderr.on("data", (d) => { log += d; });
  process.on("exit", () => { try { srv.kill("SIGINT"); } catch {} });
  let up = false;
  for (let i = 0; i < 160 && !up; i++) { try { up = (await fetch(BASE + "/health")).ok; } catch {} if (!up) await sleep(250); }
  ok(up, "the server boots");
  const api = async (method, url, token, body) => {
    const r = await fetch(BASE + url, { method, headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch {}
    return { status: r.status, body: j };
  };
  const admin = (await api("POST", "/api/login", null, { username: "admin", password: ADMIN_PW })).body?.token;
  const member = (await api("POST", "/api/register", null, { username: "zlistener", password: "Sturdy!Passw0rd#9", displayName: "L", secret: "vault marmalade lantern quartz 47", acceptTerms: true })).body?.token;
  ok((await api("GET", "/api/admin/survivorz/talk", admin)).body?.on === true, "the talk switch is ON by default (Josh, Oct 28 2026: an off default left the live show silent)");
  ok((await api("POST", "/api/admin/survivorz/talk", admin, { on: false })).body?.on === false, "the admin turns it off");
  ok((await api("POST", "/api/admin/survivorz/talk", member, { on: true })).status === 403, "a member can't turn it on");
  ok((await api("POST", "/api/admin/survivorz/talk", admin, { on: "yes" })).status === 400, "a malformed press is refused");
  ok((await api("POST", "/api/admin/survivorz/talk", admin, { on: true })).body?.on === true, "the admin turns it on");
  const db = new DatabaseSync(path.join(DATA_DIR, "solace.db"));
  ok(!!db.prepare("SELECT 1 FROM audit WHERE action = 'survivorz.talk_on'").get(), "…and it's audited");
  db.close();
  // the brain comes online (the fake reports the model loaded)
  for (let i = 0; i < 40; i++) { const s = (await api("GET", "/api/admin/survivorz/talk", admin)).body; if (s?.minds?.modelUp || i > 0 && !s?.minds) break; await sleep(250); }
  await api("POST", "/api/admin/survivorz/show", admin, { op: "start", seed: 777001 });
  const frames = [];
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws-survivorz?token=${encodeURIComponent(admin)}`);
  ws.on("message", (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
  await new Promise((r) => ws.on("open", r));
  const st = (await api("GET", "/api/admin/survivorz/talk", admin)).body;
  ok(st?.minds?.active === true, "with a model up and the switch on, the show's minds are active");
  // a say frame on the wire: the first moments come within the first sim minutes (real time here)
  let said = null;
  for (let i = 0; i < 240 && !said; i++) { said = frames.find((f) => f.type === "say"); if (!said) await sleep(500); }
  ok(!!said && typeof said.text === "string" && /^s:/.test(said.by), "a `say` frame reaches the watcher's socket" + (said ? `: ${said.by} "${said.text}"` : " (none in 2 min)"));
  const thought = frames.find((f) => f.type === "think");
  ok(!!thought && typeof thought.text === "string" && thought.text.length > 0 && /^s:/.test(thought.by), "a `think` frame reaches the watcher's socket" + (thought ? `: ${thought.by} "${thought.text}"` : ""));
  const late = [];
  const ws2 = new WebSocket(`ws://127.0.0.1:${PORT}/ws-survivorz?token=${encodeURIComponent(admin)}`);
  ws2.on("message", (d) => { try { late.push(JSON.parse(String(d))); } catch {} });
  await new Promise((r) => ws2.on("open", r));
  for (let i = 0; i < 20 && late.length < 2; i++) await sleep(100);
  const firstNonThink = late.findIndex((f, i) => i > 0 && f.type !== "think");
  const handed = late.slice(1, firstNonThink < 0 ? late.length : firstNonThink).filter((f) => f.type === "think");
  ok(late[0]?.type === "snap" && handed.length >= 5, `a watcher who joins late gets the snapshot, then every card's standing thought (${handed.length})`);
  ws2.close();
  // THE VOICES (survivorz/voices.ts): an agent that says it voices the survivors (sz=1) gets each held line
  // with its clone; the line goes out with its clip once the audio is back
  const agent = (method, url, body) => fetch(BASE + url, { method, headers: { "x-agent-secret": AGENT_SECRET, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json().catch(() => null));
  const old = await agent("GET", "/api/npc/agent/near?v=2");
  ok(old && !("survivorz" in old), "an agent that doesn't ask (an older build) is never handed survivor lines");
  await agent("GET", "/api/npc/agent/near?v=2&sz=1");
  let line = null;
  for (let i = 0; i < 240 && !line; i++) { const r = await agent("GET", "/api/npc/agent/near?v=2&sz=1"); line = (r?.survivorz ?? [])[0] ?? null; if (!line) await sleep(500); }
  ok(!!line && /^s/.test("s" + line.who) && typeof line.text === "string" && "clone" in line && typeof line.kokoro === "string", `a held line reaches the agent with its voice (${line?.who}: clone "${line?.clone}")`);
  const before = frames.length;
  const pcm = Buffer.alloc(16000 * 2);
  for (let i = 0; i < 16000; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 8) * 8000), i * 2);
  const posted = await agent("POST", "/api/npc/agent/survivorz-audio", { id: line?.id, rate: 16000, pcm: pcm.toString("base64") });
  ok(posted?.ok === true, "the agent posts the line's audio back");
  let voiced = null;
  for (let i = 0; i < 40 && !voiced; i++) { voiced = frames.slice(before).find((f) => f.type === "say" && f.audio); if (!voiced) await sleep(100); }
  ok(!!voiced && voiced.text === line?.text && voiced.ms >= 950 && voiced.ms <= 1050, `…and the line goes out WITH its clip (${voiced?.audio}, ${voiced?.ms} ms)`);
  const clip = await fetch(BASE + (voiced?.audio ?? "/x"), { headers: { authorization: "Bearer " + admin } });
  ok(clip.status === 200 && clip.headers.get("content-type") === "audio/wav" && (await clip.arrayBuffer()).byteLength === 44 + pcm.length, "the clip is a WAV a watcher can fetch");
  ok((await fetch(BASE + (voiced?.audio ?? "/x"), { headers: { authorization: "Bearer " + member } })).status === 403, "…never to somebody who can't watch the show right now");
  ok((await agent("POST", "/api/npc/agent/survivorz-audio", { id: line?.id, rate: 16000, pcm: pcm.toString("base64") }))?.ok === false, "a second rendering of the same line is dropped");
  // THE HOUSE'S SWITCH DOESN'T REACH THE SHOW (Josh, Nov 1 2026: Sterling, Ada and the goblins go back
  // to their scripted lines for the show's month, and the survivors keep talking)
  // (and since Nov 17 2026 the house's AI is ARCHIVED by default — config.npcHouseAi — so it is off with no switch to
  // turn it back on, and the show must keep talking all the same)
  { const st = (await api("GET", "/api/admin/npc-brain", admin)).body, sw = await api("POST", "/api/admin/npc-brain", admin, { on: true });
    ok(st?.houseAi === false && st?.enabled === false && sw.status === 409, `the house's AI archived: off, and its switch refused (${sw.status})`); }
  const afterHouse = (await api("GET", "/api/admin/survivorz/talk", admin)).body;
  ok(afterHouse?.minds?.active === true && afterHouse?.minds?.modelUp === true, "…and the show's minds are still active");
  const sinceHouse = frames.length;
  let saidAfter = null;
  for (let i = 0; i < 240 && !saidAfter; i++) { saidAfter = frames.slice(sinceHouse).find((f) => f.type === "say"); if (!saidAfter) await sleep(500); }
  ok(!!saidAfter, "…and still speak (a model-written `say`) with the house switched off" + (saidAfter ? `: ${saidAfter.by} "${saidAfter.text}"` : " (nothing in 2 min)"));
  await api("POST", "/api/admin/npc-brain", admin, { on: true });
  await api("POST", "/api/admin/survivorz/talk", admin, { on: false });
  ok((await api("GET", "/api/admin/survivorz/talk", admin)).body?.minds?.active === false, "switched off, the minds go quiet");
  ws.close();
  const gone = new Promise((r) => srv.once("exit", r));
  srv.kill("SIGINT");
  await Promise.race([gone, sleep(5000)]);
  if (!up) console.log(log.slice(-2000));
}

// THE RECAP (src/survivorz/recap.ts, Nov 1 2026): the stream's pop-up — public facts only
{
  console.log("\nTHE RECAP");
  const { Recapper } = D("survivorz/recap.js");
  const w = new SimWorld({ seed: 424242, start: 1_800_000_000_000 });
  for (let i = 0; i < 600; i++) w.tick(100);
  const victim = w.survivors.find((s) => s.alive);
  victim.bitten = true;   // a secret bite: nobody knows
  const r = new Recapper();
  r.feed(w, { type: "say", t: w.t, by: `s:${victim.who}`, text: "It bit me, I think it bit me." });
  r.feed(w, { type: "say", t: w.t, by: "s:dale", text: "We push for the labs at dawn." });
  r.feed(w, { type: "ev", event: "keycard.found", t: w.t, seed: 1, by: "s:johanna", tier: 2 });
  const facts = r.facts(w).join("\n");
  ok(!/bitten|bit me|bite/i.test(facts), "a secret bite and a line about it never reach the recap's facts");
  ok(/push for the labs/.test(facts) && /level-2 keycard/.test(facts), "…while the public moments and lines do");
  ok(/Day \d|day \d/.test(r.plain(w) + facts) && r.plain(w).length > 10, `the plain-words fallback says where things stand: "${r.plain(w)}"`);
  const sent = [];
  const fakeModel = (reply) => ({ up: () => true, ask: async () => reply });
  r.tick(w, fakeModel("Dale wants to push for the labs at dawn while Johanna holds the new level-2 keycard."), (f) => sent.push(f), Date.now() + 10 * 60_000);
  await sleep(50);
  ok(sent[0]?.type === "recap" && /labs at dawn/.test(sent[0].text) && sent[0].ms > 0, "a recap the model writes from the facts goes out");
  const r2 = new Recapper();
  r2.tick(w, fakeModel("Seventeen of the dead, 17 of them, close in on the group."), (f) => sent.push(f), Date.now() + 10 * 60_000);
  await sleep(50);
  ok(sent[1] && !/17/.test(sent[1].text), "a recap with a number it was never shown is replaced by the plain words");
  r2.tick(w, fakeModel("x"), (f) => sent.push(f), Date.now() + 10 * 60_000 + 1000);
  await sleep(50);
  ok(sent.length === 2, "and none comes again before the next interval");
}

fake.close();
console.log(`\n${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
