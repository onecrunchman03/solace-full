// THE PORTAL — Naa'shenai, the hall behind the Stone of the Abyss.
// PORTAL.md is the design; this is the server's whole opinion of it.
//
// THE RULE THE WIRE KEEPS: a reader is sent glyph ids and nothing else they
// have not earned. A glyph's SOUND goes out once the community has cracked
// it. A word's MEANING goes out once this reader has confirmed every root it
// is built on. A post's ENGLISH goes out once every word in it is readable.
// The archive's English sits in the bundle on this server and nowhere else.

import { readFileSync } from "node:fs";
import type { Store } from "../db/store";
import { tokenize, Dictionary, meaningMatches, normalise, SEP, type Tokenized } from "./script";
import { GLYPH_ID, GLYPH_SOUND, GLYPH_COUNT } from "./glyph-ids";
import { archiveTicks, nowTicks, stamp } from "./clock";
import { transliterate } from "./translit";
import { ETCHED_RELICS, STERLING_MARKS, sourceOf } from "./sources";
import { CHARTS, DROP_T, GALAXIES, SKY, SURVEY_REWARD, SURVEY_TRIES, WINDOW_T, checkChart, foldWeather, isGalaxy } from "./survey";
import { MARK_OF, NOTATION_BASE, NOTATION_COUNT, NOTATION_GLYPH } from "./notation-ids";

export const SIGNS = ["ren", "ta'an", "ahel", "eeth", "sehu", "onn"] as const;
/** Tharvend's nine status glyphs, in the order the client draws them. */
export const STATUS = ["ORMAA", "MEMBERS", "LINE", "DOOR", "REPAIR", "FILED", "CAPACITY", "ENTRY", "ENTRY-X"] as const;
/** Guesses a reader may get WRONG in a day (UTC). Few enough that brute force is worthless. */
export const GLYPH_TRIES = 3;
export const WORD_TRIES = 10;
/** Wrong notation claims a reader may make in a day: the second cipher's ration. */
export const NOTATION_TRIES = 3;
/** The primer's one mark (PORTAL.md: "the first crack in the second cipher"). */
export const PRIMER_MARK = MARK_OF[GLYPH_ID.e];
/** How rare each letter is in the whole archive, rarest first: the order
 *  the games' modules read the letters deduction hasn't reached. */
export let RAREST: number[] = [];
/** The first keystone a newcomer can be issued: the hall's own run to 74. */
export const FIRST_KEYSTONE = 0o75;
export const ONLINE_MS = 2 * 60_000;
/** Letters a reader may claim for a glyph (the 26 sounds) and the digits. */
export const CLAIMABLE = new Set(GLYPH_SOUND);
const LONG_TURN_TICKS = 8n ** 20n;

interface Bundle {
  rooms: { id: string; name: string | null; kind: "text" | "log" | "last" | "voice"; galaxy?: string; notation?: boolean }[];
  posts: { id: number; room: string; t: number; author: string; draft: boolean; flags: string[]; en: string; eshai: string; reacts: { sign: string; by: string[] }[]; digest?: string }[];
  profiles: { name: string; keystone: number; joined: number; galaxy: string | null; status: { en: string; eshai: string }; bio: { en: string; eshai: string } }[];
  pinned: { room: string; title: string; en: string; eshai: string }[];
  log: { t: number; sign: string; en: string; eshai: string }[];
  generated: Record<string, string[]>;
  lexicon: { word: string; meaning: string }[];
  names: string[];
  fleetRoll: string[];
  ishaal: number[][];
}

interface Text { tok: Tokenized; glyphs: Set<number>; en: string }

/** THE GLITCHES (PORTAL.md → The glitches). The machine is old. Rare — a
 *  reader meets one every few visits at most — and every one is filed in
 *  Tharvend's log as a repair at the moment it happened, so the explanation
 *  always exists, for whoever can read it. Never Makaal, never a chase. */
export type GlitchKind = "ghost" | "presence" | "corrupt";
/** PORTAL_GLITCH_CHANCE=0 turns the random roll off, so a harness sees only
 *  the glitches it forces (a stray one made test_portal flaky). */
export const GLITCH_CHANCE = Number(process.env.PORTAL_GLITCH_CHANCE ?? 0.12);
export const GLITCH_GAP_MS = 3 * 3600_000;
const GHOST_ROOMS = ["theruun", "oshkaa", "paaruk", "senwe", "yulenai", "maalith"];
type Glitch = { kind: "ghost"; room: string; post: number; at: number } | { kind: "presence"; name: string; at: number } | { kind: "corrupt"; at: number };
/** A repair as the log keeps it: its line in Eshai (from the archive's own
 *  generated phrases) and in English. */
const REPAIR_EN: Record<string, (subject: string) => string> = {
  ghost: (s) => `Repair: index. Post refiled out of order, room ${s}. Corrected.`,
  presence: (s) => `Repair: presence. Member shown online in error: ${s}. Corrected.`,
  corrupt: () => "Repair: glyph store. 3 glyphs corrupted. Rebuilt from parity.",
  voice: (s) => `Repair: voice store. Playback fault, ${s}, 4 breaths of the last session played. Corrected.`,
};
interface ArchivePost { id: number; room: string; t: number; author: string; draft: boolean; ticks: bigint; text: Text; reacts: { sign: string; by: string[] }[] }


