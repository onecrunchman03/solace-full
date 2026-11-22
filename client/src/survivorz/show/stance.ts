// SOLACE SURVIVORZ — THE SHOW: WHICH CLIP, as pure data and pure functions (no three, no imports).
//
// actors.ts plays what this file picks; scripts/survivorz/anim-show-check.mjs loads every body file in
// plain Node and walks every pose × hands × mood × speed the sim can send through these SAME functions,
// so a clip missing on one body, a clip that fails the laws there, or a loop played outside its speed
// clamp is caught before a watcher sees a T-pose or a moonwalk. Keep it import-free.
//
// THE TWO TIERS (Josh, Oct 28 2026: "if they are just hanging out and calm they dont need to be in a
// fighting stance"). A survivor is READY (alert: weapon up, the packs' combat loops) or CALM (the weapon
// put away, plain relaxed loops). The wire says which (`alert`, wire.ts); a pose that IS a fight (aim,
// shoot, reload, fight, grabbed, panic) is always ready, and one that is never a fight (sitting, eating,
// talking, searching…) is always calm. With no `alert` on the wire the screen infers it from the pose
// and the reason (`inferAlert`).
//
// Every clip named here passes the animation laws on all seven survivor bodies (anim/<body>/clip.json:
// the 3 cm line, 6 cm on Rollo) except the few in LAW_FAILS, which are never picked on the body they
// fail on.

export type Armed = "none" | "torch" | "pistol" | "rifle" | "shotgun" | "melee" | "axe" | "walkie" | "carry";
export type MeleeKey = "crowbar" | "hammer" | "pipe" | "knife";
export const MELEE_KEYS: MeleeKey[] = ["crowbar", "hammer", "pipe", "knife"];

export const GUNS = new Set<string>(["pistol", "hk416", "shotgun"]);
const MELEE: Record<string, MeleeKey> = {
  crowbar: "crowbar", "claw-hammer": "hammer", "lead-pipe": "pipe", "chef-knife": "knife", "fish-knife": "knife", machete: "knife",
};

export function armedOf(held: string | null | undefined): { armed: Armed; k?: MeleeKey } {
  if (!held) return { armed: "none" };
  if (held === "pistol") return { armed: "pistol" };
  if (held === "hk416") return { armed: "rifle" };
  if (held === "shotgun") return { armed: "shotgun" };
  if (MELEE[held]) return { armed: "melee", k: MELEE[held] };
  if (/^fire-axe/.test(held)) return { armed: "axe" };
  if (/^flashlight/.test(held)) return { armed: "torch" };
  if (held === "walkie") return { armed: "walkie" };
  return { armed: "carry" };
}

/** HOW THICK the thing in the hand is where the fingers closed round it (anim-recipes.js HELD and TORCH: a
 *  handle's radius, half a box's depth) — a held thing sits that far in front of the palm's skin */
export function holdRadius(held: string | null | undefined): number {
  const a = armedOf(held);
  if (a.armed === "melee") return a.k === "pipe" ? 0.014 : a.k === "hammer" ? 0.015 : 0.011;
  if (a.armed === "axe" || a.armed === "torch") return 0.017;
  if (a.armed === "walkie") return 0.021;
  return 0.015;
}

/** is the thing in the hand shown on this clip (a clip whose hand was built to hold it) */
export function heldShown(armed: Armed, clip: string): boolean {
  switch (armed) {
    case "none": return false;
    case "pistol": case "rifle": case "shotgun": return /^g[prs]-/.test(clip) || clip === "bd-shotgun-load" || clip === "bd-shotgun-pump";
    case "torch": return /^bd-flashlight/.test(clip);
    // (the knife that ends a grab was baked with the knife in that hand: anim-recipes.js "knife-head")
    case "melee": return /^hd-(crowbar|hammer|pipe|knife)-|^zv-knife-head-/.test(clip);
    case "axe": return /^hd-axe-|^bd-axe/.test(clip);
    case "walkie": return /^hd-walkie/.test(clip);
    case "carry": return /^hd-/.test(clip);
  }
}

/** clips past the law's line on ONE body (measured, anim/<body>/clip.json — Oct 28 2026); never picked there */
export const LAW_FAILS: Record<string, string[]> = {
  "ual2-idle-foldarms-loop": ["claudia"],
  "gp-1h-ual1-pistol-idle-loop": ["manuel"],
  "gp-1h-ual1-pistol-shoot": ["manuel", "rollo"],
  "fza-front-struggle-end": ["carla"],
  "mx-pro-rifle-pack--death-from-right": ["claudia"],
  "gr-mx-reload-2": ["rollo"],
};
export const lawful = (body: string, clip: string): boolean => !LAW_FAILS[clip]?.includes(body);
/** CLIPS A BODY CAN DO WITHOUT (Nov 9 2026): each has a stand-in the show picks when the body lacks it (folded
 *  arms → the plain idle; one laid-up cough → the other). A creator bake that finds one of these past the law's
 *  line takes it OUT of that body (anim-spare.mjs) instead of failing the whole bake — a bulky chest can't fold
 *  its arms, and that's no reason to lose the character. Anything not on this list still fails the bake. */
export const SPARE_CLIPS = ["ual2-idle-foldarms-loop", "mx-laying-mild-cough", "mx-laying-severe-cough"];

const GP = "gp-mx-pistol-handgun-locomotion-pack--pistol-";
const GR = "gr-mx-pro-rifle-pack--", GS = "gs-mx-pro-rifle-pack--";
const INJ = "mx-male-injured-pack--injured-";
export const CRAWL = "mx-injured-crawling";
/** THE EMPTY-HANDED JOG (realism rounds 12–13, Nov 2026): Mixamo's Jogging, a real jog at ~1.7 m/s natural, for a
 *  winded, hurt or careful jog up to JOG_TOP × its own speed (~2.4 m/s); past that Mixamo's Slow Run (~2.9 m/s
 *  natural, ~2.5 on a short body) takes the fresh 3.2 m/s jog at near its true pace — the jog-to-run change a
 *  person makes, not a jog's legs spun at 1.7×. UAL's "jog" is really a run (5–6 m/s natural; before these it
 *  played at 45% and floated) and stays last, for a body baked before either. */
