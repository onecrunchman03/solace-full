// SOLACE SURVIVORZ — WHAT EACH GAME EVENT SOUNDS LIKE. Pure; imports nothing.
//
// The server sends events (doors.ts FxEvent: door.open, zone.powered, vault.open…, the effects
// contract in SURVIVORZ.md §3: zone.dip, pipe.burst, thing.fell, vault.shut, fire.spread,
// fire.door, and the mechanics' own: a shot, a swing, a grab…). The effects draw them; this table
// says what they SOUND like, so the two are driven off the same event and can never disagree.
// engine.ts plays a cue; the bench (SoundBench.svelte) fires any of them by hand.
//
// A cue is a list of parts, each a manifest sound id with when it starts (ms after the event), how
// loud, and whether it loops for a while (a fire, a steam jet). A part with `pa` plays through the
// ceiling speakers everywhere; a `sting` part goes to the score; everything else plays AT the
// event's position.

export interface CuePart {
  sound: string;
  delayMs?: number;
  gain?: number;
  /** loop the sound this long (ms), fading out at the end */
  loopMs?: number;
  /** through the PA, heard in every powered zone */
  pa?: boolean;
  /** a score sting (the music player ducks under it) */
  sting?: boolean;
  /** this part only when the event's field matches (a door's material or kind) */
  when?: Record<string, string | boolean>;
}

export type CueTable = Record<string, CuePart[]>;