export class Hall {
  readonly dict: Dictionary;
  /** A glitch each reader is due on their next look (cleared once met). */
  readonly glitches = new Map<number, Glitch>();
  private lastGlitch = new Map<number, number>();
  private notationRarest: number[] = [];
  private b: Bundle;
  private posts: ArchivePost[];
  private byRoom = new Map<string, ArchivePost[]>();
  private names = new Map<string, Tokenized>();
  private profiles: (Bundle["profiles"][number] & { tok: Tokenized; statusT: Text; bioT: Text; seen: bigint })[];
  private pinned: (Bundle["pinned"][number] & { text: Text })[];
  private log: { ticks: bigint; sign: number; text: Text }[];

  constructor(private store: Store, path: string) {
    this.b = JSON.parse(readFileSync(path, "utf8")) as Bundle;
    this.dict = new Dictionary(this.b.lexicon, this.b.names);
    this.dict.addNames(this.b.profiles.map((p) => p.name));
    this.dict.addNames(this.b.fleetRoll);
    this.posts = this.b.posts.map((p) => ({
      id: p.id, room: p.room, t: p.t, author: p.author, draft: p.draft, reacts: p.reacts,
      ticks: archiveTicks(p.t), text: this.text(p.eshai + (p.flags.includes("roll") ? "\n\n" + this.b.fleetRoll.join("! ") + "!" : ""), p.en),
    }));
    for (const p of this.posts) (this.byRoom.get(p.room) ?? this.byRoom.set(p.room, []).get(p.room)!).push(p);
    this.profiles = this.b.profiles.map((p) => {
      const drop = DROP_T[(p.galaxy ?? "Maalith") as keyof typeof DROP_T] + (p.galaxy === "Maalith" ? (p.keystone % 16) * 0.001 : 0);
      return { ...p, tok: this.name(p.name), statusT: this.text(p.status.eshai, p.status.en), bioT: this.text(p.bio.eshai, p.bio.en), seen: archiveTicks(drop) };
    });
    this.pinned = this.b.pinned.map((p) => ({ ...p, text: this.text(p.eshai, p.en) }));
    this.log = this.buildLog();
    // Letter frequency over everything the hall says: the games read the rare ones.
    const freq = new Map<number, number>();
    for (const p of this.posts) for (const t of p.text.tok.tokens) if (t in MARK_OF) freq.set(t, (freq.get(t) ?? 0) + 1);
    // Marks another source hands over (the stone, Sterling, the relics) are not the games' to give.
    const held = new Set([...tokenize("onnith").tokens, ...STERLING_MARKS, ...Object.values(ETCHED_RELICS)]);
    RAREST = Object.keys(MARK_OF).map(Number).filter((g) => !held.has(g)).sort((a, b) => (freq.get(a) ?? 0) - (freq.get(b) ?? 0) || a - b);
    const kf = new Map<number, number>();
    for (const p of this.byRoom.get("kaal-ith") ?? []) for (const t of p.text.tok.tokens) if (t in MARK_OF) kf.set(MARK_OF[t], (kf.get(MARK_OF[t]) ?? 0) + 1);
    this.notationRarest = [...Array(NOTATION_COUNT).keys()].filter((m) => m !== PRIMER_MARK).sort((a, b) => (kf.get(a) ?? 0) - (kf.get(b) ?? 0) || a - b);
  }

  /** The recorded ring game, move by move (the bundle's [ply, stone, from, to]). */
  get ishaal(): number[][] { return this.b.ishaal; }

  // ---- text ----------------------------------------------------------------
  private text(eshai: string, en: string): Text {
    const tok = tokenize(eshai);
    return { tok, glyphs: new Set(tok.tokens.filter((t) => t >= 0)), en };
  }
  name(n: string): Tokenized {
    let t = this.names.get(n);
    if (!t) { t = tokenize(n); this.names.set(n, t); }
    return t;
  }
  /** A stamp as tokens: octal digits in numeral glyphs, groups gapped. */
  stampTokens(ticks: bigint): number[] {
    const out: number[] = [];
    for (const ch of stamp(ticks)) out.push(ch === " " ? SEP.GAP : GLYPH_ID[ch]);
    return out;
  }

  // ---- what a reader knows ---------------------------------------------------
  unlocked(): Set<number> { return new Set(this.store.portalGlyphs().map((g) => g.glyph)); }
  /** The sounds of cracked glyphs — the only part of the key that is ever sent. */
  sounds(unlocked: Set<number>): Record<number, string> {
    return Object.fromEntries([...unlocked].map((g) => [g, GLYPH_SOUND[g]]));
  }
  private pieceCache = new Map<string, { info: ReturnType<Dictionary["piece"]>; glyphs: number[]; gloss: string | null }>();
  private pieceOf(piece: string) {
    let c = this.pieceCache.get(piece);
    if (!c) { const info = this.dict.piece(piece); c = { info, glyphs: tokenize(piece).tokens.filter((g) => g >= 0), gloss: info.kind === "word" ? this.dict.gloss(piece) : null }; this.pieceCache.set(piece, c); }
    return c;
  }
  private pieceKnown(piece: string, words: Set<string>, unlocked: Set<number>, marks: Set<number> | null = null): boolean {
    const { info, glyphs } = this.pieceOf(piece);
    if (marks && !glyphs.every((g) => !(g in MARK_OF) || marks.has(MARK_OF[g]))) return false;
    if (info.kind === "word") return info.roots.every((r) => words.has(r));
    if (info.kind === "name" || info.kind === "number") return glyphs.every((g) => unlocked.has(g));
    return false;
  }
  /** Per word: the meaning if this reader can read it, else null. Plus the English if all of it is readable. */
  read(text: Text, words: Set<string>, unlocked: Set<number>, marks: Set<number> | null = null): { glosses: (string | null)[]; en: string | null } {
    const glosses = text.tok.words.map((w) => {
      if (!w.every((p) => this.pieceKnown(p, words, unlocked, marks))) return null;
      const g = w.map((p) => this.pieceOf(p).gloss ?? p);
      return g.join(" · ");
    });
    const all = glosses.every((g) => g !== null) && [...text.glyphs].every((g) => unlocked.has(g) && (!marks || !(g in MARK_OF) || marks.has(MARK_OF[g])));
    return { glosses, en: all && text.en ? text.en : null };
  }