const JOG = "mx-jogging", SLOW = "mx-slow-run", RUN = "ual1-jog-fwd-loop";
const JOG_TOP = 1.4;
/** THE TORCH'S JOGS (realism round 14): the same two, built with the torch out front (anim-recipes.js), the torch run
 *  (UAL's) after them — it was the only one, and at a jog it floated at half speed or moonwalked on a short body */
const TJOG = "bd-flashlight-jog", TSLOW = "bd-flashlight-slow-run";
const TORCH_JOGS = [TJOG, TSLOW, "bd-flashlight-run"];
/** off the floor: lying on the back (the fall's, the down loop's and sleep's own pose) to standing */
export const GET_UP = "ual2-laytoidle";
/** the fever's idle (infection.ts stage 2+) */
export const SHIVER = "bd-shiver";

/** `also`: more loops for the same pose, tried after `any` when it can't match the ground (a slow jog and a
 *  fast one: each fits its own speeds, fits() picks) */
type Row = Partial<Record<Armed | "injured", string>> & { any: string; also?: string[] };

/** READY: weapon up. `{k}` is the melee key. Locomotion is speed-matched. */
export const READY_LOOPS: Record<string, Row> = {
  // (ready with nothing in the hands: the guard of the sword idle, hands empty — fists up, knees bent)
  idle:          { any: "ual1-sword-idle", injured: `${INJ}idle`, pistol: "gp-ual1-pistol-idle-loop", rifle: `${GR}idle`, shotgun: `${GS}idle`, melee: "hd-{k}-ual1-sword-idle", axe: "bd-axe-idle" },
  walk:          { any: "ual1-walk-loop", injured: `${INJ}walk`, torch: "bd-flashlight-walk", pistol: `${GP}walk`, rifle: `${GR}walk-forward`, shotgun: `${GS}walk-forward` },
  jog:           { any: JOG, also: [SLOW, RUN], injured: `${INJ}run`, torch: "bd-flashlight-run", pistol: `${GP}run`, rifle: `${GR}run-forward`, shotgun: `${GS}run-forward` },
  sprint:        { any: "ual1-sprint-loop", injured: `${INJ}run`, torch: "bd-flashlight-run", pistol: `${GP}run`, rifle: `${GR}sprint-forward`, shotgun: `${GS}sprint-forward` },
  crouch:        { any: "ual1-crouch-idle-loop", pistol: `${GP}kneeling-idle`, rifle: `${GR}idle-crouching`, shotgun: `${GS}idle-crouching` },
  "crouch-walk": { any: "ual1-crouch-fwd-loop", rifle: `${GR}walk-crouching-forward`, shotgun: `${GS}walk-crouching-forward` },
  fight:         { any: "ual1-sword-idle", pistol: "gp-ual1-pistol-aim-neutral", rifle: "gr-mx-rifle-aiming-idle", shotgun: "gs-mx-rifle-aiming-idle", melee: "hd-{k}-ual1-sword-idle", axe: "bd-axe-idle" },
  aim:           { any: "ual1-sword-idle", pistol: "gp-ual1-pistol-aim-neutral", rifle: "gr-mx-rifle-aiming-idle", shotgun: "gs-mx-rifle-aiming-idle" },
  shoot:         { any: "ual1-sword-idle", pistol: "gp-ual1-pistol-aim-neutral", rifle: "gr-mx-rifle-aiming-idle", shotgun: "gs-mx-rifle-aiming-idle" },
  reload:        { any: "ual1-idle-loop", pistol: "gp-ual1-pistol-reload", rifle: "gr-mx-reloading", shotgun: "bd-shotgun-load" },
  // held by a zombie: braced, both hands shoving at it (the finisher pack's survivor half, unpaired)
  grabbed:       { any: "fza-front-struggle-start-idle" },
  panic:         { any: "mx-terrified" },
};

/** CALM: the weapon away, a relaxed body. Only a TOOL stays in the hand (a torch to see by). */
export const CALM_LOOPS: Record<string, Row> = {
  idle:          { any: "ual1-idle-loop", injured: `${INJ}idle` },
  walk:          { any: "ual1-walk-loop", injured: `${INJ}walk`, torch: "bd-flashlight-walk" },
  jog:           { any: JOG, also: [SLOW, RUN], injured: `${INJ}run`, torch: "bd-flashlight-run" },
  sprint:        { any: "ual1-sprint-loop", injured: `${INJ}run`, torch: "bd-flashlight-run" },
  crouch:        { any: "ual1-crouch-idle-loop" },
  "crouch-walk": { any: "ual1-crouch-fwd-loop" },
  search:        { any: "mx-rummaging" },
  interact:      { any: "ual1-interact" },
  hit:           { any: "ual1-idle-loop" },   // (the flinch itself is the one-shot)
  down:          { any: "mx-laying-breathless" },
  // PATCHING A FRIEND UP (realism round 7): a downed survivor is awake and bleeding, propped on their elbows (the
  // fall's held pose) — CPR's head went into their face. The kneeling first aid: hands 0.38 m ahead at knee
  // height, the head well above the body.
  revive:        { any: "ual1-fixing-kneeling" },
  sleep:         { any: "mx-laying-sleeping" },
  sit:           { any: "ual1-sitting-idle-loop" },
  eat:           { any: "bd-eat" },
  drink:         { any: "bd-drink" },
  bandage:       { any: "bd-bandage" },
  talk:          { any: "ual1-idle-talking-loop", walkie: "hd-walkie-ual2-idle-talkingphone-loop" },
  dead:          { any: "mx-laying-breathless" },   // (held at the death one-shot's last frame; this is only the fallback)
};

