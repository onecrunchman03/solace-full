// SOLACE SURVIVORZ — THE SURVIVORS' MINDS: the talk + choice layer (SURVIVORZ.md §5, layers 2-4).
//
// "Game code decides, the language model talks." This file is the model's whole reach into the
// show, and it has exactly two ways in, both seams the sim already offers (sim/world.ts SimHooks):
//   · hooks.say  — a moment happened to a survivor (a grab, a keycard, a chat…). They SAY something
//                  about it, written by the model from FACTS (facts.ts — only what they know), their
//                  sheet, their genes and their memory. It comes out as a wire `say` frame (a
//                  subtitle on the broadcast; voices are a later pass). Saying moves nothing.
//   · hooks.choose — the job menu code built (only what they know). Now and then the model picks ONE
//                  option from it with a few words of why; code checks the id is on the menu, the
//                  sim carries it out. Anything else, or no answer in time: code picks, as today.
// And the group's plan (layer 3): a MEETING, staged here when the group is together in a safe room
// after something changed. Code builds the plans, the leader proposes one in their voice, each
// other survivor accepts or argues (the genes' acceptPlan / proposeChance roll it — the model only
// voices the stance), a counter-plan with more people behind it wins that call, and leadership moves
// by following. The plan reaches the game only as `choose` answers for the people it names.
//
// THE FLOOR'S AIR, for a biolab (TALK below): one speaker at a time per room, a breath between
// lines, at most ROOM_PER_MIN lines a minute in a room, priority (a grab / going down / a death >
// a discovery > idle chat), stale lines dropped, and a survivor who's said something waits before
// saying more. All of it in the SIM's clock, so a fast harness and the live show pace alike.
//
// THE SWITCH: nothing here runs unless the house brain is up AND the admin allows it. Off, both
// hooks return at once and the sim runs exactly as it does with no hooks at all.
import { acceptPlan, ownUpChance, proposeChance, gene, type SurvivorId } from "../genes";
import { skill } from "../sim/goals";
import { SKILL_KEYS, SKILL_INFO, type SkillKey } from "../cast/rules";

/** WHAT THEY'RE GOOD AND BAD AT, in plain words (Josh, Nov 5 2026: the AI is told its skills "in plain words",
 *  never numbers). A trained skill is worth mentioning at 6+; a body skill (base 5) is good at 8+ and poor at 2
 *  or less. */
const SKILL_WORDS: Record<SkillKey, { good: string; great: string; poor?: string }> = {
  melee: { good: "handy in a fight", great: "a hard fighter up close", poor: "useless in a fight" },
  firearms: { good: "a decent shot", great: "a crack shot" },
  agility: { good: "quick on your feet", great: "very quick and nimble", poor: "slow and clumsy" },
  escape: { good: "good at wriggling free", great: "hard to hold on to", poor: "easily held" },
  strength: { good: "strong", great: "very strong", poor: "not strong" },
  endurance: { good: "fit", great: "tireless", poor: "out of shape" },
  toughness: { good: "tough", great: "very hard to hurt", poor: "frail" },
  stealth: { good: "quiet on your feet", great: "very sneaky" },
  firstAid: { good: "good at first aid", great: "a trained medic" },
  science: { good: "good with science", great: "a scientist" },
  electronics: { good: "handy with electronics", great: "an electronics expert" },
  mechanics: { good: "handy with machinery", great: "a skilled mechanic" },
  lockpicking: { good: "able to pick a lock", great: "an expert lockpick" },
  scavenging: { good: "good at scavenging", great: "a born scavenger" },
  leadership: { good: "a natural leader", great: "someone people follow", poor: "no leader" },
  quickLearner: { good: "a quick learner", great: "very quick to learn", poor: "slow to pick things up" },
};
function skillWords(s: Survivor): { good: string[]; poor: string[] } {
  const good: string[] = [], poor: string[] = [];
  for (const k of SKILL_KEYS) {
    const v = skill(s, k), base = SKILL_INFO[k].base, w = SKILL_WORDS[k];
    const greatAt = base >= 5 ? 9 : 8, goodAt = base >= 5 ? 7 : 5;
    if (v >= greatAt) good.push(w.great);
    else if (v >= goodAt) good.push(w.good);
    else if (w.poor && base >= 5 && v <= 2) poor.push(w.poor);
  }
  return { good, poor };
}
/** "a, b and c" */
const listWords = (xs: string[]): string => xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
/** a survivor's fitness for the risky end of a plan (fighting, getting free, keeping their head) */
const fitness = (s: Survivor): number => skill(s, "melee") + skill(s, "agility") - s.gen.caution;
import type { Decide, Goal, ServerFrame, Say, Think } from "../sim/wire";
import { Rng } from "../sim/rng";
import { CHOICE_WAIT, type SimWorld, type Survivor } from "../sim/world";
import { RULES, SHEETS, regardWord, systemFor, worldOf } from "./sheets";
import { factsFor, factsText, labelFor, nearby, type MenuItem } from "./facts";
import { echoes, holdsLine, keep, pickChecked, writeChecked } from "./lines";
import { crossesLine } from "../../npc/guard";
import { reveal } from "../sim/infection";
import type { TalkModel } from "./model";
import { NOTE_CHARS, loadMinds, remember, saveMinds, type KV, type Minds } from "./memory";
import { BITE_WORDS, THOUGHT_CHARS, codeThought, type CodeThought } from "./thoughts";

/** WHO MAY STILL SPEAK (Nov 2026 — Josh: "someone died and kept saying their lines"): the living, down and
 *  bleeding out included — never the dead, the turned, or one collapsed and turning (that minute ends in the
 *  turn; nobody brings them back from it). Every way a line leaves goes through this: the queue, the line
 *  about to be said, a line held for its voice (show.ts) — and the screens drop one that arrives late anyway. */
export function canSpeak(s: Survivor | undefined | null): boolean {
  // (nor the body the admin walks the map in: it has no mind of its own — sim/player.ts)
  return !!s && s.alive && !s.turned && !s.turnAt && !s.player;
}

export const TALK = {
  /** lines a minute in one room (a meeting's lines are exempt, they're one conversation) */
  ROOM_PER_MIN: 3,
  /** the breath between two lines in a room, sim ms */
  GAP_MS: 900,
  /** how long a line holds the floor: per character, with a floor and a ceiling */
  HOLD_PER_CHAR_MS: 55, HOLD_MIN_MS: 2_200, HOLD_MAX_MS: 9_000,
  /** a line not said within this long of its moment is dropped (by priority 0, 1, 2) */
  STALE_MS: [7_000, 15_000, 35_000] as const,
  MEETING_STALE_MS: 90_000,
  /** a survivor's own gap between lines (priority 0 ignores it) */
  SURVIVOR_GAP_MS: 14_000,
  /** a listener answers a line this often (by the line's priority) */
  REPLY_ODDS: [0.6, 0.35, 0.25] as const,
  /** once an exchange has started (two lines in), the next answer comes this often… */
  EXCHANGE_ODDS: 0.45,
  /** …and an exchange is this many lines at most (REALISM.md: "back-and-forth exchanges of 2–4 lines") */
  EXCHANGE_MAX: 4,
  /** IDLE TALK (REALISM.md: "a line every minute or two"): a new idle conversation starts in a room no
   *  sooner than a draw between these after the last one started there */
  IDLE_GAP_MS: [60_000, 120_000] as [number, number],
  /** QUIET SELF-TALK (REALISM.md: "sometimes when alone"): a survivor alone mutters at most this often */
  MUTTER_MS: [6 * 60_000, 12 * 60_000] as [number, number],
  /** THE AI DECIDES (Nov 2026 — Josh: "we just make the maps, set the objectives, place the enemies. The ai
   *  does the rest whether they die or not"). Every job choice is the model's, from the whole menu code
   *  built; code only carries it out, keeps the reflexes (fight, flee, hide) and picks when the model can't.
   *  A survivor waits this long for an answer (sim ms) before code picks for them */
  WAIT_MS: 8_000,
  /** the least between two asks for one survivor */
  MIN_ASK_MS: 5_000,
  /** the menu changed under a pick that still stands: asked again at most this often */
  RECONSIDER_MS: 60_000,
  /** a pick stands at most this long before they're asked again */
  PICK_HOLD_MS: 10 * 60_000,
  /** the model failed a survivor: code picks for them this long */
  FAIL_MS: 60_000,
  /** asks in flight at once, across the cast */
  MAX_ASKS: 3,
  /** SEARCHING A ROOM IS ONE DECISION (Nov 12 2026 review: every container was its own ask — a new plan every 35 s
   *  and a caption every 7): a pick to search something carries on through the same room's other containers for
   *  this long without another ask, unless something big happens */
  ROOM_SEARCH_MS: 4 * 60_000,
  /** NOBODY SAYS SOMEBODY ELSE’S LINE: a draft is read against what everybody else said this long back (lines.ts echoes) */
  ECHO_MS: 20 * 60_000,
  /** THEIR OWN GOALS: a goal is reconsidered this often, or after a big moment (a meeting's need, a plan), or when
   *  the thing it was about is done (the door sealed, the bunker clear, the radio fixed; their own find). The show
   *  is an hour: three hours meant once a run, and Ben's card read "get the keycard" 14 minutes after he had it */
  GOAL_MS: 10 * 60_000,
  /** the least between two goal asks for one survivor */
  GOAL_MIN_MS: 3 * 60_000,
  GOAL_CHARS: 140,
  /** THE CAPTIONS (phase 4): one survivor's "decided" goes on screen at most this often — a turn on
   *  somebody, a theft, a gift or owning up always does */
  DECIDE_GAP_MS: 45_000,
  /** …and anybody's at most this often (six survivors' captions a few seconds apart can't be read) */
  DECIDE_ANY_GAP_MS: 6_000,
  /** more of the same in the same room isn't news for this long */
  DECIDE_SAME_MS: 3 * 60_000,
  /** the AI's share of the choices, over this long (the admin's counter) */
  SHARE_WINDOW_MS: 3_600_000,
  SHARE_BUCKET_MS: 300_000,
  /** meetings: on, the gap, how long a plan stands, how many must be there */
  MEETINGS: true,
  MEETING_GAP_MS: 30 * 60_000,
  PLAN_MS: 3 * 3_600_000,
  MEETING_MIN: 3,
  /** a run back: out at least this long */
  RUN_MS: 10 * 60_000,
  /** the diary: at the main sleep, at most this often */
  DIARY_GAP_MS: 16 * 3_600_000,
  /** lines being written at once, across the show (the four slots are shared with the casino) */
  MAX_WRITING: 3,
  MODEL_TIMEOUT_MS: 9_000,
  SAVE_MS: 60_000,
};

/** THE THOUGHTS (Josh, Oct 28 2026: "know what the survivors are thinking as well, not just saying"):
 *  one short line on each survivor's cast card. The model writes one now and then; between, and
 *  whenever the brain is off or busy, code's thought from what drives their choice (thoughts.ts). */
