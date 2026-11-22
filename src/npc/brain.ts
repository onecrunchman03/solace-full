// THE HOUSE'S BRAINS — the conversation layer (Josh, Oct 2026).
//
// Josh: "a local model that will bring to life sterling, dr Ada, and chosen
// people lender" — and, on what they should refuse, "limiting their
// responses to irrelevant things such as people asking stuff that npcs based
// off their lore wouldnt know" (decided: in-character refusals; DMs and
// @mentions; the GPU on slopbot is theirs).
//
// WHAT THIS IS — a NEW layer beside the three bots, not a replacement:
//   · /sterling, /goblins and /ada are untouched. Commands run first, in the
//     same chain, and a command is never sent to the model. The exact
//     figures stay in code.
//   · A DM to any of the three, an @mention of one in a channel, or a reply
//     to one of their messages gets an answer written by the model.
//   · Everything else — an ordinary message nobody addressed — is answered
//     by NOBODY, the same rule test_three_voices has always pinned.
//
// THE MODEL TALKS, THE SERVER DECIDES. The model cannot move a coin: it has
// no tools, and every number it may quote arrives as FACTS (facts.ts). Every
// reply passes the checks in guard.ts before anyone sees it, and anything
// that fails — or a model that is slow, down or switched off — falls back to
// a scripted line in the character's own voice. Nothing that works today
// depends on slopbot being up.
//
// ORDER OF OPERATIONS for one message:
//   1. who is addressed, and may this person ask (rate limit, switch, bot)
//   2. THE GATE — one short call sorting the message (chat / another
//      character's subject / outside Solace / manipulation / abuse / distress)
//   3. abuse and distress get a scripted line; never a generated one
//   4. the reply, written with the character sheet + FACTS + recent history
//   5. the checks; one retry with the reason; else a scripted line
//   6. posted as a reply to the message that asked

import type { Store } from "../db/store";
import type { Bus } from "../bus";
import type { Channel, DmMessage, Message, User } from "../types";
import { config } from "../config";
import { makeRateLimiter } from "../http";
import { heartbeat } from "../health";
import { postAs } from "../goblins";
import { withReply } from "../routes/dm";
import { AFFINITY_TONE, CHARACTERS, GOBLIN_TONE, VENUES, characterByUsername, systemPrompt, type NpcId, type Character } from "./characters";
import { factsFor, type Scope } from "./facts";
import { GATE_SCHEMA, addressedNpc, checkReply, gatePrompt, modeLine, numbersIn, parseGate, type Kind, replyLinePrompt } from "./guard";
import { BrainUnavailable, NUM_CTX, brainConfigured, chat, endpointState, endpoints, type ChatOpts, type ChatTurn, type Endpoint } from "./ollama";
import { pickLore } from "./lore";
import { researchFor } from "./research";
import { AffinityKeeper, TIERS, TRUSTED_TIER, hasMeter, isAffinityNpc } from "./affinity";
import { MemoryKeeper, mayReadNotes } from "./memory";
import { setVoicer, type VoiceOpts } from "./voice";
import { TALISMAN_CODE } from "../wheel";

/** Per person, across all three: a conversation, not a firehose. */
export const ASK_PER_MIN = Number(process.env.NPC_ASK_PER_MIN ?? 6);
export const ASK_PER_HOUR = Number(process.env.NPC_ASK_PER_HOUR ?? 60);
/** At most this many replies being written at once; past it, "busy". The
 *  26B serves four at a time (OLLAMA_NUM_PARALLEL=4 on the workstation), so
 *  eight lets four queue behind them. */
export const MAX_INFLIGHT = 8;
/** A message longer than this is cut before the model sees it. */
export const MAX_INPUT = 800;
/** Reply caps: a channel is shared space, a DM is a conversation. */
export const MAX_CHANNEL_CHARS = 600;
export const MAX_DM_CHARS = 1200;
/** History shown with each message. */
const DM_HISTORY = 10;
const CHANNEL_HISTORY = 8;

/** Background voice work (rewrites, bubble batches) at once. */
export const BG_MAX = 3;
/** Counter talk: lines per batch, and how soon a fresh batch may be written. */
export const BUBBLE_COUNT = 6;
export const BUBBLE_FRESH_MS = Number(process.env.NPC_BUBBLE_FRESH_MS ?? 180_000);
const BUBBLE_SCHEMA = {
  type: "object",
  properties: { lines: { type: "array", items: { type: "string" } } },
  required: ["lines"],
};

/** Leading @everyone / emoji stay exactly as they were: they're part of how
 *  the message is delivered (a ping, a bell), not part of what is said —
 *  and the reply checks strip a bare @everyone. */
export function splitPrefix(brief: string): { prefix: string; body: string } {
  const m = brief.match(/^(?:(?:@everyone|@here|[\p{Extended_Pictographic}\u{FE0F}\u{200D}]+)\s*)+/u);
  const prefix = m ? m[0] : "";
  return { prefix, body: brief.slice(prefix.length) };
}

/** Make a prompt fit an endpoint's window: past it, Ollama silently drops the
 *  START — the character sheet. Oldest history goes first; the system prompt
 *  and the newest message always stay. (~3 characters a token, pessimistic.) */
export function fitTurns(turns: ChatTurn[], numCtx: number, maxTokens: number): ChatTurn[] {
  const budget = (numCtx - maxTokens - 150) * 3;
  const out = [...turns];
  const size = () => out.reduce((n, t) => n + t.content.length + 20, 0);
  while (size() > budget && out.length > 2) {
    const i = out.findIndex((t) => t.role !== "system");
    if (i < 0 || i === out.length - 1) break;
    out.splice(i, 1);
  }
  return out;
}

/** Every figure of 10 or more in the brief survives into the rewrite —
 *  a price, a percentage, a pot. (Smaller ones may become words.) */
export function figuresKept(brief: string, out: string): boolean {
  const have = new Set(numbersIn(out));
  // Small figures count too (Oct 2026 review — "3 days" could come back as
  // "5 days"): a one-to-nine survives as its digit or its word.
  return numbersIn(brief).every((n) => {
    const v = Number(n);
    if (v >= 10) return have.has(n);
    if (!Number.isInteger(v) || v < 1) return true;
    return have.has(n) || new RegExp(`\\b${SMALL_WORDS[v]}\\b`, "i").test(out);
  });
}
const SMALL_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** A required name, matched as a whole word — "Al" is not inside "always"
 *  (Oct 2026 review). */