/** a calm body shifts its weight now and then: folded arms some of the time (not while hurt or holding a tool) */
const CALM_IDLES = ["ual1-idle-loop", "ual1-idle-loop", "ual2-idle-foldarms-loop"];
/** STANDING STILL ISN'T STANDING STOCK-STILL (realism round 5, Nov 2026 — REALISM.md "stiff idles"): a
 *  survivor waiting calm with empty hands now and then glances over a shoulder, or coughs — a one-shot over
 *  the idle loop every FIDGET_MS, seeded per body so a room never does it in step. Every survivor body
 *  carries these (game/<body>.glb). Only with nothing showing in the hand (a weapon put away in the calm
 *  idle stays put away; one in the hand would vanish for a clip that doesn't hold it — heldShown). */
export const FIDGETS = ["bd-look-back-l", "bd-look-back-r", "bd-look-back-l", "bd-look-back-r", "bd-cough"];
export const FIDGET_MS: [number, number] = [9_000, 22_000];
/** A LOOP THAT CARRIES ITS OWN WAY IN AND OUT (realism round 8, measured off the hips): ual1-fixing-kneeling kneels
 *  down over its first 0.7 s and stands back up from 3.9 s — looped whole, anyone patching up a friend stood up and
 *  knelt again every 5.2 s. It loops `hold` only; `in` is played once when the loop starts and `out` when it ends
 *  (seconds of the clip). */
export const LOOP_PARTS: Record<string, { in: [number, number]; hold: [number, number]; out: [number, number] }> = {
  "ual1-fixing-kneeling": { in: [0, 0.7], hold: [0.7, 3.9], out: [3.9, 4.6] },
};
export const FIDGET_FIRST_MS: [number, number] = [4_000, 9_000];
/** the loops a fidget may play over (the calm idles) */
export const FIDGET_OVER = new Set(CALM_IDLES);
/** the n-th fidget of a body: which clip, and the wait before the next (ms) */
export function fidget(seed: number, n: number): { clip: string; gap: number } {
  const h = hash2(seed, 7_919 + n);
  // the first comes soon after they settle (a calm spell between jobs is often under ten seconds)
  const [lo, hi] = n === 0 ? FIDGET_FIRST_MS : FIDGET_MS;
  return { clip: FIDGETS[h % FIDGETS.length], gap: lo + (Math.floor(h / FIDGETS.length) % 1000) / 1000 * (hi - lo) };
}

/** poses that move along the ground (speed-matched) */
export const MOVING = new Set<string>(["walk", "jog", "sprint", "crouch-walk"]);
/** the body is a fight right now, whatever the wire's mood */
const ALWAYS_READY = new Set<string>(["fight", "aim", "shoot", "reload", "grabbed", "panic"]);
/** never a fighting stance here */
const ALWAYS_CALM = new Set<string>(["sit", "sleep", "talk", "eat", "drink", "bandage", "search", "interact", "revive", "down", "dead", "hit"]);
/** never turned into a walk by the body's speed (the floor, a seat, a struggle) */
const STAY_PUT = new Set<string>(["down", "dead", "sleep", "sit", "revive", "grabbed"]);
/** lying on the floor: no standing one-shot is ever laid over these (it would stand the body up) */
export const LYING = new Set<string>(["down", "dead", "sleep"]);

/** THE SPEED BANDS (m/s, the smoothed real speed). The wire's gait picks the loop first; the loop's
 *  own ground speed (measured per body: actors.ts measureSpeed, anim-show-check.mjs) then has the last
 *  word — a loop that would have to play outside RATE_CLAMP to match the ground hands over to the next
 *  gait's, or to the plain one, so the feet never skate or moonwalk. Measured natural speeds on the seven
 *  bodies (Oct 28 2026): walk 0.87–1.01 · jog (UAL's, really a run) 4.9–5.4 · sprint ~7 · the injured
 *  walk 0.88–1.02, run 1.5–1.8 · crouch 0.62–0.71 · crawl 0.52–0.59 · the pistol walk 2.1–2.4, run
 *  4.0–4.5 · the rifle walk 1.5–1.8, run 4.0–4.5, sprint 5.8–6.6. */
export const BAND = { still: 0.08, move: 0.3, jog: 2.2, sprint: 4.0 } as const;
export const RATE_CLAMP: [number, number] = [0.4, 1.7];
/** a loop's own speed fits the body's (a loop in place — no ground speed — never does) */
export function fits(nat: number, v: number): boolean {
  if (!Number.isFinite(nat) || nat <= 0.15) return false;
  const k = v / nat;
  return k >= RATE_CLAMP[0] && k <= RATE_CLAMP[1];
}

/** with no `alert` on the wire: weapon up only in a fight or running from one */
export function inferAlert(pose: string, why: string | undefined): boolean {
  if (ALWAYS_READY.has(pose)) return true;
  return /fight|flee|threat|hunt|attack|zombie|danger|defend|panic/.test(why ?? "");
}

export interface SurvivorIn {
  body: string; seed: number; pose: string; held?: string | null; alert?: boolean; why?: string;
  hp: number; hpMax: number; speed: number;
  /** the infection's symptoms (wire vitals.sick): the fever shivers when it stands about */
  sick?: number;
  /** ms clock: which idle variant this half-minute (a crowd doesn't fold its arms in step) */
  now: number;
  /** crossing a link (wire TickBody.link): a ladder, a vent, a lift */
  link?: string | null;
}

/** is a survivor ready this frame (ALWAYS_READY / ALWAYS_CALM, else the wire, else inferred) */
export function readyOf(s: Pick<SurvivorIn, "pose" | "alert" | "why">, pose = s.pose): boolean {
  if (ALWAYS_READY.has(pose)) return true;
  if (ALWAYS_CALM.has(pose)) return false;
  return s.alert ?? inferAlert(pose, s.why);
}

