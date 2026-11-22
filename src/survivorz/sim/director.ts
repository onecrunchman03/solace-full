// SOLACE SURVIVORZ — THE DIRECTOR (SURVIVORZ.md §9; Level 0's rules director, adapted).
//
// THE ONE RULE: IT CHANGES WHEN DANGER ARRIVES, NEVER HOW MUCH EXISTS. It never makes a zombie, never
// hurts anyone, never makes anything stronger. Its menu is only things the facility already has:
//   · wake    — an idle zombie near an awake survivor starts drifting toward their room (never onto them)
//   · noise   — a pipe bursts / something falls 10–25 m away; the dead go to it
//   · dip     — the lights stutter in their zone (atmosphere: the flicker the effects already draw)
//   · trickle — the next of the tunnels' ~2 a day comes sooner (only while a tunnel door stands open)
//   · quiet   — after a peak, the dead near the tense are held idle and the next event pushed back
// RHYTHM: build → peak → relax → build. NO DULL STRETCHES: a calm, awake group gets a nudge.
// DEATH PACING: about one a week and never two close — six hours of quiet after a death, nothing
// woken near anyone down or badly hurt — and it eases off as the group shrinks.
//
// Pure: the caller hands it a clock and a random; the world applies the actions.

export type DirectorPhase = "build" | "peak" | "relax";

export interface DirSurvivor {
  id: string;
  awake: boolean;
  /** inside a safe room (the director never sends anything at a safe room) */
  safe: boolean;
  hp: number;
  down: boolean;
  dead: boolean;
  chased: boolean;
  grabbed: boolean;
  fighting: boolean;
  dark: boolean;
  alone: boolean;
  /** hungry, thirsty or exhausted */
  needy: boolean;
  /** damage taken since the last step */
  hurt: number;
}

export interface DirInput {
  now: number;
  survivors: DirSurvivor[];
  /** permanent deaths so far, and when the last was */
  deaths: number;
  lastDeathAt: number;
  startedAt: number;
  /** a tunnel door stands open, so the trickle is running */
  trickle: boolean;
}

export type DirAction =
  | { kind: "wake"; near: string; reason: string }
  | { kind: "noise"; near: string; event: "pipe.burst" | "thing.fell"; reason: string }
  | { kind: "dip"; near: string; reason: string }
  | { kind: "trickle"; reason: string }
  | { kind: "quiet"; near: string; until: number; reason: string };

export const DIRECTOR = {
  TICK_MS: 1000,
  HURT_PER_HP: 0.9,
  CHASED_PER_S: 6,
  GRABBED_PER_S: 18,
  FIGHT_PER_S: 3,
  DOWN_PER_S: 20,
  DARK_PER_S: 0.4,
  ALONE_PER_S: 0.3,
  NEEDY_PER_S: 0.2,
  DECAY_PER_S: 1.0,
  PEAK_AT: 70,
  RELAX_BELOW: 40,
  RELAX_MS: 120_000,
  CALM_BELOW: 20,
  /** a calm group, awake and out, gets nudged after this long with nothing happening (×1/strength) */
  QUIET_BEFORE_EVENT_MS: 8 * 60_000,
  EVENT_GAP_MS: 6 * 60_000,
  /** after a death: grief */
  GRIEF_MS: 8 * 60_000,   // THE BUNKER: a four-hour show grieves minutes, not hours
  /** a survivor this hurt is left alone */
  HURT_HP: 30,
  // THE BUNKER: no death target (third round 33: a run goes how the AI performs) — the pace never holds back
  WEEK_MS: 3_600_000,
  TARGET_DEATHS_PER_WEEK: 99,
} as const;

export interface DirectorState {
  phase: DirectorPhase;
  tension: Record<string, number>;
  phaseSince: number;
  lastEventAt: number;
  lastActiveAt: number;
  quietUntil: number;
  /** what it did, newest last (for the admin) */
  log: { at: number; what: string }[];
  /** time spent in each phase (the harness profile) */
  time: Record<DirectorPhase, number>;
  lastStep: number;
  on: boolean;
}

export function newDirector(now: number): DirectorState {
  return { phase: "build", tension: {}, phaseSince: now, lastEventAt: now, lastActiveAt: now, quietUntil: 0, log: [], time: { build: 0, peak: 0, relax: 0 }, lastStep: now, on: true };
}

/** How hard it may push: full at six, ~70% at three, ~50% with one left; less again when deaths
 *  have run ahead of a death a week. */
export function strength(alive: number, deaths: number, elapsed: number): number {
  const size = alive >= 6 ? 1 : alive <= 1 ? 0.5 : 0.5 + (alive - 1) * 0.1;
  const due = (elapsed / DIRECTOR.WEEK_MS) * DIRECTOR.TARGET_DEATHS_PER_WEEK;
  const pace = deaths > due + 0.5 ? 0.5 : 1;
  return size * pace;
}