  // ---- the fold school's notation (notation-ids.ts) ------------------------------
  /** The marks the community has cracked. */
  marks(): Set<number> { return new Set(this.store.portalNotation().map((n) => n.mark)); }
  /** A run of tokens as the notation draws it: every letter whose mark is
   *  still locked goes out as that mark (NOTATION_BASE + mark); a cracked
   *  mark lets the script glyph show through. Numerals are common numerals. */
  veil(tokens: number[], marks: Set<number>): number[] {
    return tokens.map((t) => (t >= 0 && t in MARK_OF && !marks.has(MARK_OF[t]) ? NOTATION_BASE + MARK_OF[t] : t));
  }
  /** Claim a mark: name the script glyph it stands for. Right cracks it for everyone. */
  guessNotation(mark: unknown, glyph: unknown, viewer: number, day: string): { ok: true; right: boolean; left: number } | { ok: false; error: string } {
    if (!Number.isInteger(mark) || (mark as number) < 0 || (mark as number) >= NOTATION_COUNT) return { ok: false, error: "bad_mark" };
    // Any of the 34 shapes may be named; a numeral is simply wrong (a refusal
    // would tell a prober for free which shapes are numbers).
    if (!Number.isInteger(glyph) || (glyph as number) < 0 || (glyph as number) >= GLYPH_COUNT) return { ok: false, error: "bad_glyph" };
    if (this.marks().has(mark as number)) return { ok: false, error: "already_cracked" };
    const wrong = this.store.portalWrongGuesses(viewer, "notation", day);
    if (wrong >= NOTATION_TRIES) return { ok: false, error: "no_tries" };
    if (NOTATION_GLYPH[mark as number] === glyph) { this.store.portalUnlockNotation(mark as number, viewer, "deduction"); return { ok: true, right: true, left: NOTATION_TRIES - wrong }; }
    this.store.portalGuessedWrong(viewer, "notation", day);
    return { ok: true, right: false, left: NOTATION_TRIES - wrong - 1 };
  }
  /** The primer, page one: a reader who can read all of it gets the second
   *  cipher's first mark (once, for everyone). */
  primerCrack(viewer: number): number | null {
    if (this.marks().has(PRIMER_MARK)) return null;
    const primer = this.pinned.find((p) => p.room === "kaal-ith");
    if (!primer || this.read(primer.text, this.store.portalWords(viewer), this.unlocked()).en === null) return null;
    return this.store.portalUnlockNotation(PRIMER_MARK, viewer, "primer") ? PRIMER_MARK : null;
  }
  /** A games module: each one reads ONE mark, ever, for whoever gets there
   *  first — the rarest letter no other source is holding that nobody has
   *  read yet. (Per reader it would read the whole script by the tenth player.) */
  moduleCrack(viewer: number, source: string): number | null {
    if (this.store.portalGlyphs().some((g) => g.source === source)) return null;
    const unlocked = this.unlocked();
    const g = RAREST.find((x) => !unlocked.has(x));
    if (g === undefined) return null;
    return this.store.portalUnlockGlyph(g, viewer, source) ? g : null;
  }
  /** The unaimed fold's reward: the notation mark nobody has cracked that is
   *  rarest in kaal-ith (the room is the only place to learn it from). */
  notationModuleCrack(viewer: number, source: string): number | null {
    if (this.store.portalNotation().some((n) => n.source === source)) return null;
    const marks = this.marks();
    const m = this.notationRarest.find((x) => !marks.has(x));
    if (m === undefined) return null;
    return this.store.portalUnlockNotation(m, viewer, source) ? m : null;
  }
  /** The last room opens when every mark of the script is read. */
  lastOpen(unlocked: Set<number> = this.unlocked()): boolean { return unlocked.size >= GLYPH_COUNT; }

  // ---- the hall ------------------------------------------------------------
  /** File a reader on arrival; their stone cracks a glyph of "onnith" while any is still locked. */
  arrive(userId: number, username: string): { keystone: number; first: boolean; cracked: number | null } {
    const r = this.store.portalFile(userId, FIRST_KEYSTONE);
    let cracked: number | null = null;
    if (r.first) {
      const unlocked = this.unlocked();
      const stoneGlyph = [...new Set(tokenize("onnith").tokens)].find((g) => !unlocked.has(g));
      if (stoneGlyph !== undefined && this.store.portalUnlockGlyph(stoneGlyph, userId, "stone")) cracked = stoneGlyph;
    }
    void username;
    return { keystone: r.keystone, first: r.first, cracked };
  }

