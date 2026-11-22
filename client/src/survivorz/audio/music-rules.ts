// SOLACE SURVIVORZ — THE SCORE'S RULES (ASSETS.md §2h, Josh: "Music will be controlled by the
// director … These need to be accurately and intelligently controlled for premium immersion").
//
// Pure and clock-injected: the music player (engine.ts) calls `step` a few times a second with what
// the CAMERA is showing, and plays what `mix` says. A plain Node harness (test-audio.mjs) holds every
// rule below. Imports nothing.
//
// THE RULES, in one place:
//   · the score follows the SHOT, not the whole facility — the input is the threat on screen;
//   · it RISES FAST (into a higher level the moment the threat crosses its line) and FALLS SLOW
//     (one level down only after the threat has stayed under a lower line for that level's hold);
//   · it never flip-flops: separate lines up and down, and a minimum time on every level;
//   · changes land on musical boundaries (the next phrase of the loop), except into combat and on a
//     death, which can't wait;
//   · a death drops everything to SILENCE at once and the sting carries the moment, then grief;
//   · the calm thins after midnight in show time;
//   · each zone has its own quiet colour bed under everything;
//   · Josh can pin a level, mute the score, or fire a sting (the control panel).

export const LEVELS = ["calm", "uneasy", "suspense", "combat"] as const;
export type Level = (typeof LEVELS)[number] | "aftermath" | "silence";

/** The threat (0-1) that RAISES the score to each level, and the line it must stay under to come
 *  back DOWN from it. Up and down are apart on purpose: a zombie stepping in and out of view at
 *  0.5 doesn't toggle anything. */
export const UP: Record<"uneasy" | "suspense" | "combat", number> = { uneasy: 0.22, suspense: 0.5, combat: 0.8 };
export const DOWN: Record<"uneasy" | "suspense" | "combat", number> = { uneasy: 0.12, suspense: 0.36, combat: 0.6 };

/** How long the threat must stay under a level's DOWN line before it falls (ms). Combat lets go only
 *  after 25 s with no threat, through aftermath. */
export const FALL_HOLD: Record<"uneasy" | "suspense" | "combat", number> = { uneasy: 20_000, suspense: 15_000, combat: 25_000 };
/** The least time on any level before it may FALL (rising is never held back). */
export const MIN_HOLD = 8_000;
/** After combat or a death, the grief layer holds this long unless the threat rises again. */
export const AFTERMATH_MS = 40_000;
export const DEATH_AFTERMATH_MS = 60_000;
/** A death's silence before grief comes in (the sting plays inside it). */
export const DEATH_SILENCE_MS = 6_000;
/** The loop's phrase length (ms): an ordinary change waits for the next one. */
export const PHRASE_MS = 4_000;

/** The layer files (manifest ids) each level plays. */
export const LAYER: Record<Exclude<Level, "silence">, string> = {
  calm: "score-calm", uneasy: "score-uneasy", suspense: "score-suspense", combat: "score-combat", aftermath: "score-aftermath",
};

/** The zone's colour bed, by facility-map zone (and the tunnels, which are rooms of "deep"). */
export function colourOf(zone: string | null, roomId?: string | null): string | null {
  if (roomId === "far-tunnels" || roomId === "tunnel-junction" || roomId === "outside") return "score-colour-tunnels";
  switch (zone) {
    case "labs": case "medical": return "score-colour-labs";
    case "power": return "score-colour-power";
    case "deep": case "containment": return "score-colour-deeplab";
    default: return null;
  }
}

/** The stings, by the moment that fires them (the director and the game call `sting(kind)`). */
export const STING: Record<string, string> = {
  contact: "sting-contact", bite: "sting-bite", down: "sting-down", death: "sting-death",
  "door-break": "sting-door-break", power: "sting-power", zone: "sting-zone",
  truth: "sting-truth", cure: "sting-cure", escape: "sting-escape", turn: "sting-turn",
};

export interface MusicInput {
  now: number;
  /** 0-1, the danger in the shot on camera right now (the director computes it). */
  threat: number;
  /** a fight is on in the shot (always at least combat). */
  fighting: boolean;
  zone: string | null;
  room?: string | null;
  /** 00:00-06:00 show time. */
  night: boolean;
}

export interface MusicState {
  level: Level;
  /** when this level began */
  since: number;
  /** when the threat first went under the current level's DOWN line (null = it isn't) */
  belowSince: number | null;
  /** aftermath / silence end at this time */
  until: number;
  /** a level Josh pinned from the control panel */
  pin: Level | null;
  muted: boolean;
  /** when the score started, for the phrase grid */
  origin: number;
}