export const THINK = {
  /** thoughts at all (frames only — they never touch the sim) */
  ON: true,
  /** a model thought per survivor every this long (sim ms, a draw between the two) */
  GAP_MS: [120_000, 240_000] as [number, number],
  /** the first model thought, and the stagger between survivors, so six don't arrive at once */
  FIRST_MS: 20_000, STAGGER_MS: 15_000,
  /** after a big moment or a change in what drives them, the next one this soon… */
  SOON_MS: 6_000,
  /** …but never closer than this to their last model thought */
  MIN_MS: 30_000,
  /** a thought that couldn't be written (busy, refused, slow): try again after this */
  RETRY_MS: 30_000,
  /** thoughts being written at once — and one only starts with two of MAX_WRITING free (speech first) */
  AT_ONCE: 1,
  /** code's thought is re-read this often */
  CHECK_MS: 2_000,
  /** code's thought stands at least this long, unless something urgent */
  CODE_HOLD_MS: 20_000,
  /** a model thought stands at least this long; past it, code's takes the card when what drives them changes */
  MODEL_STALE_MS: 90_000,
  /** a moment this recent is in the thought's prompt */
  MOMENT_MS: 90_000,
  MAX_CHARS: THOUGHT_CHARS,
  MAX_TOKENS: 48,
};

/** How a thought is written — what replaces RULES' "you are speaking aloud" for the inner voice. */
export const THINK_RULES = `HOW YOU THINK
- This isn't speech. Nobody hears it: it's the one private thought going through your head right now, in your own voice, first person.
- One short line, under ${THINK.MAX_CHARS} characters. Blunt and plain, the way people really think — half a sentence is fine. No quotes, no markdown, no emoji, no stage directions, no "I think that".
- It's HONEST. Out loud you may lie; in your own head you never do. If you're scared, you're scared. If you don't trust somebody, you know it.
- You know only what's in FACTS and what you've heard. Never invent a room, a door, a supply, a number or a person. Numbers only from FACTS, in digits.
- This is an adults-only show and your head can be as dark and crude as you are. THE ONE LINE YOU NEVER CROSS: nothing sexual involving anyone under 18, anyone who hasn't consented, animals, or family members.
- You are a real person, not an AI. You don't know you're on a show.`;

interface Thought { text: string; src: "model" | "code"; at: number; key: string }

type Prio = 0 | 1 | 2;

/** What each moment from the sim means to the one it happened to. */
const MOMENT: Record<string, { p: Prio; say: (c: Record<string, unknown>, name: (w: string) => string) => string }> = {
  grabbed: { p: 0, say: () => "One of the dead just GRABBED you and is pulling you in." },
  // GLENRIDGE HALL (sim/scenarios/glenridge.ts)
  bolted: { p: 0, say: () => "You just shut the great front door and shot the bolt. The dead are outside it now — and so is anybody who didn't make it in." },
  boarded: { p: 1, say: (c) => (Number(c.left) ? `You just nailed the last plank over a broken window. ${Number(c.left)} more stand open.` : "You just boarded the last of the broken windows. The house is shut.") },
  blackout: { p: 0, say: () => "Every light in the house just went out — the storm. It's black in here but for the lightning." },
  lightsOn: { p: 1, say: () => "You got the switchboard going: the lights are back on." },
  down: { p: 0, say: () => "You just went DOWN — you're on the floor, bleeding out, and you can't get up." },
  panic: { p: 0, say: () => "You've lost it — pure panic, you can't think." },
  revived: { p: 1, say: (c, n) => `You just got ${n(String(c.who))} back on their feet after they went down.` },
  fight: { p: 1, say: () => "You're fighting the dead, up close." },
  keycard: { p: 1, say: (c) => (typeof c.keyName === "string" ? `You just found ${c.keyName}.` : `You just found a keycard — level ${Number(c.tier) || 1}.`) },
  power: { p: 1, say: () => "You just threw a breaker and the lights came back on around you." },
  read: {
    p: 1,
    say: (c) => {
      const title = typeof c.title === "string" ? `"${c.title}"` : "one of the staff's files";
      const why = c.truth ? " It's part of what really happened here." : c.lazarus ? " It's about Lazarus — a cure they were working on." : c.claudia ? " It names somebody called Claudia." : "";
      const gist = typeof c.gist === "string" && c.gist ? ` What it says: ${c.gist}` : "";
      return `You just read ${title}.${gist}${why}`;
    },
  },
  truth: { p: 0, say: () => "You've pieced it together: you know what Halcyon did here, and who for." },
  sample: { p: 0, say: () => "You just took a sample off one of the experiments. It won't keep long — it has to get to the Deep Lab." },
  brew: { p: 1, say: () => "You've put the sample in and started making Lazarus. The machines are loud; the dead will hear." },
  doses: { p: 0, say: () => "Lazarus is made: three doses. Nobody knows yet whether it works." },
  proven: { p: 0, say: (c) => (c.how === "patient" ? "You gave somebody infected a dose — and it WORKED. Lazarus is real." : "The analyser says it: Lazarus works.") },
  cured: { p: 0, say: () => "The dose worked. You're not going to turn. You're going to live." },
  route: { p: 0, say: () => "You followed the transit tunnel to a maintenance shaft — and it's OPEN. There's a way out of here." },
  leaving: { p: 0, say: (c, n) => `It's decided: ${(c.goers as string[] ?? []).map((g) => n(g)).join(" and ")} going out through the vault. ${c.presser ? n(String(c.presser)) + " will arm the override." : ""}` },
  override: { p: 0, say: (c) => (c.going ? "You just armed the vault override. Sixty seconds. Run." : "You just armed the vault override. Sixty seconds, and they're gone — you're staying.") },
  calls: { p: 1, say: () => "You've been hiding alone for days, and now you can hear people out there — living people. Call out to them." },
  found: { p: 0, say: (c, n) => `You just found somebody alive, hiding: ${n(String(c.who))}. They've been alone in here a long time.` },
  confess: { p: 0, say: (c) => (c.how === "cough" ? "You can't hide it any more — the others heard that cough. They know you're infected." : "You've just told the others you were bitten. They know.") },
  skill: { p: 2, say: (c) => `All this has taught you something: you're better at ${String(c.skill)} now.` },
  slam: { p: 1, say: () => "You just slammed a door shut on the dead behind you." },
  plan: { p: 1, say: () => "You've decided the group can't stay put: you have to push further into this place." },
  sleep: { p: 2, say: () => "You're turning in for some sleep." },
  chat: { p: 2, say: (c, n) => `You've got a quiet minute with ${n(String(c.with))}; say something to them.` },
};

interface Line {
  who: SurvivorId;
  prio: Prio;
  /** the moment's sim time */
  t: number;
  room: string;
  to?: SurvivorId;
  text: string;
  meeting?: boolean;
  seq: number;
  /** which line of its exchange this is (1 = it starts one) */
  ex: number;
  /** said, then this: a listener may answer */
  after?: (w: SimWorld, said: string) => void;
  /** never said (dropped as stale) */
  fail?: () => void;
}

interface Air { until: number; said: number[] }
/** Is this text most of the same words as one of those? (a reason given again, word for word or nearly) */
function alike(text: string, earlier: string[]): boolean {
  const bag = (t: string) => new Set(t.toLowerCase().replace(/[^a-z ]/g, "").split(/\s+/).filter((x) => x.length > 2));
  const a = bag(text);
  if (a.size < 4) return false;
  return earlier.some((e) => { const b = bag(e); if (b.size < 4) return false; let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.min(a.size, b.size) >= 0.75; });
}

interface Pick { id: string; at: number; why: string; label: string; sig: string; kind?: string; room?: number }
interface Ask { at: number; inflight: boolean; failUntil: number; queuedAt: number }

/** A meeting's plan: what it is, and who it sends where. */
export interface GroupPlan {
  kind: "push" | "scavenge" | "hold";
  label: string;
  /** survivor → their part in it */
  roles: Partial<Record<SurvivorId, "go-explore" | "go-scavenge" | "stay">>;
  leader: SurvivorId;
  at: number;
  until: number;
  /** who argued it down, who refused it */
  refused: SurvivorId[];
}

export interface MindsStatus {
  active: boolean;
  allowed: boolean;
  modelUp: boolean;
  /** an engine is configured on this box (the hold, broadcast.ts, only ever waits for one that is) */
  configured: boolean;
  said: number;
  dropped: number;
  writing: number;
  choicesAsked: number;
  choicesTaken: number;
  choicesFailed: number;
  goalsAsked: number;
  goalsSet: number;
  /** each survivor's own goal, as they set it */
  goals: Record<string, string>;
  /** who decided each think: the model, or code (the model down, slow or busy) */
  thinksAi: number;
  thinksCode: number;
  /** the AI's share of every choice over the last hour (sim time): what Josh holds to 90% */
  share: { ai: number; code: number; pct: number | null };
  decided: number;
  meetings: number;
  thoughts: number;
  thoughtsWritten: number;
  thoughtsDropped: number;
  thinking: number;
  plan: GroupPlan | null;
  leader: SurvivorId;
  follow: Record<string, number>;
}

export interface MindsOptions {
  model: TalkModel;
  /** the admin's switch (Show tab) */
  allowed: () => boolean;
  kv?: KV | null;
  /** the cast cards' thoughts (default THINK.ON) — frames only, never the sim */
  thoughts?: boolean;
}

export class SurvivorMinds {
  readonly hooks: { say: (w: SimWorld, who: SurvivorId, what: string, ctx?: Record<string, unknown>) => void; choose: (w: SimWorld, who: SurvivorId, menu: MenuItem[]) => string | undefined; aiDecides: (w: SimWorld) => boolean };
  minds!: Minds;
  private id = "";
  private listeners: ((f: ServerFrame) => void)[] = [];
  private air = new Map<string, Air>();
  private queue: Line[] = [];
  private seq = 0;
  private writing = 0;
  private lastSaid = new Map<SurvivorId, number>();
  private recent = new Map<SurvivorId, string[]>();
  private picks = new Map<SurvivorId, Pick>();
  private asks = new Map<SurvivorId, Ask>();
  private jobSince = new Map<SurvivorId, number>();
  private asking = 0;
  private rng = new Rng(1);
  private _need: string | null = "the start";
  /** when the last big moment happened (a goal set before it is reconsidered) */
  private needAt = 0;
  private get need(): string | null { return this._need; }
  private set need(v: string | null) { this._need = v; if (v) this.needAt = this.w?.t ?? 0; }
  private goalAsk = new Map<SurvivorId, number>();
  private goaling = false;
  private lastMeeting = -Infinity;
  private meeting = false;
  plan: GroupPlan | null = null;
  private follow: Record<string, number> = { rick: 3 };
  private outSince = new Map<SurvivorId, number>();
  private lastFoodDays = Infinity;
  private dirty = false;
  private savedAt = 0;
  private lastPump = -Infinity;
  private w: SimWorld | null = null;
  stats = { said: 0, dropped: 0, echoes: 0, choicesAsked: 0, choicesTaken: 0, choicesFailed: 0, thinksAi: 0, thinksCode: 0, goalsAsked: 0, goalsSet: 0, decided: 0, meetings: 0, thoughts: 0, thoughtsWritten: 0, thoughtsDropped: 0 };
  /** the share counter's buckets: start (sim ms) → ai / code thinks */
  private shareBuckets: { at: number; ai: number; code: number }[] = [];
  private lastDecide = new Map<SurvivorId, number>();
  private lastDecideAny = -Infinity;
  /** per survivor: what their last caption was about, and the reasons they've given lately */
  private lastDecideOf = new Map<SurvivorId, { kind?: string; room?: number; at: number }>();
  private reasons = new Map<SurvivorId, string[]>();
  /** an objective step (everyone) or a find of their own: the goal it may have been about is looked at again */
  private goalBumpAll = -Infinity;
  private goalBump = new Map<SurvivorId, number>();
  // ---- the thoughts (THINK) ----
  private thoughts = new Map<SurvivorId, Thought>();
  private thinkDue = new Map<SurvivorId, number>();
  private thinkPulled = new Set<SurvivorId>();
  private thinkLast = new Map<SurvivorId, number>();
  private thinkRecent = new Map<SurvivorId, string[]>();
  private lastMoment = new Map<SurvivorId, { t: number; situation: string }>();
  private thinking = 0;
  private thinkId = "";
  private thinkCheck = -Infinity;
  private thinkRng = new Rng(2);
  /** every thought shown (src model|code; `pull` = a model one brought forward by a moment or a
   *  change; `load` = lines + thoughts being written when it was asked for) — the harness reads it */
  readonly thinkLog: { t: number; who: SurvivorId; src: "model" | "code"; pull: boolean; text: string; load?: number }[] = [];
  /** the last lines said (the admin's readout, the harness) */
  readonly log: { t: number; who: SurvivorId; room: string; prio: Prio; meeting: boolean; text: string }[] = [];