/** the pose a body's real speed makes of the wire's pose */
export function movedPose(pose: string, speed: number): string {
  if (pose === "down") return pose;
  if (MOVING.has(pose)) {
    if (speed < BAND.still) return pose === "crouch-walk" ? "crouch" : "idle";
    return pose;
  }
  if (!STAY_PUT.has(pose) && speed > BAND.move) {
    if (pose === "crouch") return "crouch-walk";
    return speed > BAND.sprint ? "sprint" : speed > BAND.jog ? "jog" : "walk";
  }
  return pose;
}
/** the gaits to try, nearest first, when a loop can't match the ground */
const NEIGHBOURS: Record<string, string[]> = { walk: ["walk", "jog"], jog: ["jog", "walk", "sprint"], sprint: ["sprint", "jog"], "crouch-walk": ["crouch-walk", "walk"] };

/** the loops a survivor in pose `p` would play, best first */
function candidates(p: string, s: SurvivorIn, ready: boolean): string[] {
  const { armed, k } = armedOf(s.held);
  const injured = s.hp > 0 && s.hp < s.hpMax * 0.35;
  const tries: (string | undefined)[] = [];
  if (ready && READY_LOOPS[p]) {
    const row = READY_LOOPS[p];
    tries.push(row[armed], injured ? row.injured : undefined, ...(armed === "none" ? [row.any, ...row.also ?? []] : [CALM_LOOPS[p]?.any ?? row.any, ...(CALM_LOOPS[p] ?? row).also ?? []]));
  } else {
    const row = CALM_LOOPS[p] ?? READY_LOOPS[p] ?? CALM_LOOPS.idle;
    // a TOOL stays in the hand when calm (the torch walk); a weapon never does
    const tool = armed === "torch" || armed === "walkie" ? row[armed] : undefined;
    tries.push(tool, injured ? row.injured : undefined);
    // THE WORK, by what the job is (wire `why`): a sample is knelt over and cut, not CPR; the bench's two
    // hours are hands at the bench, a file reached for, back to it — a new one every 20 s; study is reading
    const why = s.why ?? "";
    if (p === "revive" && why && !/revive|saving/.test(why)) tries.push(...WORK.sample);
    if (p === "interact" && /^(brew|prove)$/.test(why)) tries.push(WORK.bench[hash2(s.seed, Math.floor(s.now / 20_000)) % WORK.bench.length], WORK.bench[0]);
    if (p === "search" && why === "study") tries.push(NOTE);
    // a house's work (Glenridge Hall): hands at the thing — the bolt, the boards, a crest, the switchboard, the fuel
    // can; the journals are read like any paper
    if (p === "interact" && /^(bolt|board|crest|plant|fuel|planks)$/.test(why)) tries.push(WORK.bench[0]);
    if (p === "search" && (why === "read" || why === "journals")) tries.push(NOTE);
    // the fever: standing about, they shiver
    if (p === "idle" && (s.sick ?? 0) >= 2 && (s.sick ?? 0) < 5) tries.push(SHIVER);
    if (p === "idle" && !injured && armed !== "torch") tries.push(CALM_IDLES[hash2(s.seed, Math.floor(s.now / 30_000)) % CALM_IDLES.length]);
    tries.push(row.any, ...row.also ?? []);
  }
  const out: string[] = [];
  // (the slow jog shows nothing in the hands: a gun or a torch, which have their own moving loops to keep them
  // in sight, never trade them for it — their picks are what they were before it existed)
  // (a CALM gun is stowed on the back and shows on no loop: it jogs like empty hands — kept off the jog, a calm carrier
  // ran UAL's 5-7 m/s run at 0.4 speed, under the floor on the short bodies: the feet moonwalked)
  const own = (ready && (armed === "pistol" || armed === "rifle" || armed === "shotgun")) || armed === "torch";
  if (armed === "torch" && p === "jog") tries.unshift(...TORCH_JOGS);
  for (const t of tries) { const n = t?.replace("{k}", k ?? "crowbar"); if (n && !out.includes(n) && !(own && (n === JOG || n === SLOW))) out.push(n); }
  return out;
}

/** the survivor's loop now. `has` = the body has the clip AND it passes the laws there; `rate` = a loop's
 *  own ground speed on this body (m/s; NaN = in place). */
export function survivorLoop(s: SurvivorIn, has: (clip: string) => boolean, rate?: (clip: string) => number): string {
  // on a link: up the ladder, through the vent, standing in the lift (never walking through the air)
  if (s.link && LINK_CLIP[s.link] && has(LINK_CLIP[s.link])) return LINK_CLIP[s.link];
  if (s.pose === "down") return s.speed > BAND.still && has(CRAWL) ? CRAWL : CALM_LOOPS.down.any;
  const p = movedPose(s.pose, s.speed);
  const ready = readyOf(s, p);
  if (rate && MOVING.has(p)) {
    for (const g of NEIGHBOURS[p] ?? [p]) for (const c of candidates(g, s, ready)) if (has(c) && fits(rate(c), s.speed) && !(c === JOG && s.speed > rate(c) * JOG_TOP && has(SLOW)) && !(c === TJOG && s.speed > rate(c) * JOG_TOP && has(TSLOW))) return c;
    // NOTHING FITS (a jog pose at a crawl — starting off, slowing into a door, a crowd): the loop that slides
    // least, not the pose's own (an injured run at 0.28 m/s ran on the spot, its feet skating at 4 m/s)
    let best = "", worst = Infinity;
    for (const g of ["walk", ...(NEIGHBOURS[p] ?? [p])]) for (const c of candidates(g, s, ready)) {
      if (!has(c)) continue;
      const nat = rate(c);
      const slip = Number.isFinite(nat) && nat > 0.15 ? Math.abs(s.speed - nat * Math.min(RATE_CLAMP[1], Math.max(RATE_CLAMP[0], s.speed / nat))) : s.speed;
      if (slip < worst - 1e-6) { worst = slip; best = c; }
    }
    if (best) return best;
  }
  return [...candidates(p, s, ready), CALM_LOOPS.idle.any].find(has) ?? "ual1-idle-loop";
}

