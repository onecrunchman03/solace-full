// THE RULES DIRECTOR (Josh, Oct 2026: "let's do the rules director") — an
// unseen game master for a level, after Left 4 Dead's AI Director. It reads
// how the players are doing and paces the scares: quiet when people are
// frazzled, tension when they're comfortable.
//
// THE ONE RULE: IT RE-TIMES DANGER, IT DOES NOT ADD IT. The creatures keep
// their own rules (Backrooms law 2) and the level keeps its own lethality
// (law 11 — difficulty is Josh's call). The director only spends from a short
// menu of levers the level already has:
//   · flicker  — a short brownout with the lights stuttering but NOT black
//                (the Stalker hunts only in a black one), atmosphere only
//   · mimic    — the Stalker throws a voice sooner than it would have
//   · hasten   — the next scheduled brownout comes sooner (never sooner than
//                a floor away)
//   · lure     — a sound far from a too-comfortable player draws a
//                patrolling Entity toward their part of the map (never onto
//                them, never in sight; rare)
//   · quiet    — after a peak: the Stalker's next voice and hunt and the
//                next brownout are pushed back, so a scare has room to land
//
// This file is the DECISION, pure and clocked by its caller, so the harness
// can drive it minute by minute. service.ts gathers the inputs and applies
// the actions.

export type DirectorPhase = "build" | "peak" | "relax";

export interface DirectorPlayer {
  id: number;
  hp: number;
  /** An Entity is chasing them right now. */
  chased: boolean;
  /** The Stalker is hunting them right now. */
  hunted: boolean;
  /** No other living player within ALONE_CELLS. */
  alone: boolean;
}

export interface DirectorInput {
  now: number;
  players: DirectorPlayer[];
  /** A black brownout is on (the dark the Stalker hunts in). */
  dark: boolean;
  /** Any brownout is on, black or not. */
  brownout: boolean;
  /** When the next scheduled brownout fires. */
  nextBrownoutAt: number;
  /** The Stalker is placed and shadowing (it can throw a voice). */
  stalkerShadowing: boolean;
}

export type DirectorAction =
  | { kind: "flicker"; ms: number; reason: string }
  | { kind: "mimic"; reason: string }
  | { kind: "hasten"; to: number; reason: string }
  | { kind: "lure"; targetId: number; reason: string }
  | { kind: "quiet"; until: number; reason: string };

/** The dials. Everything a retune would argue about, in one place. */
export const DIRECTOR = {
  TICK_MS: 1000,
  /** Tension, 0..100, per player. */
  HURT_PER_HP: 0.8,
  CHASED_PER_S: 8,
  HUNTED_PER_S: 10,
  DARK_PER_S: 1.5,
  ALONE_PER_S: 0.4,
  DECAY_PER_S: 1.2,
  /** Phases, on the most tense player. */
  PEAK_AT: 70,
  RELAX_BELOW: 40,
  RELAX_MS: 90_000,
  /** BUILD only acts on a calm level that has been quiet a while. */
  CALM_BELOW: 20,
  QUIET_BEFORE_EVENT_MS: 90_000,
  EVENT_GAP_MS: 60_000,
  /** The lure is the rare one. */
  LURE_QUIET_MS: 240_000,
  LURE_CALM_BELOW: 10,
  LURE_GAP_MS: 300_000,
  /** Flicker length. */
  FLICKER_MIN_MS: 6_000,
  FLICKER_SPAN_MS: 4_000,
  /** How much sooner a hastened brownout may come, and its floor. */
  HASTEN_BY_MS: 120_000,
  HASTEN_FLOOR_MS: 30_000,
  /** How long a "quiet" pushes the Stalker and the next brownout back. */
  QUIET_MS: 60_000,
} as const;

export interface DirectorState {
  phase: DirectorPhase;
  tension: Map<number, number>;
  hpSeen: Map<number, number>;
  /** The last moment something scary happened (a chase, a hunt, a wound, the dark). */
  lastScareAt: number;
  lastEventAt: number;
  lastLureAt: number;
  relaxUntil: number;
  /** The most recent decisions, newest first — for the admin. */
  log: { at: number; text: string }[];
}

export function newDirector(now: number): DirectorState {
  return {
    phase: "build",
    tension: new Map(),
    hpSeen: new Map(),
    lastScareAt: now,
    lastEventAt: now,
    lastLureAt: 0,
    relaxUntil: 0,
    log: [],
  };
}

/** One director tick: update tension and phase, maybe choose an action.
 *  `rand` is injectable so the harness is deterministic. */