export function newMusic(now: number): MusicState {
  return { level: "calm", since: now, belowSince: null, until: 0, pin: null, muted: false, origin: now };
}

const rank = (l: Level): number => (l === "combat" ? 3 : l === "suspense" ? 2 : l === "uneasy" ? 1 : 0);

/** The level the threat alone asks for (rising). */
function wanted(i: MusicInput): Level {
  if (i.fighting || i.threat >= UP.combat) return "combat";
  if (i.threat >= UP.suspense) return "suspense";
  if (i.threat >= UP.uneasy) return "uneasy";
  return "calm";
}

/** What changed this step: the new level, whether the change can wait for a phrase, and the fade. */
export interface Change { level: Level; urgent: boolean; fadeS: number }

/** A death on screen: silence now, then grief. */
export function death(s: MusicState, now: number): Change {
  s.level = "silence"; s.since = now; s.until = now + DEATH_SILENCE_MS; s.belowSince = null;
  return { level: "silence", urgent: true, fadeS: 0.4 };
}

/** One step of the director. Returns a Change when the level moves, otherwise null. */
export function step(s: MusicState, i: MusicInput): Change | null {
  const now = i.now;
  if (s.pin) {
    if (s.level === s.pin) return null;
    s.level = s.pin; s.since = now; s.belowSince = null;
    return { level: s.pin, urgent: true, fadeS: 2 };
  }
  // a death's silence runs out into grief
  if (s.level === "silence") {
    if (now < s.until) return null;
    s.level = "aftermath"; s.since = now; s.until = now + DEATH_AFTERMATH_MS;
    return { level: "aftermath", urgent: true, fadeS: 6 };
  }
  const want = wanted(i);
  // RISE FAST: any level above the current one, at once (grief yields only to real danger)
  const cur = s.level === "aftermath" ? -1 : rank(s.level);
  const riseFrom = s.level === "aftermath" ? rank("uneasy") : cur;
  if (rank(want) > riseFrom) {
    s.level = want; s.since = now; s.belowSince = null;
    return { level: want, urgent: want === "combat", fadeS: want === "combat" ? 1.5 : 3 };
  }
  // grief holds its time, then gives way to calm
  if (s.level === "aftermath") {
    if (now < s.until) return null;
    s.level = "calm"; s.since = now; s.belowSince = null;
    return { level: "calm", urgent: false, fadeS: 8 };
  }
  if (s.level === "calm") return null;
  // FALL SLOW: under this level's DOWN line, for its hold, and past the minimum time on the level
  const lvl = s.level as "uneasy" | "suspense" | "combat";
  const under = !i.fighting && i.threat < DOWN[lvl];
  if (!under) { s.belowSince = null; return null; }
  if (s.belowSince === null) s.belowSince = now;
  if (now - s.belowSince < FALL_HOLD[lvl] || now - s.since < MIN_HOLD) return null;
  const next: Level = lvl === "combat" ? "aftermath" : lvl === "suspense" ? "uneasy" : "calm";
  s.level = next; s.since = now; s.belowSince = null;
  if (next === "aftermath") s.until = now + AFTERMATH_MS;
  return { level: next, urgent: false, fadeS: next === "aftermath" ? 6 : 5 };
}

/** When an ordinary change may land: the next phrase boundary of the loop. */
export function nextBoundary(s: MusicState, now: number): number {
  const into = (now - s.origin) % PHRASE_MS;
  return into === 0 ? now : now + (PHRASE_MS - into);
}

/** The gain each layer should sit at for a level (the engine fades to these). The colour bed sits
 *  quietly under every level but silence; the calm thins at night. */
export function mix(level: Level, i: { zone: string | null; room?: string | null; night: boolean }, muted = false): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.values(LAYER)) out[id] = 0;
  for (const c of ["score-colour-labs", "score-colour-power", "score-colour-tunnels", "score-colour-deeplab"]) out[c] = 0;
  if (muted || level === "silence") return out;
  out[LAYER[level]] = level === "calm" && i.night ? 0.55 : level === "combat" ? 0.95 : 0.85;
  // suspense keeps a thread of the uneasy layer under it, so the step up doesn't read as a cut
  if (level === "suspense") out[LAYER.uneasy] = 0.25;
  const colour = colourOf(i.zone, i.room);
  if (colour) out[colour] = level === "combat" ? 0.2 : 0.4;
  return out;
}