// ---- the dead -------------------------------------------------------------------------------------

/** A zombie's loops; each list is picked from by the zombie's seed (a crowd doesn't move in step). A
 *  MOVING zombie plays only a loop whose own ground speed fits its speed (fits()). THE HALLOWEEN MOCAP
 *  WALKS (hw-*) are out: they barely step — 0.02–0.09 m/s measured, ten-second takes of shuffling — so a
 *  body gliding along at 0.45 m/s on one slid over the floor. The walks left cover ~0.2–1.5 m/s between
 *  them (natural 0.31–0.51, UAL's 0.77–0.89), the run 1.3–4.5 (natural 2.3–2.7). */
export const ZOMBIE_LOOPS: Record<string, string[]> = {
  "z-idle": ["mx-zombie-idle", "ual2-zombie-idle-loop", "mx-zombie-idle-1"],
  "z-wander": ["mx-zombie-walk", "mx-zombie-walking", "mx-zombie-walking-1", "ual2-zombie-walk-fwd-loop"],
  "z-chase": ["mx-zombie-running"],
  "z-attack": ["mx-zombie-attack", "mx-zombie-attack-1"],
  "z-bang": ["ual2-zombie-scratch"],
  "z-feed": ["mx-zombie-biting-ground"],
  "z-crawl": ["mx-zombie-crawl"],
  "z-stagger": ["mx-zombie-reaction-hit"],
  "z-dead": ["mx-zombie-death", "mx-zombie-dying"],
};
export const Z_MOVING = new Set<string>(["z-wander", "z-chase", "z-crawl"]);
/** at this speed or more a zombie RUNS (a shambler's 1.0 m/s chase on the running loop played it at the
 *  0.55 floor and slid — it walks now) */
export const Z_RUN_AT = 1.6;

export interface ZombieIn { zkind?: string; pose: string; speed: number; seed: number; link?: string | null }
/** the poses the crawler's prone body keeps (a standing attack, stagger or death would stand it up: it
 *  crawls, and dead it lies as it crawled — actors.ts freezes the crawl) */
const CRAWLER_KEEPS = new Set<string>(["z-feed"]);

export function zombieKey(z: ZombieIn): string {
  const key: string = z.pose.startsWith("z-") ? z.pose : z.pose === "dead" ? "z-dead" : "z-idle";
  // (through a broken window the dead come over the sill on their bellies, not upright through the frame)
  if (z.link === "window" && key !== "z-dead") return "z-crawl";
  if (z.zkind === "crawler") return CRAWLER_KEEPS.has(key) ? key : "z-crawl";
  if (Z_MOVING.has(key) || key === "z-idle") {
    if (z.speed < BAND.still || (key === "z-idle" && z.speed <= 0.25)) return "z-idle";
    return z.speed >= Z_RUN_AT ? "z-chase" : "z-wander";
  }
  return key;
}

export function zombieLoop(z: ZombieIn, has: (clip: string) => boolean, rate?: (clip: string) => number): string {
  let key = zombieKey(z);
  // (attacking on the move: the legs walk or run, the swipe is the arms' loop over them — zombieArms)
  if (key === "z-attack" && z.speed > ARMS_AT) key = z.speed >= Z_RUN_AT ? "z-chase" : "z-wander";
  let list = (ZOMBIE_LOOPS[key] ?? ZOMBIE_LOOPS["z-idle"]).filter(has);
  if (rate && Z_MOVING.has(key) && z.speed > BAND.still && list.length > 1) {
    const ok = list.filter((c) => fits(rate(c), z.speed));
    // (none fits: the one nearest its own speed — the rate clamp takes the rest)
    list = ok.length ? ok : [...list].sort((a, b) => Math.abs(Math.log(z.speed / Math.max(1e-3, rate(a)))) - Math.abs(Math.log(z.speed / Math.max(1e-3, rate(b))))).slice(0, 1);
  }
  return list[z.seed % Math.max(1, list.length)] ?? (ZOMBIE_LOOPS["z-idle"].find(has) ?? "");
}

/** THE ARMS OVER THE LEGS (realism round 6, Nov 2026): a stance that plays in place — a weapon up, a zombie
 *  swiping — while the body moves. Played full-body it plants the feet and skates them (the audit: a zombie's
 *  swipe at 0.8 m/s, feet sliding 1.9 m/s); dropped for a plain walk it puts the weapon away for every step
 *  (READY has no walk that holds a pipe, so a pipe vanished from the hand each time they moved in a fight).
 *  Moving, the legs keep their locomotion and this loop plays on the spine and up (Actor.upperAction). */
export const ARMS_AT = BAND.move + 0.05;
export function survivorArms(s: SurvivorIn, has: (clip: string) => boolean): string {
  if (s.link || s.pose === "down" || s.pose === "grabbed" || s.speed <= ARMS_AT) return "";
  const p = movedPose(s.pose, s.speed);
  if (!MOVING.has(p)) return "";
  // weapon up: always in a fight / aiming, else what the wire says
  if (!readyOf(s, s.pose) && !readyOf(s, p)) return "";
  const { armed, k } = armedOf(s.held);
  // (a gun has its own walk and run loops; a torch its own; bare hands walk as they are)
  if (armed !== "melee" && armed !== "axe") return "";
  const row = READY_LOOPS.fight;
  const n = (armed === "axe" ? row.axe : row.melee)?.replace("{k}", k ?? "crowbar");
  return n && has(n) ? n : "";
}
export function zombieArms(z: ZombieIn, has: (clip: string) => boolean): string {
  if (z.zkind === "crawler" || z.speed <= ARMS_AT) return "";
  const key = z.pose.startsWith("z-") ? z.pose : "";
  if (key !== "z-attack") return "";
  const list = ZOMBIE_LOOPS["z-attack"].filter(has);
  return list[z.seed % Math.max(1, list.length)] ?? "";
}

