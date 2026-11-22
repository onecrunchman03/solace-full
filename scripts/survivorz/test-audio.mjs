// SOLACE SURVIVORZ — THE SOUND ENGINE'S RULES (client/src/survivorz/audio/rules.ts, music-rules.ts,
// cues.ts), held without a browser: Node imports the pure TS files directly.
//
// Run:  node scripts/survivorz/test-audio.mjs        (npm run build first for the room-coverage check)
//
// What it holds, one assert per agreed rule:
//   · takes: never the same take twice running, and every take still gets played;
//   · footsteps: run louder and higher than walk, sneak quieter and dulled, every step jittered;
//   · the camera's hearing: walls dull and quieten a sound, distance past its range silences it;
//   · every room on the map has an echo and a floor; the PA, logs and score aren't positional;
//   · the devices: logs on tape, Ashby's call on a phone line, the PA through the speakers;
//   · THE SCORE: rises at once, falls only after its hold, never flip-flops on a wobbling threat,
//     keeps its minimum time, combat → aftermath → calm, a death → silence → grief, a pin wins,
//     mute silences, ordinary changes wait for the phrase, calm thins at night, the zone colour;
//   · THE CUES: every event the doors code fires has one, every sound they name exists in the
//     finished set, a door's material picks its sound, `{who}` becomes the survivor.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const R = await imp("client/src/survivorz/audio/rules.ts");
const M = await imp("client/src/survivorz/audio/music-rules.ts");
const C = await imp("client/src/survivorz/audio/cues.ts");

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log("  ✗", msg); } };
const seeded = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);

// ── takes ──
{
  const r = seeded(7);
  let last, repeats = 0; const seen = new Set();
  for (let i = 0; i < 2000; i++) { const k = R.pickTake(5, last, r); if (k === last) repeats++; seen.add(k); last = k; }
  ok(repeats === 0, "a take never plays twice running");
  ok(seen.size === 5, "every take still gets played");
  ok(R.pickTake(1, 0, r) === 0, "a sound with one take plays it");
}

// ── footsteps ──
{
  const man = { walk: { gainDb: 0, pitch: 1, lowpassHz: null }, run: { gainDb: 4, pitch: 1.04, lowpassHz: null }, sneak: { gainDb: -9, pitch: 0.97, lowpassHz: 3500 } };
  const flat = { pitch: 0, gainDb: 0 }, r = seeded(3);
  const w = R.stepShape(man, flat, "walk", r), run = R.stepShape(man, flat, "run", r), sn = R.stepShape(man, flat, "sneak", r);
  ok(run.gain > w.gain && run.rate > w.rate, "running is louder and higher than walking");
  ok(sn.gain < w.gain && sn.lowpassHz === 3500, "sneaking is quieter and dulled");
  const a = R.stepShape(man, { pitch: 0.04, gainDb: 1.5 }, "walk", r), b = R.stepShape(man, { pitch: 0.04, gainDb: 1.5 }, "walk", r);
  ok(a.rate !== b.rate && Math.abs(a.rate - 1) <= 0.04 && Math.abs(20 * Math.log10(a.gain)) <= 1.5, "every step is jittered, inside the jitter");
}

// ── the camera's hearing ──
{
  const clear = R.worldMix(10, 0, 90, 0.3), walled = R.worldMix(10, 2, 90, 0.3);
  ok(walled.cutoff < clear.cutoff && walled.dry < clear.dry, "walls dull and quieten a sound");
  ok(R.worldMix(95, 0, 90, 0.3).silent && !R.worldMix(85, 0, 90, 0.3).silent, "past its range a sound is silent, inside it isn't");
  ok(R.audibleRange("gun-pistol-shot", "guns") > R.audibleRange("step-concrete", "footsteps"), "a gunshot carries further than a step");
  ok(["pa-lockdown", "log-a01", "score-calm", "bed-labs"].every((id) => R.audibleRange(id, id.startsWith("pa") ? "pa" : id.startsWith("log") ? "audiologs" : id.startsWith("score") ? "score" : "facility beds") === 0),
    "the PA, the logs, the score and the room tone are not positional");
  ok(R.audibleRange("vocal-rick-scream", "vocals") > R.audibleRange("vocal-rick-cough", "vocals"), "a scream carries further than a cough");
}