export function directorStep(st: DirectorState, inp: DirectorInput, rand: () => number = Math.random): DirectorAction[] {
  const D = DIRECTOR;
  const dt = D.TICK_MS / 1000;
  const now = inp.now;
  const out: DirectorAction[] = [];
  const present = new Set(inp.players.map((p) => p.id));
  for (const id of [...st.tension.keys()]) if (!present.has(id)) { st.tension.delete(id); st.hpSeen.delete(id); }

  let scared = inp.dark;
  for (const p of inp.players) {
    let t = st.tension.get(p.id) ?? 0;
    const before = st.hpSeen.get(p.id) ?? p.hp;
    const hurt = Math.max(0, before - p.hp);
    st.hpSeen.set(p.id, p.hp);
    let rose = false;
    if (hurt > 0) { t += hurt * D.HURT_PER_HP; rose = true; }
    if (p.chased) { t += D.CHASED_PER_S * dt; rose = true; }
    if (p.hunted) { t += D.HUNTED_PER_S * dt; rose = true; }
    if (inp.dark) { t += D.DARK_PER_S * dt; rose = true; }
    if (p.alone) t += D.ALONE_PER_S * dt;
    if (!rose) t -= D.DECAY_PER_S * dt;
    if (hurt > 0 || p.chased || p.hunted) scared = true;
    st.tension.set(p.id, Math.max(0, Math.min(100, t)));
  }
  if (scared) st.lastScareAt = now;
  const top = Math.max(0, ...st.tension.values());
  const busy = inp.players.some((p) => p.chased || p.hunted);

  // PHASES
  if (st.phase !== "peak" && top >= D.PEAK_AT) {
    st.phase = "peak";
    note(st, now, `peak (tension ${Math.round(top)})`);
  } else if (st.phase === "peak" && top < D.RELAX_BELOW) {
    st.phase = "relax";
    st.relaxUntil = now + D.RELAX_MS;
    out.push({ kind: "quiet", until: now + D.QUIET_MS, reason: `after a peak — letting it land` });
  } else if (st.phase === "relax" && now >= st.relaxUntil) {
    st.phase = "build";
    note(st, now, "build");
  }

  // BUILD: only a calm, quiet level gets anything, and never mid-chase.
  if (st.phase === "build" && !busy && !inp.brownout && inp.players.length) {
    const quietFor = now - Math.max(st.lastScareAt, st.lastEventAt);
    if (top < D.CALM_BELOW && quietFor >= D.QUIET_BEFORE_EVENT_MS && now - st.lastEventAt >= D.EVENT_GAP_MS) {
      const calmest = [...inp.players].sort((a, b) => (st.tension.get(a.id) ?? 0) - (st.tension.get(b.id) ?? 0))[0];
      const lureOk = top < D.LURE_CALM_BELOW && quietFor >= D.LURE_QUIET_MS && now - st.lastLureAt >= D.LURE_GAP_MS;
      const options: { a: DirectorAction; w: number }[] = [
        { a: { kind: "flicker", ms: Math.round(D.FLICKER_MIN_MS + rand() * D.FLICKER_SPAN_MS), reason: `quiet ${Math.round(quietFor / 1000)}s` }, w: 5 },
      ];
      if (inp.stalkerShadowing) options.push({ a: { kind: "mimic", reason: `quiet ${Math.round(quietFor / 1000)}s` }, w: 3 });
      const hastened = Math.max(now + D.HASTEN_FLOOR_MS, inp.nextBrownoutAt - D.HASTEN_BY_MS);
      if (inp.nextBrownoutAt - now > D.HASTEN_FLOOR_MS * 2 && hastened < inp.nextBrownoutAt)
        options.push({ a: { kind: "hasten", to: hastened, reason: `quiet ${Math.round(quietFor / 1000)}s` }, w: 2 });
      if (lureOk && calmest) options.push({ a: { kind: "lure", targetId: calmest.id, reason: `calm ${Math.round(quietFor / 1000)}s` }, w: 4 });
      const total = options.reduce((s, o) => s + o.w, 0);
      let r = rand() * total;
      const pick = options.find((o) => (r -= o.w) < 0) ?? options[0];
      out.push(pick.a);
      st.lastEventAt = now;
      if (pick.a.kind === "lure") st.lastLureAt = now;
    }
  }
  for (const a of out) note(st, now, describe(a));
  return out;
}

function describe(a: DirectorAction): string {
  switch (a.kind) {
    case "flicker": return `flicker ${Math.round(a.ms / 1000)}s — ${a.reason}`;
    case "mimic": return `the Stalker speaks — ${a.reason}`;
    case "hasten": return `next brownout brought forward — ${a.reason}`;
    case "lure": return `lure toward player ${a.targetId} — ${a.reason}`;
    case "quiet": return `quiet — ${a.reason}`;
  }
}

function note(st: DirectorState, at: number, text: string): void {
  st.log.unshift({ at, text });
  if (st.log.length > 30) st.log.length = 30;
}