// ---- the one-shots --------------------------------------------------------------------------------

export type OneShot = "swing.light" | "swing.heavy" | "stab" | "stomp" | "shoot" | "reload" | "hit" | "hit.head" | "bitten" | "fall" | "death" | "attack" | "zhit" | "open-box" | "can" | "sink" | "door" | "getup" | "liedown" | "cough" | "inject";

export interface ShotIn { zombie: boolean; zkind?: string; pose: string; held?: string | null; seed: number; part?: string }

/** The one-shot's clip, or null (none fits this body now: a crawler's standing flinch, a standing flinch
 *  on the floor). `freeze` = no clip: hold the loop where it is (a crawler, or a body on the floor, dying). */
export function oneShotName(kind: OneShot, o: ShotIn, has: (clip: string) => boolean): string | null | "freeze" {
  const { armed, k } = armedOf(o.held);
  const pick = (...names: string[]) => names.find(has) ?? null;
  const z = o.zombie;
  const prone = z ? o.zkind === "crawler" : LYING.has(o.pose);
  const kneeling = z && o.pose === "z-feed";
  if (kind === "death") {
    if (prone) return "freeze";
    // a kneeling feeder topples BACK off the body (Nov 2026: the dying slump fell forward, onto the one it was eating —
    // corpses piled on a downed survivor); the backward death joins at its kneel (oneShotStart)
    if (z) return kneeling ? pick("mx-zombie-death", "mx-zombie-dying") : pick(...(o.seed % 2 ? ["mx-zombie-dying", "mx-zombie-death"] : ["mx-zombie-death", "mx-zombie-dying"]));
    return pick(o.part === "back" ? "mx-pro-rifle-pack--death-from-the-back" : o.seed % 2 ? "mx-pro-rifle-pack--death-from-the-front" : "ual1-death01", "ual1-death01");
  }
  // (lying down is getting up played backwards: actors.ts runs it at timeScale -1)
  if (kind === "getup" || kind === "liedown") return z ? null : pick(GET_UP);
  // THE INFECTION: a coughing fit (lying, the laid-up cough; standing, the bent-over one), and a needle
  if (kind === "cough") return z ? null : prone ? pick("mx-laying-severe-cough", "mx-laying-mild-cough") : pick("bd-cough");
  // nothing else stands a body up off the floor or out of a crouch over its food
  if (prone || kneeling) return null;
  switch (kind) {
    case "swing.light":
      if (armed === "melee") return pick(`hd-${k}-ual2-sword-regular-${o.seed % 2 ? "a" : "b"}`, `hd-${k}-ual2-sword-regular-a`);
      if (armed === "axe") return pick("hd-axe-ual2-treechopping-loop");
      return pick("ual1-punch-jab");
    case "swing.heavy":
      if (armed === "melee") return pick(`hd-${k}-mx-standing-melee-attack-downward`, `hd-${k}-ual2-sword-regular-a`);
      if (armed === "axe") return pick("hd-axe-ual2-treechopping-loop");
      return pick("ual1-punch-cross");
    case "stab": return armed === "melee" ? pick(`hd-${k}-mx-stabbing`, `hd-${k}-ual2-sword-regular-a`) : pick("ual1-punch-jab");
    case "stomp": return pick("mx-stomp");
    case "shoot": return armed === "pistol" ? pick("gp-ual1-pistol-shoot") : armed === "rifle" ? pick("gr-mx-shoot-rifle") : armed === "shotgun" ? pick("gs-mx-shoot-rifle") : null;
    case "reload": return armed === "pistol" ? pick("gp-ual1-pistol-reload") : armed === "rifle" ? pick("gr-mx-reloading") : armed === "shotgun" ? pick("bd-shotgun-load") : null;
    case "hit": return z ? pick("mx-zombie-reaction-hit") : pick("ual1-hit-chest");
    case "hit.head": return z ? pick("mx-zombie-reaction-hit") : pick("ual1-hit-head");
    case "zhit": return pick("mx-zombie-reaction-hit");
    case "bitten": return pick("mx-hit-reaction", "ual1-hit-chest");
    case "fall": return pick("mx-falling-down");
    case "attack": return pick(...(o.seed % 2 ? ["mx-zombie-attack-1", "mx-zombie-attack"] : ["mx-zombie-attack", "mx-zombie-attack-1"]));
    case "open-box": return pick("ual2-chest-open");
    case "can": return pick("bd-can");
    case "sink": return pick("bd-sink");
    case "door": return pick("mx-door-opening");
    case "inject": return z ? null : pick("bd-inject");
  }
  return null;
}
/** ON THE ARMS ALONE, EVEN STANDING (realism round 14, measured against the loop each plays over — scratchpad snap
 *  check): an in-place action whose legs don't match the stance under it popped the body every time. A jab or a cross
 *  out of the fight guard stood the body up 11 cm and back; the glance over the shoulder (a calm fidget) starts with
 *  the feet 38 cm off the idle's and takes a whole step; the axe's chop drops the hips 9 cm off the axe guard. None
 *  needs its own legs: the arms and the chest play the action, the stance keeps the feet. */
export const UPPER_ONLY = new Set(["ual1-punch-jab", "ual1-punch-cross", "bd-look-back-l", "bd-look-back-r", "hd-axe-ual2-treechopping-loop"]);
// (the glance is rebuilt on the idle now — anim-recipes.js — and stays arms-only for a body baked before that)
/** a one-shot that has to bring its own legs but starts far off the stance (the shove out of the guard, the hips 20 cm
 *  up and a foot 31 cm off; the stomp 14 cm; the door's step 23 cm) blends in over this long, not a pop in 0.12 s */