// ── the rooms ──
{
  const req = createRequire(import.meta.url);
  const mapJs = path.join(ROOT, "dist/survivorz/facility-map.js");
  if (fs.existsSync(mapJs)) {
    const { SITE_9 } = req(mapJs);
    const missing = SITE_9.rooms.filter((r) => !(r.id in R.ROOM_ACOUSTIC)).map((r) => r.id);
    ok(missing.length === 0, `every room on the map has an echo (missing: ${missing.join(", ")})`);
    ok(SITE_9.rooms.every((r) => ["concrete", "vinyl", "grating", "water", "vent"].includes(R.roomSurface(r.id))), "every room has a floor");
    const zones = new Set(SITE_9.zones.map((z) => z.id));
    ok([...zones].every((z) => R.bedOf(z, null)), "every zone has a room tone");
  } else console.log("  (skipped the room coverage: npm run build first)");
  ok(R.roomAcoustic("generator-hall") === "hall" && R.ACOUSTIC.hall.decayS > R.ACOUSTIC.office.decayS, "the generator hall rings longer than an office");
  ok(R.roomAcoustic("nowhere") === "concrete", "an unknown room falls back to concrete");
}

// ── devices ──
ok(R.deviceOf("log-a01", "audiologs") === "tape" && R.deviceOf("log-a04", "audiologs") === "phone" && R.deviceOf("pa-breach", "pa") === "pa" && R.deviceOf("gun-pistol-shot", "guns") === null,
  "logs on tape, Ashby's call on the phone, the PA on the speakers, the world on nothing");

// ── THE SCORE ──
{
  const at = (t, threat, extra = {}) => ({ now: t, threat, fighting: false, zone: "labs", night: false, ...extra });
  let s = M.newMusic(0);
  let c = M.step(s, at(100, 0.55));
  ok(c && c.level === "suspense" && s.level === "suspense", "it rises at once when the threat crosses a line");
  c = M.step(s, at(200, 0.9));
  ok(c && c.level === "combat" && c.urgent, "into combat is immediate");
  // fall slow: under the line but not yet for the hold
  M.step(s, at(10_000, 0.1));
  ok(s.level === "combat", "combat doesn't let go the moment the threat drops");
  M.step(s, at(10_000 + M.FALL_HOLD.combat - 1, 0.1));
  ok(s.level === "combat", "…nor just before its hold");
  c = M.step(s, at(10_000 + M.FALL_HOLD.combat + 1, 0.1));
  ok(c && c.level === "aftermath", "after the hold, combat falls to aftermath");
  M.step(s, at(10_000 + M.FALL_HOLD.combat + M.AFTERMATH_MS + 10, 0));
  ok(s.level === "calm", "aftermath gives way to calm");

  // no flip-flop: a threat wobbling round the suspense line
  s = M.newMusic(0);
  M.step(s, at(0, 0.55));
  let changes = 0;
  for (let t = 100; t < 60_000; t += 250) { const thr = (t / 250) % 2 ? 0.47 : 0.53; if (M.step(s, at(t, thr))) changes++; }
  ok(changes === 0 && s.level === "suspense", "a threat wobbling round a line doesn't toggle the score");
  // the minimum hold: rise, drop at once, the hold of the level must still pass
  s = M.newMusic(0);
  M.step(s, at(0, 0.3));
  for (let t = 100; t <= M.FALL_HOLD.uneasy + 500; t += 250) M.step(s, at(t, 0));
  ok(s.level === "calm", "uneasy falls back to calm after its hold");
  // the minimum time on a level: pinned to suspense with no threat, unpinned, it still waits
  s = M.newMusic(0); s.pin = "suspense"; M.step(s, at(0, 0)); s.pin = null;
  for (let t = 250; t < M.MIN_HOLD - 100; t += 250) M.step(s, at(t, 0));
  ok(s.level === "suspense", "no level falls before its minimum time");

  // a death
  s = M.newMusic(0);
  M.step(s, at(0, 0.9));
  c = M.death(s, 1000);
  ok(c.level === "silence" && c.urgent, "a death drops the score to silence at once");
  M.step(s, at(1000 + M.DEATH_SILENCE_MS - 10, 0.9));
  ok(s.level === "silence", "the silence holds through a threat, for its time");
  c = M.step(s, at(1000 + M.DEATH_SILENCE_MS + 10, 0));
  ok(c && c.level === "aftermath", "then grief comes in");
  ok(Object.values(M.mix("silence", { zone: "labs", night: false })).every((g) => g === 0), "silence is silent, colour bed included");

  // levers
  s = M.newMusic(0); s.pin = "combat";
  M.step(s, at(10, 0));
  ok(s.level === "combat", "a pinned level wins over the threat");
  ok(Object.values(M.mix("combat", { zone: "labs", night: false }, true)).every((g) => g === 0), "mute silences everything");

  // phrase boundaries
  s = M.newMusic(1000);
  ok(M.nextBoundary(s, 1000 + 4500) === 1000 + 8000 && M.nextBoundary(s, 1000 + 8000) === 9000, "an ordinary change waits for the next 4-second phrase");
  c = (() => { const t = M.newMusic(0); return M.step(t, at(10, 0.3)); })();
  ok(c && !c.urgent, "rising to uneasy waits for the phrase (only combat and a death don't)");

  // the mix
  const day = M.mix("calm", { zone: "labs", night: false }), night = M.mix("calm", { zone: "labs", night: true });
  ok(night["score-calm"] < day["score-calm"], "the calm thins at night");
  ok(day["score-colour-labs"] > 0 && day["score-colour-power"] === 0, "the zone's colour bed plays, the others don't");
  ok(M.colourOf("deep", "far-tunnels") === "score-colour-tunnels", "the tunnels have their own colour");
}

