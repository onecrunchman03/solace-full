// THE RACE CALLER — the same call on every screen, and never a wrong one.
//
// Run:  node scripts/checks/test_derby_call.mjs
//
// Josh, Oct 2026 ("Derby race caller"): the announcer is pre-voiced lines
// chosen by a pure planner (client/src/lib/derby-call.ts) over the shared race
// model (derby-race.ts). This holds it to what makes it worth having:
//   · two screens planning the same race agree exactly (seed → same lines)
//   · the race is called right: the winner and second named are the real
//     ones, a "takes the lead" names whoever actually leads at that instant
//   · lines never talk over each other and all fall inside the race
//   · Old Reliable's slide and pratfall are called only when they happen
//   · every line he can say has its voiced file on disk

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const url = (p) => "file://" + path.join(ROOT, p).replace(/\\/g, "/");
const { raceModel, mulberry32 } = await import(url("client/src/lib/derby-race.ts"));
const { planCall, CALL_LINES, GAP_MS, CALL_TAIL_MS, callClips, msOf, WIN_LATE_MS } = await import(url("client/src/lib/derby-call.ts"));

let n = 0, bad = 0;
const ok = (c, name) => { n++; if (!c) { bad++; console.error("  x " + name); } else console.log("  + " + name); };

const KEYS = ["rocket", "snail", "frog", "nascar", "blob", "boulder"];
const RACE_MS = 11000;
const rng = mulberry32(20261012);
const shuffle = () => { const a = [...KEYS]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const plan = (seed, placings) => planCall(raceModel(seed, KEYS, placings, RACE_MS), KEYS, placings, mulberry32(seed ^ 0x5eed));

const RACES = 400;
let agree = true, winRight = true, secondRight = true, spaced = true, inside = true, offFirst = true, known = true;
let leadRight = true, leadCalls = 0, goCalls = 0, flopCalls = 0, goWrong = false, flopWrong = false, stretchCalls = 0;
for (let r = 0; r < RACES; r++) {
  const seed = Math.floor(rng() * 2 ** 31);
  const placings = shuffle();
  const a = plan(seed, placings);
  const b = plan(seed, placings);
  if (JSON.stringify(a) !== JSON.stringify(b)) agree = false;
  const model = raceModel(seed, KEYS, placings, RACE_MS);
  const fin = model.winnerFin;
  const wc = a.find((c) => c.clip.startsWith("derby/call-win-") || c.clip.startsWith("derby/call-wire-"));
  if (!wc || wc.at < fin || wc.at > fin + WIN_LATE_MS || !(wc.clip.endsWith(`-${placings[0]}`) || (placings[0] === "boulder" && wc.clip === "derby/call-win-boulder-late"))) winRight = false;
  if (!a.some((c) => c.at > fin && c.clip === `derby/call-second-${placings[1]}`)) secondRight = false;
  const flops = a.filter((c) => c.clip === "derby/call-boulder-flop");
  flopCalls += flops.length;
  if (flops.length !== (model.boulderFlop ? 1 : 0)) flopWrong = true;
  if (flops[0] && !(flops[0].at > Math.max(...a.filter((c) => c !== flops[0]).map((c) => c.at)))) flopWrong = true;
  if (a[0].at !== 0 || !a[0].clip.startsWith("derby/call-off-")) offFirst = false;
  for (let i = 1; i < a.length; i++) if (a[i].at < a[i - 1].at + msOf(a[i - 1].clip) + GAP_MS) spaced = false;
  for (const c of a) {
    if (c.at < 0 || c.at + msOf(c.clip) > model.winnerFin + CALL_TAIL_MS) inside = false;
    if (!(c.clip in CALL_LINES)) known = false;
  }
  // replay the race and check what each call says against where everyone is
  const check = raceModel(seed, KEYS, placings, RACE_MS);
  const byAt = new Map(a.map((c) => [c.at, c.clip]));
  let wentAt = null, downAt = null;
  for (let tr = 0; tr <= fin + 2500; tr += 50) {
    const f = check.at(tr);
    if (f.boulderGo !== null && wentAt === null) wentAt = f.boulderGo;
    if (f.boulderDown && downAt === null) downAt = tr;
    const clip = byAt.get(tr);
    if (!clip) continue;
    const m = clip.match(/^derby\/call-(early|lead)-(\w+)$/);
    if (m) {
      leadCalls++;
      const i = KEYS.indexOf(m[2]);
      if (f.progress[i] < Math.max(...f.progress)) leadRight = false;
    }
    if (clip === "derby/call-boulder-go") { goCalls++; if (model.boulderFlop || wentAt !== tr) goWrong = true; }
    if (clip.startsWith("derby/call-stretch-")) stretchCalls++;
  }
}
console.log(`(${RACES} races: ${leadCalls} lead calls, ${goCalls} slides, ${flopCalls} pratfalls, ${stretchCalls} stretch calls)`);

console.log("ONE CALL, EVERY SCREEN");
ok(agree, "two screens planning the same race make exactly the same call");
console.log("CALLED RIGHT");
ok(offFirst, "every race opens with 'they're off' the moment the gate opens");
ok(winRight, "the winner named is the real winner, called as they cross (at most a beat after, to let the boulder call finish)");
ok(secondRight, "second place is named after the winner, and it's the real second");
ok(leadRight && leadCalls > RACES, "every 'in front' / 'takes the lead' names whoever is actually leading right then");
ok(!goWrong && goCalls > 0, "Old Reliable's slide is called exactly when he sets off, and never on a pratfall");
ok(!flopWrong && flopCalls > 0, "his pratfall is called on every race where he falls over, last, after the result — and never when he doesn't");
console.log("NEVER OVER EACH OTHER");
ok(spaced, "no line starts before the one before it has finished (each voiced line's real length, plus a breath)");
ok(inside, "every line falls inside the race");
ok(known, "every line called is one he has");
console.log("THE MODEL EVERY SCREEN SHARES");
// A pure function of the race: a screen that samples it late, out of order or
// from the middle (a backgrounded tab, a late joiner) sees the same thing.
let pure = true, order = true;
for (let r = 0; r < 200; r++) {
  const seed = Math.floor(rng() * 2 ** 31);
  const placings = shuffle();
  const m = raceModel(seed, KEYS, placings, RACE_MS);
  const late = raceModel(seed, KEYS, placings, RACE_MS);
  for (const tr of [9000, 400, 12000, 3000, 7000]) {
    if (JSON.stringify(m.at(tr)) !== JSON.stringify(late.at(tr))) pure = false;
  }
  // Nobody crosses the line ahead of a runner the result put in front of them.
  const crossed = {};
  for (let tr = 0; tr <= m.lastFinish + 100; tr += 10) {
    const f = m.at(tr);
    KEYS.forEach((k, i) => { if (crossed[k] === undefined && f.progress[i] >= 1) crossed[k] = tr; });
  }
  const finishers = placings.filter((k) => crossed[k] !== undefined);
  for (let i = 1; i < finishers.length; i++) if (crossed[finishers[i]] < crossed[finishers[i - 1]]) order = false;
}
ok(pure, "the race model answers the same for any moment, asked in any order (a late or backgrounded screen sees the same race)");
ok(order, "nobody crosses the line ahead of a runner the result put in front of them — the boulder included");

console.log("THE VOICE ON DISK");
const missing = callClips().filter((id) => !existsSync(path.join(ROOT, "client/public/sfx", id + ".ogg")));
ok(missing.length === 0, `every line he can say has its voiced file (${callClips().length} lines${missing.length ? `, missing ${missing.length}: ${missing.slice(0, 3).join(", ")}…` : ""})`);

console.log(`\n${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