export const SLOW_IN: Record<string, number> = { "mx-push": 0.3, "mx-stomp": 0.25, "mx-door-opening": 0.28 };

/** where a one-shot starts (0..1 of its length): a kneeling zombie's death joins the backward death at its kneel */
export function oneShotStart(kind: OneShot, o: ShotIn): number {
  // (measured: the backward death passes the feed's kneel height, head ~1.0 m, 47% of the way in, the head already going back)
  return kind === "death" && o.zombie && o.pose === "z-feed" ? 0.47 : 0;
}

// ---- THE OTHER MOVES (Oct 31 2026): clips the EVENTS play, not the pose ---------------------------
// (Josh, Oct 20: "good textures, assets, sound, animations for every action". The bake had them all;
// the show only kept the pose table's. Every clip named below passes the law on all seven survivor
// bodies — anim/<body>/clip.json, scripts/survivorz/anim-show-check.mjs walks each one.)

/** THE TURN, the collapse half: stage 5 drops them where they stand (backwards, onto the back — the down
 *  loop's own pose, so the minute they lie there is one continuous body) */
export const COLLAPSE = "mx-falling-down";
/** THE TURN, the rise half: the survivor's own body (every body carries the zombie pack) gets up off the
 *  floor — stand-up-1 starts on its back, head behind, exactly as the down loop lies (measured: the other
 *  stand-up lies the other way round and would flip the body 180° in the cut) — and screams */
export const RISE: [string, string] = ["mx-zombie-stand-up-1", "mx-zombie-scream"];
/** a SHOVE: mx-push's thrust (the hands out by 0.75 s) and back, without its six-second hold */
export const SHOVE = { clip: "mx-push", from: 0.2, to: 1.3 };

/** THE WORK, by what's being worked on (an event says which; the pose stays "search"/"interact") —
 *  each loops while the sim keeps them at it */
export const WORK: Record<string, string[]> = {
  terminal: ["mx-typing"],
  // listening to a tape: arms folded, still (the recorder sits on the desk)
  listen: ["ual2-idle-foldarms-loop", "ual1-idle-loop"],
  // the bench (brewing Lazarus, studying): hands on the bench, reaching for a file, back to it
  bench: ["ual1-interact", "mx-searching-files-high", "ual1-interact", "mx-looking-through-files-low"],
  // a tissue sample taken off the experiment's body: knelt down, working with the hands — not CPR
  sample: ["ual1-fixing-kneeling"],
};
/** reading a paper record: the sheet held up and read (a one-shot, 5 s) */
export const NOTE = "bd-note";

/** THE TOOLS at a door or a panel, one-shots */
export const TOOLS: Record<string, string> = {
  keycard: "bd-keycard", keypad: "bd-keypad", crowbar: "bd-crowbar", "hold-door": "bd-hold-door", breaker: "bd-breaker",
};