// ── THE CUES ──
{
  const doorsSrc = fs.readFileSync(path.join(ROOT, "src/survivorz/doors.ts"), "utf8");
  const fired = [...new Set([...doorsSrc.matchAll(/this\.fx\("([^"]+)"/g)].map((m) => m[1]))];
  const missing = fired.filter((e) => !(e in C.CUES));
  ok(missing.length === 0, `every event the doors code fires has a cue (missing: ${missing.join(", ")})`);
  const fxContract = ["zone.dip", "zone.powered", "pipe.burst", "thing.fell", "vault.open", "vault.shut", "fire.spread", "fire.door"];
  ok(fxContract.every((e) => e in C.CUES), "every event in the effects contract has a cue");
  const manPath = path.join(ROOT, "assets/downloads/survivorz/sound/final/manifest.json");
  if (fs.existsSync(manPath)) {
    const man = JSON.parse(fs.readFileSync(manPath, "utf8")).sounds;
    const used = [...C.soundsUsed(["johanna", "dale", "ben", "rick", "sarah", "rollo"])];
    const gone = used.filter((s) => !man[s]);
    ok(gone.length === 0, `every sound a cue names is in the finished set (missing: ${gone.join(", ")})`);
    const scoreIds = [...Object.values(M.LAYER), ...Object.values(M.STING), "score-colour-labs", "score-colour-power", "score-colour-tunnels", "score-colour-deeplab"];
    ok(scoreIds.every((s) => man[s]), "every layer and sting the score uses is in the set");
  } else console.log("  (skipped the sound-set check: no finished set on this box)");
  const glass = C.partsFor("door.broken", { material: "glass" }).map((p) => p.sound);
  const wood = C.partsFor("door.broken", { material: "wood" }).map((p) => p.sound);
  ok(glass.includes("glass-break") && !glass.includes("plank-break") && wood.includes("plank-break"), "a door's material picks its sound");
  ok(C.partsFor("survivor.cough", { who: "sarah" })[0].sound === "vocal-sarah-cough", "{who} becomes the survivor's own voice");
  // A BODY'S THUD IS ITS OWN CUE (Nov 12 2026): played when the body reaches the floor (show/actors.ts onThud), never
  // with the event that starts the fall — a fall takes 0.8 s to land, a zombie's death up to two
  ok(C.partsFor("body.fall")[0]?.sound === "body-fall" && !C.partsFor("survivor.down", { who: "sarah" }).some((p) => p.sound === "body-fall") && !C.partsFor("zombie.death").some((p) => p.sound === "body-fall"),
    "a fall's thud is its own cue, not part of the event that starts the fall");
  // WHAT THEY PICK UP, HAND OVER AND HELP UP makes a sound (Nov 12 2026: all of it was silent)
  ok(["item.found", "keycard.found", "survivor.give", "survivor.steal"].every((e) => C.partsFor(e, {}).length > 0) && C.partsFor("survivor.revived", { who: "dale" }).some((p) => p.sound === "vocal-dale-effort"),
    "a find, a keycard, a gift, a theft and a friend hauled back up each have a sound");
  // A VOICE TO BORROW (Nov 12 2026): only the first six have scream, pain and cough recordings of their own
  {
    const cast = [{ id: "rick", vox: "m" }, { id: "johanna", vox: "f" }, { id: "dale", vox: "m" }, { id: "sarah", vox: "f" }, { id: "claudia", vox: "f" }, { id: "renner", vox: "m" }];
    const lib = new Set(["rick", "johanna", "dale", "sarah"].flatMap((w) => ["scream", "pain", "cough"].map((k) => `vocal-${w}-${k}`)));
    const has = (id) => lib.has(id);
    const c1 = C.vocalStandIn("claudia", "scream", cast, has), r1 = C.vocalStandIn("renner", "scream", cast, has);
    ok(["johanna", "sarah"].includes(c1) && ["rick", "dale"].includes(r1), `somebody with no voice sounds of their own borrows a set of the same register (Claudia: ${c1}, Renner: ${r1})`);
    ok(C.vocalStandIn("claudia", "pain", cast, has) === c1 && C.vocalStandIn("claudia", "scream", cast, has) === c1, "…the same one every time");
    ok(C.vocalStandIn("claudia", "sob", cast, has) === null, "…and nothing when nobody has that sound");
    ok(C.vocalStandIn("zed", "scream", [{ id: "zed" }, ...cast], has) !== null && C.vocalStandIn("claudia", "scream", [{ id: "claudia", vox: "f" }, { id: "rick", vox: "m" }], has) === "rick", "…any set at all when there is none of their own register");
    const rc = C.standInRate("claudia"), rr = C.standInRate("renner");
    ok([rc, rr].every((r) => Math.abs(r - 1) >= 0.049 && Math.abs(r - 1) <= 0.081) && C.standInRate("claudia") === rc, `a borrowed voice plays a little off its own pitch, the same for a character every time (Claudia ×${rc.toFixed(2)}, Renner ×${rr.toFixed(2)})`);
  }
  const rec = C.partsFor("recorder.play", { log: "log-a03" }).map((p) => p.sound);
  ok(rec.includes("recorder-play") && rec.includes("log-a03") && C.partsFor("recorder.play", {}).every((p) => p.sound !== "{log}" && p.sound !== ""), "a recorder plays the log it holds (and a recorder with none plays only its click)");
  const count = C.partsFor("vault.countdown").map((p) => p.delayMs ?? 0);
  ok(count.join(",") === "0,1000,2000,3000,4000", "the countdown is one number a second");
  ok(C.partsFor("zone.powered", { on: false }).every((p) => p.sound !== "sting-power"), "the power going off fires no power-up sting");
}

// ---- A HOUSE (Glenridge Hall): the floor heard is the floor the build laid, and nothing of the bunker's steel ----
// (the review of Nov 13 2026: 31 rooms of 77 played the wrong floor, and boards knocked off a window, the dead at an
// oak door and the lights going out played steel doors and machinery)
{
  const site = JSON.parse(fs.readFileSync(path.join(ROOT, "src/survivorz/glenridge-site.json"), "utf8"));
  R.setHouse(site.rooms.map((r) => ({ id: r.id, outdoor: !!r.outdoor, surface: r.surface, below: (r.y ?? 0) < -1 })));
  const wrong = site.rooms.filter((r) => R.roomSurface(r.id) !== r.surface).map((r) => r.id);
  ok(site.rooms.every((r) => typeof r.surface === "string") && wrong.length === 0, `every room of the house sounds the floor the build laid there (wrong: ${wrong.join(", ")})`);
  ok(R.roomSurface("great-hall") === "wood" && R.roomSurface("kitchen") === "vinyl" && R.roomSurface("solarium") === "stone" && R.roomSurface("forecourt") === "gravel" && R.roomSurface("furnace-room") === "concrete" && R.roomSurface("boys-bedroom-a") === "carpet",
    "the Great Hall is boards, the kitchen lino, the solarium stone, the forecourt gravel, the furnace room concrete, the carpeted bedroom carpet");
  ok(site.rooms.every((r) => R.STEP_SOUND[R.roomSurface(r.id)]) && site.rooms.every((r) => !!R.roomAcoustic(r.id)), "every room has a step sound and an echo");
  ok(R.roomAcoustic("great-hall") === "hall" && R.roomAcoustic("upper-gallery") !== "hall" && R.roomAcoustic("forecourt") === "outside", "the tall hall rings; the low gallery above it doesn't; the grounds are out of doors");
  ok(R.bedOf(null, "forecourt") === "rain-out" && R.bedOf(null, "great-hall") === "rain-in" && R.bedOf(null, "library-porch") === "rain-out", "the rain is heard out in it on the grounds and an open porch, and from inside under a roof");
  ok(R.bedLevel("forecourt") > R.bedLevel("great-hall") && R.bedLevel("great-hall") > R.bedLevel("furnace-room") && R.bedLevel("furnace-room") > 0, "the rain is loudest out of doors, quieter under a roof, a murmur in the cellars");
  const names = (ev, f) => C.partsFor(ev, f).map((p) => p.sound);
  const H = { house: true, material: "wood" }, B = { house: false, material: "metal" };
  ok(names("door.banged", H).includes("door-wood-pound") && !names("door.banged", H).some((x) => /zombie-bang-door|zombie-claw/.test(x)) && names("door.banged", B).includes("zombie-bang-door"),
    "the dead beat on oak in a house and on steel in the bunker");
  ok(names("door.pushed", H).includes("door-wood-open") && !names("door.pushed", H).includes("door-forced") && names("door.pushed", B).includes("door-forced") && names("door.pushed", {}).includes("door-forced"),
    "a door pushed open is an oak door in a house; a caller that doesn't say is not in a house");
  ok(names("window.broken", H).includes("plank-break") && names("window.boarded", H).includes("hammer-nail") && names("window.banged", H).includes("door-wood-pound"), "a window's boards go up with a hammer, are beaten on as wood, and break as planks");
  // (the PA lines are in the table for a facility that has one; the engine drops them: paSystem is off on every map)
  ok(!names("zone.powered", { on: false, house: true }).some((x) => /^power-/.test(x)) && names("zone.powered", { on: false, house: true }).includes("breaker-throw") && names("zone.powered", { on: false, house: false }).includes("power-off"),
    "a house's lights go out with the switch alone: no machinery winding down");
  ok(names("door.keycard", H).includes("door-bolt") && !names("door.keycard", H).includes("card-accept"), "a key door in a house is a lock turning, never a card reader");
  const houseEvents = ["door.bolted", "planks.taken", "window.boarded", "window.banged", "window.broken", "hammer", "house.clear"];
  const silent = houseEvents.filter((e) => C.partsFor(e, H).length === 0);
  ok(silent.length === 0, `every event of the house has a sound (silent: ${silent.join(", ")})`);
  R.setHouse(null);
}

console.log(`audio: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