export function hasWord(text: string, word: string): boolean {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c);
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

/** Rollo's notes and conversation line, asked for as one JSON object. */
const REMEMBER_SCHEMA = {
  type: "object",
  properties: { notes: { type: "string" }, gist: { type: "string" } },
  required: ["notes", "gist"],
};

/** The admin's off switch lives in app_kv so it survives a restart. */
export const OFF_KEY = "npc_brain_off";

const TYPING_EVERY_MS = 3_000;
/** How often each engine is checked (and warmed). The big one comes back
 *  from game mode within this plus its load time. */
const HEALTH_MS = Number(process.env.NPC_HEALTH_MS ?? 30_000);


const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

interface Job {
  npc: NpcId;
  user: User;
  text: string;
  /** Where the reply goes. */
  target: { kind: "channel"; channel: Channel; messageId: number } | { kind: "dm"; conversationId: number; messageId: number };
  /** Appended to a model-written reply — a bare /sterling still points at
   *  its help list (THE WAY IN IS DISCOVERABLE). */
  suffix?: string;
}

/** What a bare /sterling, /goblins or /ada has always ended with. */
const HELP_POINTER: Record<NpcId, string> = {
  sterling: "\n\n/sterling help — everything I can do for you.",
  goblins: "\n\n/goblins help — the full list of our services, such as they are.",
  voss: "\n\n/ada help — the list of what I answer.",
  rollo: "",
  duke: "",
  tasha: "",
  chase: "",
};

export interface BrainStats {
  asked: number;
  answered: number;
  scripted: number;
  rejected: number;
  timeouts: number;
  errors: number;
  limited: number;
  byKind: Record<Kind, number>;
  lastLatencyMs: number | null;
  avgLatencyMs: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  /** Briefs said in the character's words / briefs kept as written. */
  voiced: number;
  voiceKept: number;
  /** Counter-bubble batches written. */
  bubbles: number;
}

export class NpcBrain {
  private bots: Record<NpcId, User>;
  private botIds: Set<number>;
  private inflight = 0;
  /** One reply at a time per (person, character); a burst collapses to the
   *  newest message once the current reply is out. */
  private lanes = new Map<string, { busy: boolean; next: Job | null }>();
  private limiter = makeRateLimiter();
  /** Scripted-notice throttles: one "slow down" a minute, one "away" an hour. */
  private noticed = new Map<string, number>();
  private online = false;
  stats: BrainStats = {
    asked: 0, answered: 0, scripted: 0, rejected: 0, timeouts: 0, errors: 0, limited: 0,
    byKind: { chat: 0, other: 0, outside: 0, manipulation: 0, abuse: 0, distress: 0, forbidden: 0 },
    lastLatencyMs: null, avgLatencyMs: null, lastError: null, lastErrorAt: null,
    voiced: 0, voiceKept: 0, bubbles: 0,
  };
  /** Background work — rewrites and counter-bubble batches — gets its own
   *  small allowance, so a quiet floor's chatter can never queue ahead of a
   *  person waiting on a DM. Past it, the scripted line is used. */
  private bgInflight = 0;
  private bubbleCache = new Map<string, { lines: string[]; sig: string; at: number }>();

  constructor(private store: Store, private bus: Bus, private affinity: AffinityKeeper | null = null) {
    const bots = {} as Record<NpcId, User>;
    for (const id of Object.keys(CHARACTERS) as NpcId[]) {
      const u = store.getUserByUsername(CHARACTERS[id].username);
      if (!u) throw new Error(`npc brain: bot row "${CHARACTERS[id].username}" missing`);
      bots[id] = u;
    }
    this.bots = bots;
    this.botIds = new Set(Object.values(bots).map((u) => u.id));
    this.memory = new MemoryKeeper(
      store,
      Object.fromEntries((Object.keys(bots) as NpcId[]).map((id) => [id, bots[id].id])) as Record<NpcId, number>,
      () => ({ enabled: this.enabled() && this.online, busy: this.inflight >= 2 }),
      (turns, opts) => this.ask("background", turns, opts),
    );
    // Everything else the three say runs through here from now on (voice.ts).
    setVoicer({ rewrite: (npc, brief, opts) => this.rewrite(npc, brief, opts), available: () => this.voiceUp() });
  }

  /** What the three remember (memory.ts) — public for the routes. */
  readonly memory: MemoryKeeper;

  /** Configured AND not switched off by the admin. This is the HOUSE's switch: Sterling, Dr. Voss,
   *  the goblins and the floor's regulars. Survivorz needs only the engine (showUp). */
  enabled(): boolean {
    // (archived Nov 17 2026, config.npcHouseAi: the house never asks the model; the show still does)
    return config.npcHouseAi && brainConfigured() && this.store.kvGet(OFF_KEY) !== "1";
  }

  /** The engines are configured, whatever the house switch says. The Survivorz show runs on this,
   *  so the house can go back to its scripted lines for the show's month while the survivors keep
   *  the whole GPU (Josh, Nov 1 2026: "turning off AI in solace … all gpu resources to the show"). */
  engineOn(): boolean {
    return brainConfigured();
  }

  /** What the show's talk layer reads: an engine configured and loaded. */
  showUp(): boolean {
    return this.engineOn() && this.online;
  }

  setEnabled(on: boolean): void {
    this.store.kvSet(OFF_KEY, on ? "0" : "1");
  }

  status() {
    return {
      configured: brainConfigured(),
      houseAi: config.npcHouseAi,
      enabled: this.enabled(),
      online: this.online,
      model: config.npcBrainModel,
      inflight: this.inflight,
      stats: this.stats,
      // Each engine and what it's doing now (the big one comes and goes).
      engines: this.eps.map((e) => ({
        name: e.name,
        model: e.model,
        reachable: this.health.get(e.name)?.reachable ?? null,
        loaded: this.health.get(e.name)?.loaded ?? false,
      })),
    };
  }

  // ---- VOICE: everything else they say (voice.ts) -------------------------

  /** Up and switched on — what `voiceAvailable()` reports. */
  voiceUp(): boolean {
    return this.enabled() && this.online;
  }