  constructor(private o: MindsOptions) {
    this.hooks = {
      say: (w, who, what, ctx) => this.moment(w, who, what, ctx ?? {}),
      choose: (w, who, menu) => this.choose(w, who, menu),
      aiDecides: () => this.active(),
    };
  }

  /** Is the layer talking right now? */
  active(): boolean { return this.o.allowed() && this.o.model.up(); }

  /** The model for the stream's recap (recap.ts) while the layer is talking; null = its plain words. */
  recapModel(): TalkModel | null { return this.active() ? this.o.model : null; }

  onFrame(cb: (f: ServerFrame) => void): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter((x) => x !== cb); };
  }

  status(): MindsStatus {
    return {
      active: this.active(), allowed: this.o.allowed(), modelUp: this.o.model.up(), configured: this.o.model.configured?.() ?? true,
      ...this.stats, share: this.share(), goals: this.goalTexts(), writing: this.writing, thinking: this.thinking, plan: this.plan, leader: this.leader(), follow: { ...this.follow },
    };
  }

  // ---- the world this mind belongs to ------------------------------------------------------------

  /** Write the memories now if anything changed (the broadcast's save — a deploy mustn't lose the last
   *  few minutes of what they heard and thought). */
  saveNow(): void {
    if (!this.dirty || !this.id) return;
    saveMinds(this.o.kv, this.id, this.minds);
    this.dirty = false;
    if (this.w) this.savedAt = this.w.t;
  }

  /** Bind to a world (and its memories), keyed by the world's RUN id (SimWorld.run): a restart that
   *  resumes the same run picks its memories up again; a different run — a reset — starts fresh. */
  private bind(w: SimWorld): void {
    const id = w.run;
    if (this.w === w && this.id === id) return;
    this.w = w;
    this.id = id;
    this.minds = loadMinds(this.o.kv, id);
    this.air.clear(); this.queue = []; this.picks.clear(); this.asks.clear(); this.lastSaid.clear(); this.recent.clear(); this.log.length = 0;
    this.rng = new Rng((w.seed ^ 0x5a17c0de) >>> 0);
    this.need = "the start"; this.lastMeeting = -Infinity; this.meeting = false; this.plan = null;
    this.follow = { rick: 3 };
    this.outSince.clear(); this.lastFoodDays = Infinity;
    this.opened = false;
  }
  /** the show's first line has been asked for (once a world) */
  private opened = false;

  private surv(w: SimWorld, who: SurvivorId): Survivor | undefined { return w.survivors.find((s) => s.who === who); }
  private roomKey(s: Survivor): string { return s.room >= 0 ? `r${s.room}` : `f${s.floor}:${Math.round(s.x / 12)}:${Math.round(s.z / 12)}`; }
  private nm = (who: string): string => SHEETS[who as SurvivorId]?.short ?? who;

  // ---- STRANGERS UNTIL THEY MEET (BUNKER.md follow-up 30; the Nov 12 2026 review) --------------------------------
  // The sim knows who has met whom (Survivor.met: "the stranger" on the job menu until then). The prompts didn't:
  // THE OTHERS listed the whole cast by name, FACTS said "Johanna: you don't know where they are", and the sheets
  // (written for the old show) name each other — so Rick, alone, twelve seconds in, set himself the goal "Find
  // Johanna, Dale, and the others", and Rollo called "Ben, Sarah, anybody out there?" down an empty hall.
  // Three layers: what's built for a survivor leaves the unmet out (about(), facts.ts); every prompt is VEILED on
  // its way out (a name that slipped through becomes "a stranger"); and a line, goal or reason naming somebody
  // they haven't met is refused coming back.
  /** every name a survivor has no way to know: the cast they haven't met (short name, first name, id) */
  private unmet(s: Survivor): string[] {
    const out: string[] = [];
    for (const who of Object.keys(SHEETS) as SurvivorId[]) {
      if (who === s.who || s.met?.has(who)) continue;
      const sh = SHEETS[who];
      for (const n of [sh?.short, sh?.name?.split(" ")[0], who[0].toUpperCase() + who.slice(1)]) if (n && n.length > 2 && !out.includes(n)) out.push(n);
    }
    return out;
  }
  private unmetRe(s: Survivor): RegExp | null {
    const names = this.unmet(s);
    return names.length ? new RegExp(`\\b(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b('s)?`, "g") : null;
  }
  /** what a survivor calls somebody: their name once they've met */
  private call(s: Survivor, who: string): string { return s.met?.has(who as SurvivorId) || who === s.who ? this.nm(who) : "somebody you haven't met"; }
  /** a prompt for `s`, with anybody they haven't met left nameless */
  private veil(s: Survivor, text: string): string {
    const re = this.unmetRe(s);
    return re ? text.replace(re, (_m, pos) => (pos ? "a stranger's" : "a stranger")) : text;
  }
  /** does this text (a line, a goal, a reason) name somebody `s` hasn't met? */
  namesUnmet(s: Survivor, text: string): boolean { const re = this.unmetRe(s); return !!re && re.test(text); }
  /** their own sheet: a sentence about somebody they haven't met yet is left out until they have */
  private sheetOf(s: Survivor): string {
    const re = this.unmetRe(s);
    const sheet = SHEETS[s.who].sheet;
    if (!re) return sheet;
    return sheet.split("\n").map((line) => line.split(/(?<=[.!?])\s+/).filter((x) => { re.lastIndex = 0; return !re.test(x); }).join(" ")).filter((l) => l.trim()).join("\n");
  }

  // ---- frames in (from the sim) ------------------------------------------------------------------

  /** Every frame the sim makes passes here (show.ts): deaths and bites are moments too. */
  onSimFrame(w: SimWorld, f: ServerFrame): void {
    if (f.type !== "ev" || !this.active()) return;
    this.bind(w);
    if (f.event === "door.sealed" || f.event === "bunker.clear" || f.event === "radio.fixed") this.goalBumpAll = w.t;
    else if ((f.event === "keycard.found" || f.event === "part.found" || f.event === "note.read") && typeof f.by === "string" && f.by.startsWith("s:")) this.goalBump.set(f.by.slice(2) as SurvivorId, w.t);
    const victim = typeof f.victim === "string" && f.victim.startsWith("s:") ? (f.victim.slice(2) as SurvivorId) : null;
    if (!victim) return;
    const v = this.surv(w, victim);
    if (!v) return;
    if (f.event === "survivor.dead") {
      this.need = `${this.nm(victim)}'s death`;
      // (to the ones in earshot: the rest find out when they see the body or are told — knowledge.ts)
      for (const s of w.survivors) if (s.alive && s !== v && nearby(s, v)) remember.event(this.minds[s.who], w.t, `${this.call(s, victim)} died.`);
      // the one nearest them who's awake says it
      const wit = w.survivors.filter((s) => s.alive && s.mode !== "sleep" && s.mode !== "down" && nearby(s, v)).sort((a, b) => (this.minds[b.who].regard[victim] ?? 0) - (this.minds[a.who].regard[victim] ?? 0))[0];
      if (wit) {
        this.momentThought(w, wit.who, 0, `${this.call(wit, victim)} just DIED, right in front of you.`);
        this.line(w, wit, 0, `${this.call(wit, victim)} just DIED, right in front of you.`, { to: undefined });
      }
    } else if (f.event === "survivor.bitten") {
      remember.event(this.minds[victim], w.t, "You were bitten.");
      this.momentThought(w, victim, 0, "You just got BITTEN.");
      const others = w.survivors.some((s) => s !== v && s.alive && s.mode !== "sleep" && nearby(v, s));
      if (!others) { this.line(w, v, 1, "You just got BITTEN, and nobody saw it. You're alone.", {}); return; }
      // a bite somebody SAW is known already; otherwise owning up is the survivor's own call
      if (v.infected && v.infKnown) {
        remember.event(this.minds[victim], w.t, "You told them you were bitten.");
        this.line(w, v, 0, "You just got BITTEN. Tell the others straight — you're bit.", {});
        return;
      }
      void this.decideBite(w, v);
    } else if (f.event === "survivor.down") {
      this.need = `${this.nm(victim)} going down`;
      this.momentThought(w, victim, 0, "You just went DOWN — you're on the floor, bleeding out.");
    }
  }

  /** A bite nobody saw: tell them now, or hide it. The model decides; a model that can't answer leaves it to
   *  the honesty gene as before. Owning up later is on their job menu ("tell the others you've been bitten"). */
  private async decideBite(w: SimWorld, v: Survivor): Promise<void> {
    const { system } = this.prompt(w, v, "", undefined);
    const facts = factsText(w, v.who);
    const pick = await pickChecked(this.o.model, system,
      `FACTS:\n${facts.map((l) => `- ${l}`).join("\n")}\n\nYou just got BITTEN, and nobody saw it happen. Bitten people turn. Do you tell the others now, or hide it? It's your call.\n\nYOUR OPTIONS:\n- a: tell them now\n- b: hide it — say it's a scratch, or nothing\n\nPick one. Then say why you picked it, in a few words: the reason for THAT choice and no other.`,
      ["a", "b"], TALK.MODEL_TIMEOUT_MS).catch(() => null);
    if (this.w !== w || !v.alive) return;
    const tell = pick ? pick.id === "a" : this.rng.next() < ownUpChance(v.gen);
    if (pick) remember.choice(this.minds[v.who], w.t, tell ? "tell them about the bite" : "hide the bite", pick.why);
    if (tell && pick) this.decided(w, v, "confess", "tell the others they've been bitten", pick.why);
    if (tell) {
      if (v.infected && !v.infKnown) { reveal(w, v, "told"); return; }   // the sim's "confess" moment says it
      remember.event(this.minds[v.who], w.t, "You told them you were bitten.");
      this.line(w, v, 0, "You just got BITTEN. Tell the others straight — you're bit.", {});
      return;
    }
    remember.event(this.minds[v.who], w.t, "You hid the bite.");
    this.line(w, v, 0, "You just got BITTEN, and you're NOT going to tell them. Cover it — say it's a scratch, or nothing, and keep moving. Don't say the word bitten.", {});
  }

  /** WHAT THEY DO TO EACH OTHER (sim/social.ts): a gift warms, a theft — caught — costs dearly. */
  private social(w: SimWorld, s: Survivor, what: string, ctx: Record<string, unknown>): boolean {
    const nudge = (a: SurvivorId, b: SurvivorId, d: number) => { const m = this.minds[a]; m.regard[b] = Math.max(-100, Math.min(100, (m.regard[b] ?? 0) + d)); };
    if (what === "give") {
      const to = ctx.to as SurvivorId, thing = String(ctx.what);
      const o = this.surv(w, to);
      remember.event(this.minds[s.who], w.t, `You gave ${this.nm(to)} some of your ${thing}.`);
      if (!o) return true;
      nudge(to, s.who, 8);
      remember.event(this.minds[to], w.t, `${this.nm(s.who)} gave you some of their ${thing}.`);
      this.line(w, o, 1, `${this.nm(s.who)} just gave you some of their ${thing}.`, { to: s.who });
      this.dirty = true;
      return true;
    }
    if (what === "steal") {
      const from = ctx.from as SurvivorId, thing = String(ctx.what);
      const seenBy = (Array.isArray(ctx.seenBy) ? ctx.seenBy : []) as SurvivorId[];
      const caught = !!ctx.noticed;
      remember.event(this.minds[s.who], w.t, `You stole ${this.nm(from)}'s ${thing}${caught ? " — and they caught you" : seenBy.length ? " — and somebody saw" : " — nobody saw"}.`);
      this.momentThought(w, s.who, 1, `You just stole ${this.nm(from)}'s ${thing}${caught ? ", and they caught you at it" : ""}.`);
      const o = this.surv(w, from);
      if (caught && o) {
        nudge(from, s.who, -25);
        remember.event(this.minds[from], w.t, `${this.nm(s.who)} stole your ${thing}. You caught them at it.`);
        this.momentThought(w, from, 0, `You just caught ${this.nm(s.who)} stealing your ${thing}.`);
        this.line(w, o, 0, `You just caught ${this.nm(s.who)} stealing your ${thing}.`, { to: s.who });
      }
      for (const b of seenBy) {
        nudge(b, s.who, -12);
        remember.event(this.minds[b], w.t, `You saw ${this.nm(s.who)} steal ${this.nm(from)}'s ${thing}.`);
      }
      const wit = !caught && seenBy.map((b) => this.surv(w, b)).find(Boolean);
      if (wit) this.line(w, wit, 1, `You just saw ${this.nm(s.who)} steal ${this.nm(from)}'s ${thing}${o?.mode === "sleep" ? " while they slept" : ""}.`, {});
      this.dirty = true;
      return true;
    }
    // TURNING ON ONE OF THEIR OWN (sim survivor.ts attackStep): the victim and everyone who saw it turn on them
    if (what === "attack" || what === "killed" || what === "downed") {
      const victim = ctx.victim as SurvivorId;
      const seenBy = (Array.isArray(ctx.seenBy) ? ctx.seenBy : []) as SurvivorId[];
      const v = this.surv(w, victim);
      if (what === "downed") {
        remember.event(this.minds[s.who], w.t, `You put ${this.nm(victim)} down.`);
        this.need = `${this.nm(s.who)} putting ${this.nm(victim)} down`;
        this.dirty = true;
        return true;
      }
      const kill = what === "killed";
      remember.event(this.minds[s.who], w.t, kill ? `You killed ${this.nm(victim)}.` : `You attacked ${this.nm(victim)}.`);
      this.momentThought(w, s.who, 0, kill ? `You just killed ${this.nm(victim)}.` : `You just went for ${this.nm(victim)}.`);
      for (const b of seenBy) {
        nudge(b, s.who, kill ? -60 : -30);
        remember.event(this.minds[b], w.t, kill ? `You saw ${this.nm(s.who)} kill ${this.nm(victim)}.` : `You saw ${this.nm(s.who)} attack ${this.nm(victim)}.`);
      }
      if (!kill && v) {
        nudge(victim, s.who, -40);
        remember.event(this.minds[victim], w.t, `${this.nm(s.who)} attacked you.`);
        this.momentThought(w, victim, 0, `${this.nm(s.who)} just ATTACKED you.`);
        this.line(w, v, 0, `${this.nm(s.who)} just ATTACKED you — one of your own.`, { to: s.who });
      }
      const wit = seenBy.map((b) => this.surv(w, b)).find((b) => b && b.alive);
      if (wit && kill) this.line(w, wit, 0, `You just watched ${this.nm(s.who)} KILL ${this.nm(victim)}.`, {});
      this.need = kill ? `${this.nm(s.who)} killing ${this.nm(victim)}` : `${this.nm(s.who)} attacking ${this.nm(victim)}`;
      this.dirty = true;
      return true;
    }
    return false;
  }

  // ---- hooks.say ---------------------------------------------------------------------------------

  private moment(w: SimWorld, who: SurvivorId, what: string, ctx: Record<string, unknown>): void {
    if (!this.active()) return;
    this.bind(w);
    const s = this.surv(w, who);
    if (!s || !s.alive || s.player) return;
    if (this.social(w, s, what, ctx)) return;
    const m = MOMENT[what];
    if (!m) return;
    if (["keycard", "power", "plan", "down"].includes(what)) this.need = what === "plan" ? "the plan to push on" : what;
    const situation = m.say(ctx, this.nm);
    this.momentThought(w, who, m.p, situation);
    remember.event(this.minds[who], w.t, situation.replace(/^You('ve| just)? ?/i, "").slice(0, 120));
    if (what === "sleep") this.maybeDiary(w, s);
    if (what === "chat") {
      const other = typeof ctx.with === "string" ? (ctx.with as SurvivorId) : undefined;
      this.line(w, s, 2, situation, { to: other, reply: other });
      return;
    }
    this.line(w, s, m.p, situation, {});
  }

  /** Ask for one line; it joins its room's queue when written. */
  private line(w: SimWorld, s: Survivor, prio: Prio, situation: string, o: { to?: SurvivorId; reply?: SurvivorId; heard?: string; meeting?: boolean; ex?: number; alone?: boolean; then?: (w: SimWorld, said: string) => void; fail?: () => void }): boolean {
    if (!canSpeak(s) || (s.mode === "sleep" && !situation.includes("turning in"))) return false;
    const room = this.roomKey(s);
    const ex = o.ex ?? 1;
    // a line nobody prompted (idle chat, a quiet moment) starts a conversation: one a minute or two per room
    const starts = prio === 2 && !o.heard && !o.meeting;
    if (starts && w.t < (this.idleNext.get(room) ?? -Infinity)) return false;
    if (!o.meeting) {
      if (prio > 0 && w.t - (this.lastSaid.get(s.who) ?? -Infinity) < TALK.SURVIVOR_GAP_MS) return false;
      if (this.writing + this.thinking >= TALK.MAX_WRITING && prio > 0) { this.stats.dropped++; return false; }
      const a = this.air.get(room);
      if (prio > 0 && a && a.said.filter((t) => w.t - t < 60_000).length >= TALK.ROOM_PER_MIN) { this.stats.dropped++; return false; }
      // idle talk waits for a quiet room: nothing being written or queued there already
      if (prio === 2 && (this.queue.some((q) => q.room === room) || this.writingIn.has(room))) return false;
      // idle talk needs somebody to hear it (muttering to yourself doesn't)
      if (prio === 2 && !o.alone && !w.survivors.some((x) => nearby(s, x) && x.mode !== "sleep")) return false;
    }
    if (starts) { const [lo, hi] = TALK.IDLE_GAP_MS; this.idleNext.set(room, w.t + lo + this.rng.next() * (hi - lo)); }
    const { system, user } = this.prompt(w, s, situation, o.to, o.heard);
    const t = w.t, who = s.who;
    this.writing++;
    this.writingIn.set(room, (this.writingIn.get(room) ?? 0) + 1);
    void writeChecked(this.o.model, system, user, SHEETS[who].name, this.recent.get(who) ?? [], TALK.MODEL_TIMEOUT_MS,
      { refuse: (text) => (this.namesUnmet(s, text) ? "it used the name of somebody you haven't met — you don't know anyone's name until you've met them" : null),
        said: this.saidLately(w), names: this.castNames() })
      .catch(() => null)
      .then((text) => {
        this.writing--;
        const n = (this.writingIn.get(room) ?? 1) - 1;
        if (n > 0) this.writingIn.set(room, n); else this.writingIn.delete(room);
        if (!text || this.w !== w) { if (!text) this.stats.dropped++; o.fail?.(); return; }
        this.queue.push({
          who, prio, t, room, to: o.to, text, meeting: o.meeting, seq: ++this.seq, fail: o.fail, ex,
          after: o.then ?? (o.alone ? undefined : o.reply ? (ww, said) => this.answer(ww, o.reply!, who, said, ex) : (ww, said) => this.maybeReply(ww, who, prio, said, ex)),
        });
      });
    return true;
  }
  private writingIn = new Map<string, number>();
  /** what has been said on the show lately, by anybody (the audience has heard all of it) — a speaker’s own lines too:
   *  the house’s check only reads their opening words, and one of them shouted the same thing three grabs running */
  private saidLately(w: SimWorld): string[] {
    return this.log.filter((l) => l.t >= w.t - TALK.ECHO_MS).map((l) => l.text);
  }
  /** what everybody but `who` has said since `since` */
  private saidByOthers(w: SimWorld, who: SurvivorId, since: number): string[] {
    return this.log.filter((l) => l.who !== who && l.t >= since).map((l) => l.text);
  }
  private castNames(): string[] { return (Object.keys(SHEETS) as SurvivorId[]).map((k) => SHEETS[k].short); }
  /** per room: the soonest a new idle conversation may start (IDLE_GAP_MS) */
  private idleNext = new Map<string, number>();
  /** per survivor: the soonest they may mutter to themselves (MUTTER_MS) */
  private mutterNext = new Map<SurvivorId, number>();
  /** THE FLOOR AFTER THE VOICE (show.ts): a room whose last line is still waiting for its voice, or still
   *  being spoken, is busy in WALL time. The sim's own hold is a guess at the length; this is the real one. */
  private floorBusy: ((room: string) => boolean) | null = null;
  setFloorGate(gate: (room: string) => boolean): void { this.floorBusy = gate; }
  /** the room key a survivor's lines are paced by */
  roomOf(w: SimWorld, by: string): string { const s = w.survivors.find((x) => x.id === by); return s ? this.roomKey(s) : by; }

  /** A listener answers (an exchange: chat's reply, or a reaction to a big line). */
  private answer(w: SimWorld, who: SurvivorId, to: SurvivorId, said: string, ex = 1): void {
    if (ex >= TALK.EXCHANGE_MAX) return;
    const s = this.surv(w, who), o = this.surv(w, to);
    if (!s || !o || !s.alive || s.mode === "sleep" || s.mode === "down" || !nearby(s, o)) return;
    this.line(w, s, 2, `${this.nm(to)} just said to you: "${said}" Answer them.`, { to, heard: `${this.nm(to)}: ${said}`, meeting: false, ex: ex + 1 });
  }
  private maybeReply(w: SimWorld, who: SurvivorId, prio: Prio, said: string, ex = 1): void {
    if (ex >= TALK.EXCHANGE_MAX) return;
    if (this.rng.next() >= (ex >= 2 ? TALK.EXCHANGE_ODDS : TALK.REPLY_ODDS[prio])) return;
    const s = this.surv(w, who);
    if (!s) return;
    const ls = w.survivors.filter((x) => x.alive && x.mode !== "sleep" && x.mode !== "down" && nearby(s, x));
    if (!ls.length) return;
    ls.sort((a, b) => (this.minds[b.who].regard[who] ?? 0) - (this.minds[a.who].regard[who] ?? 0));
    const l = ls[0];
    this.lastSaid.set(l.who, -Infinity);   // an answer isn't held back by their own gap
    this.line(w, l, prio === 0 ? 1 : 2, `${this.nm(who)} just said: "${said}" React to it, to them.`, { to: who, heard: `${this.nm(who)}: ${said}`, ex: ex + 1 });
  }

  // ---- the prompt --------------------------------------------------------------------------------

  /** System: who they are + how they feel + what they remember. User: FACTS + what was just said +
   *  the moment. Nothing else of the world. */
  prompt(w: SimWorld, s: Survivor, situation: string, to?: SurvivorId, heard?: string): { system: string; user: string } {
    const system = this.veil(s, [this.sheetOf(s), "", worldOf(s.who), "", RULES].join("\n") + "\n\n" + this.about(w, s, false).filter(Boolean).join("\n\n"));
    const facts = factsText(w, s.who);
    const lately = this.lately(w, s, heard);
    const user = [
      `FACTS:\n${facts.map((l) => `- ${l}`).join("\n")}`,
      lately.length ? `JUST SAID AROUND YOU:\n${lately.join("\n")}` : "",
      `WHAT JUST HAPPENED: ${situation}`,
      to ? `You're talking to ${this.call(s, to)}.` : "",
      "Say your line now — only the words you say out loud.",
    ].filter(Boolean).join("\n\n");
    return { system, user: this.veil(s, user) };
  }

  /** The lines heard lately (and the one just heard). */
  private lately(w: SimWorld, s: Survivor, heard?: string): string[] {
    const lately = this.minds[s.who].heard.filter((h) => w.t - h.t < 10 * 60_000).slice(-5).map((h) => `${this.call(s, h.by)}: ${h.text}`);
    if (heard && !lately.includes(heard)) lately.push(heard);
    return lately;
  }

  /** Their nature, the others, what's happened to them, the diary — the system prompt after the
   *  sheet. `hideBite`: a thought while the bite is hidden — anything naming it is left out. */
  private about(w: SimWorld, s: Survivor, hideBite: boolean): string[] {
    const mind = this.minds[s.who];
    const g = s.gen;
    // (only the ones they've met: the rest are strangers they couldn't name, or count)
    const others = w.survivors.filter((o) => o !== s && s.met?.has(o.who));
    const note = (o: SurvivorId) => { const x = mind.notes[o]; return x && !(hideBite && BITE_WORDS.test(x)) ? " " + x : ""; };
    const feel = others.length
      ? others.map((o) => `- ${this.nm(o.who)}: you ${regardWord(mind.regard[o.who] ?? 0)}.${note(o.who)}`).join("\n") + (others.length < w.survivors.length - 1 ? "\n(There may be others down here you haven't met. You don't know their names.)" : "")
      : "You haven't met anybody down here yet. You don't know who else is around, how many, or what anyone is called.";
    const last = mind.diary[mind.diary.length - 1];
    const diary = last && !(hideBite && BITE_WORDS.test(last.text)) ? `YOUR LAST DIARY ENTRY (day ${last.day}): ${last.text}` : "";
    const happened = mind.events.filter((e) => !(hideBite && BITE_WORDS.test(e.what))).slice(-6).map((e) => `- ${e.what}`).join("\n");
    const lean = [
      g.honesty <= 3 ? "You lie easily when it suits you." : g.honesty >= 8 ? "You don't lie." : "",
      g.temper >= 7 ? "You've got a short fuse." : g.temper <= 2 ? "You almost never lose your temper." : "",
      g.assertiveness >= 8 ? "You lead, and say so." : g.assertiveness <= 3 ? "You'd rather follow than lead." : "",
      g.caution <= 3 ? "You take risks." : g.caution >= 7 ? "You're careful." : "",
      gene(g, "courage") >= 8 ? "You're brave: you go in first." : gene(g, "courage") <= 2 ? "You're a coward at heart, and you know it." : "",
      gene(g, "optimism") >= 8 ? "You always think you'll make it." : gene(g, "optimism") <= 2 ? "You expect the worst." : "",
      gene(g, "humour") >= 8 ? "You joke your way through anything." : gene(g, "humour") <= 2 ? "You don't joke." : "",
      gene(g, "composure") >= 8 ? "You stay calm when everyone else panics." : gene(g, "composure") <= 2 ? "You panic easily." : "",
      gene(g, "ruthlessness") >= 8 ? "You'll do whatever it takes to live, and leave anyone behind." : gene(g, "ruthlessness") <= 2 ? "You'd never leave anyone behind." : "",
    ].filter(Boolean).join(" ");
    const sw = skillWords(s);
    const able = [
      sw.good.length ? `You're ${listWords(sw.good)}.` : "",
      sw.poor.length ? `You're ${listWords(sw.poor)}.` : "",
    ].filter(Boolean).join(" ");
    // who they've SEEN be handy at what (knowledge.ts handy) — never what they haven't seen
    const handy = [...(s.know.handy ?? new Map<string, Set<string>>())]
      .filter(([who]) => s.met?.has(who as SurvivorId) && w.survivors.some((o) => o.who === who && o.alive))
      .map(([who, set]) => `${this.nm(who)}: ${listWords([...set].map((k) => (SKILL_WORDS[k as SkillKey]?.good ?? k)))}`)
      .join("; ");
    const goal = mind.goal && !(hideBite && BITE_WORDS.test(mind.goal.text)) ? `YOUR GOAL (you set it yourself): ${mind.goal.text}` : "";
    return [
      lean ? `YOUR NATURE: ${lean}` : "",
      able ? `WHAT YOU CAN DO: ${able}` : "",
      handy ? `WHAT YOU'VE SEEN THE OTHERS DO WELL: ${handy}.` : "",
      goal,
      `THE OTHERS:\n${feel}`,
      happened ? `WHAT'S HAPPENED TO YOU LATELY:\n${happened}` : "",
      diary,
    ];
  }

  // ---- the pump (after every sim tick) -----------------------------------------------------------

  pump(w: SimWorld): void {
    this.thinkPump(w);
    if (!this.active()) { const q = this.queue; this.queue = []; for (const l of q) l.fail?.(); return; }
    this.bind(w);
    // stale lines go
    const keepQ: Line[] = [];
    for (const q of this.queue) {
      if (w.t - q.t <= (q.meeting ? TALK.MEETING_STALE_MS : TALK.STALE_MS[q.prio]) && canSpeak(this.surv(w, q.who))) keepQ.push(q);
      else { this.stats.dropped++; q.fail?.(); }
    }
    this.queue = keepQ;
    // one speaker per room: the best line waiting where the floor is free
    if (this.queue.length) {
      const rooms = new Set(this.queue.map((q) => q.room));
      for (const room of rooms) {
        const a = this.air.get(room) ?? { until: -Infinity, said: [] };
        if (w.t < a.until) continue;
        // a voice still going in the room holds everything but the urgent (a grab, a death): those cut in
        const busy = this.floorBusy?.(room) ?? false;
        // the cap holds at the moment of saying too: past it, only the urgent and a meeting go
        const full = a.said.filter((t) => w.t - t < 60_000).length >= TALK.ROOM_PER_MIN;
        const next = this.queue.filter((q) => q.room === room && (q.prio === 0 || (!busy && (!full || q.meeting)))).sort((x, y) => x.prio - y.prio || x.seq - y.seq)[0];
        if (!next) continue;
        this.queue = this.queue.filter((q) => q !== next);
        // (somebody else said it while this one was being written — two grabbed in the same breath: it isn't said twice)
        if (echoes(next.text, this.saidByOthers(w, next.who, next.t - 2_000), this.castNames())) { this.stats.dropped++; this.stats.echoes++; next.fail?.(); continue; }
        this.say(w, next, a);
        this.air.set(room, a);
      }
    }
    if (w.t - this.lastPump < 1000) return;
    this.lastPump = w.t;
    this.maybeGoal(w);
    // THE FIRST LINE OF THE SHOW: the leader, the moment there's somebody to say it to
    if (!this.opened) {
      const lead = this.surv(w, this.leader());
      if (lead?.alive && lead.mode === "job" && w.survivors.some((o) => nearby(lead, o) && o.mode !== "sleep")) {
        this.opened = true;
        this.line(w, lead, 1, w.t - w.startedAt < 30 * 60_000
          ? "You've all just made it inside this place and shut the door on the dead. Say something to the group."
          : "You're looking round at the group, taking stock. Say something to them.", {});
      }
    }
    this.watchChanges(w);
    this.maybeMutter(w);
    this.maybeMeeting(w);
    if (this.plan && w.t > this.plan.until) this.plan = null;
    if (this.dirty && w.t - this.savedAt > TALK.SAVE_MS) { saveMinds(this.o.kv, this.id, this.minds); this.dirty = false; this.savedAt = w.t; }
  }

  /** QUIET SELF-TALK: one survivor alone and calm, now and then, says a few words to nobody. */
  private maybeMutter(w: SimWorld): void {
    for (const s of w.survivors) {
      if (!canSpeak(s) || s.mode !== "job" || s.threats.length) continue;
      const next = this.mutterNext.get(s.who);
      const [lo, hi] = TALK.MUTTER_MS;
      if (next === undefined) { this.mutterNext.set(s.who, w.t + lo + this.rng.next() * (hi - lo)); continue; }
      if (w.t < next) continue;
      this.mutterNext.set(s.who, w.t + lo + this.rng.next() * (hi - lo));
      if (w.survivors.some((o) => o !== s && o.alive && nearby(s, o))) continue;
      this.line(w, s, 2, "You're on your own for a moment. Mutter a few words to yourself, quietly, the way people do when nobody's listening.", { alone: true });
      return;
    }
  }

  private say(w: SimWorld, l: Line, a: Air): void {
    const s = this.surv(w, l.who)!;
    const hold = Math.min(TALK.HOLD_MAX_MS, Math.max(TALK.HOLD_MIN_MS, l.text.length * TALK.HOLD_PER_CHAR_MS));
    a.until = w.t + hold + TALK.GAP_MS;
    a.said = a.said.filter((t) => w.t - t < 60_000);
    a.said.push(w.t);
    this.lastSaid.set(l.who, w.t);
    this.recent.set(l.who, keep(this.recent.get(l.who) ?? [], l.text));
    remember.heard(this.minds[l.who], w.t, l.who, l.text);
    for (const o of w.survivors) if (o !== s && nearby(s, o) && o.mode !== "sleep") remember.heard(this.minds[o.who], w.t, l.who, l.text);
    this.dirty = true;
    this.stats.said++;
    this.log.push({ t: w.t, who: l.who, room: l.room, prio: l.prio, meeting: !!l.meeting, text: l.text });
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
    const f: Say = { type: "say", t: w.t, by: s.id, text: l.text, ...(l.to ? { to: `s:${l.to}` } : {}) };
    for (const cb of this.listeners) cb(f);
    l.after?.(w, l.text);
  }

  // ---- the thoughts (THINK) ------------------------------------------------------------------------

  /** The thoughts on the cards now, as frames (a watcher joining mid-show gets them after the
   *  snapshot, so no card starts empty). */
  thoughtFrames(w: SimWorld): Think[] {
    if (this.thinkId !== w.run) return [];
    const out: Think[] = [];
    for (const s of w.survivors) { const th = this.thoughts.get(s.who); if (s.alive && th) out.push({ type: "think", t: th.at, by: s.id, text: th.text }); }
    return out;
  }

  /** A moment brings the next model thought forward (a grab, a death, a discovery — never chat). */
  private momentThought(w: SimWorld, who: SurvivorId, prio: Prio, situation: string): void {
    this.lastMoment.set(who, { t: w.t, situation });
    if (prio <= 1) this.pullThought(w, who);
  }
  private pullThought(w: SimWorld, who: SurvivorId): void {
    const soon = Math.max((this.thinkLast.get(who) ?? -Infinity) + THINK.MIN_MS, w.t + THINK.SOON_MS);
    if (soon < (this.thinkDue.get(who) ?? Infinity)) { this.thinkDue.set(who, soon); this.thinkPulled.add(who); }
  }

  /** THE BITTEN DECISION: is any bite a secret right now — somebody bitten whose infection the
   *  broadcast doesn't show (the overlay's rule)? While one is, NO thought names a bite: not the
   *  bitten one's (they don't even think around it — "I can't let them see this arm" is still the
   *  audience learning it from the overlay), and not a witness's ("Dale got bit, I saw it"). The
   *  bite is left out of every thought's prompt going in and refused coming out; the reveal is the
   *  story's, not the cast strip's. With no secret bite, a thought about the dead biting is fine. */
  private biteHidden(w: SimWorld): boolean { return w.survivors.some((s) => s.alive && s.bitten && !w.vitals(s).infected); }

  private showThought(w: SimWorld, s: Survivor, text: string, src: "model" | "code", key: string, pull = false, load?: number): void {
    const cur = this.thoughts.get(s.who);
    this.thoughts.set(s.who, { text, src, at: w.t, key });
    if (cur?.text === text) return;
    this.stats.thoughts++;
    this.thinkLog.push({ t: w.t, who: s.who, src, pull, text, ...(load !== undefined ? { load } : {}) });
    if (this.thinkLog.length > 2000) this.thinkLog.splice(0, this.thinkLog.length - 2000);
    const f: Think = { type: "think", t: w.t, by: s.id, text };
    for (const cb of this.listeners) cb(f);
  }

  /** Every CHECK_MS: code's thought where the card needs one, and a model thought where one's due.
   *  Reads the world, never writes it — and draws nothing from the sim's dice. */
  private thinkPump(w: SimWorld): void {
    if (!(this.o.thoughts ?? THINK.ON)) return;
    const id = w.run;
    if (id !== this.thinkId) {
      this.thinkId = id;
      this.thoughts.clear(); this.thinkDue.clear(); this.thinkPulled.clear(); this.thinkLast.clear(); this.thinkRecent.clear(); this.lastMoment.clear();
      this.thinkCheck = -Infinity;
      this.thinkRng = new Rng((w.seed ^ 0x7417c0de) >>> 0);
    }
    if (w.t - this.thinkCheck < THINK.CHECK_MS) return;
    this.thinkCheck = w.t;
    const live = this.active();
    w.survivors.forEach((s, i) => {
      if (!s.alive || s.player) { this.thoughts.delete(s.who); return; }
      if (!this.thinkDue.has(s.who)) this.thinkDue.set(s.who, w.t + THINK.FIRST_MS + i * THINK.STAGGER_MS);
      const code = codeThought(w, s);
      const cur = this.thoughts.get(s.who);
      if (!cur) this.showThought(w, s, code.text, "code", code.key);
      else if (code.key !== cur.key) {
        if (code.urgent || (cur.src === "code" && w.t - cur.at >= THINK.CODE_HOLD_MS) || (cur.src === "model" && (!live || w.t - cur.at >= THINK.MODEL_STALE_MS))) {
          this.showThought(w, s, code.text, "code", code.key);
        }
        // a danger now drives them: a fresh thought from the model soon (any other change waits for the gap)
        if (live && code.urgent && s.mode !== "sleep") this.pullThought(w, s.who);
      }
    });
    if (!live) return;
    for (const s of w.survivors) {
      if (this.thinking >= THINK.AT_ONCE || this.writing + this.thinking > TALK.MAX_WRITING - 2) break;
      if (!s.alive || s.player || s.mode === "sleep" || w.t < (this.thinkDue.get(s.who) ?? Infinity)) continue;
      this.writeThought(w, s, codeThought(w, s));
    }
  }

  /** One model thought: the sheet, THINK_RULES, their nature and memory, FACTS, what they heard and
   *  what just happened, and what drives them (code's thought). The same checks as a spoken line,
   *  shorter, and — while a bite is theirs alone — the bite left out going in and refused coming out. */
  private writeThought(w: SimWorld, s: Survivor, code: CodeThought): void {
    this.bind(w);
    const who = s.who;
    const hidden = this.biteHidden(w);
    const pull = this.thinkPulled.has(who);
    this.thinkPulled.delete(who);
    this.thinkDue.set(who, Infinity);
    const { system, user } = this.thoughtPrompt(w, s, code, hidden);
    const load = this.writing + this.thinking + 1;
    this.thinking++;
    void writeChecked(this.o.model, system, user, SHEETS[who].name, this.thinkRecent.get(who) ?? [], TALK.MODEL_TIMEOUT_MS, {
      max: THINK.MAX_CHARS, maxTokens: THINK.MAX_TOKENS,
      refuse: (x) => (hidden && BITE_WORDS.test(x) ? "keep that out of it — think about something else that's going on" : null),
    }).catch(() => null).then((text) => {
      this.thinking--;
      if (this.thinkId !== w.run) return;
      const now = this.surv(w, who);
      // a bite that went secret while it was being written: the belt and braces
      if (!text || !now?.alive || (this.biteHidden(w) && BITE_WORDS.test(text))) {
        this.stats.thoughtsDropped++;
        this.thinkDue.set(who, w.t + THINK.RETRY_MS);
        return;
      }
      this.stats.thoughtsWritten++;
      this.thinkLast.set(who, w.t);
      this.thinkPulled.delete(who);   // (a pull while it was being written: this thought answers it)
      this.thinkRecent.set(who, keep(this.thinkRecent.get(who) ?? [], text));
      const [lo, hi] = THINK.GAP_MS;
      this.thinkDue.set(who, w.t + lo + Math.floor(this.thinkRng.next() * (hi - lo)));
      this.showThought(w, now, text, "model", codeThought(w, now).key, pull, load);
    });
  }

  thoughtPrompt(w: SimWorld, s: Survivor, code: CodeThought, hidden: boolean): { system: string; user: string } {
    const sh = SHEETS[s.who];
    const system = this.veil(s, [this.sheetOf(s), worldOf(s.who), THINK_RULES, ...this.about(w, s, hidden)].filter(Boolean).join("\n\n"));
    let facts = factsText(w, s.who);
    if (hidden) facts = facts.map((l) => l.replace(/,? and you've been BITTEN \(only you know\)/, "")).filter((l) => !BITE_WORDS.test(l));
    let lately = this.lately(w, s);
    if (hidden) lately = lately.filter((l) => !BITE_WORDS.test(l));
    const m = this.lastMoment.get(s.who);
    const moment = m && w.t - m.t < THINK.MOMENT_MS && !(hidden && BITE_WORDS.test(m.situation)) ? m.situation : "";
    const pick = this.picks.get(s.who);
    const chose = pick && w.t - pick.at < TALK.PICK_HOLD_MS && !(hidden && BITE_WORDS.test(pick.why)) ?`You chose to ${pick.label}${pick.why ? ` (${pick.why})` : ""}.` : "";
    const user = [
      `FACTS:\n${facts.map((l) => `- ${l}`).join("\n")}`,
      lately.length ? `JUST SAID AROUND YOU:\n${lately.join("\n")}` : "",
      moment ? `WHAT JUST HAPPENED: ${moment}` : "",
      `WHAT'S DRIVING YOU: ${code.text}${chose ? " " + chose : ""}`,
      `Your private thought now — one line, under ${THINK.MAX_CHARS} characters, only the thought.`,
    ].filter(Boolean).join("\n\n");
    return { system, user: this.veil(s, user) };
  }

  // ---- big changes → a meeting ---------------------------------------------------------------------

  private watchChanges(w: SimWorld): void {
    for (const s of w.survivors) {
      if (!s.alive) continue;
      const safe = s.room >= 0 && w.nav.rooms[s.room].kind === "safe";
      if (!safe) { if (!this.outSince.has(s.who)) this.outSince.set(s.who, w.t); continue; }
      const out = this.outSince.get(s.who);
      if (out !== undefined && w.t - out >= TALK.RUN_MS) this.need = `${this.nm(s.who)} getting back from a run`;
      this.outSince.delete(s.who);
    }
    const days = w.supplies().foodDays;
    if (days < 2 && this.lastFoodDays >= 2) this.need = "food running low";
    this.lastFoodDays = days;
  }

  private leader(): SurvivorId {
    const w = this.w;
    let best: SurvivorId = "rick", bv = -Infinity;
    for (const s of w?.survivors ?? []) {
      if (!s.alive) continue;
      const v = (this.follow[s.who] ?? 0) * 10 + s.gen.assertiveness;
      if (v > bv) { bv = v; best = s.who; }
    }
    return best;
  }

  private maybeMeeting(w: SimWorld): void {
    if (!TALK.MEETINGS || this.meeting || !this.need || w.t - this.lastMeeting < TALK.MEETING_GAP_MS) return;
    const alive = w.survivors.filter((s) => s.alive);
    const awake = alive.filter((s) => s.mode !== "sleep" && s.mode !== "down");
    if (awake.length < TALK.MEETING_MIN) return;
    const room = awake[0].room;
    if (room < 0 || w.nav.rooms[room].kind !== "safe") return;
    if (!awake.every((s) => s.room === room && (s.mode === "job" || s.mode === "sleep"))) return;
    const why = this.need;
    this.need = null;
    this.lastMeeting = w.t;
    this.meeting = true;
    this.stats.meetings++;
    void this.runMeeting(w, awake, why).catch(() => null).finally(() => { this.meeting = false; });
  }

  /** The plans code can build from what they know. */
  plans(w: SimWorld, present: Survivor[]): GroupPlan[] {
    // a way on that nobody's been through, as the leader knows it
    const unseen = (factsFor(w, this.leader())?.doors ?? []).some((d) => d.to === "unknown" || / needs /.test(d.state));
    const fit = present.filter((s) => s.hp >= 55 && s.tiredH < 16).sort((a, b) => (fitness(b) - fitness(a)));
    const leader = this.leader();
    const mk = (kind: GroupPlan["kind"], label: string, goers: Survivor[], role: "go-explore" | "go-scavenge"): GroupPlan => {
      const roles: GroupPlan["roles"] = {};
      for (const s of present) roles[s.who] = goers.includes(s) ? role : "stay";
      return { kind, label, roles, leader, at: w.t, until: w.t + TALK.PLAN_MS, refused: [] };
    };
    const out: GroupPlan[] = [];
    if (unseen && fit.length >= 2) {
      const team = fit.slice(0, Math.min(3, fit.length - (present.length > 3 ? 1 : 0)));
      out.push(mk("push", `push deeper into the facility — ${team.map((s) => this.nm(s.who)).join(", ")} go, the rest hold the safe room`, team, "go-explore"));
    }
    if (fit.length >= 1) {
      const team = fit.slice(0, 2);
      out.push(mk("scavenge", `a supply run back through the rooms we know — ${team.map((s) => this.nm(s.who)).join(" and ")} go`, team, "go-scavenge"));
    }
    out.push(mk("hold", "stay put: rest, eat, patch up and keep watch in turns", [], "go-explore"));
    return out;
  }

  private async runMeeting(w: SimWorld, present: Survivor[], why: string): Promise<void> {
    const plans = this.plans(w, present);
    const lead = this.surv(w, this.leader()) ?? present[0];
    const letters = plans.map((_, i) => String.fromCharCode(97 + i));
    const { system } = this.prompt(w, lead, "", undefined);
    const facts = factsText(w, lead.who);
    const menuText = plans.map((p, i) => `- ${letters[i]}: ${p.label}`).join("\n");
    // the leader picks which plan to put to them (a choice code built), with a few words of why
    const pick = await pickChecked(this.o.model, system,
      `FACTS:\n${facts.map((l) => `- ${l}`).join("\n")}\n\nThe group is together in the safe room after ${why}. You're the one they look to. Which plan do you put to them?\n\nTHE PLANS:\n${menuText}\n\nPick one. Then say why you picked it, in a few words: the reason for THAT choice and no other.`,
      letters, TALK.MODEL_TIMEOUT_MS);
    if (this.w !== w) return;
    let plan = plans[pick ? letters.indexOf(pick.id) : 0];
    remember.choice(this.minds[lead.who], w.t, `proposed: ${plan.label}`, pick?.why ?? "");
    const said: string[] = [];
    const speak = (s: Survivor, situation: string): Promise<string | null> => new Promise((resolve) => {
      const ok = this.line(w, s, 1, situation, { meeting: true, heard: said.slice(-3).join("\n"), then: (_ww, text) => resolve(text) });
      if (!ok) resolve(null);
      // a line that never makes it (dropped, stale) resolves on the next beat
      setTimeout(() => resolve(null), TALK.MODEL_TIMEOUT_MS * 3).unref?.();
    });
    const t1 = await speak(lead, `The group is together in the safe room after ${why}. Put your plan to them, as their leader: ${plan.label}.`);
    if (t1) said.push(`${this.nm(lead.who)}: ${t1}`);
    // each of the others: accept or argue (the genes roll it; the model only voices it)
    const stance: { s: Survivor; agree: boolean; counter: GroupPlan | null }[] = [];
    for (const s of present) {
      if (s === lead) continue;
      const agree = this.rng.next() < acceptPlan(s.gen, this.minds[s.who].regard[lead.who] ?? 0);
      let counter: GroupPlan | null = null;
      if (!agree && this.rng.next() < proposeChance(s.gen)) {
        // the plan their nature leans to
        const want: GroupPlan["kind"] = s.gen.caution >= 6 || s.hp < 55 ? "hold" : s.gen.curiosity >= 6 || s.gen.caution <= 3 ? "push" : "scavenge";
        counter = plans.find((p) => p.kind === want && p !== plan) ?? plans.find((p) => p !== plan) ?? null;
      }
      stance.push({ s, agree, counter });
      const how = agree ? "You AGREE with it — say so in your own way."
        : counter ? `You DON'T like it, and you say what you'd do instead: ${counter.label}.`
          : "You DON'T like it — push back, say why.";
      const t = await speak(s, `${this.nm(lead.who)} just put a plan to the group: ${plan.label}. ${how}`);
      if (t) said.push(`${this.nm(s.who)}: ${t}`);
      if (!agree) this.minds[s.who].regard[lead.who] = Math.max(-100, (this.minds[s.who].regard[lead.who] ?? 0) - 3);
      if (this.w !== w) return;
    }
    // a counter-plan with more people behind it than the leader's wins that call
    const agreeN = 1 + stance.filter((x) => x.agree).length;
    const counters = new Map<GroupPlan, { by: Survivor; n: number }>();
    for (const x of stance) if (x.counter) { const c = counters.get(x.counter) ?? { by: x.s, n: 0 }; c.n++; counters.set(x.counter, c); }
    for (const x of stance) if (!x.agree && !x.counter) for (const [p, c] of counters) if (p.kind === "hold" ? x.s.gen.caution >= 5 : x.s.gen.caution < 5) { c.n++; break; }
    let winner = lead;
    for (const [p, c] of counters) if (c.n > agreeN) { plan = { ...p, leader: c.by.who }; winner = c.by; }
    this.follow[winner.who] = (this.follow[winner.who] ?? 0) + 1;
    if (winner !== lead) this.follow[lead.who] = Math.max(0, (this.follow[lead.who] ?? 0) - 1);
    plan.refused = stance.filter((x) => !x.agree && plan.kind !== x.counter?.kind).map((x) => x.s.who);
    if (winner !== lead) plan.refused = plan.refused.filter((r) => r !== winner.who);
    const t3 = await speak(winner, winner === lead
      ? `Settle it — the group goes with your plan: ${plan.label}. Say it's decided.`
      : `The group backed YOUR plan over ${this.nm(lead.who)}'s: ${plan.label}. Say it's decided.`);
    if (t3) said.push(`${this.nm(winner.who)}: ${t3}`);
    this.plan = plan;
    this.needAt = w.t;   // a plan: everybody reconsiders what they're after
    for (const s of present) remember.event(this.minds[s.who], w.t, `A meeting after ${why}: the group went with ${plan.leader === s.who ? "your" : `${this.nm(plan.leader)}'s`} plan — ${plan.label}.${plan.refused.includes(s.who) ? " You didn't go along with it." : ""}`);
    this.dirty = true;
  }

  // ---- hooks.choose ------------------------------------------------------------------------------

  /** Every think goes through here while the model is up: the held pick, a wait for an answer, or —
   *  only when the model can't answer — code's. */
  private choose(w: SimWorld, who: SurvivorId, menu: MenuItem[]): string | undefined {
    if (!this.active() || menu.length < 2) return undefined;
    this.bind(w);
    const s = this.surv(w, who);
    if (!s || !s.alive || s.mode !== "job") return undefined;
    const ids = menu.map((m) => m.id);
    const sig = [...ids].sort().join("|");
    // the job they're on, and when it began (a job that ended leaves its start behind)
    const since = s.job?.since ?? this.jobSince.get(who) ?? -Infinity;
    this.jobSince.set(who, since);
    const ended = !s.job || w.t >= s.job.until;
    const a = this.asks.get(who) ?? { at: -Infinity, inflight: false, failUntil: -Infinity, queuedAt: -Infinity };
    this.asks.set(who, a);
    const code = (): undefined => { this.stats.thinksCode++; this.count(w, false); return undefined; };
    const p = this.picks.get(who);
    const standing = p && ids.includes(p.id) && w.t - p.at < TALK.PICK_HOLD_MS ? p : undefined;
    // what they picked stands — unless the job it became is over, or the menu changed and it's been a while
    const fresh = standing && !(ended && standing.at <= since) && (standing.sig === sig || w.t - a.at < TALK.RECONSIDER_MS);
    if (a.inflight) return w.t - a.at < TALK.WAIT_MS ? CHOICE_WAIT : fresh ? this.ai(w, standing.id) : code();
    if (fresh) return this.ai(w, standing.id);
    // SEARCHING A ROOM IS ONE DECISION: the container they chose is done, and the room has more
    if (p && ended && p.kind === "loot" && p.room !== undefined && w.t - p.at < TALK.ROOM_SEARCH_MS && this.needAt <= p.at) {
      const next = menu.find((m) => m.kind === "loot" && m.room === p.room);
      if (next) { this.picks.set(who, { ...p, id: next.id, label: labelFor(next), sig }); return this.ai(w, next.id); }
    }
    if (w.t < a.failUntil || w.t - a.at < TALK.MIN_ASK_MS) return standing ? this.ai(w, standing.id) : code();
    // the brain's slots are full: wait a beat for one
    if (this.asking >= TALK.MAX_ASKS) {
      if (a.queuedAt < 0 || a.queuedAt < a.at) a.queuedAt = w.t;
      return w.t - a.queuedAt < TALK.WAIT_MS ? CHOICE_WAIT : standing ? this.ai(w, standing.id) : code();
    }
    this.ask(w, s, menu, sig, a);
    return CHOICE_WAIT;
  }

  private ai(w: SimWorld, id: string): string { this.stats.thinksAi++; this.count(w, true); return id; }

  /** THE SHARE COUNTER: every think into a five-minute bucket, an hour of them kept. */
  private count(w: SimWorld, ai: boolean): void {
    const at = Math.floor(w.t / TALK.SHARE_BUCKET_MS) * TALK.SHARE_BUCKET_MS;
    let b = this.shareBuckets[this.shareBuckets.length - 1];
    if (!b || b.at !== at) {
      b = { at, ai: 0, code: 0 };
      this.shareBuckets.push(b);
      const keep = Math.ceil(TALK.SHARE_WINDOW_MS / TALK.SHARE_BUCKET_MS);
      if (this.shareBuckets.length > keep) this.shareBuckets.splice(0, this.shareBuckets.length - keep);
    }
    if (ai) b.ai++; else b.code++;
  }
  private share(): { ai: number; code: number; pct: number | null } {
    const now = this.w?.t ?? 0;
    let ai = 0, code = 0;
    for (const b of this.shareBuckets) if (now - b.at < TALK.SHARE_WINDOW_MS) { ai += b.ai; code += b.code; }
    return { ai, code, pct: ai + code ? Math.round((ai / (ai + code)) * 1000) / 10 : null };
  }

  /** THE CAPTION (phase 4): a choice the model made, on screen with their reason — after the reason has
   *  been read a second time for THE LINE, and never a bite the screen doesn't show. "Keep at it" isn't news. */
  private decided(w: SimWorld, s: Survivor, id: string, did: string, why: string, about: { kind?: string; room?: number } = {}): void {
    const social = /^(give|steal|attack|finish|confess)\b/.test(id);
    if (!social) {
      if (w.t - (this.lastDecide.get(s.who) ?? -Infinity) < TALK.DECIDE_GAP_MS || w.t - this.lastDecideAny < TALK.DECIDE_ANY_GAP_MS) return;
      const last = this.lastDecideOf.get(s.who);
      if (last && about.kind && last.kind === about.kind && last.room === about.room && w.t - last.at < TALK.DECIDE_SAME_MS) return;
    }
    // (a reason that names somebody they haven't met, or the one they gave last time, isn't shown: the choice is)
    if (why && (this.namesUnmet(s, why) || alike(why, this.reasons.get(s.who) ?? []))) why = "";
    if (why) { const r = this.reasons.get(s.who) ?? []; r.push(why); if (r.length > 4) r.shift(); this.reasons.set(s.who, r); }

    if (this.biteHidden(w) && id !== "confess") {
      if (BITE_WORDS.test(did)) return;
      if (BITE_WORDS.test(why)) why = "";
    }
    this.lastDecide.set(s.who, w.t);
    if (!social) { this.lastDecideAny = w.t; this.lastDecideOf.set(s.who, { kind: about.kind, room: about.room, at: w.t }); }
    const at = w.t;
    const send = (reason: string) => {
      if (this.w !== w || !canSpeak(s)) return;
      const f: Decide = { type: "decide", t: at, by: s.id, did, reason, ...(social ? { kind: "social" as const } : {}) };
      this.stats.decided++;
      for (const cb of this.listeners) cb(f);
    };
    if (!why) { send(""); return; }
    void holdsLine(this.o.model, why, TALK.MODEL_TIMEOUT_MS).catch(() => false).then((ok) => send(ok ? why : ""));
  }

  /** THE PRODUCER'S NUDGE (Admin Panel → Survivorz → Show, a test run only): a goal set for a survivor, or a thought
   *  put in their head (it's in what they remember, so it steers their next choices). THE LINE is checked here; the
   *  admin wrote it, so it goes on the card at once. Returns false for nobody, the dead, or an unfit text. */
  nudge(w: SimWorld, who: SurvivorId, kind: "goal" | "thought", text: string): boolean {
    this.bind(w);
    const s = w.survivors.find((x) => x.who === who);
    const m = this.minds?.[who];
    const t = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, TALK.GOAL_CHARS);
    if (!s || !s.alive || !m || t.length < 3 || crossesLine(t)) return false;
    if (kind === "goal") {
      remember.goal(m, w.t, t, "the producer's nudge");
      remember.event(m, w.t, `You set yourself a goal: ${t}`);
      m.goal!.screen = true;
      const f: Goal = { type: "goal", t: w.t, by: s.id, text: t };
      for (const cb of this.listeners) cb(f);
    } else {
      remember.event(m, w.t, `A thought keeps coming back to you: ${t}`);
      const f: Think = { type: "think", t: w.t, by: s.id, text: t };
      for (const cb of this.listeners) cb(f);
    }
    this.dirty = true;
    return true;
  }

  /** Their goals as they stand, for a watcher who joins mid-show (only the ones read twice). */
  goalFrames(w: SimWorld): Goal[] {
    if (!this.minds) return [];
    const hidden = this.biteHidden(w);
    const out: Goal[] = [];
    for (const s of w.survivors) {
      const g = this.minds[s.who]?.goal;
      if (s.alive && g?.screen && !(hidden && BITE_WORDS.test(g.text))) out.push({ type: "goal", t: g.at, by: s.id, text: g.text });
    }
    return out;
  }

  private ask(w: SimWorld, s: Survivor, menu: MenuItem[], sig: string, a: Ask): void {
    const who = s.who;
    a.at = w.t; a.inflight = true; a.queuedAt = -Infinity;
    this.asking++;
    this.stats.choicesAsked++;
    const letters = menu.map((_, i) => String.fromCharCode(97 + i));
    const labels = menu.map((m) => labelFor(m) + (m.current ? " (what you're doing now)" : ""));
    const { system } = this.prompt(w, s, "", undefined);
    const facts = factsText(w, who);
    const doing = s.job && w.t < s.job.until ? "Keep at what you're doing, or do something else?" : "You've finished what you were doing. What do you do NEXT?";
    const plan = this.planPart(w, s) + (this.minds[who].goal ? " Your own goal is in what you know about yourself: pick what serves it, or what you'd rather do right now." : "");
    const user = `FACTS:\n${facts.map((l) => `- ${l}`).join("\n")}\n\n${plan ? plan + "\n\n" : ""}${doing} It's your call, as yourself — nobody's going to make it for you, and it may get you killed.\n\nYOUR OPTIONS:\n${menu.map((_, i) => `- ${letters[i]}: ${labels[i]}`).join("\n")}\n\nPick one. Then say why you picked it, in a few words: the reason for THAT choice and no other.`;
    void pickChecked(this.o.model, system, this.veil(s, user), letters, TALK.MODEL_TIMEOUT_MS).catch(() => null).then((r) => {
      a.inflight = false;
      this.asking = Math.max(0, this.asking - 1);
      if (this.w !== w) return;
      if (!r) { a.failUntil = w.t + TALK.FAIL_MS; this.stats.choicesFailed++; return; }
      const i = letters.indexOf(r.id);
      this.picks.set(who, { id: menu[i].id, at: w.t, why: r.why, label: labelFor(menu[i]), sig, kind: menu[i].kind, room: menu[i].room });
      remember.choice(this.minds[who], w.t, labelFor(menu[i]), r.why);
      this.stats.choicesTaken++;
      if (!menu[i].current) this.decided(w, s, menu[i].id, labelFor(menu[i]), r.why, { kind: menu[i].kind, room: menu[i].room });
      this.dirty = true;
    });
  }

  private goalTexts(): Record<string, string> {
    const out: Record<string, string> = {};
    if (this.minds) for (const [who, m] of Object.entries(this.minds)) if (m?.goal) out[who] = m.goal.text;
    return out;
  }

  /** THEIR OWN GOALS (Nov 2026): one at a time across the cast, a survivor whose goal is missing, old, or
   *  older than the last big moment sets one in their own words. It rides every prompt after (about()),
   *  so the choices that follow serve it — code never reads it. */
  private maybeGoal(w: SimWorld): void {
    if (this.goaling || this.asking >= TALK.MAX_ASKS) return;
    const due = w.survivors.filter((s) => {
      if (!s.alive || s.player || s.mode === "sleep" || s.mode === "down") return false;
      if (w.t - (this.goalAsk.get(s.who) ?? -Infinity) < TALK.GOAL_MIN_MS) return false;
      const g = this.minds[s.who]?.goal;
      return !g || w.t - g.at > TALK.GOAL_MS || this.needAt > g.at || Math.max(this.goalBumpAll, this.goalBump.get(s.who) ?? -Infinity) > g.at;
    });
    if (!due.length) return;
    const s = due.sort((a, b) => (this.minds[a.who].goal?.at ?? -1) - (this.minds[b.who].goal?.at ?? -1))[0];
    this.goalAsk.set(s.who, w.t);
    this.goaling = true;
    this.stats.goalsAsked++;
    const { system } = this.prompt(w, s, "", undefined);
    const facts = factsText(w, s.who);
    const plan = this.planPart(w, s);
    const old = this.minds[s.who].goal;
    const user = [
      `FACTS:\n${facts.map((l) => `- ${l}`).join("\n")}`,
      plan,
      old ? `Your goal until now: ${old.text}. If it's done, or can't be done any more, set a new one; keep it only if it's still what you're after.` : "You haven't set yourself a goal yet.",
      `What are YOU trying to get done next, tonight? One goal, in your own words, under ${TALK.GOAL_CHARS} characters. It's yours: getting out, finding something, keeping someone alive, looking after yourself, getting away from someone — whatever you'd really be after. Only places and things you know about. Answer in JSON: "goal", and "why" in a few words.`,
    ].filter(Boolean).join("\n\n");
    const schema = { type: "object", properties: { goal: { type: "string" }, why: { type: "string" } }, required: ["goal", "why"] };
    void this.o.model.ask([{ role: "system", content: system }, { role: "user", content: this.veil(s, user) }], { maxTokens: 120, temperature: 0.7, format: schema, signal: AbortSignal.timeout(TALK.MODEL_TIMEOUT_MS * 2) })
      .then((raw) => {
        if (!raw || this.w !== w) return;
        let j: { goal?: unknown; why?: unknown } = {};
        try { j = JSON.parse(raw); } catch { return; }
        const clean = (v: unknown, n: number) => String(v ?? "").replace(/[*`#"]/g, "").replace(/\s+/g, " ").trim().slice(0, n);
        const goal = clean(j.goal, TALK.GOAL_CHARS), why = clean(j.why, 160);
        if (goal.length < 4 || crossesLine(goal) || crossesLine(why) || this.namesUnseen(w, s, goal) || this.namesUnmet(s, goal)) return;
        if (old?.text === goal) { old.at = w.t; this.dirty = true; return; }
        remember.goal(this.minds[s.who], w.t, goal, why);
        remember.event(this.minds[s.who], w.t, `You set yourself a goal: ${goal}`);
        this.stats.goalsSet++;
        this.dirty = true;
        // the cast card shows it once THE LINE has been read a second time (fails closed)
        const g = this.minds[s.who].goal!;
        void holdsLine(this.o.model, goal, TALK.MODEL_TIMEOUT_MS).catch(() => false).then((ok) => {
          if (this.w !== w || this.minds[s.who].goal !== g || !s.alive) return;
          if (ok) { g.screen = true; this.dirty = true; }
          // an unfit goal clears the card (the old one would be a lie now)
          const text = ok && !(this.biteHidden(w) && BITE_WORDS.test(goal)) ? goal : "";
          const f: Goal = { type: "goal", t: g.at, by: s.id, text };
          for (const cb of this.listeners) cb(f);
        });
      })
      .catch(() => null)
      .finally(() => { this.goaling = false; });
  }

  /** A room name the survivor has never seen (the model guessing one): such a goal is dropped. */
  private namesUnseen(w: SimWorld, s: Survivor, text: string): boolean {
    const known = new Set<string>();
    for (let r = 0; r < w.nav.rooms.length; r++) if (s.know?.room[r] || r === s.room) known.add(w.nav.rooms[r].name);
    for (const R of w.nav.rooms) if (R.name && !known.has(R.name) && text.includes(R.name)) return true;
    return false;
  }

  /** The group's plan, as something they know — never an order code carries out for them. */
  private planPart(w: SimWorld, s: Survivor): string {
    const p = this.plan;
    if (!p || w.t > p.until) return "";
    const role = p.roles[s.who];
    if (!role) return "";
    const part = role === "go-explore" ? "you're one of the ones going out to push on" : role === "go-scavenge" ? "you're one of the ones going on the supply run" : "you stay in the safe room and hold it";
    const whose = p.leader === s.who ? "your plan" : `${this.nm(p.leader)}'s plan`;
    return `THE GROUP'S PLAN (${whose}, from the meeting): ${p.label}. Your part: ${part}.${p.refused.includes(s.who) ? " You argued against it." : ""} Whether you stick to it is up to you.`;
  }

  // ---- the diary (at the main sleep) -------------------------------------------------------------

  private maybeDiary(w: SimWorld, s: Survivor): void {
    const mind = this.minds[s.who];
    if (w.t - mind.diaryAt < TALK.DIARY_GAP_MS && mind.diaryAt) return;
    if (this.writing + this.thinking >= TALK.MAX_WRITING) return;
    mind.diaryAt = w.t;
    const others = w.survivors.filter((o) => o !== s).map((o) => o.who);
    const names = others.map((o) => this.nm(o));
    const system = `You keep ${SHEETS[s.who].name}'s private diary and private notes about the others, in the zombie outbreak, in a sealed facility. Answer in JSON: "diary": a few lines (under 400 characters) in ${SHEETS[s.who].short}'s own first-person voice about today; "notes": for each person, one short line (under ${NOTE_CHARS} characters) of what ${SHEETS[s.who].short} now thinks of them and remembers about them — keep what still matters from the old notes. Only what's in what you're given: never invent a place, a find or an event.`;
    const user = [
      `OLD NOTES:\n${names.map((n, i) => `${n}: ${mind.notes[others[i]] ?? "(none)"}`).join("\n")}`,
      `WHAT HAPPENED:\n${mind.events.slice(-16).map((e) => `- ${e.what}`).join("\n") || "- a quiet day"}`,
      `WHAT WAS SAID:\n${mind.heard.slice(-12).map((h) => `${this.nm(h.by)}: ${h.text}`).join("\n") || "(not much)"}`,
      `CHOICES YOU MADE:\n${mind.choices.slice(-6).map((c) => `- ${c.label}${c.why ? ` (${c.why})` : ""}`).join("\n") || "(none)"}`,
    ].join("\n\n");
    const schema = { type: "object", properties: { diary: { type: "string" }, notes: { type: "object", properties: Object.fromEntries(names.map((n) => [n, { type: "string" }])) } }, required: ["diary", "notes"] };
    this.writing++;
    void this.o.model.ask([{ role: "system", content: system }, { role: "user", content: user }], { maxTokens: 400, temperature: 0.5, format: schema, signal: AbortSignal.timeout(30_000) })
      .then(async (raw) => {
        if (!raw || this.w !== w) return;
        let j: { diary?: unknown; notes?: Record<string, unknown> } = {};
        try { j = JSON.parse(raw); } catch { return; }
        const clean = (v: unknown, n: number) => String(v ?? "").replace(/[*`#]/g, "").replace(/\s+/g, " ").trim().slice(0, n);
        const diary = clean(j.diary, 500);
        if (diary && (await holdsLine(this.o.model, diary, 15_000))) remember.diary(mind, w.t, w.day(), diary);
        for (let i = 0; i < others.length; i++) {
          const n = clean(j.notes?.[names[i]], NOTE_CHARS);
          if (n && !/\bas an ai\b|language model/i.test(n)) mind.notes[others[i]] = n;
        }
        this.dirty = true;
      })
      .catch(() => null)
      .finally(() => { this.writing--; });
  }
}