  // ---- the sources across the hub (sources.ts) ---------------------------------
  /** One etched relic: read it if this reader holds it and it is still locked. */
  relicCrack(userId: number, slug: string): number | null {
    const glyph = ETCHED_RELICS[slug];
    if (glyph === undefined || this.unlocked().has(glyph)) return null;
    return this.store.portalUnlockGlyph(glyph, userId, `relic:${slug}`) ? glyph : null;
  }
  /** Every etched relic this reader has ever unlocked, carried through.
   *  `each` hears every crack the moment it lands, so an announcement that
   *  counts the read marks counts its own mark and not the next one's. */
  relicCracks(userId: number, each: (glyph: number, slug: string) => void = () => {}): { glyph: number; slug: string }[] {
    const out: { glyph: number; slug: string }[] = [];
    for (const { relicId } of this.store.brRelics(userId)) {
      const g = this.relicCrack(userId, relicId);
      if (g !== null) { out.push({ glyph: g, slug: relicId }); each(g, relicId); }
    }
    return out;
  }
  /** Sterling's three, together, to a reader who has been through. */
  sterlingMarks(userId: number): number[] {
    const unlocked = this.unlocked();
    return STERLING_MARKS.filter((g) => !unlocked.has(g) && this.store.portalUnlockGlyph(g, userId, "sterling"));
  }
  /** THE CLAIM WALL: every mark, and for the read ones who read it and how. */
  /** The second half of the wall: every notation mark, and for the cracked
   *  ones the script glyph it stands for and who cracked it. */
  notationWall(): { mark: number; glyph: number | null; who: number[] | null; source: string | null; stamp: number[] | null }[] {
    const byMark = new Map(this.store.portalNotation().map((n) => [n.mark, n]));
    const members = new Map(this.store.portalMembers().map((m) => [m.userId, m.username]));
    return [...Array(NOTATION_COUNT).keys()].map((mark) => {
      const c = byMark.get(mark);
      if (!c) return { mark, glyph: null, who: null, source: null, stamp: null };
      const name = c.userId != null ? members.get(c.userId) : undefined;
      return { mark, glyph: NOTATION_GLYPH[mark], who: name ? tokenize(transliterate(name)).tokens : null, source: c.source, stamp: this.stampTokens(nowTicks(c.at)) };
    });
  }
  wall(): { glyph: number; sound: string | null; who: number[] | null; source: string | null; relic: string | null; galaxy: number[] | null; stamp: number[] | null }[] {
    const byGlyph = new Map(this.store.portalGlyphs().map((g) => [g.glyph, g]));
    const members = new Map(this.store.portalMembers().map((m) => [m.userId, m.username]));
    return [...Array(GLYPH_COUNT).keys()].map((glyph) => {
      const c = byGlyph.get(glyph);
      if (!c) return { glyph, sound: null, who: null, source: null, relic: null, galaxy: null, stamp: null };
      const s = sourceOf(c.source);
      const name = c.userId != null ? members.get(c.userId) : undefined;
      return { glyph, sound: GLYPH_SOUND[glyph], who: name ? tokenize(transliterate(name)).tokens : null, source: s.kind, relic: s.relic, galaxy: s.galaxy ? this.name(s.galaxy).tokens : null, stamp: this.stampTokens(nowTicks(c.at)) };
    });
  }

  // ---- the survey (survey.ts) --------------------------------------------------
  /** The instrument for one reader: the sky, every galaxy's beats and
   *  catalogue (periods as numeral glyph ids, never digits), what they have
   *  charted, and, once they have charted all six, the fold weather. */
  survey(viewer: number, day: string) {
    const charted = this.store.portalCharted(viewer);
    const all = GALAXIES.every((g) => charted.has(g));
    const turns: number[][] = [];
    for (let t = 0; t <= Math.floor(WINDOW_T); t++) turns.push(this.stampTokens(archiveTicks(t)));
    turns.push(this.stampTokens(archiveTicks(WINDOW_T)));
    return {
      galaxies: GALAXIES.map((g) => {
        const c = CHARTS[g];
        return {
          id: g, name: this.name(g).tokens, ...SKY[g], charted: charted.has(g),
          sources: c.sources.map(({ id, x, y, period, phase, kind }) => ({ id, x, y, period, phase, kind })),
          catalogue: c.entries.map((e) => ({ id: e.id, period: e.mark === "pause" ? null : tokenize(e.period.toString(8)).tokens, mark: e.mark })),
          // The reader worked this one out; they may keep seeing their own chart.
          match: charted.has(g) ? { ...c.answer } : null,
        };
      }),
      left: Math.max(0, SURVEY_TRIES - this.store.portalWrongGuesses(viewer, "survey", day)),
      window: WINDOW_T,
      turns,
      weather: all ? foldWeather() : null,
    };
  }
  /** Chart a galaxy: right reads its numeral for everyone (if still locked). */
  chart(viewer: number, galaxy: unknown, pairs: unknown, day: string):
    { ok: true; right: boolean; left: number; cracked: number | null } | { ok: false; error: string } {
    if (!isGalaxy(galaxy)) return { ok: false, error: "bad_galaxy" };
    if (this.store.portalCharted(viewer).has(galaxy)) return { ok: false, error: "already_charted" };
    const wrong = this.store.portalWrongGuesses(viewer, "survey", day);
    if (wrong >= SURVEY_TRIES) return { ok: false, error: "no_tries" };
    const r = checkChart(galaxy, pairs);
    if (r === "bad") return { ok: false, error: "bad_chart" };
    if (!r) { this.store.portalGuessedWrong(viewer, "survey", day); return { ok: true, right: false, left: SURVEY_TRIES - wrong - 1, cracked: null }; }
    this.store.portalChart(viewer, galaxy);
    const glyph = SURVEY_REWARD[galaxy];
    const cracked = !this.unlocked().has(glyph) && this.store.portalUnlockGlyph(glyph, viewer, `survey:${galaxy}`) ? glyph : null;
    return { ok: true, right: true, left: SURVEY_TRIES - wrong, cracked };
  }