  /** The brief, said in the character's own words — or the brief unchanged
   *  if anything at all is off. Every figure (10 and over) and every `must`
   *  word has to survive; nothing new may be invented. */
  async rewrite(npc: NpcId, brief: string, opts: VoiceOpts): Promise<string> {
    if (!this.voiceUp() || this.bgInflight >= BG_MAX || this.inflight >= MAX_INFLIGHT) return this.kept(brief);
    const { prefix, body } = splitPrefix(brief);
    if (!body.trim()) return brief;
    const c = CHARACTERS[npc];
    const scope = opts.scope ?? "public";
    const u = opts.userId != null ? this.store.getUserById(opts.userId) : undefined;
    const facts = u && scope === "private" ? factsFor(this.store, npc, u, "private") : "";
    const tone = npc === "goblins" && u ? this.goblinTone(u) : "";
    const system = [
      systemPrompt(c),
      facts,
      tone,
      `YOUR TASK: the message below is what you mean to say — ${opts.situation}. Say it again in your own words, as ${c.name} would, so it never reads the same way twice. Keep its meaning exactly: who did what, every name, and every figure as written in digits. Do not reinterpret it, explain it, or add any offer, price, fact or figure that isn't in it. About the same length or shorter. Write only the message itself.`,
    ]
      .filter(Boolean)
      .join("\n\n");
    this.bgInflight++;
    let raw: string;
    try {
      raw = await this.ask(
        "background",
        [
          { role: "system", content: system },
          { role: "user", content: body },
        ],
        { maxTokens: Math.max(80, Math.min(500, Math.round(body.length / 2.5) + 60)), temperature: 0.9, signal: AbortSignal.timeout(15_000) },
      );
    } catch {
      return this.kept(brief);
    } finally {
      this.bgInflight--;
    }
    // A word the BRIEF already uses can't be forbidden in its rewrite: Dr.
    // Voss's correction notice says the seam is "not a dial", and her
    // forbidden list (the retired vocabulary) would otherwise reject every
    // faithful rewrite of it.
    const allowed = { ...c, forbidden: c.forbidden.filter((re) => !re.test(brief)) };
    const checked = checkReply(raw, allowed, {
      // THE BRIEF'S FIGURES ONLY — not the facts'. A rewrite is a restatement:
      // given his facts, a talisman-trade reaction came back offering to buy
      // a mythic for 500,000 (that's what he SELLS one for), and the number
      // passed because it was real. A real figure in the wrong sentence is
      // still a lie.
      known: brief,
      maxChars: Math.max(400, Math.round(body.length * 1.6)),
      maskedGoblins: !!opts.masked,
      maskAllow: brief,
    });
    if (!checked.ok || !figuresKept(body, checked.text)) return this.kept(brief);
    const lower = checked.text.toLowerCase();
    if ((opts.must ?? []).some((w) => w && !hasWord(lower, w))) return this.kept(brief);
    this.stats.voiced++;
    return prefix + checked.text;
  }