/** TALK: what the body does with a line (the voice's text picks the family; the seed picks within) */
export const TALK: Record<string, string[]> = {
  plain: ["mx-talking", "mx-talking-2", "ual1-idle-talking-loop"],
  ask: ["mx-shrugging", "mx-talking-2"],
  shout: ["mx-yelling", "mx-standing-arguing"],
  argue: ["mx-standing-arguing", "mx-standing-arguing-1"],
  laugh: ["mx-laughing"],
  yes: ["ual2-yes"],
  no: ["ual2-idle-no-loop"],
  cheer: ["mx-cheering", "mx-fist-pump"],
  down: ["mx-disappointed"],
};
/** a line's gesture family, off its words (the brain writes them; the screen only reads them) */
export function talkKind(text: string): keyof typeof TALK {
  const t = text.toLowerCase();
  if (/\b(ha(ha)+|heh|lol)\b/.test(t)) return "laugh";
  if (/\b(we did it|yes!|got it!|hell yes|finally!)/.test(t)) return "cheer";
  if (/^(no|nope|no way|not a chance)\b/.test(t)) return "no";
  if (/^(yes|yeah|yep|okay|ok|sure|right)\b/.test(t)) return "yes";
  if (/\b(damn|dammit|it's over|we're dead|can't do this|hopeless)\b/.test(t)) return "down";
  if ((t.match(/!/g) ?? []).length >= 2 || /\b(run|get down|move|look out|behind you)\b/.test(t)) return "shout";
  if (/\b(you always|that's not|listen to me|are you serious|bullshit|stop)\b/.test(t)) return "argue";
  if (t.trim().endsWith("?")) return "ask";
  return "plain";
}

/** CROSSING A LINK (a ladder, a vent, a lift — wire TickBody.link): what the body does on the way */
export const LINK_CLIP: Record<string, string> = { ladder: "mx-climbing-ladder", vent: CRAWL, lift: "ual1-idle-loop" };

/** WHAT'S IN THE HAND ON A CLIP the bake fitted a hand to (anim-recipes.js PROPS/HELD): the prop the
 *  game hangs there for that clip only. `side` the hand; `along` the hand axis the prop's grip axis
 *  lies on (u the thumb side, f the fingers); `axis`/`across` the prop's own axes (its grip axis, and
 *  the one that lies along the hand's second axis); `scale` brings a packed prop to the size the hand
 *  was closed round; `shift` slides it along its axis from the fist; `pt` (f, p, u from the wrist) puts
 *  it at the fingertips instead of in the fist. Only clips whose hand CLOSES round a thing are here —
 *  a bandage roll wound round a forearm by an open hand would float (law 2), so it isn't. */
export interface ClipProp {
  prop: string; side: "r" | "l"; along: "u" | "f";
  axis: [number, number, number]; across: [number, number, number];
  scale?: [number, number, number]; shift?: number; pt?: [number, number, number];
  /** the radius the hand closed round (the bake's HELD / CAN / SYRINGE): the prop sits in the body's own grip
   *  channel, that far in front of the palm's skin (actors.ts holdPoint) */
  r?: number;
  /** PINCHED LIKE A KEY (anim-recipes.js CARD.pinch / cardPose): on the thumb's side of the index finger's first
   *  bone — how far along that bone, then the prop's middle ahead along the hand and toward the palm. Placed off the
   *  finger's own bones, so it is in the pinch on every hand */
  pinch?: [number, number, number];
}
export const CLIP_PROPS: Record<string, ClipProp> = {
  // HELD.bottle (r 0.04, 0.26 m): the water bottle is that bottle, cap to the thumb
  "bd-drink": { prop: "water-bottle", side: "r", along: "u", axis: [0, 1, 0], across: [0, 0, 1], r: 0.04 },
  "bd-sink": { prop: "water-bottle", side: "l", along: "u", axis: [0, 1, 0], across: [0, 0, 1], r: 0.04 },
  // HELD.bar: 0.15 along the thumb, 0.035 along the fingers, 0.012 thick, held near its bottom end
  "bd-eat": { prop: "granola-bar", side: "r", along: "u", axis: [1, 0, 0], across: [0, 0, 1], scale: [1.25, 0.55, 0.73], shift: 0.036, r: 0.006 },
  // SYRINGE: along the fingers, the needle out past the fingertips
  "bd-inject": { prop: "syringe", side: "r", along: "f", axis: [0, -1, 0], across: [0, 0, 1], scale: [0.9, 0.93, 0.9], shift: 0.03, r: 0.008 },
  // CAN (r 0.033, h 0.115) in the left hand while the right opens it
  "bd-can": { prop: "rusted-can", side: "l", along: "u", axis: [0, 1, 0], across: [0, 0, 1], scale: [0.53, 0.76, 0.53], r: 0.033 },
  // CARD (0.086 × 0.054) pinched between the thumb and the side of the index finger, on its edge, swiped
  "bd-keycard": { prop: "keycard-a", side: "r", along: "f", axis: [1, 0, 0], across: [0, 1, 0], scale: [0.78, 0.75, 0.2], pinch: [0.7, 0.023, 0] },
};

/** THE PAIRS (show/pairs.ts) — the finisher pack's struggles, the bites and the rescues, both halves
 *  baked per pair: the zombie's `zd-<clip>-<survivor>`, the survivor's `fz-<clip>` or `zv-<clip>-<zombie>`
 *  (docs/survivorz/finisher-fit.json says which, and which pairs may play at all), `zd-bite-<part>-<s>` /
 *  `bd-bitten-<part>`, and the rescuer's `zv-pull-off-<zombie>` / `zv-knife-head-<zombie>` */
export const PAIR_CHAINS = {
  front: { start: "fz-front-struggle-start", idle: "fz-front-struggle-start-idle", free: "fz-front-struggle-free" },
  back: { start: "fz-back-struggle-start", idle: "fz-back-struggle-idle", free: "fz-back-struggle-free" },
} as const;
const PAIR_CLIP = /^(fz-(front-struggle-(start|start-idle|free)|back-struggle-(start|idle|free))|zv-fz-(front-struggle-(start|start-idle|free)|back-struggle-(start|idle|free))-zombie-[mf]\d\d|zd-fz-(front-struggle-(start|start-idle|free)|back-struggle-(start|idle|free))-[a-z][a-z0-9-]*|zd-bite-(forearm|shoulder)-[a-z][a-z0-9-]*|bd-bitten-(forearm|shoulder)|zv-(pull-off|knife-head)-zombie-[mf]\d\d)$/;

// ---- every clip the show can ask for (the rest of a body file's bake is dropped) -----------------

/** keep this clip when a body file loads (the table's names, and the pairs' families) */
export const keepClip = (name: string): boolean => CLIP_NAMES.has(name) || PAIR_CLIP.test(name);

export const CLIP_NAMES = new Set<string>([
  COLLAPSE, ...RISE, SHOVE.clip, NOTE, ...Object.values(WORK).flat(), ...Object.values(TOOLS), ...Object.values(TALK).flat(), ...Object.values(LINK_CLIP),
  ...[...Object.values(READY_LOOPS), ...Object.values(CALM_LOOPS)].flatMap((row) => Object.values(row).flat().flatMap((n) => (n!.includes("{k}") ? MELEE_KEYS.map((k) => n!.replace("{k}", k)) : [n!]))),
  ...CALM_IDLES, ...FIDGETS, ...TORCH_JOGS, ...Object.values(ZOMBIE_LOOPS).flat(), CRAWL, GET_UP, SHIVER, "bd-cough", "bd-inject", "mx-laying-severe-cough", "mx-laying-mild-cough",
  "ual1-punch-jab", "ual1-punch-cross", "mx-stomp", "gp-ual1-pistol-shoot", "gr-mx-shoot-rifle", "gs-mx-shoot-rifle", "gp-ual1-pistol-reload", "gr-mx-reloading", "bd-shotgun-load", "bd-shotgun-pump",
  "ual1-hit-chest", "ual1-hit-head", "mx-hit-reaction", "mx-falling-down", "mx-zombie-reaction-hit", "mx-zombie-attack", "mx-zombie-attack-1", "mx-zombie-death", "mx-zombie-dying",
  "mx-pro-rifle-pack--death-from-the-back", "mx-pro-rifle-pack--death-from-the-front", "ual1-death01", "ual2-chest-open", "bd-can", "bd-sink", "mx-door-opening", "hd-axe-ual2-treechopping-loop",
  ...MELEE_KEYS.flatMap((k) => [`hd-${k}-ual2-sword-regular-a`, `hd-${k}-ual2-sword-regular-b`, `hd-${k}-mx-standing-melee-attack-downward`, `hd-${k}-mx-stabbing`]),
]);

export function hash2(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ b;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