  rooms(viewer = 0): { id: string; name: number[] | null; kind: string; last: number[] | null; posts: number; ghost?: boolean; open?: boolean }[] {
    const g = this.glitches.get(viewer);
    return this.b.rooms.map((r) => {
      const list = this.byRoom.get(r.id) ?? [];
      const liveAt = this.store.portalLastPostAt(r.id);
      const ghost = g?.kind === "ghost" && g.room === r.id;
      const lastTicks = ghost ? nowTicks(g.at) : liveAt ? nowTicks(liveAt) : r.id === "tharvend" ? nowTicks() : list.length ? list[list.length - 1].ticks : null;
      return {
        id: r.id, kind: r.kind,
        name: r.name ? tokenize(r.name).tokens : null,
        last: lastTicks ? this.stampTokens(lastTicks) : null,
        posts: list.length,
        ...(ghost ? { ghost: true } : {}),
        ...(r.kind === "last" ? { open: this.lastOpen() } : {}),
      };
    });
  }

  // ---- the glitches --------------------------------------------------------------
  /** Roll for a glitch on this look (or force one, the admin's lever). */
  maybeGlitch(viewer: number, force: GlitchKind | null = null): GlitchKind | null {
    const now = Date.now();
    if (!force && (this.glitches.has(viewer) || now - (this.lastGlitch.get(viewer) ?? 0) < GLITCH_GAP_MS || Math.random() >= GLITCH_CHANCE)) return null;
    const kind = force ?? (["ghost", "ghost", "presence", "corrupt"] as const)[Math.floor(Math.random() * 4)];
    this.lastGlitch.set(viewer, now);
    if (kind === "ghost") {
      const room = GHOST_ROOMS[Math.floor(Math.random() * GHOST_ROOMS.length)];
      const list = this.byRoom.get(room) ?? [];
      const post = list[Math.floor(Math.random() * list.length)];
      if (!post) return null;
      this.glitches.set(viewer, { kind, room, post: post.id, at: now });
      this.store.portalRepair("ghost", this.b.rooms.find((r) => r.id === room)?.name ?? room, now);
    } else if (kind === "presence") {
      const p = this.profiles[Math.floor(Math.random() * this.profiles.length)];
      this.glitches.set(viewer, { kind, name: p.name, at: now });
      this.store.portalRepair("presence", p.name, now);
    } else {
      this.glitches.set(viewer, { kind, at: now });
      this.store.portalRepair("corrupt", "", now);
    }
    return kind;
  }
  /** A repair's line in the log. */
  private repairText(kind: string, subject: string): Text {
    const R = this.b.generated["repairs"] ?? [];
    const eshai =
      kind === "ghost" ? (R[0] ?? "").replace("Theruun", subject)
      : kind === "presence" ? (R[1] ?? "").replace("Yulen Dar", subject)
      : kind === "corrupt" ? R[2] ?? ""
      : kind === "voice" ? (R[3] ?? "").replace("ren-ta'an", subject).replace("120", subject === "keth-ren" ? (59).toString(8) : "120")
      : "";
    return this.text(eshai, REPAIR_EN[kind]?.(subject) ?? "");
  }

  roster(viewer: number): unknown[] {
    // The presence flicker: one dead row reads online, for this one look.
    const g = this.glitches.get(viewer);
    const flicker = g?.kind === "presence" ? g.name : null;
    if (flicker) this.glitches.delete(viewer);
    const ghosts = this.profiles.map((p) => ({
      kind: "ghost", key: `g:${p.name}`, name: p.tok.tokens, keystone: this.stampTokens(BigInt(p.keystone)).filter((t) => t !== SEP.GAP),
      online: p.name === flicker, mark: "ENTRY-X", seen: this.stampTokens(p.seen),
    }));
    const now = Date.now();
    const living = this.store.portalMembers().map((m) => ({
      kind: "member", key: `m:${m.userId}`, name: tokenize(transliterate(m.username)).tokens, keystone: this.stampTokens(BigInt(m.keystone)).filter((t) => t !== SEP.GAP),
      online: now - m.lastSeen < ONLINE_MS, mark: null, seen: this.stampTokens(nowTicks(m.lastSeen)), you: m.userId === viewer,
    }));
    return [...ghosts, ...living];
  }

  profile(key: string, viewer: number): unknown | null {
    const words = this.store.portalWords(viewer), unlocked = this.unlocked();
    if (key.startsWith("g:")) {
      const p = this.profiles.find((x) => x.name === key.slice(2));
      if (!p) return null;
      return { key, name: p.tok.tokens, keystone: this.stampTokens(BigInt(p.keystone)).filter((t) => t !== SEP.GAP), joined: this.stampTokens(archiveTicks(p.joined)),
        seen: this.stampTokens(p.seen), mark: "ENTRY-X",
        status: { tokens: p.statusT.tok.tokens, ...this.read(p.statusT, words, unlocked) },
        bio: { tokens: p.bioT.tok.tokens, ...this.read(p.bioT, words, unlocked) } };
    }
    const m = this.store.portalMembers().find((x) => `m:${x.userId}` === key);
    if (!m) return null;
    return { key, name: tokenize(transliterate(m.username)).tokens, keystone: this.stampTokens(BigInt(m.keystone)).filter((t) => t !== SEP.GAP),
      joined: this.stampTokens(nowTicks(m.filedAt)), seen: this.stampTokens(nowTicks(m.lastSeen)), mark: null, status: null, bio: null };
  }