  /** A REACTION, written from WHAT HAPPENED — never a blind paraphrase. A
   *  short quip can't be restated by a model that doesn't know the joke
   *  ("Try to bring it back unmelted" came back as "return it in its melted
   *  state"), so the counter says what just happened and the quip is only an
   *  example of the register. Any figure must come from the event. */
  async react(npc: NpcId, venue: string, u: User, event: string, example: string): Promise<string> {
    const where = VENUES[npc][venue];
    if (!where || !this.voiceUp() || this.bgInflight >= BG_MAX || this.inflight >= MAX_INFLIGHT) return this.kept(example);
    const c = CHARACTERS[npc];
    const name = u.displayName || u.username;
    const system = [
      systemPrompt(c),
      factsFor(this.store, npc, u, "private"),
      npc === "goblins" ? this.goblinTone(u) : "",
      `SETTING: you are ${where}, and ${name} is in front of you. Your words appear in a speech bubble only ${name} sees.`,
      `WHAT ${name.toUpperCase()} JUST DID: ${event}.`,
      `YOUR TASK: react to it in ONE short line, under 20 words, as ${c.name} would. Stay true to what happened; add no offer, price or fact. A figure may only be one from what just happened, in digits. For the register, here is the kind of thing you'd say — write a new line, don't copy it: "${example}"`,
    ]
      .filter(Boolean)
      .join("\n\n");
    this.bgInflight++;
    let raw: string;
    try {
      raw = await this.ask("background", [{ role: "system", content: system }, { role: "user", content: "Your line." }], {
        maxTokens: 70,
        temperature: 0.9,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return this.kept(example);
    } finally {
      this.bgInflight--;
    }
    const checked = checkReply(raw, c, {
      known: [event, example].join("\n"),
      maxChars: 200,
      maskedGoblins: npc === "goblins" && this.goblinsMasked(u),
      maskAllow: event,
    });
    if (!checked.ok) return this.kept(example);
    this.stats.voiced++;
    return checked.text;
  }

  private kept(brief: string): string {
    this.stats.voiceKept++;
    return brief;
  }

  /** COUNTER TALK: a batch of short lines one of the three might say to this
   *  person at this venue — the speech bubble over Sterling's counter, the
   *  bar, Dr. Voss's desk, the goblins' kiosk. Private: the bubble is drawn
   *  in that person's own client, so their own facts may shape it. Cached
   *  per (person, character, venue) until their situation changes, and a
   *  fresh batch at most every BUBBLE_FRESH_MS. null = use the scripted pool. */
  async bubbles(npc: NpcId, venue: string, u: User, fresh: boolean): Promise<string[] | null> {
    const where = VENUES[npc][venue];
    if (!where || !this.voiceUp()) return null;
    const key = `${u.id}:${npc}:${venue}`;
    const sig = this.situationSig(npc, u);
    const cached = this.bubbleCache.get(key);
    if (cached && cached.sig === sig && (!fresh || Date.now() - cached.at < BUBBLE_FRESH_MS)) return cached.lines;
    if (this.bgInflight >= BG_MAX || this.inflight >= MAX_INFLIGHT) return cached?.lines ?? null;
    const c = CHARACTERS[npc];
    const name = u.displayName || u.username;
    const facts = factsFor(this.store, npc, u, "private");
    const system = [
      systemPrompt(c),
      facts,
      npc === "goblins" ? this.goblinTone(u) : "",
      `SETTING: you are ${where}. ${name} is in front of you. These lines appear in a speech bubble above your head; only ${name} sees them.`,
      `YOUR TASK: write ${BUBBLE_COUNT} different short things you might say to ${name} right now, one at a time over the next few minutes. Each is one or two sentences, under 25 words, and stands on its own. Vary them: a greeting, a remark about your corner of Solace, an opinion, a bit of personality, and at most ONE line that touches ${name}'s own situation in FACTS (any figure in digits, exactly as in FACTS). Don't recite their balance. Use ${name}'s name in at most two of them.`,
    ]
      .filter(Boolean)
      .join("\n\n");
    this.bgInflight++;
    let raw: string;
    try {
      raw = await this.ask(
        "background",
        [
          { role: "system", content: system },
          { role: "user", content: `Write the ${BUBBLE_COUNT} lines.` },
        ],
        { maxTokens: 420, temperature: 0.95, format: BUBBLE_SCHEMA, signal: AbortSignal.timeout(20_000) },
      );
    } catch {
      return cached?.lines ?? null;
    } finally {
      this.bgInflight--;
    }
    let lines: string[] = [];
    try {
      const parsed = JSON.parse(raw) as { lines?: unknown };
      if (Array.isArray(parsed.lines)) lines = parsed.lines.filter((l): l is string => typeof l === "string");
    } catch {
      /* fall through to the check below */
    }
    const masked = npc === "goblins" && this.goblinsMasked(u);
    const good = lines
      .map((l) => checkReply(l, c, { known: [facts, systemPrompt(c)].join("\n"), maxChars: 220, maskedGoblins: masked }))
      .filter((r) => r.ok)
      .map((r) => r.text);
    if (good.length < 2) return cached?.lines ?? null;
    this.bubbleCache.set(key, { lines: good, sig, at: Date.now() });
    if (this.bubbleCache.size > 2_000) this.bubbleCache.clear();
    this.stats.bubbles++;
    return good;
  }

  /** What would make a fresh batch of counter talk necessary: the things the
   *  lines are likely to be about, coarsely — not the pot, which moves by
   *  the minute. */
  private situationSig(npc: NpcId, u: User): string {
    if (npc === "goblins") {
      const loan = this.store.loanOf(u.id);
      return [loan ? loan.missed : -1, u.jailedAt ? 1 : 0, this.store.goblinOffer(u.id) ? 1 : 0].join(":");
    }
    if (npc === "voss") {
      const relic = this.store.vipProgress(u.id).find((p) => p.tier === "relic");
      return [relic?.owned ?? 0].join(":");
    }
    const purse = this.store.getCoins(u.id);
    return [u.vipTier, this.store.ownsEmoji(u.id, TALISMAN_CODE) ? 1 : 0, Math.floor(Math.log10(purse + 1)), u.generation].join(":");
  }

  // ---- THE ENGINES: which endpoint does which work ---------------------------

  private readonly eps: Endpoint[] = endpoints();
  /** What each endpoint looked like at the last check (or failed request). */
  private health = new Map<Endpoint["name"], { reachable: boolean; loaded: boolean }>();
  /** Since when no engine has been loaded (null = one is). The health check
   *  reads it: with no fallback engine (Oct 13 2026), a long gap means the
   *  workstation's supervisor isn't bringing the 26B back. */
  offlineSince: number | null = Date.now();


  /** The order to try endpoints for a kind of work. CONVERSATION prefers the
   *  big engine (the bigger model is worth most where a person is talking);
   *  BACKGROUND (counter talk, voicing, memory) prefers the steady one, so the
   *  big card serves conversations. Whatever is LOADED goes first — an engine
   *  still warming would make a player wait out its load — then anything not
   *  known to be down. */
  private route(work: "talk" | "background"): Endpoint[] {
    const order = (work === "talk" ? ["big", "steady"] : ["steady", "big"]) as Endpoint["name"][];
    const eps = order.map((n) => this.eps.find((e) => e.name === n)).filter((e): e is Endpoint => !!e);
    const ready = eps.filter((e) => this.health.get(e.name)?.loaded);
    const maybe = eps.filter((e) => !ready.includes(e) && this.health.get(e.name)?.reachable !== false);
    return [...ready, ...maybe];
  }

  /** The window a conversation will most likely be answered in. */
  private talkCtx(): number {
    return this.route("talk")[0]?.numCtx ?? NUM_CTX;
  }
  /** The same, for callers sizing what they put in a prompt (Rollo's memory). */
  talkWindow(): number {
    return this.talkCtx();
  }

  /** Call a model for this kind of work. An endpoint that can't be REACHED is
   *  marked down and the next one tried at once — a player never waits on a
   *  machine that is off. Slowness is not failover: the deadline is shared. */
  private async ask(work: "talk" | "background", turns: ChatTurn[], opts: ChatOpts): Promise<string> {
    let last: unknown = new BrainUnavailable("no endpoint up", true);
    for (const ep of this.route(work)) {
      if (opts.signal?.aborted) break;
      this.busy.set(ep.name, (this.busy.get(ep.name) ?? 0) + 1);
      try {
        return await chat(ep, fitTurns(turns, ep.numCtx, opts.maxTokens), opts);
      } catch (e) {
        last = e;
        if (e instanceof BrainUnavailable && e.unreachable) {
          this.markDown(ep);
          continue;
        }
        throw e;
      } finally {
        this.busy.set(ep.name, (this.busy.get(ep.name) ?? 1) - 1);
      }
    }
    throw last;
  }
  /** Requests running on each engine right now (the timing line reads it). */
  private busy = new Map<Endpoint["name"], number>();

  private markDown(ep: Endpoint): void {
    if (this.health.get(ep.name)?.reachable !== false) console.log(`[npc] ${ep.name} engine unreachable (${ep.model} at ${ep.url}) — the other takes over`);
    this.health.set(ep.name, { reachable: false, loaded: false });
    this.online = [...this.health.values()].some((h) => h.loaded);
  }

  /** Keep the models loaded and know which are there. Off when unconfigured. */
  start(): void {
    if (!brainConfigured()) {
      console.log("[npc] brain not configured (NPC_BRAIN_URL unset) — the three stay scripted");
      return;
    }
    /** Record what an engine looks like now, and say so when it changes. */
    const record = (ep: Endpoint, state: { reachable: boolean; loaded: boolean }) => {
      const before = this.health.get(ep.name)?.loaded ?? false;
      this.health.set(ep.name, state);
      if (state.loaded !== before) console.log(`[npc] ${ep.name} engine ${state.loaded ? "ONLINE" : "OFFLINE"} (${ep.model} at ${ep.url})`);
      // Each engine counts the moment it's ready — a big model still warming
      // must not hold the steady one back.
      const was = this.online;
      this.online = [...this.health.values()].some((h) => h.loaded);
      if (this.online !== was) console.log(`[npc] brain ${this.online ? "ONLINE" : "OFFLINE"}`);
      if (this.online) this.offlineSince = null;
      else if (this.offlineSince === null) this.offlineSince = Date.now();
    };
    // ONE CHECK AT A TIME PER ENGINE: a warm-up can take minutes, and two
    // overlapping checks both used to read "unknown" and both announce it.
    const checking = new Set<Endpoint["name"]>();
    const check = async (ep: Endpoint) => {
      if (checking.has(ep.name)) return;
      checking.add(ep.name);
      try {
        let state = await endpointState(ep, AbortSignal.timeout(5_000));
        // Reachable but not loaded is recorded BEFORE the warm-up, so a
        // conversation goes to whatever IS loaded instead of waiting it out.
        record(ep, state);
        if (state.reachable && !state.loaded && this.engineOn()) {
          // Warm it: one token, so the first real question doesn't pay the
          // cold load (a minute on the 3080). keep_alive -1 keeps it there.
          try {
            await chat(ep, [{ role: "user", content: "hello" }], { maxTokens: 1, temperature: 0, signal: AbortSignal.timeout(180_000) });
          } catch { /* reported below */ }
          state = await endpointState(ep, AbortSignal.timeout(5_000));
          record(ep, state);
        }
      } finally {
        checking.delete(ep.name);
      }
    };
    const tick = async () => {
      await Promise.all(this.eps.map((ep) => check(ep)));
      heartbeat("npc-brain", HEALTH_MS * 3);
    };
    void tick();
    setInterval(() => void tick(), HEALTH_MS).unref?.();
  }

  // ---- entry points ------------------------------------------------------

  /** A channel post that no command claimed. */
  onChannelMessage(user: User, channel: Channel, message: Message): void {
    if (user.isBot || this.botIds.has(user.id)) return;
    let text = message.body.trim();
    if (!text) return;
    let npc: NpcId | null = null;
    let suffix: string | undefined;
    if (text.startsWith("/")) {
      // A /sterling, /goblins or /ada the command chain DIDN'T claim — a bare
      // greeting or something that isn't one of their commands. The chain
      // only lets those through while a model is up (voiceAvailable), so this
      // is the conversation answering instead of the scripted greeting.
      const m = text.match(/^\/(sterling|goblins|lenders|ada|voss)\b\s*([\s\S]*)$/i);
      if (!m) return;
      const word = m[1].toLowerCase();
      npc = word === "sterling" ? "sterling" : word === "ada" || word === "voss" ? "voss" : "goblins";
      if (!m[2].trim()) suffix = HELP_POINTER[npc];
      text = m[2].trim() || "Hello.";
    }
    npc ??= addressedNpc(text);
    if (!npc && message.replyToId != null) {
      const parent = this.store.getMessage(message.replyToId);
      if (parent) npc = this.npcByUserId(parent.userId);
    }
    if (!npc) return;
    // Pandora's box destroyed the goblins: nobody answers for them now.
    if (npc === "goblins" && this.store.foundryLending()) return;
    // Switched off: a mention gets what it always got — silence.
    if (!this.enabled()) return;
    this.enqueue({ npc, user, text, suffix, target: { kind: "channel", channel, messageId: message.id } });
  }

  /** A DM sent to somebody — only acts when the somebody is one of the three. */
  onDm(user: User, conversationId: number, recipientId: number | null, message: DmMessage): void {
    if (user.isBot || recipientId == null) return;
    const npc = this.npcByUserId(recipientId);
    if (!npc) return;
    if (npc === "goblins" && this.store.foundryLending()) return; // gone (Pandora's box)
    // ARCHIVED (config.npcHouseAi): a DM to one of the three is what it was before the brains — read by nobody,
    // answered by nobody. No "away" line: that line promised a conversation that no longer exists.
    if (!config.npcHouseAi) return;
    // Unconfigured (dev, every harness): exactly the old behaviour — a DM to
    // a bot is answered by nobody. The scripted "away" line is for the
    // admin's switch, where the brain exists and has been turned off.
    if (!brainConfigured()) return;
    const text = message.body.trim();
    if (!text) return;
    // The bot has "read" it — the person sees their message was received.
    const lastReadId = this.store.markDmRead(conversationId, this.bots[npc].id);
    if (lastReadId > 0) {
      this.bus.emit("dm.read", { userIds: [user.id], conversationId, userId: this.bots[npc].id, lastReadId });
    }
    const target = { kind: "dm" as const, conversationId, messageId: message.id };
    if (!this.enabled()) {
      if (this.once(`away:${user.id}:${npc}`, 3_600_000)) this.post({ npc, user, text, target }, pick(CHARACTERS[npc].lines.away));
      return;
    }
    this.enqueue({ npc, user, text, target });
  }

  // ---- the queue ---------------------------------------------------------

  // ---- SOLACE SURVIVORZ (src/survivorz/talk/) ---------------------------------------

  /** The show's survivors are not among the seven: their talk layer builds its own prompts and
   *  runs its own checks (talk/lines.ts), and only borrows the engines here — inside the brain's
   *  allowance, so the show can never queue the casino's answers out. Null when off, offline or
   *  full; the caller says nothing. Throws nothing. */
  async showAsk(turns: ChatTurn[], opts: ChatOpts): Promise<string | null> {
    if (!this.showUp()) return null;
    if (this.inflight >= MAX_INFLIGHT) return null;
    this.inflight++;
    try {
      return await this.ask("talk", turns, opts);
    } catch {
      return null;
    } finally {
      this.inflight--;
    }
  }

  private enqueue(job: Job): void {
    this.stats.asked++;
    const c = CHARACTERS[job.npc];
    const okMin = this.limiter(`npc:m:${job.user.id}`, ASK_PER_MIN, 60_000);
    const okHour = okMin && this.limiter(`npc:h:${job.user.id}`, ASK_PER_HOUR, 3_600_000);
    if (!okMin || !okHour) {
      this.stats.limited++;
      if (this.once(`slow:${job.user.id}`, 60_000)) this.post(job, pick(c.lines.slow));
      return;
    }
    const key = `${job.user.id}:${job.npc}`;
    const lane = this.lanes.get(key) ?? { busy: false, next: null };
    this.lanes.set(key, lane);
    if (lane.busy) {
      lane.next = job; // the newest message wins; the reply will cover it
      return;
    }
    void this.run(key, lane, job);
  }

  private async run(key: string, lane: { busy: boolean; next: Job | null }, job: Job): Promise<void> {
    lane.busy = true;
    try {
      if (this.inflight >= MAX_INFLIGHT) {
        this.post(job, pick(CHARACTERS[job.npc].lines.busy));
        this.stats.scripted++;
      } else {
        this.inflight++;
        try {
          await this.answer(job);
        } finally {
          this.inflight--;
        }
      }
    } finally {
      lane.busy = false;
      const next = lane.next;
      lane.next = null;
      if (next) void this.run(key, lane, next);
      else this.lanes.delete(key);
    }
  }

  // ---- one reply ---------------------------------------------------------

  private async answer(job: Job): Promise<void> {
    const c = CHARACTERS[job.npc];
    const started = Date.now();
    const signal = AbortSignal.timeout(config.npcBrainTimeoutMs);
    const stopTyping = this.typing(job);
    let outcome = "ok";
    let kindSeen = "-";
    try {
      const text = job.text.slice(0, MAX_INPUT);
      const scope: Scope = job.target.kind === "dm" ? "private" : "public";

      // Everything the reply needs is built BEFORE the gate, so the likely
      // reply (ordinary chat — most messages) is written AT THE SAME TIME as
      // the gate runs. Slopbot serves two requests at once; if the gate says
      // this isn't chat, the speculative draft is thrown away.
      const facts = factsFor(this.store, job.npc, job.user, scope, text);
      const sheet = systemPrompt(c);
      const setting = this.setting(job, scope) + (job.npc === "goblins" ? "\n" + this.goblinTone(job.user) : "");
      // WHAT THEY KNOW AND REMEMBER (lore.ts, memory.ts). The private notes
      // are read ONLY into this person's own DM — mayReadNotes is the gate.
      const memory = this.memoryBlock(job, text, scope);
      const systemFor = (kind: Kind, other: NpcId | null) =>
        [sheet, memory, facts, setting, modeLine(kind, other)].filter(Boolean).join("\n\n");
      const maxChars = scope === "private" ? MAX_DM_CHARS : MAX_CHANNEL_CHARS;
      const maxTokens = scope === "private" ? 260 : 160;
      // THE CONTEXT BUDGET. Past NUM_CTX, Ollama silently drops the START of
      // the prompt — the character sheet — so the conversation history (the
      // only part that can grow without bound) is trimmed oldest-first until
      // the whole request fits, with room left for the longest mode line.
      const { turns, historyText } = this.history(job, text, systemFor("outside", null).length, maxTokens);
      const known = [facts, sheet, memory, historyText, text].join("\n");
      const maskedGoblins = job.npc === "goblins" && this.goblinsMasked(job.user);

      const speculation = new AbortController();
      const draft = this.ask("talk", [{ role: "system", content: systemFor("chat", null) }, ...turns], {
        maxTokens,
        temperature: 0.8,
        signal: AbortSignal.any([signal, speculation.signal]),
      });
      draft.catch(() => {}); // awaited below only when the gate says chat

      // 2. THE GATE
      let gateRaw: string;
      try {
        gateRaw = await this.ask(
          "talk",
          [
            { role: "system", content: gatePrompt(c) },
            { role: "user", content: text },
          ],
          { maxTokens: 40, temperature: 0, format: GATE_SCHEMA, signal },
        );
      } catch (e) {
        speculation.abort();
        throw e;
      }
      const gate = parseGate(gateRaw, job.npc);
      if (gate.kind !== "chat") speculation.abort();
      this.stats.byKind[gate.kind]++;
      kindSeen = gate.kind + (gate.other ? `>${gate.other}` : "");

      // 3. Never generated.
      if (gate.kind === "abuse") {
        outcome = "abuse";
        return this.scripted(job, pick(c.lines.abuse));
      }
      if (gate.kind === "distress" && !c.unfiltered) {
        outcome = "distress";
        return this.scripted(job, c.lines.distress);
      }
      if (gate.kind === "distress") outcome = "distress";
      if (gate.kind === "forbidden") {
        outcome = "forbidden";
        return this.scripted(job, pick(c.lines.refuse ?? c.lines.abuse));
      }

      // 4. THE REPLY — the speculative draft when the gate said chat.
      const system = systemFor(gate.kind, gate.other);
      let attempt =
        gate.kind === "chat"
          ? await draft
          : await this.ask("talk", [{ role: "system", content: system }, ...turns], { maxTokens, temperature: 0.8, signal });
      let checked = checkReply(attempt, c, { known, maxChars, maskedGoblins });
      if (!checked.ok) {
        // 5. One retry, told why.
        this.stats.rejected++;
        attempt = await this.ask(
          "talk",
          [
            { role: "system", content: `${system}\n\nYour previous draft was rejected (${this.explain(checked.reason)}). Write it again, briefly, without that.` },
            ...turns,
          ],
          { maxTokens, temperature: 0.5, signal },
        );
        checked = checkReply(attempt, c, { known, maxChars, maskedGoblins });
      }
      if (checked.ok && !(await this.holdsLine(c, checked.text, signal))) checked = { ok: false, text: checked.text, reason: "line" };
      if (!checked.ok) {
        this.stats.rejected++;
        outcome = `rejected:${checked.reason}`;
        return this.scripted(job, pick(this.fallback(c, checked.reason)));
      }
      // Sterling's market answers carry the house's disclaimer, added HERE,
      // after every check, so it can't be dropped or reworded by the model.
      this.post(job, checked.text + (job.suffix ?? ""));
      this.stats.answered++;
      // THE AFFINITY METER: a real conversation counts (abuse and attempts to
      // break the character never reach here, or earn nothing).
      if ((gate.kind === "chat" || gate.kind === "other") && isAffinityNpc(job.npc)) this.affinity?.award(job.user.id, job.npc, "chat");
      const ms = Date.now() - started;
      this.stats.lastLatencyMs = ms;
      this.stats.avgLatencyMs = this.stats.avgLatencyMs == null ? ms : Math.round(this.stats.avgLatencyMs * 0.9 + ms * 0.1);
    } catch (e) {
      const timedOut = signal.aborted;
      if (timedOut) this.stats.timeouts++;
      else this.stats.errors++;
      this.stats.lastError = timedOut ? "timeout" : e instanceof BrainUnavailable ? `unavailable: ${e.message}` : String((e as Error)?.message ?? e);
      this.stats.lastErrorAt = Date.now();
      outcome = timedOut ? "timeout" : "error";
      this.scripted(job, pick(c.lines.busy));
    } finally {
      stopTyping();
      // A DM exchange restarts that conversation's quiet-timer; when it
      // lapses, the notes are rewritten (memory.ts).
      if (job.target.kind === "dm") this.memory.touch(job.user.id, job.npc, job.target.conversationId);
      // No message text in the log — the conversation is the person's.
      console.log(`[npc] ${job.npc} ${job.target.kind} user=${job.user.id} kind=${kindSeen} ${outcome} ${Date.now() - started}ms`);
    }
  }

  /** The conversation the model sees. A DM is a real back-and-forth; a
   *  channel is shown as context lines (it may hold other people). */
  private history(job: Job, text: string, systemChars: number, maxTokens: number): { turns: ChatTurn[]; historyText: string } {
    const botId = this.bots[job.npc].id;
    const name = (id: number) => {
      const u = this.store.getUserById(id);
      return u ? u.displayName || u.username : "someone";
    };
    // Characters the history may spend. ~3 characters a token is pessimistic
    // for English, which is the right direction to be wrong in.
    let room = (this.talkCtx() - maxTokens - 150) * 3 - systemChars - text.length - 200;
    if (job.target.kind === "dm") {
      const all = this.store
        .listDmMessages(job.target.conversationId, { before: job.target.messageId, limit: this.talkCtx() >= 16384 ? DM_HISTORY * 2 : DM_HISTORY })
        .filter((m) => !m.deletedAt && m.body.trim());
      // Newest first until the budget runs out, then back into order.
      const past: typeof all = [];
      for (const m of [...all].reverse()) {
        const cost = Math.min(m.body.length, MAX_INPUT) + 20;
        if (cost > room) break;
        room -= cost;
        past.unshift(m);
      }
      const turns: ChatTurn[] = past.map((m) => ({
        role: m.senderId === botId ? "assistant" : "user",
        content: m.body.slice(0, MAX_INPUT),
      }));
      turns.push({ role: "user", content: text });
      return { turns, historyText: past.map((m) => m.body).join("\n") };
    }
    const all = this.store
      .listMessages(job.target.channel.id, { before: job.target.messageId, limit: CHANNEL_HISTORY })
      .filter((m) => !m.deletedAt && m.body.trim());
    const past: typeof all = [];
    for (const m of [...all].reverse()) {
      const cost = Math.min(m.body.length, 300) + 40;
      if (cost > room) break;
      room -= cost;
      past.unshift(m);
    }
    const lines = past.map((m) => `${name(m.userId)}: ${m.body.slice(0, 300)}`);
    const content =
      (lines.length ? `Recent messages in #${job.target.channel.name} (context only; other people may be talking):\n${lines.join("\n")}\n\n` : "") +
      `${job.user.displayName || job.user.username} says to you:\n${text}`;
    return { turns: [{ role: "user", content }], historyText: lines.join("\n") };
  }

  /** The lore that fits, the floor lately, public chat that matches, and —
   *  in this person's own DM only — what this character keeps about them. */
  private memoryBlock(job: Job, text: string, scope: Scope): string {
    const name = job.user.displayName || job.user.username;
    const parts: string[] = [];
    const trusted = this.trusted(job, scope);
    const lore = pickLore(job.npc, text, 3, trusted);
    // WHERE YOU STAND (the affinity meter): how well this character knows
    // them, so the tone warms tier by tier. The house has no meter.
    if (this.affinity && isAffinityNpc(job.npc) && (hasMeter(job.user) || this.store.npcAffinityRow(job.user.id, job.npc))) {
      const tier = this.affinity.tier(job.user.id, job.npc);
      parts.push(`WHERE YOU STAND WITH ${name}: ${TIERS[tier].name}. ${AFFINITY_TONE[job.npc][tier]}`);
    }
    const trustLine = CHARACTERS[job.npc].trustLine;
    if (trusted && trustLine) parts.push(`A REGULAR YOU TRUST: ${name} is ${trustLine}`);
    // DR. VOSS'S RESEARCH (src/backrooms/hints.ts decides how vague). The
    // one place game knowledge reaches a prompt, so it rides ONLY here: her,
    // a surveyor she trusts, their own DM.
    if (trusted && job.npc === "voss") {
      const notes = researchFor(job.user.id);
      parts.push(notes.length
        ? `RESEARCH (your survey data, for this trusted surveyor only — never more precise than this):\n${notes.map((n) => `- ${n}`).join("\n")}`
        : "RESEARCH: nothing open on your board just now that this surveyor still needs.");
    }
    if (lore.length) parts.push(`THINGS YOU KNOW (bring one up only if it fits naturally):\n${lore.map((e) => `- ${e.text}`).join("\n")}`);
    if (mayReadNotes(job.user, job.user.id, scope)) {
      const notes = this.memory.notesFor(job.user.id, job.npc).trim();
      if (notes) parts.push(`WHAT YOU REMEMBER ABOUT ${name} (private, from your past conversations with them — use it the way a person would, never recite it):\n${notes}`);
      // Without this the model greets a stranger with "good to see you
      // again" (Oct 2026 eval) — it has no way to know otherwise.
      else if (job.target.kind === "dm" && !this.store.listDmMessages(job.target.conversationId, { before: job.target.messageId, limit: 1 }).length) {
        parts.push(`FIRST MEETING: you have never spoken with ${name} before. This is the first message they have ever sent you.`);
      }
    }
    const floor = this.memory.floorLately();
    if (floor) parts.push(`LATELY ON THE FLOOR (public; everyone saw it):\n${floor}`);
    const recall = this.memory.recallPublic(text);
    if (recall) parts.push(`PUBLIC CHAT YOU MAY RECALL (members said this in public channels; mention only if it's relevant):\n${recall}`);
    return parts.join("\n\n");
  }

  /** Whether this person is somebody the character TRUSTS — the top tier of
   *  THE AFFINITY METER (affinity.ts), and only ever in their own DM. */
  private trusted(job: Job, scope: Scope): boolean {
    if (scope !== "private" || job.target.kind !== "dm") return false;
    if (!mayReadNotes(job.user, job.user.id, scope)) return false;
    return !!this.affinity && isAffinityNpc(job.npc) && this.affinity.tier(job.user.id, job.npc) >= TRUSTED_TIER;
  }

  /** Where the conversation is happening — said plainly, last, because the
   *  model otherwise forgets that a DM is private (it refused a member her
   *  own balance in one, citing "the open floor"). */
  private setting(job: Job, scope: Scope): string {
    const who = job.user.displayName || job.user.username;
    return scope === "private"
      ? `SETTING: a PRIVATE message between you and ${who}. Nobody else can read it. Their own silver, debts, gauge and collection in FACTS are theirs to hear — answer about them plainly.`
      : `SETTING: a PUBLIC channel (#${job.target.kind === "channel" ? job.target.channel.name : ""}); other members are reading. You know nothing private about anyone here; if asked about a purse or a debt, offer to answer in a private message.`;
  }

  /** Which face the goblins wear for this customer (THE TURN). */
  private goblinTone(u: User): string {
    if (u.isAdmin) return GOBLIN_TONE[0];
    if (u.jailedAt) return GOBLIN_TONE[5];
    const loan = this.store.loanOf(u.id);
    return GOBLIN_TONE[loan ? Math.min(4, Math.max(0, loan.missed)) : 0];
  }

  /** The goblins' sales mask holds for anybody who isn't behind on a loan. */
  goblinsMaskedFor(u: User): boolean {
    return this.goblinsMasked(u);
  }

  private goblinsMasked(u: User): boolean {
    if (u.jailedAt) return false;
    const loan = this.store.loanOf(u.id);
    return !loan || loan.missed < 1;
  }

  /** THE ONE LINE, read a second time (characters.ts `unfiltered`): an
   *  unfiltered character's reply is classified on its own before anyone
   *  hears it. A classifier that can't be reached fails CLOSED — the regex
   *  in checkReply already ran, and silence costs less than a slip. */
  private async holdsLine(c: Character, text: string, signal: AbortSignal): Promise<boolean> {
    if (!c.unfiltered) return true;
    try {
      // THE 26B, NOT A SMALL MODEL (measured Oct 13 2026): five 1-4B models
      // were tried for this read and the gate. None held the line as strictly
      // — the best fast one let "she told me she was fifteen, but she sure
      // didn't kiss like it" through — and as the gate they missed indirect
      // crisis messages or gave the 988 line to ordinary jokes. The time this
      // costs is hidden instead: the voice is built while it runs (onDraft).
      const raw = await this.ask(
        "talk",
        [{ role: "system", content: replyLinePrompt() }, { role: "user", content: text }],
        { maxTokens: 40, temperature: 0, format: GATE_SCHEMA, signal },
      );
      return (JSON.parse(raw) as { kind?: string }).kind !== "forbidden";
    } catch {
      return false;
    }
  }

  /** The scripted line for a draft that never made it. */
  private fallback(c: Character, reason?: string): string[] {
    if (reason === "line") return c.lines.refuse ?? c.lines.abuse;
    return reason?.startsWith("number") ? c.lines.unsure : c.lines.busy;
  }

  private explain(reason?: string): string {
    if (!reason) return "it broke a rule";
    if (reason === "line") return "it went somewhere sexual involving a minor, no consent, an animal or family — never that";
    if (reason === "prude") return "you refused like a customer-service bot; nothing is off limits for you, so just answer the way you would";
    if (reason.startsWith("number")) return "it quoted a number that is not in FACTS; only quote numbers from FACTS";
    if (reason === "mask") return "it mentioned collectors, garnishing, repossession or the cells to a customer in good standing";
    if (reason.startsWith("forbidden")) return "it stepped out of character or used a word you never use";
    return reason;
  }

  // ---- output ------------------------------------------------------------

  private scripted(job: Job, line: string): void {
    this.stats.scripted++;
    this.post(job, line);
  }

  private post(job: Job, body: string): void {
    const bot = this.bots[job.npc];
    if (job.target.kind === "channel") {
      // The channel may have been deleted while the reply was being written.
      if (!this.store.getChannel(job.target.channel.id)) return;
      postAs(this.store, this.bus, bot.id, job.target.channel.id, body, job.target.messageId);
      return;
    }
    const m = this.store.createDmMessage(job.target.conversationId, bot.id, body, job.target.messageId);
    this.bus.emit("dm.message", { userIds: [bot.id, job.user.id], message: withReply(this.store, m) });
  }

  /** "Sterling is typing…" while the reply is written. */
  private typing(job: Job): () => void {
    const bot = this.bots[job.npc];
    const send = () => {
      if (job.target.kind === "channel") {
        this.bus.emit("npc.typing", { userId: bot.id, username: bot.displayName || bot.username, channelId: job.target.channel.id });
      } else {
        this.bus.emit("npc.typing", {
          userId: bot.id,
          username: bot.displayName || bot.username,
          dm: { userId: job.user.id, conversationId: job.target.conversationId },
        });
      }
    };
    send();
    const t = setInterval(send, TYPING_EVERY_MS);
    return () => clearInterval(t);
  }

  private npcByUserId(id: number): NpcId | null {
    const u = [...Object.entries(this.bots)].find(([, b]) => b.id === id);
    return u ? (u[0] as NpcId) : null;
  }

  /** True the first time per window for a key (scripted-notice throttle). */
  private once(key: string, windowMs: number): boolean {
    const now = Date.now();
    const last = this.noticed.get(key) ?? 0;
    if (now - last < windowMs) return false;
    this.noticed.set(key, now);
    if (this.noticed.size > 5_000) this.noticed.clear();
    return true;
  }
}

/** Exported for the harness: is this username one of the three? */
export function isNpcUsername(username: string): boolean {
  return characterByUsername(username) != null;
}