/** The events and what they play. */
export const CUES: CueTable = {
  // ── THE BUNKER (wire.ts BUNKER_EVENTS; Nov 2026 — they were silent: the breach alarm, the blast door going
  //    shut and the radio coming alive played nothing at all). All from the library as it stands; the wheel
  //    has no turning sound of its own yet, so its first heave is the breaker's clunk.
  "alarm.start": [{ sound: "alarm-siren", loopMs: 12_000, gain: 0.6 }],
  "crank.start": [{ sound: "breaker-throw", gain: 0.7 }],
  "door.sealed": [{ sound: "airlock-seal" }, { sound: "door-slam", delayMs: 500, gain: 0.8 }],
  // (the dead pushing a door open: a steel door forced in the bunker, an oak door thrown back in a house)
  "door.pushed": [{ sound: "door-forced", when: { house: false } }, { sound: "door-wood-open", when: { house: true }, gain: 1.1 }],
  "door.keycard": [{ sound: "card-accept", when: { house: false } }, { sound: "door-bolt", when: { house: true } }],
  "part.found": [{ sound: "pickup" }],
  "note.read": [{ sound: "paper" }],
  "radio.static": [{ sound: "walkie-static", loopMs: 2_500, gain: 0.5 }],
  "radio.fixed": [{ sound: "walkie-click" }, { sound: "walkie-static", delayMs: 250, loopMs: 1_800, gain: 0.5 }],
  "radio.call": [{ sound: "walkie-click" }],
  "zombie.rise": [{ sound: "zombie-alert", gain: 0.7 }],
  "bunker.clear": [{ sound: "sting-zone", sting: true }],

  // ── GLENRIDGE HALL (sim/scenarios/glenridge.ts) ──
  // (the bolt goes home once the leaf is shut: the swing takes 0.63 s)
  "door.bolted": [{ sound: "door-bolt", delayMs: 900 }],
  // a window's own events (doors.ts fires them; the effects read them as a door's: show/bridge.ts HOUSE_EV)
  "window.boarded": [{ sound: "plank-drop" }, { sound: "hammer-nail", delayMs: 500 }, { sound: "hammer-nail", delayMs: 1100 }],
  "window.banged": [{ sound: "door-wood-pound" }],
  "window.broken": [{ sound: "plank-break" }, { sound: "plank-drop", delayMs: 350, gain: 0.7 }],
  // boarding, while it is worked (one a blow: the bridge lets one through every second and a half)
  hammer: [{ sound: "hammer-nail", gain: 0.8 }],
  "car.fueled": [{ sound: "bottle-fill" }],
  "car.in": [{ sound: "car-door" }],
  "secret.open": [{ sound: "stone-grind" }, { sound: "sting-zone", sting: true }],
  "crest.set": [{ sound: "crest-set" }],
  "crest.found": [{ sound: "pickup" }],
  "key.found": [{ sound: "pickup" }],
  "keys.found": [{ sound: "pickup" }],
  "ledger.read": [{ sound: "paper" }],
  "secret.read": [{ sound: "paper" }, { sound: "sting-zone", sting: true }],
  "crests.seen": [{ sound: "sting-zone", sting: true }],
  "planks.taken": [{ sound: "plank-drop", gain: 0.6 }],
  "fuel.taken": [{ sound: "pickup" }],
  "car.away": [{ sound: "car-away" }],
  "house.clear": [{ sound: "sting-zone", sting: true }],

  // ── doors (doors.ts) ──
  "door.open": [
    { sound: "door-slide", when: { material: "glass" } },
    { sound: "door-fire-open", when: { material: "metal" } },
    { sound: "door-fire-open", when: { material: "wood", house: false }, gain: 0.7 },
    // a house's oak doors (Glenridge Hall): the latch and the hinges
    { sound: "door-wood-open", when: { material: "wood", house: true } },
    { sound: "airlock-hiss", when: { kind: "power" } },
    // the card through the reader (bd-keycard swipes it), its accept chirp as the bolts draw
    { sound: "card-accept", when: { kind: "keycard", house: false } },
    // (a house's locked door is opened with a key: the lock turning, not a reader's chirp)
    { sound: "door-bolt", when: { kind: "keycard", house: true } },
  ],
  "door.close": [
    { sound: "door-slide", when: { material: "glass" }, gain: 0.8 },
    { sound: "door-fire-close", when: { material: "metal" } },
    { sound: "door-slam", when: { material: "wood", house: false }, gain: 0.6 },
    // (heard as the leaf meets the frame, not as it starts to move)
    { sound: "door-wood-close", when: { material: "wood", house: true }, delayMs: 280 },
    { sound: "airlock-seal", when: { kind: "power" } },
  ],
  "door.lock": [{ sound: "door-locked" }],
  "door.hit": [{ sound: "melee-axe-wood", when: { material: "wood" } }, { sound: "melee-pipe-metal", when: { material: "metal" } }, { sound: "glass-pound", when: { material: "glass" } }],
  "door.banged": [
    { sound: "zombie-bang-door", when: { house: false } }, { sound: "zombie-claw", delayMs: 400, gain: 0.6, when: { house: false } },
    // (fists on oak, not on a steel door)
    { sound: "door-wood-pound", when: { house: true } },
  ],
  "door.barricade": [{ sound: "plank-drop" }, { sound: "hammer-nail", delayMs: 500 }, { sound: "hammer-nail", delayMs: 1100 }],
  "door.unbarricade": [{ sound: "plank-break" }],
  "door.broken": [
    { sound: "plank-break", when: { material: "wood" } },
    { sound: "door-forced", when: { material: "metal" } },
    { sound: "glass-break", when: { material: "glass" } },
    { sound: "sting-door-break", sting: true },
  ],
  "door.pried": [{ sound: "door-forced" }],
  "safe.found": [{ sound: "keypad-accept" }, { sound: "door-fire-open", delayMs: 300 }],
  "room.unsealed": [{ sound: "keypad-accept" }, { sound: "door-fire-open", delayMs: 300 }],
  "route.mapped": [{ sound: "paper" }],
  "vault.open": [{ sound: "pa-vault-open", pa: true, delayMs: 200 }, { sound: "vault-open" }, { sound: "sting-escape", sting: true }],
  "vault.shut": [{ sound: "pa-vault-sealing", pa: true }, { sound: "vault-close", delayMs: 1500 }, { sound: "pa-vault-sealed", pa: true, delayMs: 7000 }],
  "vault.armed": [{ sound: "pa-override", pa: true }],
  "vault.count30": [{ sound: "pa-30", pa: true }],
  "vault.count10": [{ sound: "pa-10", pa: true }],
  // the last five seconds: one number a second, at the pace of real seconds (Josh)
  "vault.countdown": [
    { sound: "pa-count-5", pa: true }, { sound: "pa-count-4", pa: true, delayMs: 1000 }, { sound: "pa-count-3", pa: true, delayMs: 2000 },
    { sound: "pa-count-2", pa: true, delayMs: 3000 }, { sound: "pa-count-1", pa: true, delayMs: 4000 },
  ],

  // ── power (doors.ts zone.powered, the effects contract's zone.dip) ──
  "zone.powered": [
    { sound: "breaker-throw" },
    // (a facility's machinery winding up or down: a house has only the switch, and the dark)
    { sound: "power-on", delayMs: 250, when: { on: true, house: false } },
    { sound: "power-off", delayMs: 250, when: { on: false, house: false } },
    { sound: "sting-power", sting: true, when: { on: true } },
    // THE PA (Oct 31 2026): the chime, then the facility saying which wing is lit — or that the mains went
    { sound: "pa-chime", pa: true, delayMs: 900 },
    { sound: "pa-power-labs", pa: true, delayMs: 2400, when: { zone: "labs", on: true } },
    { sound: "pa-power-medical", pa: true, delayMs: 2400, when: { zone: "medical", on: true } },
    { sound: "pa-power-security", pa: true, delayMs: 2400, when: { zone: "security", on: true } },
    { sound: "pa-power-containment", pa: true, delayMs: 2400, when: { zone: "containment", on: true } },
    { sound: "pa-power-deep", pa: true, delayMs: 2400, when: { zone: "deep", on: true } },
    { sound: "pa-power-fail", pa: true, delayMs: 2400, when: { on: false } },
  ],
  "zone.dip": [{ sound: "light-flicker" }, { sound: "spark", delayMs: 300, gain: 0.5 }],
  "generator.max": [{ sound: "pa-generator-max", pa: true }],
  // (the breach comes with Containment's power: its "seals disengaged" line goes first, then the warning)
  "containment.breach": [{ sound: "alarm-klaxon", loopMs: 20_000, gain: 0.7, delayMs: 300 }, { sound: "pa-breach", pa: true, delayMs: 5600 }],
  lockdown: [{ sound: "pa-lockdown", pa: true }],

  // ── the director's tools (the effects contract) ──
  // (the bunker's own noises: a steam pipe on the mansion's lawn is nobody's idea of the house settling, and the
  // house has its creaks: the code review's D-6)
  "pipe.burst": [{ sound: "pipe-burst", when: { house: false } }, { sound: "house-creak", when: { house: true }, gain: 1.2 }],
  "thing.fell": [{ sound: "metal-clatter", when: { house: false } }, { sound: "house-creak", when: { house: true } }],
  "fire.spread": [{ sound: "fire-loop", loopMs: 8_000 }],
  "fire.door": [{ sound: "fire-loop", loopMs: 8_000 }, { sound: "pa-fire", pa: true, delayMs: 1500 }],

  // ── weapons ──
  "gun.pistol": [{ sound: "gun-pistol-shot" }, { sound: "gun-casing", delayMs: 450, gain: 0.5 }],
  "gun.rifle": [{ sound: "gun-rifle-shot" }, { sound: "gun-casing", delayMs: 450, gain: 0.5 }],
  "gun.shotgun": [{ sound: "gun-shotgun-shot" }, { sound: "gun-shotgun-pump", delayMs: 600 }],
  "gun.dry": [{ sound: "gun-dryfire" }],
  "gun.reload.pistol": [{ sound: "gun-pistol-mag-out" }, { sound: "gun-pistol-mag-in", delayMs: 900 }, { sound: "gun-pistol-slide", delayMs: 1500 }],
  "gun.reload.rifle": [{ sound: "gun-rifle-mag" }, { sound: "gun-rifle-bolt", delayMs: 1800 }],
  "gun.reload.shell": [{ sound: "gun-shotgun-load" }],
  "melee.swing.light": [{ sound: "melee-swing-light" }],
  "melee.swing.heavy": [{ sound: "melee-swing-heavy" }],
  "melee.hit": [{ sound: "melee-hit-flesh" }],
  "melee.hit.head": [{ sound: "melee-hit-flesh" }, { sound: "melee-bone", gain: 0.8 }],
  "melee.stab": [{ sound: "melee-stab" }],
  "melee.stomp": [{ sound: "melee-bone" }, { sound: "body-gore", gain: 0.7 }],
  "molotov.break": [{ sound: "molotov-break" }, { sound: "fire-loop", delayMs: 300, loopMs: 8_000 }],
  "molotov.light": [{ sound: "lighter" }],
  "pipebomb.fuse": [{ sound: "fuse-hiss" }],
  "pipebomb.blast": [{ sound: "pipebomb-blast" }],
  "noisemaker": [{ sound: "alarm-clock", loopMs: 20_000 }],

  // ── zombies ──
  "zombie.idle": [{ sound: "zombie-idle" }],
  "zombie.alert": [{ sound: "zombie-alert" }],
  "zombie.chase": [{ sound: "zombie-chase" }],
  "zombie.attack": [{ sound: "zombie-attack" }],
  "zombie.feed": [{ sound: "zombie-eat" }],
  // (the body's thud is its own cue, played when the body reaches the floor: "body.fall", show/actors.ts onThud)
  "zombie.death": [{ sound: "zombie-death" }],
  "body.fall": [{ sound: "body-fall" }],
  "zombie.burn": [{ sound: "zombie-burn" }],
  "zombie.glass": [{ sound: "glass-pound" }],
  "experiment.idle": [{ sound: "zombie-exp-idle" }],
  "experiment.alert": [{ sound: "zombie-exp-scream" }],
  "horde": [{ sound: "zombie-horde" }],

  // ── the survivors (the vocal sounds take the survivor's id: `vocal-${who}-${kind}`) ──
  "survivor.grabbed": [{ sound: "vocal-{who}-scream" }, { sound: "vocal-{who}-struggle", delayMs: 700 }],
  "survivor.bitten": [{ sound: "vocal-{who}-scream" }, { sound: "body-gore", gain: 0.6 }, { sound: "sting-bite", sting: true }],
  "survivor.hit": [{ sound: "vocal-{who}-hit" }],
  "survivor.effort": [{ sound: "vocal-{who}-effort" }],
  "survivor.down": [{ sound: "vocal-{who}-pain", delayMs: 500 }, { sound: "sting-down", sting: true }],
  "survivor.dying": [{ sound: "vocal-{who}-dying" }],
  "survivor.dead": [{ sound: "sting-death", sting: true }],
  "survivor.cough": [{ sound: "vocal-{who}-cough" }],
  "survivor.panic": [{ sound: "vocal-{who}-panic" }],
  "survivor.sob": [{ sound: "vocal-{who}-sob" }],
  "survivor.pain": [{ sound: "vocal-{who}-pain" }],
  "survivor.turned": [{ sound: "sting-turn", sting: true }, { sound: "zombie-alert", delayMs: 2500 }],

  // ── survival work ──
  "eat.can": [{ sound: "can-open" }],
  "drink": [{ sound: "drink" }],
  "sink.fill": [{ sound: "sink-run" }, { sound: "bottle-fill", delayMs: 400 }],
  "bandage": [{ sound: "bandage" }, { sound: "tape", delayMs: 900 }],
  "inject": [{ sound: "syringe" }],
  "pills": [{ sound: "pills" }],
  "search": [{ sound: "rummage" }],
  "pickup": [{ sound: "pickup" }],
  "bag": [{ sound: "zip" }],
  "craft": [{ sound: "workbench", loopMs: 6_000 }],
  "lockpick": [{ sound: "lockpick" }],
  "box.open": [{ sound: "box-open" }],
  // WHAT THEY PICK UP, HAND OVER AND HELP UP (the Nov 12 2026 review, D3 — all silent: 19 finds, a keycard and 23
  // gifts in one show). From the library as it stands: nothing new was recorded.
  "item.found": [{ sound: "pickup", gain: 0.8 }],
  "keycard.found": [{ sound: "pickup" }],
  "survivor.give": [{ sound: "cloth", gain: 0.7 }, { sound: "pickup", delayMs: 400, gain: 0.7 }],
  "survivor.steal": [{ sound: "cloth", gain: 0.45 }],
  // (the one on the floor is hauled up: their clothes, then the effort in their own voice)
  "survivor.revived": [{ sound: "cloth" }, { sound: "vocal-{who}-effort", delayMs: 600 }],
  "fridge.open": [{ sound: "fridge-open" }],
  "drag": [{ sound: "furniture-drag" }],
  "flashlight": [{ sound: "flashlight" }],
  "walkie.key": [{ sound: "walkie-click" }],
  "walkie.static": [{ sound: "walkie-static", loopMs: 2_500, gain: 0.5 }],
  "keypad.press": [{ sound: "keypad-press" }],
  "keypad.ok": [{ sound: "keypad-accept" }],
  "keypad.no": [{ sound: "keypad-deny" }],
  "card.ok": [{ sound: "card-accept" }],
  "card.no": [{ sound: "card-deny" }],
  "terminal.boot": [{ sound: "terminal-boot" }],
  "terminal.type": [{ sound: "terminal-keys" }],
  "paper": [{ sound: "paper" }],
  // the recorder's click, then the log itself (the event names it: {log} = "log-a01"…; a tape through the
  // recording device, so it ducks the score like a voice)
  "recorder.play": [{ sound: "recorder-play" }, { sound: "{log}", delayMs: 700 }],
  "ladder": [{ sound: "ladder" }],
  "hatch": [{ sound: "hatch-open" }],
  "lift": [{ sound: "elevator" }, { sound: "pa-lift", pa: true, delayMs: 800 }],
  "decon": [{ sound: "decon-shower", loopMs: 6_000 }],

  // ── the cure and the truth ──
  "lazarus.start": [{ sound: "lab-machine", loopMs: 20_000 }],
  "lazarus.done": [{ sound: "analyser-done" }],
  "cure.proven": [{ sound: "analyser-done" }, { sound: "sting-cure", sting: true, delayMs: 500 }],
  "truth.found": [{ sound: "sting-truth", sting: true }],
  "zone.opened": [{ sound: "sting-zone", sting: true }],
  "first.contact": [{ sound: "sting-contact", sting: true }],
};