  /** A room as this reader may see it. */
  room(id: string, viewer: number): unknown | null {
    const r = this.b.rooms.find((x) => x.id === id);
    if (!r || r.kind === "voice") return null;
    const words = this.store.portalWords(viewer), unlocked = this.unlocked();
    if (r.kind === "last") {
      // Shut until every mark of the script is read; then the count mark is
      // given, and the room is the last pleas. Nobody reacts to them; nobody posts.
      if (!this.lastOpen(unlocked)) return { id, kind: "last", locked: true, posts: [] };
      return { id, kind: "last", locked: false, posts: (this.byRoom.get("last") ?? []).map((p) => ({
        key: `a:${p.id}`, author: this.name(p.author).tokens, draft: p.draft, stamp: this.stampTokens(p.ticks),
        tokens: p.text.tok.tokens, ...this.read(p.text, words, unlocked), reacts: [] })) };
    }
    const reacts = this.reactionMap(viewer);
    const marks = r.notation ? this.marks() : null;
    const out = (tokens: number[]) => (marks ? this.veil(tokens, marks) : tokens);
    if (r.kind === "log") {
      return { id, kind: "log", posts: this.logFor(viewer).map((e, i) => ({ key: `l:${i}`, sign: e.sign, stamp: this.stampTokens(e.ticks), tokens: e.text.tok.tokens, ...this.read(e.text, words, unlocked) })) };
    }
    const archive = (this.byRoom.get(id) ?? []).map((p) => ({
      key: `a:${p.id}`, author: this.name(p.author).tokens, draft: p.draft, stamp: this.stampTokens(p.ticks),
      tokens: out(p.text.tok.tokens), ...this.read(p.text, words, unlocked, marks), reacts: this.mergeReacts(p.reacts, reacts.get(`a:${p.id}`)),
    }));
    const members = new Map(this.store.portalMembers().map((m) => [m.userId, m.username]));
    const live = this.store.portalPosts(id).map((p) => {
      const text = this.text(p.text, "");
      return { key: `p:${p.id}`, author: tokenize(transliterate(members.get(p.userId) ?? "a")).tokens, mine: p.userId === viewer, draft: false,
        stamp: this.stampTokens(nowTicks(p.at)), tokens: out(text.tok.tokens), ...this.read(text, words, unlocked, marks), reacts: this.mergeReacts([], reacts.get(`p:${p.id}`)) };
    });
    const pinned = this.pinned.map((p, i) => ({ p, i })).filter(({ p }) => p.room === id).map(({ p, i }) => ({ key: `pin:${i}`, tokens: p.text.tok.tokens, ...this.read(p.text, words, unlocked) }));
    const posts: Record<string, unknown>[] = [...archive, ...live];
    // A glitch this reader is due here (see glitches): an old post re-filed
    // at the bottom, marked new, or a word unmade for a moment.
    const g = this.glitches.get(viewer);
    let glitch: { kind: string; key: string; word: number } | null = null;
    if (g?.kind === "ghost" && g.room === id) {
      const src = archive.find((a) => a.key === `a:${g.post}`);
      if (src) posts.push({ ...src, key: `ghost:${g.post}`, stamp: this.stampTokens(nowTicks(g.at)), ghost: true, reacts: [] });
      this.glitches.delete(viewer);
    } else if (g?.kind === "corrupt") {
      const pool = archive.slice(-30).filter((a) => a.glosses.length >= 3);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick) glitch = { kind: "corrupt", key: pick.key, word: Math.floor(Math.random() * pick.glosses.length) };
      this.glitches.delete(viewer);
    }
    return { id, kind: "text", notation: !!r.notation, pinned, posts, glitch };
  }

  private reactionMap(viewer: number): Map<string, { sign: string; n: number; mine: boolean }[]> {
    const out = new Map<string, Map<string, { sign: string; n: number; mine: boolean }>>();
    for (const r of this.store.portalReactions()) {
      const m = out.get(r.target) ?? out.set(r.target, new Map()).get(r.target)!;
      const e = m.get(r.sign) ?? m.set(r.sign, { sign: r.sign, n: 0, mine: false }).get(r.sign)!;
      e.n++; if (r.userId === viewer) e.mine = true;
    }
    return new Map([...out].map(([k, v]) => [k, [...v.values()]]));
  }
  private mergeReacts(archive: { sign: string; by: string[] }[], live: { sign: string; n: number; mine: boolean }[] | undefined) {
    const m = new Map<string, { sign: number; n: number; mine: boolean }>();
    const idx = (s: string) => SIGNS.indexOf(s as never);
    for (const r of archive) m.set(r.sign, { sign: idx(r.sign), n: r.by.length, mine: false });
    for (const r of live ?? []) { const e = m.get(r.sign) ?? { sign: idx(r.sign), n: 0, mine: false }; e.n += r.n; e.mine = r.mine; m.set(r.sign, e); }
    return [...m.values()].filter((r) => r.sign >= 0);
  }

  // ---- Tharvend's log --------------------------------------------------------
  private buildLog(): { ticks: bigint; sign: number; text: Text }[] {
    const S = (s: string) => Math.max(0, STATUS.indexOf(s.split(/\s*\/\s*/)[0].trim() as never));
    const out = this.b.log.map((e) => ({ ticks: archiveTicks(e.t), sign: S(e.sign), text: this.text(e.eshai, e.en) }));
    // Every remaining member's broken entry, across the last hours.
    const maalith = this.profiles.filter((p) => p.galaxy === "Maalith");
    maalith.forEach((p, i) => out.push({ ticks: archiveTicks(80.17 + i * 0.0008), sign: STATUS.indexOf("ENTRY-X"), text: this.text(`Shem khet: ${p.name}. Vend'onneth ma-dosh. Esheth nul.`, "") }));
    // The recent window: one line per long turn, the last few dozen of 512.
    // Every eighth long turn Tharvend re-reads the last room; now and then
    // a repair (tharvend.md, the recent window's hand-written entries).
    const end = nowTicks(Date.UTC(2026, 8, 17));
    const line = this.b.generated["recent window"]?.[0] ?? "";
    const R = this.b.generated["repairs"] ?? [];
    for (let k = 40; k >= 1; k--) {
      const t = end - BigInt(k) * LONG_TURN_TICKS;
      out.push({ ticks: t, sign: STATUS.indexOf("ORMAA"), text: this.text(line, "") });
      if (k % 8 === 0 && R[6]) out.push({ ticks: t + 1n, sign: STATUS.indexOf("FILED"), text: this.text(R[6], "Filed: integrity. The count mark: 1 room, intact.") });
      if (k === 29 && R[4]) out.push({ ticks: t + 2n, sign: STATUS.indexOf("REPAIR"), text: this.text(R[4], "Repair: hull. Micro-impact, panel 0041. Sealed.") });
      if (k === 13 && R[5]) out.push({ ticks: t + 2n, sign: STATUS.indexOf("REPAIR"), text: this.text(R[5], "Repair: Ormaa collector. Output fault, collector 5 of 10. Collector 5 retired. Remaining collectors realigned.") });
    }
    return out.sort((a, b) => (a.ticks < b.ticks ? -1 : 1));
  }
  /** The log with the living in it: each arrival, as Tharvend filed it. */
  private logFor(viewer: number) {
    void viewer;
    const arrivals = this.store.portalMembers().flatMap((m, i) => {
      const t = nowTicks(m.filedAt);
      const name = transliterate(m.username);
      return [
        { ticks: t, sign: STATUS.indexOf("DOOR"), text: this.text("Vhaal'ith: oveth ren: naa'ir.", "") },
        { ticks: t + 1n, sign: STATUS.indexOf("LINE"), text: this.text(`Onnith lom: ${m.keystone.toString(8)}: ye.`, "") },
        { ticks: t + 2n, sign: STATUS.indexOf("MEMBERS"), text: this.text(`Sil-ai: ${(i + 1).toString(8)}.`, "") },
        { ticks: t + 3n, sign: STATUS.indexOf("FILED"), text: this.text(`Vend: sil-ai vend: ${name}.`, "") },
        // Gone a while: Tharvend drops the line and holds it open. It doesn't know how not to.
        ...(Date.now() - m.lastSeen > ONLINE_MS ? [{ ticks: nowTicks(m.lastSeen + ONLINE_MS), sign: STATUS.indexOf("LINE"), text: this.text(`Onnith lom: ${m.keystone.toString(8)}: sheva. Lom vhen onn.`, "") }] : []),
      ];
    });
    const repairs = this.store.portalRepairs().map((r) => ({ ticks: nowTicks(r.at), sign: STATUS.indexOf("REPAIR"), text: this.repairText(r.kind, r.subject) }));
    const moves = this.store.portalDoneAll("paelu").map((d) => ({ ticks: nowTicks(d.at), sign: STATUS.indexOf("FILED"), text: this.text(`Vend: ishaal: ${(0o760).toString(8)}: onnith ${(this.store.portalMembers().find((m) => m.userId === d.userId)?.keystone ?? 0).toString(8)}.`, "") }));
    return [...this.log, ...arrivals, ...repairs, ...moves].sort((a, b) => (a.ticks < b.ticks ? -1 : 1));
  }

  // ---- speaking --------------------------------------------------------------
  /** A post arrives as glyph tokens. Every glyph must be cracked, every word
   *  one this reader has learned (PORTAL.md: you can say what you can read). */
  composePost(room: string, tokens: unknown, viewer: number): { ok: true; text: string } | { ok: false; error: string } {
    const r = this.b.rooms.find((x) => x.id === room);
    if (!r || r.kind !== "text") return { ok: false, error: "no_room" };
    if (!Array.isArray(tokens) || tokens.length === 0 || tokens.length > 400) return { ok: false, error: "bad_text" };
    const unlocked = this.unlocked();
    const sepChar: Record<number, string> = { [SEP.GAP]: " ", [SEP.SEAM]: "'", [SEP.CLITIC]: "-", [SEP.STOP]: ". ", [SEP.PAUSE]: ", " };
    let text = "";
    for (const t of tokens) {
      if (!Number.isInteger(t)) return { ok: false, error: "bad_text" };
      if (t >= 0) { if (t >= GLYPH_COUNT || !unlocked.has(t)) return { ok: false, error: "glyph_locked" }; text += GLYPH_SOUND[t]; }
      else if (t in sepChar) text += sepChar[t];
      else return { ok: false, error: "bad_text" };
    }
    text = text.replace(/\s+/g, " ").trim();
    const tok = tokenize(text);
    if (!tok.words.length) return { ok: false, error: "bad_text" };
    const words = this.store.portalWords(viewer);
    for (const w of tok.words) for (const p of w) if (!this.pieceKnown(p, words, unlocked)) return { ok: false, error: "word_unknown" };
    return { ok: true, text };
  }

  // ---- deciphering -------------------------------------------------------------
  /** Claim a glyph's sound. Right: cracked for everyone. */
  guessGlyph(glyph: unknown, sound: unknown, viewer: number, day: string): { ok: true; right: boolean; left: number } | { ok: false; error: string } {
    if (!Number.isInteger(glyph) || (glyph as number) < 0 || (glyph as number) >= GLYPH_COUNT) return { ok: false, error: "bad_glyph" };
    const s = typeof sound === "string" ? normalise(sound.trim()) : "";
    if (!CLAIMABLE.has(s)) return { ok: false, error: "bad_sound" };
    if (this.unlocked().has(glyph as number)) return { ok: false, error: "already_cracked" };
    const wrong = this.store.portalWrongGuesses(viewer, "glyph", day);
    if (wrong >= GLYPH_TRIES) return { ok: false, error: "no_tries" };
    if (GLYPH_SOUND[glyph as number] === s) { this.store.portalUnlockGlyph(glyph as number, viewer, "deduction"); return { ok: true, right: true, left: GLYPH_TRIES - wrong }; }
    this.store.portalGuessedWrong(viewer, "glyph", day);
    return { ok: true, right: false, left: GLYPH_TRIES - wrong - 1 };
  }

  /** Claim a word's meaning: a piece of a word in a post the reader can see. */
  guessWord(target: unknown, wordIx: unknown, pieceIx: unknown, meaning: unknown, viewer: number, day: string):
    { ok: true; right: boolean; left: number; learned?: string } | { ok: false; error: string } {
    const text = this.textFor(target, viewer);
    if (!text) return { ok: false, error: "no_post" };
    const w = Number.isInteger(wordIx) ? text.tok.words[wordIx as number] : undefined;
    const p = w && Number.isInteger(pieceIx) ? w[pieceIx as number] : undefined;
    if (!p) return { ok: false, error: "no_word" };
    if (typeof meaning !== "string" || !meaning.trim() || meaning.length > 60) return { ok: false, error: "bad_meaning" };
    const unlocked = this.unlocked();
    if (!tokenize(p).tokens.every((g) => g < 0 || unlocked.has(g))) return { ok: false, error: "glyph_locked" };
    // In the notation, a word is only there to learn once its marks are cracked.
    if (this.isNotation(target)) { const marks = this.marks(); if (!tokenize(p).tokens.every((g) => !(g in MARK_OF) || marks.has(MARK_OF[g]))) return { ok: false, error: "glyph_locked" }; }
    const info = this.dict.piece(p);
    if (info.kind !== "word") return { ok: false, error: "not_a_word" };
    const words = this.store.portalWords(viewer);
    const open = info.roots.filter((r) => !words.has(r));
    if (!open.length) return { ok: false, error: "already_known" };
    const wrong = this.store.portalWrongGuesses(viewer, "word", day);
    if (wrong >= WORD_TRIES) return { ok: false, error: "no_tries" };
    const hit = open.find((r) => meaningMatches(meaning, this.dict.meaning.get(r)!));
    if (hit) { this.store.portalLearn(viewer, hit); return { ok: true, right: true, left: WORD_TRIES - wrong, learned: hit }; }
    this.store.portalGuessedWrong(viewer, "word", day);
    return { ok: true, right: false, left: WORD_TRIES - wrong - 1 };
  }
  private textFor(target: unknown, viewer: number): Text | null {
    if (typeof target !== "string") return null;
    const [kind, idS] = target.split(":"), id = Number(idS);
    if (kind === "a") { const p = this.posts.find((x) => x.id === id); return p && (p.room !== "last" || this.lastOpen()) ? p.text : null; }
    if (kind === "p") {
      for (const r of this.b.rooms) { const p = this.store.portalPosts(r.id).find((x) => x.id === id); if (p) return this.text(p.text, ""); }
      return null;
    }
    if (kind === "pin") { const p = this.pinned[id]; return p ? p.text : null; }
    if (kind === "g") { const p = this.profiles.find((x) => x.name === idS); return p ? p.bioT : null; }
    void viewer;
    return null;
  }
  private isNotation(target: unknown): boolean {
    if (typeof target !== "string") return false;
    const [kind, idS] = target.split(":"), id = Number(idS);
    const room = kind === "a" ? this.posts.find((x) => x.id === id)?.room : kind === "p" ? this.b.rooms.find((r) => this.store.portalPosts(r.id).some((x) => x.id === id))?.id : undefined;
    return !!room && !!this.b.rooms.find((r) => r.id === room)?.notation;
  }
  /** A reaction target the hall knows about. */
  hasTarget(target: unknown): boolean {
    if (typeof target !== "string") return false;
    const [kind, idS] = target.split(":"), id = Number(idS);
    if (kind === "a") return this.posts.some((p) => p.id === id && p.room !== "last");
    if (kind === "p") return this.b.rooms.some((r) => this.store.portalPosts(r.id).some((p) => p.id === id));
    return false;
  }

  /** The hall's whole state for one reader, on opening. */
  overview(viewer: number) {
    const unlocked = this.unlocked();
    const cracked = this.store.portalGlyphs();
    return {
      rooms: this.rooms(viewer),
      sounds: this.sounds(unlocked),
      cracked: cracked.length,
      glyphCount: GLYPH_COUNT,
      words: this.store.portalWords(viewer).size,
      signs: SIGNS.map((s) => tokenize(s).tokens),
      status: STATUS,
      now: this.stampTokens(nowTicks()),
    };
  }
}