/** the admin's readout keeps the last LOG_KEPT things it did (every push goes through here — a group stuck
 *  at home used to grow it ~100 lines a day for the whole run) */
const LOG_KEPT = 50;
function logIt(st: DirectorState, at: number, what: string): void {
  st.log.push({ at, what });
  if (st.log.length > LOG_KEPT) st.log.splice(0, st.log.length - LOG_KEPT);
}

export function directorStep(st: DirectorState, inp: DirInput, rand: () => number): DirAction[] {
  const D = DIRECTOR;
  const dt = Math.max(0, inp.now - st.lastStep) / 1000;
  st.lastStep = inp.now;
  st.time[st.phase] += dt * 1000;
  const out: DirAction[] = [];
  let top = 0, busy = false;
  for (const s of inp.survivors) {
    if (s.dead) { delete st.tension[s.id]; continue; }
    let t = st.tension[s.id] ?? 0;
    t += s.hurt * D.HURT_PER_HP;
    if (s.chased) t += D.CHASED_PER_S * dt;
    if (s.grabbed) t += D.GRABBED_PER_S * dt;
    if (s.fighting) t += D.FIGHT_PER_S * dt;
    if (s.down) t += D.DOWN_PER_S * dt;
    if (s.dark && !s.safe) t += D.DARK_PER_S * dt;
    if (s.alone && !s.safe) t += D.ALONE_PER_S * dt;
    if (s.needy) t += D.NEEDY_PER_S * dt;
    if (!s.chased && !s.grabbed && !s.fighting && !s.down) t -= D.DECAY_PER_S * dt;
    t = Math.max(0, Math.min(100, t));
    st.tension[s.id] = Math.round(t * 10) / 10;
    top = Math.max(top, t);
    if (s.chased || s.grabbed || s.fighting || s.down) busy = true;
  }
  if (busy) st.lastActiveAt = inp.now;
  if (!st.on) return out;

  // the phases, on the most tense survivor
  const to = (p: DirectorPhase) => { if (st.phase !== p) { st.phase = p; st.phaseSince = inp.now; } };
  if (top >= D.PEAK_AT) to("peak");
  else if (st.phase === "peak") {
    to("relax");
    // hold the dead quiet round whoever peaked
    const near = Object.entries(st.tension).sort((a, b) => b[1] - a[1])[0]?.[0];
    st.quietUntil = inp.now + D.RELAX_MS;
    if (near) out.push({ kind: "quiet", near, until: st.quietUntil, reason: "after a peak" });
    logIt(st, inp.now, "relax: holding the dead quiet");
  } else if (st.phase === "relax" && top < D.RELAX_BELOW && inp.now - st.phaseSince >= D.RELAX_MS) to("build");

  if (st.phase !== "build" || busy) return out;
  if (inp.now < st.quietUntil) return out;
  if (inp.lastDeathAt && inp.now - inp.lastDeathAt < D.GRIEF_MS) return out;
  const alive = inp.survivors.filter((s) => !s.dead);
  if (!alive.length) return out;
  const k = strength(alive.length, inp.deaths, inp.now - inp.startedAt);
  if (top >= D.CALM_BELOW) return out;
  const quietFor = inp.now - Math.max(st.lastActiveAt, st.lastEventAt);
  if (quietFor < D.QUIET_BEFORE_EVENT_MS / k || inp.now - st.lastEventAt < D.EVENT_GAP_MS / k) return out;
  // nothing near anyone down or badly hurt; only somebody awake and out of the safe rooms
  if (alive.some((s) => s.down)) return out;
  const out_ = alive.filter((s) => s.awake && !s.safe && s.hp >= D.HURT_HP);
  if (!out_.length) {
    // the whole group is home or asleep: the trickle is the only thing that can come sooner
    if (inp.trickle && rand() < 0.25) { st.lastEventAt = inp.now; out.push({ kind: "trickle", reason: "everyone's home; the tunnels stir" }); logIt(st, inp.now, "trickle"); }
    return out;
  }
  const who = out_[Math.floor(rand() * out_.length)];
  const roll = rand();
  let a: DirAction;
  if (roll < 0.4) a = { kind: "wake", near: who.id, reason: "a calm stretch" };
  else if (roll < 0.75) a = { kind: "noise", near: who.id, event: rand() < 0.5 ? "pipe.burst" : "thing.fell", reason: "a calm stretch" };
  else if (roll < 0.92 || !inp.trickle) a = { kind: "dip", near: who.id, reason: "a calm stretch" };
  else a = { kind: "trickle", reason: "a calm stretch" };
  st.lastEventAt = inp.now;
  logIt(st, inp.now, `${a.kind}${"near" in a ? " near " + a.near : ""}`);
  out.push(a);
  return out;
}