/** The parts of a cue that apply to this event's fields, with `{who}` (and any other `{field}` the event
 *  carries as a string — a recorder's `{log}`) filled in. A part naming a field the event doesn't carry is
 *  dropped. */
export function partsFor(event: string, fields: Record<string, unknown> = {}): CuePart[] {
  const cue = CUES[event];
  if (!cue) return [];
  const out: CuePart[] = [];
  for (const p of cue) {
    // (a caller that doesn't say is not in a house)
    if (p.when && !Object.entries(p.when).every(([k, v]) => (fields[k] ?? (k === "house" ? false : undefined)) === v)) continue;
    if (!p.sound.includes("{")) { out.push(p); continue; }
    let ok = true;
    const sound = p.sound.replace(/\{(\w+)\}/g, (_m, k: string) => { const v = fields[k]; if (typeof v !== "string" || !v) { ok = false; return ""; } return v; });
    if (ok) out.push({ ...p, sound });
  }
  return out;
}

/** A VOICE TO BORROW (the Nov 12 2026 review, RUBRIC D2). The screams, grunts, coughs and sobs are recorded per
 *  character (`vocal-<who>-<kind>`), and only the first six have a set: Claudia and Renner — and anybody made in
 *  the creator since — were grabbed, bitten and killed without a sound. Until a character has a set of their own
 *  they borrow one: somebody with the same register of voice who has the sound, the same one every time, played a
 *  little off its own pitch (standInRate) so two people don't scream in one voice. Pure.
 *  `cast`: the page's characters (id + vox); `has`: is this sound in the library? */
export function vocalStandIn(who: string, kind: string, cast: readonly { id: string; vox?: string }[], has: (id: string) => boolean): string | null {
  const me = cast.find((c) => c.id === who);
  const own = (c: { id: string }) => c.id !== who && has(`vocal-${c.id}-${kind}`);
  const same = cast.filter((c) => own(c) && (!me?.vox || c.vox === me.vox));
  const pool = (same.length ? same : cast.filter(own)).map((c) => c.id).sort();
  if (!pool.length) return null;
  return pool[hashOf(who) % pool.length];
}
/** how far off its own pitch a borrowed voice plays: 5–8% up or down, the same for a character every time */
export function standInRate(who: string): number {
  const h = hashOf(who + "/rate");
  return 1 + (h % 2 ? 1 : -1) * (0.05 + ((h >>> 3) % 4) * 0.01);
}
function hashOf(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

/** Every sound id a cue can reach for, `{who}` filled with each name given. */
export function soundsUsed(who: string[]): Set<string> {
  const out = new Set<string>();
  for (const parts of Object.values(CUES))
    for (const p of parts) {
      if (p.sound.includes("{who}")) for (const w of who) out.add(p.sound.replace("{who}", w));
      // a recorder plays whichever of the nine logs it holds (docs/survivorz/audio-logs.mjs)
      else if (p.sound === "{log}") for (let i = 1; i <= 9; i++) out.add(`log-a0${i}`);
      else out.add(p.sound);
    }
  return out;
}
