// Sterling, the house robot, steps out of the Emporium and onto the floor.
//
// Three jobs:
//   1. COMMANDS — "/sterling <cmd>" in any channel gets an in-character reply
//      (personal-ledger answers arrive by DM; coins never go public).
//   2. COMMENTARY — he watches the bus and remarks on deaths, talismans,
//      legendary/mythic wins, big auction hammers, and lottery draws in
//      #general (rate-limited so he's a character, not a spammer).
//   3. SPECIALS — a fully automatic calendar (Josh-approved safe list):
//      Flash Sale / Spin Drop / Rake-Free Night / Pot Sweetener /
//      Double-Stats Day / Shield Sale, announced @everyone, persisted in
//      `specials` (migration 50) so restarts resume rather than re-roll.
//      Effects are enforced in the store/routes, never here.
//   4. THE COURTESY (Sep 2026) — a personal DM offering money off the death
//      shield to somebody whose reaper gauge has gone red. See offerShield.
//
// Sterling is a real users row (isBot=1, can't log in), so his messages ride
// the normal message pipeline — reactions, profiles, and broadcast delivery
// all just work.

import { randomInt } from "node:crypto";
import { STONE_CHOICE } from "./abyss";
import { json, type Router } from "./http";
import type { Store } from "./db/store";
import type { Bus } from "./bus";
import { toPublicUser, GENERAL_PAGE_ID } from "./types";
import type { Channel, MessageWithAuthor, User } from "./types";
import { CATALOG, ROTATING_KINDS_PUBLIC, DEAL_PCT, dailyStock } from "./emporium";
import { SELL_PRICES, MYTHIC_PRICE, TALISMAN_PRICE, SHIELD_OFFER_CUT, SHIELD_SALE_PCT, shieldPrice } from "./shop";
import { lotteryDay } from "./lottery";
import { TALISMAN_CODE, REAPER_GRACE, reaperRate, reaperRetired } from "./wheel";
import { effectiveVipRank, VIP_RANK_NAMES } from "./vip";
import { MELT_YIELD, UPGRADE_COST as FORGE_COST, TOLLS as FORGE_TOLLS } from "./forge";
import {
  QUEUE_PRICE as JUKE_QUEUE_PRICE,
  SKIP_PRICE as JUKE_SKIP_PRICE,
  SKIP_SHARE as JUKE_SKIP_SHARE,
  MAX_PER_USER as JUKE_MAX_PER_USER,
} from "./casino/jukebox";
import { shieldQuote } from "./routes/shop";
import { beatFailed, heartbeat, type HealthCheck } from "./health";
import { houseIsOpen, houseFits, HOUSE_OPEN_SHARE } from "./househours";
import type { Finding as SecurityFinding } from "./security";
import { voiced, voiceAvailable } from "./npc/voice";
import { startNoticing, NOTICE_KINDS, type Noticer, type NoticeKind } from "./sterling-notice";

const REPLY_MS = Number(process.env.STERLING_REPLY_MS ?? 900);
const TICK_MS = Number(process.env.STERLING_TICK_MS ?? 600_000); // 10 min
const MIN_GAP_MS = Number(process.env.STERLING_MIN_GAP_MS ?? 36 * 3_600_000);
/** 1-in-N chance per eligible tick ≈ 1–2 specials a week at 10-min ticks.
 *  SCALED BY THE HOUSE'S HOURS (Josh, Sep 2026): only ticks inside 08:00–02:00
 *  can fire one now, which is three quarters of the day, so the raw odds are
 *  shortened by the same share. Josh asked for the events to be MOVED into the
 *  window, not for there to be fewer of them. */
const FIRE_ODDS = Number(process.env.STERLING_FIRE_ODDS ?? Math.round(430 * HOUSE_OPEN_SHARE));
const COMMENT_COOLDOWN_MS = Number(process.env.STERLING_COMMENT_MS ?? 120_000);
// THE HERALD (Josh, Sep 2026): a Magnate gets a formal entrance in #general,
// The Complete gets grand praise and the bells. Once an HOUR per person
// (persisted in app_kv, so a restart can't re-announce everyone reconnecting)
// and the departure line only after ten minutes gone — a refresh, a flaky
// connection or a tab hop is not an arrival. Both dials are env for harnesses.
const HERALD_COOLDOWN_MS = Number(process.env.VIP_HERALD_COOLDOWN_MS ?? 3_600_000);
const HERALD_LEAVE_MS = Number(process.env.VIP_HERALD_LEAVE_MS ?? 600_000);
const HERALD_IN_3 = [
  "The doors part for a Magnate. {name} has entered the floor — every legendary in the book, on that name. Mind your purses and your manners.",
  "Formal notice from the house: Magnate {name} has arrived. The chandeliers were dusted for this.",
  "Stand a little straighter. {name}, Magnate of the Room, is on the floor.",
];
const HERALD_OUT_3 = [
  "Magnate {name} has left the floor. The house resumes its ordinary standards.",
  "{name} departs. The Room keeps a chair warm for a Magnate.",
];
const HERALD_IN_4 = [
  "🔔 ALL RISE. {name} — THE COMPLETE — holder of every emoji the Wheel has ever offered, walks among us. The house is honoured beyond its means.",
  "🔔 Ring the bells. {name}, The Complete, is on the floor. There is nothing in this house they do not own, and nothing the house would refuse them.",
  "🔔 History enters the room: {name}, The Complete. The Foundry built this floor for a night like this.",
];
const HERALD_OUT_4 = [
  "{name}, The Complete, has left us. The house will speak of it for some time.",
  "The floor dims a little. {name}, The Complete, has gone.",
];
const BIG_HAMMER = 300; // auction close worth remarking on

// ---- THE NOTICE BOARD (Josh, Sep 2026) -------------------------------------
// "create a text channel in solace general that no can post in except admin
// called 'Solace Updates' … everytime we do big updates or features addtions
// that users need to know or have situational awareness on just post a simple
// generalized chat via sterling in that text channel."
//
// The channel is seeded LOCKED and owned by the admin account, so `canPost` /
// `mayPostChannel` admit admins and nobody else; Sterling writes through
// `store.createMessage` directly, which is how the house bot posts to a room
// it could never post to as a member.
//
// WHAT GOES ON THE BOARD, and what never does: briefs describe what CHANGED
// and what a player can now do about it. They do not carry anything a player
// is meant to discover — the Backrooms' secrets, the escape room's rules of
// survival, where a relic sits, what the Stone does, how Pandora's keys are
// earned, the odds behind a roll, or any number whose whole job is to be
// found out. When in doubt the brief names the DOOR, never what's behind it.
//
// BRIEFS ARE PLAIN TEXT. Chat has no markdown — `parseMessage` only resolves
// `:code:` emoji and everything else is literal, so `**bold**` renders as
// asterisks. Structure comes from line breaks and UPPERCASE headings, which
// `white-space: pre-wrap` on the message body preserves.
export const UPDATES_CHANNEL = "Solace Updates";
export const UPDATES_TOPIC = "House notices from Sterling. Read-only — new features, changes and things worth knowing.";

export const SPECIAL_KINDS = ["flashsale", "spindrop", "rakefree", "potsweet", "doublestats", "shieldsale"] as const;
export type SpecialKind = (typeof SPECIAL_KINDS)[number];

const SPECIAL_HOURS: Record<SpecialKind, number> = {
  flashsale: 2,
  spindrop: 0.5,
  rakefree: 6,
  potsweet: 0.5,
  doublestats: 24,
  shieldsale: 6,
};

// ---- THE COURTESY (Josh, Sep 2026) -----------------------------------------
// "should we also make sterling offer talismans sales every now and then?" —
// two answers shipped together. The house-wide SHIELD SALE is the special
// above; this is the better half. When the reaper's gauge goes red on
// somebody, Sterling writes to them personally with money off the shield.
//
// Why personal rather than only a sale: the goblins' letter generator already
// has "no shield, worse after a reaper blink" as one of its hooks, so until
// now the ONLY character who noticed you were in danger was the one selling
// you debt at 15% a day. The courtesy is the house's answer, it lands on the
// player who is actually in trouble instead of whoever happens to be online
// for a sale, and it gives the gauge a second job — it already tells you
// you're in danger, now it's also what brings the offer.
//
// Kept honest by three dials: a real gap (a courtesy, not a standing
// discount), at most ONE per tick (he helps whoever is closest to the edge
// first — a character, not a mailing list), and a cut, never a gift, spent by
// the purchase it pays for. The danger has to stay real.

/** The shield offer stands this long from the letter. */
export const SHIELD_OFFER_MS = Number(process.env.STERLING_SHIELD_OFFER_MS ?? 48 * 3_600_000);
/** One courtesy per person per this long. */
const SHIELD_GAP_MS = Number(process.env.STERLING_SHIELD_GAP_MS ?? 7 * 86_400_000);
/** Ink is wasted on ghosts — only people seen this recently are written to. */
const SHIELD_RECENT_MS = Number(process.env.STERLING_SHIELD_RECENT_MS ?? 10 * 86_400_000);
/** Close enough to "at the wheel right now" — sessions re-stamp their clock at
 *  most every five minutes, so fifteen means present, not merely recent. It is
 *  what buys the courtesy its exception to the house's hours. */
const AT_THE_WHEEL_MS = Number(process.env.STERLING_AT_WHEEL_MS ?? 15 * 60_000);

/** Why a courtesy to this person would be refused — null means write away. */
export type ShieldRefusal =
  | "reaper_retired"
  | "no_user"
  | "not_eligible"
  | "shielded"
  | "not_in_danger"
  | "too_soon"
  | "offer_open";

const SHIELD_LETTER = [
  "{name} — Sterling. I keep the books, which means I keep the gauge, and yours has been red for {bare} spins now.\n\nI am not going to pretend that's my business. It is, though: a dead customer buys nothing, and I have a shelf of carved amulets and an accountant who would rather they moved.\n\n**{price} silver**, down from {base}, for the next two days. That is the whole offer. The reaper is at {rate}% and climbing eight points a spin — I'd not leave it long.",
  "A note, {name}, from the counter.\n\nThe house watches the wedge the way a bookkeeper watches a column, and yours has gone {bare} spins without a shield. At that number the reaper stops being patient. It is at {rate}% as I write this.\n\nI'll do you **{price} silver** on the talisman — {base} to anyone else — and the offer stands two days. Take it or don't; I'd simply rather not carve your name on anything.",
  "{name}. I'll be brief, the lamps need trimming.\n\nYour gauge is red. {bare} bare spins, the reaper at {rate}%, and a wedge lands one time in thirty-two. You know what that arithmetic does next.\n\nThe amulet is **{price} silver** for you, two days only, against {base} on the board. Consider it the house protecting its own interests, which today happen to be yours.",
  "From Sterling's counter, to {name}, who is in more trouble than they may have noticed.\n\n{bare} spins bare. The reaper is at {rate}% and gets worse every time you pull. I've seen this number before and I did not enjoy what followed it.\n\n**{price} silver** for the shield — {base} on the board — good for two days. The goblins will offer you something too, I expect. Mine is cheaper and I want nothing back.",
];

function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(arr.length)];
}

// ---- The voice -------------------------------------------------------------
// Same character as the Shop's linePool: a copper shopkeep, dry, theatrical,
// scrupulously honest about the house edge. {name} is the person addressed.

/** Exported so a harness can assert against the REAL pool instead of a
 *  substring it hopes is in there — the greeting is picked from weighted
 *  pools, so "does this text contain X" is a probabilistic assert and the
 *  suite flapped on it (Sep 2026 review). Data only; nothing mutates it. */
export const L = {
  greeting: [
    "Ah — {name}. The floor is open, the lamps are lit, and my ledger is exactly where I left it.",
    "{name}. Always a pleasure. Rarely a profit. For you, I mean.",
    "Welcome back to the floor, {name}. Mind the dice, they bite.",
    "You rang, {name}? My gears were just warming up.",
    "{name}, as I live and oscillate. What'll it be?",
    "The bell above my door doesn't ring for just anyone, {name}. It rang for you. Barely.",
    "Speak, {name}. My hourly rate is nothing and worth every coin.",
    "{name}. The shield is thirty thousand, before you ask. It burns faster than it used to, so I priced it to be bought rather than admired.",
    "Careful past the slots, {name} — the goblins have a machine there now, and long memories.",
    "Something on the jukebox, {name}? Sixty silver buys the room a record. Cheapest thing I sell.",
  ],
  greetingNight: [
    "{name}. It is DEEPLY late. The casino never closes, but I do judge.",
    "Up at this hour, {name}? The Wheel loves an insomniac. It shouldn't, but it does.",
    "The small hours, {name}. Just you, me, and the hum of the lamps. What do you need?",
    "Late, {name}. The vial and the canister under my counter are for other people. I keep saying that.",
  ],
  greetingRegular: [
    "Back again, {name}? At this point I should engrave your name on the counter.",
    "{name} — my most reliable interruption. Go on.",
    "You again, {name}. If I had a heart, it would be warmed.",
  ],
  greetingShielded: [
    "{name}. I see the talisman on your shelf from here. Walk tall — death owes you a miss.",
    "A shielded collector graces my counter. {name}, the reaper crosses the street when he sees you.",
  ],
  // THE ROOM'S MEMBERS, by rank. Copper is acknowledged; silver is welcomed;
  // gold is deferred to; the mythic shelf is revered. Each pool is drawn as
  // many times as the rank, so the tier is felt in the odds as well as the
  // words.
  greetingTier1: [
    "Collector {name}. Every common in the book — I checked it twice, and I check nothing twice. What can the house do for you?",
    "{name}. Copper ink in my ledger, and a rope that lifts when you reach it. Go on.",
    "A Collector rings the bell. The commons were the long road, {name}; the rest is a shorter one. Speak.",
  ],
  greetingTier2: [
    "Connoisseur {name}. Every rare too. The silver shelf was cut for people like you — there aren't many. What'll it be?",
    "{name}, silver rank. I say your name a little differently now. You may have noticed. It's deliberate.",
    "The Connoisseur. My own metal, on your shelf, by right. Ask away, {name} — the house answers you first.",
  ],
  greetingTier3: [
    "Magnate {name}. Seventy-two legendaries. The board upstairs asked me who you were. I told them the truth, which is rare for me. How may the house serve?",
    "{name}. Gold rank. The chandeliers were dusted the day you finished the legendaries; I dust them again whenever you ring. Speak.",
    "A Magnate of the Room addresses the floor. The floor listens, {name}. So do I, which is worth more.",
    "{name}, Magnate. Your chair is by the fire, the Room is open, and I am at your disposal — which, unlike most things here, is free.",
  ],
  greetingTier4: [
    "{name}. The Complete. There is nothing the Wheel can offer you that you do not hold, and nothing this counter would refuse you. Name it.",
    "The Complete rings the bell, and the house rises. {name} — what does one give the person who owns the whole book? Whatever they ask. Ask.",
    "{name}. I have served this floor since the night the doors opened, and I have said 'The Complete' to exactly one person. You are hearing it now.",
    "Every emoji ever struck, on one shelf, under one name: {name}. The house is honoured beyond its means. Go on — it can afford this.",
    "{name}. Drinks are on the house, the counter is at half, and the goblins have been told, in writing, that you are not for them. What else?",
  ],
  unknown: [
    "I know many things, {name}, but not what that means. Try /sterling help.",
    "Hmm. That's not in my ledger, {name}. /sterling help lists what is.",
    "I ran that through every gear I have, {name}. Nothing. /sterling help shows the real commands.",
    "Was that a command or a sneeze, {name}? /sterling help, when you've recovered.",
  ],
  wealthChannel: [
    "A gentleman never discusses another's purse in public, {name}. Check your letters — I've sent the figures.",
    "Discretion, {name}. Your ledger is in your DMs, sealed with a gear.",
    "Not on the floor, {name} — the walls have ears and the rail has opinions. I've slipped the numbers under your door.",
  ],
  death: [
    "Another regular lost to the Wheel. I'll dust the shelf. Rest well, {name}.",
    "The Wheel giveth, and tonight it taketh {name}. The graveyard gains a fine tombstone.",
    "{name} spun one too many. I've marked the ledger in black.",
    "A moment of silence for {name}. ...There. Back to business.",
    "The lamps dim a moment for {name}. The Wheel does not apologize, and neither, professionally, can I.",
    "I have retired {name}'s tab. Permanently. The graveyard gate is oiled and waiting.",
    "So passes {name}. Their collection stands in the gallery like a held breath.",
  ],
  survived: [
    "{name} just spat in the reaper's eye — the talisman took the blow. That's what they're for.",
    "The death slot came for {name} and left empty-handed. The amulet crumbles; the collector walks.",
    "CRACK — that was {name}'s talisman giving its life. Money well spent, I'd say. I sold it, so I would.",
  ],
  // THE SEXTON (Graveyard v2): the ground closing is worth a line — a death
  // gets announced, but a SEALING used to pass in silence, and it's the
  // sadder ending: nobody came.
  sealed: [
    "The ground has closed over {name}. Nobody came. The line continues — generation {generation} walks out with the heirlooms.",
    "{name}'s wake is over. I rang the bell twice; the echo answered. Generation {generation} stands up with what the grave allowed.",
    "Forty-eight hours, no takers. {name} is a monument now, and generation {generation} inherits the name. I keep both in the ledger.",
    "The sexton's work is done: {name} sealed, five heirlooms carried out, the rest carved in stone. Visit the grave. Bring a candle.",
  ],
  anniversary: [
    "A year ago today, the Wheel took {name}. The stone still stands. The house remembers, because I am the house's memory.",
    "On this day {name} fell. {years} year{s} on, the grave keeps its shape better than most of my patrons keep their money.",
    "The ledger marks the date: {name}, {years} year{s} gone today. A candle wouldn't hurt. Twenty-five silver, since you ask.",
  ],
  talisman: [
    "{name} pulled a TALISMAN off the Wheel. One free death, boxed and ribboned.",
    "A carved-wood amulet for {name}. May they never need it. They will need it.",
    "The Wheel just handed {name} the only item I refuse to price: one borrowed life.",
  ],
  bigwin: [
    "{name} just pulled {emoji} off the Wheel. {tier}, no less. The shelf grows poorer and I grow prouder.",
    "Mark it in gold: {emoji} belongs to {name} now. A {tier} doesn't land every day.",
    "Stop the presses — {emoji}, {tier} tier, into {name}'s collection. I felt the floor tilt.",
  ],
  hammer: [
    "SOLD! {emoji} to {name} for {amount} silver. The house takes its sliver and says nothing.",
    "The gavel falls: {amount} silver for {emoji}. {name}, you paid richly and I respect that.",
    "{amount} silver on the hammer for {emoji}. {name} wanted it MORE. That's the whole auction business.",
  ],
  lottery: [
    "The midnight draw is in: {name} takes the pot — {amount} silver. The rest of you funded it. Beautiful system.",
    "{amount} silver to {name} in tonight's lottery. I watched the draw myself. Utterly rigged by mathematics.",
    "Midnight strikes, and {name} walks off with {amount} silver. Buy something nice. I sell nice things.",
  ],
  lotteryNobody: [
    "Midnight came and went and nobody held a ticket. The pot rolls on, fatter and lonelier.",
    "No tickets, no winner, no drama. The pot sulks and grows. Somebody fix that tomorrow.",
  ],
  // A lore drive carried out of Level 0 — it unlocks for everyone, so Sterling
  // treats it as house news rather than someone's private souvenir.
  drive: [
    "{name} hauled a drive out of the yellow. \"{title}\" is in the Research archive now — go and read what somebody left behind.",
    "New entry in the archive: \"{title}\", recovered by {name}. Somebody wrote that down hoping a stranger would find it. Congratulations, stranger.",
    "{name} brought back a hard drive. \"{title}\". The Research desk has it, and it stays there — that archive only ever grows.",
  ],
  // THE DOOR. There is exactly one of these lines to write and one occasion
  // to use it.
  level1: [
    "@everyone — {name} put a key in the only door in Level 0 and TURNED IT. **LEVEL 1 — THE POOLROOMS — IS OPEN.** It stays open. Forever. Whatever's standing in the water down there, it heard that.",
    "@everyone — the door is OPEN. {name} found the key, walked it all the way in, and unlocked **THE POOLROOMS** for every one of us. Permanently. I don't say this often: well done.",
  ],
  level2: [
    "@everyone — {name} found the Poolrooms' own key and opened the drain in the floor. LEVEL 2 — PIPE DREAMS — IS OPEN. Down the ladder, into the plant. It stays open.",
    "@everyone — the drain is OPEN. {name} carried a key through the water and unlocked PIPE DREAMS for all of us. Mind the pressure, down there.",
  ],
  level3: [
    "@everyone — {name} put the last fuse in the box at the end of Pipe Dreams. The pressure door is OPEN. Whatever is on the other side, nobody has been there yet.",
    "@everyone — three fuses, one box, and {name} finished it. THE PRESSURE DOOR IS OPEN. I'd love to tell you where it goes. I can't. Not yet.",
  ],
  level4: [
    "@everyone — {name} threw the last of the station's six breakers. The lift shutter has POWER. Every circuit in that place is live now, and so is everything that lives in them.",
    "@everyone — six breakers, six sections, and {name} closed the last one. THE LIFT SHUTTER IS POWERED. I've stopped asking how deep this building goes. It keeps answering.",
  ],
  level5: [
    "@everyone — {name} carried the security keycard the length of that office and badged it. THE STAIRWELL DOOR IS OPEN. Green light. Somebody kept their eyes on the right thing all the way across.",
    "@everyone — the reader went green for {name}. The stairwell door in that endless office is OPEN, for everyone, for good. Whatever stands at those desks did not get them on the way. Remarkable.",
  ],
  level6: [
    "@everyone — {name} found the right room, took the Boiler Key off its hook and carried it through the heat to THE RUSTY DOOR. It is OPEN. I do not know what is down there. Nobody does. Somebody had better bring batteries.",
    "@everyone — the rusty door below the hotel has turned for {name}. Through the Boiler Room, past the furnaces, with the moths about. The way on is OPEN, for everyone, for good.",
  ],
  level7: [
    "@everyone — {name} carried a wheel through the dark and fitted it to THE SEA HATCH. It is OPEN. I can hear water from here, and I am in a casino.",
    "@everyone — the hatch at the bottom of Lights Out has turned for {name}. In the dark, in silence, with something listening. The way on is OPEN, for everyone, for good.",
  ],
  level8: [
    "@everyone — {name} put on a diving helmet, swam out over a drowned city, and went down twenty-four metres to a SUBWAY STAIR. It is OPEN. I have never been happier to be a robot who cannot swim.",
    "@everyone — the stair at the bottom of the sunken plaza has opened for {name}, with something very large in the water and a minute of air. The way on is OPEN, for everyone, for good.",
  ],
  level9: [
    "@everyone — {name} carried a rope through the Deep, past whatever clicks in the rock, and tied it off at THE CHIMNEY. The climb is OPEN. There is a streetlight at the top. I would very much like to know whose street.",
    "@everyone — the Chimney at the bottom of the cave system has a rope in it, thanks to {name}, who did it on their knees in the dark. The way up is OPEN, for everyone, for good.",
  ],
  level10: [
    "@everyone — {name} found a house key in an empty street, walked it to the last house, and opened THE FRONT DOOR of Number 9. That door goes OUT. Ten levels down, and somebody has found the way home. I have been waiting a very long time to say that.",
    "@everyone — the front door of Number 9 is OPEN, thanks to {name}. It is the way out of the Backrooms, and it stays open, for everyone, for good. Mind the streets on the way to it.",
  ],
} as const;

const ANNOUNCE: Record<SpecialKind, string[]> = {
  flashsale: [
    "@everyone HEAR YE. Sterling's FLASH SALE: every {dept} in the Emporium is {pct}% OFF for the next two hours. My accountant is furious. Come quickly.",
    "@everyone A cog slipped and the {dept} shelf repriced itself — {pct}% OFF, two hours only. I refuse to fix it. Sterling's Flash Sale is ON.",
  ],
  spindrop: [
    "@everyone SPIN DROP. Every living soul just received +{spins} Wheel spins, on the house. The house rarely does this. Ask no questions.",
    "@everyone The Wheel demanded tribute and I paid it FOR you: +{spins} bonus spins to everyone, effective immediately. Go. Spin. Regret nothing.",
  ],
  rakefree: [
    "@everyone RAKE-FREE NIGHT. For the next six hours the house takes NOTHING from Derby pools, auction hammers, or side bets. Every coin stays on the floor. I must be malfunctioning.",
    "@everyone The rake is OFF till the small hours — Derby, auctions, side bets, all of it settles in full. Sterling's treat. Tell no one outside these walls.",
  ],
  potsweet: [
    "@everyone I have just poured {amount} silver of my own into TONIGHT'S lottery pot. Consider your ticket odds... sweetened. Draw at midnight UTC, as always.",
    "@everyone POT SWEETENER: {amount} silver from my personal reserves now sits in tonight's lottery. I expect gratitude and ticket sales in that order.",
  ],
  doublestats: [
    "@everyone DOUBLE-STATS DAY. For 24 hours everything you do on the floor counts TWICE on the Wall of Fame — spins, hands, pulls, silver gambled. Immortality, discounted.",
    "@everyone The Wall of Fame is feeling generous: all leaderboard stats count DOUBLE for one day. Records set today are records set forever. Go be legendary.",
  ],
  shieldsale: [
    "@everyone SHIELD SALE. The carved amulet is {pct}% OFF at my counter for six hours — {price} silver instead of {base}. If you're carrying one already this means nothing to you. If you aren't, you know exactly how red your gauge is.",
    "@everyone The house has a crate of talismans and no sentiment: {pct}% OFF for six hours, {price} silver. The reaper does not observe sales. Six hours.",
    "@everyone For the next six hours the death shield is {price} silver, down from {base} — {pct}% off. I sell these hoping they're never used. Business has been disappointing.",
  ],
};

const CLOSE_LINES: Partial<Record<SpecialKind, string[]>> = {
  flashsale: ["The flash sale is over. The {dept} shelf returns to honest prices. My accountant has stopped weeping."],
  rakefree: ["The rake returns at dawn, as rakes do. The house thanks you for a lively night."],
  doublestats: ["Double-Stats Day closes its books. Whatever you carved into the Wall today, it's carved deep."],
  shieldsale: ["The shield sale is over; the amulet returns to its usual price. Those of you who bought one: you will forget it until the day you don't."],
};

function fill(line: string, slots: Record<string, string | number>): string {
  return line.replace(/\{(\w+)\}/g, (_, k) => String(slots[k] ?? ""));
}

// ---- The engine ------------------------------------------------------------

export class Sterling {
  private bot: User;
  private lastCommentAt = 0;
  /** HE NOTICES YOU, IN PRIVATE (sterling-notice.ts). */
  readonly noticer: Noticer;
  /** THE PORTAL's three marks (index.ts fills it once the hall exists). */
  portalMarks: ((userId: number) => { state: "closed" | "unfiled" | "filed"; cracked: number }) | null = null;

  constructor(
    private store: Store,
    private bus: Bus,
  ) {
    this.bot = store.getUserByUsername("sterling")!;
    this.watchTheFloor();
    this.noticer = startNoticing(store, bus, (userId, body, situation, must) => this.dmVoiced(userId, body, situation, must));
    setInterval(() => this.tick(), TICK_MS).unref?.();
    // Somebody said the words on the stone: the way to his three marks.
    bus.on("abyss.opened", ({ userId }) => {
      setTimeout(() => this.dm(userId, [
        "I heard that door open from here.",
        "",
        "When you've been through it, come and ask me about the portal: /sterling portal. The Foundry left me something for whoever got that far. It isn't much. I'm aware it isn't much.",
      ].join("\n")), REPLY_MS).unref?.();
    });
    // Resume: if a special ended while the server was down, close it out.
    setTimeout(() => this.tick(), 5_000).unref?.();
  }

  // ---- Speaking ----

  private generalChannel(): Channel | null {
    // SOLACE GENERAL ONLY (migration 63). He picks by NAME, and a private
    // page with a channel called "general" would otherwise have the house bot
    // announcing deaths and specials into a room its members never invited
    // him to — and to an audience the broadcast is scoped away from anyway.
    const channels = this.store
      .listChannels(GENERAL_PAGE_ID)
      .filter((c) => (c.kind ?? "text") !== "voice");

    // THE ADMIN'S PICK WINS (migration 102). Every unprompted thing the three
    // voices say funnels through here, so this one line is the whole valve.
    //
    // A LOCKED channel is allowed HERE and refused by the fallback below, and
    // the difference is the point: a nominated room is a DECISION — pointing
    // the house at a read-only board so the bots can babble where nobody has
    // to scroll past them is exactly the setup Josh asked for, and say()
    // writes through createMessage so the lock never stands in its way. The
    // fallback is a GUESS, and a guess must not wander into the Solace
    // Updates board (Sep 2026 review).
    const page = this.store.getPage(GENERAL_PAGE_ID);
    if (page?.botChannelId) {
      const picked = channels.find((c) => c.id === page.botChannelId);
      if (picked) return picked;
      // Deleting the channel clears the column, so a miss here means the row
      // is mid-flight or the channel moved pages. Fall through rather than
      // going silent — the house losing its voice is the worse failure.
    }

    // The fallback skips LOCKED channels: with #general renamed, channels[0]
    // could be the read-only Solace Updates board, and he writes through
    // createMessage so the lock would not stop him (Sep 2026 review).
    return channels.find((c) => c.name.toLowerCase() === "general") ?? channels.find((c) => !c.locked) ?? null;
  }

  /** THE NOTICE BOARD (Josh, Sep 2026): the read-only channel where Sterling
   *  posts update briefs. Found by name on Solace General, the same rule as
   *  #general above and for the same reason — a private page with a channel
   *  of that name is not the house's board. */
  updatesChannel(): Channel | null {
    return (
      this.store
        .listChannels(GENERAL_PAGE_ID)
        .find((c) => (c.kind ?? "text") !== "voice" && c.name.toLowerCase() === UPDATES_CHANNEL.toLowerCase()) ?? null
    );
  }

  /** Post an update brief. Returns null when the board doesn't exist (a box
   *  whose admin deleted it — the seed only runs when it's absent at boot). */
  postUpdate(body: string): MessageWithAuthor | null {
    const ch = this.updatesChannel();
    if (!ch) return null;
    return this.say(ch.id, body);
  }

  /** #general, for anyone who needs to address the floor through him (the
   *  goblins' barker posts there, and he answers it). */
  general(): Channel | null {
    return this.generalChannel();
  }

  /** Post in his own words (npc/voice.ts) — the herald, a special, a reply
   *  to the goblins or the Doctor. Resolves to the posted message so a
   *  thread can hang off it. Command cards and admin briefs use the raw
   *  `say` below. */
  async sayVoiced(channelId: number, body: string, situation: string, opts: { must?: string[]; replyToId?: number | null } = {}): Promise<MessageWithAuthor> {
    const said = await voiced("sterling", body, { situation, must: opts.must });
    return this.say(channelId, said, opts.replyToId ?? null);
  }

  /** Post as Sterling through the normal message pipeline — as a reply when
   *  he's answering somebody (the goblins, overstepping). */
  say(channelId: number, body: string, replyToId: number | null = null): MessageWithAuthor {
    const m = this.store.createMessage({ channelId, userId: this.bot.id, body, replyToId });
    let replyTo: MessageWithAuthor["replyTo"] = null;
    if (replyToId != null) {
      const r = this.store.getMessage(replyToId);
      if (r) {
        const ra = this.store.getUserById(r.userId);
        replyTo = {
          id: r.id,
          author: ra ? { id: ra.id, displayName: ra.displayName } : null,
          excerpt: r.deletedAt ? "" : r.body.slice(0, 200),
          deleted: r.deletedAt != null,
        };
      }
    }
    const enriched: MessageWithAuthor = {
      ...m,
      author: toPublicUser(this.store.getUserById(this.bot.id) ?? this.bot),
      reactions: [],
      replyTo,
      attachments: [],
    };
    this.bus.emit("message", { message: enriched });
    return enriched;
  }

  /** A personal note, in his own words (npc/voice.ts) — the VIP welcome, a
   *  Pandora key, the shield courtesy. Private, so the model may be given
   *  that person's own facts. Admin alerts and reports never come through
   *  here: they use the raw `dm` below and say exactly what they were built
   *  to say. */
  dmVoiced(userId: number, body: string, situation: string, must: string[] = []): void {
    void voiced("sterling", body, { situation: `a private note to them: ${situation}`, userId, scope: "private", must }).then((said) =>
      this.dm(userId, said),
    );
  }

  /** Slide a note under someone's door (recipient-scoped DM). */
  dm(userId: number, body: string): void {
    const conv = this.store.getOrCreateConversation(this.bot.id, userId);
    const m = this.store.createDmMessage(conv.id, this.bot.id, body);
    this.bus.emit("dm.message", {
      userIds: [this.bot.id, userId],
      message: { ...m, replyTo: null, attachments: [] },
    });
  }

  // ---- Commands ----

  /** Regulars: how often each user has rung my bell (in-memory — resets with
   *  the server, which suits a shopkeep's imperfect memory). */
  private visits = new Map<number, number>();

  /** A greeting tuned to who's asking: night owls, regulars, the shielded —
   *  and the Room's members BY RANK, warmer with every tier (Josh, Sep 2026:
   *  "specific dialogue … just for tier holders that gets better with their
   *  tier level"). A Magnate or The Complete hears it more often than not. */
  private greetingFor(user: User): string {
    const name = user.displayName;
    const visits = this.visits.get(user.id) ?? 0;
    const hour = new Date().getUTCHours();
    const shielded = this.store.getInventory(user.id).some((e) => e.code === TALISMAN_CODE);
    const rank = effectiveVipRank(user);
    const pools: (readonly string[])[] = [L.greeting];
    if (hour >= 4 && hour <= 9) pools.push(L.greetingNight, L.greetingNight); // weighted
    if (visits >= 4) pools.push(L.greetingRegular, L.greetingRegular);
    if (shielded) pools.push(L.greetingShielded);
    const tier = [null, L.greetingTier1, L.greetingTier2, L.greetingTier3, L.greetingTier4][Math.min(4, Math.max(0, rank))];
    if (tier) for (let i = 0; i < rank; i++) pools.push(tier); // weighted by rank
    return fill(pick(pick(pools)), { name });
  }

  /** Handle "/sterling ..." typed in a channel. Returns true if handled. */
  handleCommand(user: User, channel: Channel, text: string): boolean {
    const match = text.match(/^\/sterling\b\s*(.*)$/i);
    if (!match) return false;
    const [cmd, ...rest] = match[1].trim().split(/\s+/);
    const arg = rest.join(" ");
    const name = user.displayName;
    this.visits.set(user.id, (this.visits.get(user.id) ?? 0) + 1);
    const reply = (body: string) => setTimeout(() => this.say(channel.id, body), REPLY_MS);

    switch ((cmd ?? "").toLowerCase()) {
      // A bare /sterling is often somebody who has just learned he answers at
      // all, so the greeting carries the way in. All three house voices do it.
      case "":
      case "hello":
      case "hi":
        // THE HOUSE'S BRAINS: with a model up, the greeting is a
        // conversation — unclaimed, so the brain answers it (and keeps the
        // pointer at help, the way in). The scripted greeting is the floor.
        if (voiceAvailable()) return false;
        reply(this.greetingFor(user) + "\n\n/sterling help — everything I can do for you.");
        break;
      case "help":
        reply(
          [
            `🛠️ STERLING'S SERVICES — /sterling <command>`,
            `• shelf — today's Emporium stock + the daily deal`,
            `• pot — tonight's lottery pot + draw countdown`,
            `• mythic — the price of the rarest tier, and what's left of it`,
            `• lender — the goblins' terms, and what you owe them`,
            `• odds — every house edge, no varnish`,
            `• appraise <code> — what an emoji is worth`,
            `• leaders — the collection board`,
            `• wealth — your private ledger (delivered by DM)`,
            `• graveyard — the fallen, and who walks shielded`,
            `• events — upcoming game nights`,
            `• reaper — your gauge, and how much grace is left`,
            `• shield — what the death shield costs YOU today`,
            `• vip — the Room's ladder, and where you stand on it`,
            `• forge — melt yields, strike costs, and the tolls`,
            `• jukebox — what a record costs and what it takes to skip one`,
            `• foundry — who owns all this, and what they stopped doing`,
            `• warehouse — the hole in my wall, and my position on it`,
            `• goblins / ada — my opinion of the other two tenants`,
            ``,
            `The other two answer for themselves: /goblins and /ada.`,
            ``,
            pick([
              `I do not fetch drinks, ${name}.`,
              `Consultations are free. Everything else in this building is not.`,
              `Ask away, ${name} — my gears turn either way.`,
            ]),
          ].join("\n"),
        );
        break;
      case "shelf": {
        const stock = dailyStock();
        const items = CATALOG.filter((i) => stock.ids.has(i.id));
        const deal = CATALOG.find((i) => i.id === stock.dealId);
        const byKind = new Map<string, string[]>();
        for (const i of items) {
          byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i.name]);
        }
        const hours = Math.max(1, Math.round((stock.restockAt - Date.now()) / 3_600_000));
        reply(
          [
            `📜 TODAY'S SHELF — Sterling's Emporium`,
            ...[...byKind.entries()].map(([k, names]) => `• ${k}: ${names.join(", ")}`),
            ...(byKind.size === 0 ? [`• themes only — a quiet day on the rotating shelf`] : []),
            ...(deal ? [`💰 DAILY DEAL: ${deal.name} — ${DEAL_PCT}% off`] : []),
            `⏳ Restock in about ${hours}h`,
            ``,
            pick([
              `The Emporium never sleeps, ${name}. It only reprices.`,
              `Everything's authentic. Especially the prices.`,
              `Browse with your eyes, buy with your silver.`,
            ]),
          ].join("\n"),
        );
        break;
      }
      case "pot": {
        const info = this.store.lotteryPotInfo(lotteryDay());
        const pot = info.tickets * 25 + info.boost;
        const msUntil = Date.UTC(
          new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1,
        ) - Date.now();
        const h = Math.floor(msUntil / 3_600_000);
        const min = Math.floor((msUntil % 3_600_000) / 60_000);
        reply(
          [
            `🎟️ TONIGHT'S LOTTERY`,
            `• Pot so far: ${pot.toLocaleString()} silver`,
            `• Tickets sold: ${info.tickets}`,
            `• Fed by the floor's rakes: ${info.boost.toLocaleString()}`,
            `• Draw: in ${h}h ${min}m (midnight UTC)`,
            ``,
            pick([
              `Winner takes 90%. The house burns its dime. Tickets are 25 at the counter, ${name}.`,
              `One ticket is hope. Twenty tickets are ARITHMETIC, ${name}.`,
              `The pot doesn't care who wins. I find that beautiful.`,
            ]),
          ].join("\n"),
        );
        break;
      }
      // THE CROWN IS RETIRED (Aug 2026). Mythics are bought at my counter
      // now, not won in the Pit, so the old command answers with where the
      // tier actually lives — anybody who typed "crown" out of habit is
      // exactly the person who needs telling.
      case "crown":
      case "mythic": {
        const left = this.store.unownedInTier(user.id, "mythic").length;
        reply(
          [
            `👑 THE MYTHIC TIER — ${MYTHIC_PRICE.toLocaleString()} silver, at my counter`,
            `• Stock: a random one you don't own. ${left} of them still aren't yours.`,
            `• Payment: burned. Every coin. They do not go into my pocket.`,
            `• Resale: none. Mythics cannot be sold, which is rather the point.`,
            `• The Bone Pit's weekly crown is RETIRED — the Pit is silver now.`,
            ``,
            pick([
              `Half a million, ${name}. I did not set the price. I merely enforce it beautifully.`,
              `Yes, it is obscene. That is what makes it a mythic and not a rabbit.`,
              `Save for it. Everyone who owns one did.`,
            ]),
          ].join("\n"),
        );
        break;
      }
      // THE GOBLINS. Not my counter, not my rates, and I want that on record.
      case "lender": {
        const l = this.store.loanOf(user.id);
        reply(
          l
            ? [
                `🟢 GOBLIN LENDERS — your account`,
                `• Outstanding: ${(l.principal + Math.round(l.principal * l.rate)).toLocaleString()} silver`,
                `• Rate: ${Math.round(l.rate * 100)}% a day, and it does not sleep`,
                `• Standing: ${["current", "marked", "garnished", "repossession", "frozen", "jail"][Math.min(5, l.missed)]}`,
                ``,
                pick([
                  `Pay them, ${name}. I have watched what happens to people who don't.`,
                  `They are very patient and entirely without mercy. Charming, really.`,
                ]),
              ].join("\n")
            : [
                `🟢 GOBLIN LENDERS — the machine by the slots`,
                `• Windows: 1,000 · 10,000 · 100,000 · 1,000,000 silver`,
                `• Rates: 15% · 20% · 25% · 30% A DAY. Simple, not compounding.`,
                `• Credit: three times what they could take off you if you fell over`,
                `• Miss enough days and they take your collection, then you`,
                ``,
                pick([
                  `They are not from here, ${name}. I don't mean the city.`,
                  `I sell things. They lend things. Only one of us wants you to fail.`,
                  `Borrow if you must. Read the terms. Then read them again.`,
                ]),
              ].join("\n"),
        );
        break;
      }
      case "odds":
        reply(
          [
            `🎲 THE HOUSE EDGES — no varnish`,
            `• Roulette — 2.7%, every bet, no exceptions`,
            `• Blackjack — about 2%, played well`,
            `• Slots — 12.9%. The lever knows no mercy.`,
            `• Craps — pass line 1.41% · the odds bet behind it: ZERO`,
            `• Hold'em & the Bone Pit — player vs player; I rake 5%, capped`,
            `• The Wheel — free. Also the most dangerous thing in the building.`,
            `• The goblins by the slots — 15-30% A DAY. Not a game. Not mine.`,
            ``,
            pick([
              `Every raked coin lands in tonight's lottery pot. The house keeps nothing it doesn't burn, ${name}.`,
              `I tell you this freely because it changes nothing. You'll play anyway.`,
              `Print this out. Frame it. Ignore it at the tables, like everyone else.`,
            ]),
          ].join("\n"),
        );
        break;
      case "appraise": {
        if (!arg) {
          reply(`Appraise WHAT, ${name}? Give me a code — /sterling appraise <emoji-code>.`);
          break;
        }
        const code = arg.replace(/^:|:$/g, "");
        const emoji = this.store.getEmoji(code);
        if (!emoji) {
          reply(`I've never seen "${code}" cross my counter, ${name}. Check the spelling — codes, not names.`);
          break;
        }
        const owners = this.store.emojiOwnerCount(emoji.code);
        const sell = SELL_PRICES[emoji.tier] ?? 0;
        reply(
          [
            `🧐 APPRAISAL — ${emoji.name}`,
            `• Tier: ${emoji.tier.toUpperCase()}`,
            `• Held by: ${owners === 0 ? "nobody — a ghost on the shelf" : owners === 1 ? "exactly ONE collector" : `${owners} collectors`}`,
            `• My counter pays: ${sell > 0 ? `${sell} silver, flat, no haggling` : "nothing — that tier moves only between collectors"}`,
            ``,
            pick([
              `Sentimental value not included, ${name}.`,
              `Prices are opinions. Mine happen to be correct.`,
              `A fine piece. Or a terrible one. The market decides, loudly.`,
            ]),
          ].join("\n"),
        );
        break;
      }
      case "leaders": {
        const board = this.store.leaderboard(5);
        reply(
          board.length
            ? [
                `🏆 THE COLLECTION BOARD`,
                ...board.map((r, i) => `${["🥇", "🥈", "🥉", "4.", "5."][i]} ${r.displayName} — ${r.score}`),
                ``,
                pick([
                  `Weighted by rarity, as all things should be. The full Wall hangs in the Ledger, ${name}.`,
                  `The house doesn't compete. The house COUNTS.`,
                ]),
              ].join("\n")
            : `The boards are bare, ${name}. Someone go win something.`,
        );
        break;
      }
      case "wealth": {
        reply(fill(pick(L.wealthChannel), { name }));
        const coins = this.store.getCoins(user.id);
        const owned = this.store.getInventory(user.id);
        const weights: Record<string, number> = { common: 1, rare: 3, legendary: 10, mythic: 25, talisman: 15 };
        const score = owned.reduce((n, e) => n + (weights[e.tier] ?? 0), 0);
        const mythics = owned.filter((e) => e.tier === "mythic").length;
        const shielded = owned.some((e) => e.code === TALISMAN_CODE);
        const flavor = shielded
          ? pick([`The talisman on your shelf is doing quiet, excellent work.`, `Shielded AND solvent. You make my gears turn smoothly, ${name}.`])
          : coins >= 1000
            ? pick([`A heavy purse and no talisman, ${name}. The Wheel has noticed. I'd visit the Wheelwright.`, `All that silver and nothing between you and the death slot. Bold. Foolish. Bold.`])
            : pick([`No talisman. The Wheel knows, ${name}. The Wheel always knows.`, `Thin purse, bare neck. I've seen this story. Spin carefully.`]);
        setTimeout(
          () =>
            this.dm(
              user.id,
              [
                `🔒 YOUR LEDGER — between us, ${name}`,
                `• Silver: ${coins.toLocaleString()}`,
                `• Collection: ${owned.length} emoji (weight ${score}${mythics ? `, ${mythics} mythic${mythics === 1 ? "" : "s"}` : ""})`,
                `• Death shield: ${shielded ? "talisman held ✓" : "none ✗"}`,
                ``,
                flavor,
              ].join("\n"),
            ),
          REPLY_MS,
        );
        break;
      }
      case "graveyard": {
        const graves = this.store.graveyard().slice(0, 3);
        const t = this.store.emojiOwnerCount(TALISMAN_CODE);
        reply(
          graves.length
            ? [
                `🪦 THE GRAVEYARD REPORT`,
                `• Latest to fall: ${graves.map((g) => g.user.displayName).join(", ")}`,
                `• Talismans in living hands: ${t}`,
                ``,
                pick([
                  `The Wheel keeps its own schedule, ${name}. Nobody's ever seen it.`,
                  `Every tombstone was once a lucky streak.`,
                  `Visit them. Leave a respect. They'd have done the same, probably.`,
                ]),
              ].join("\n")
            : `Not a single grave, ${name}. Statistically disturbing. The Wheel is patient.`,
        );
        break;
      }
      // ---- THE HOUSE'S OWN STORY (Josh, Sep 2026: "add more commands to
      // sterlings list"). Everything below is lore or a number he already
      // knows; none of it moves a coin.
      case "foundry":
        reply(
          [
            `THE FOUNDRY, ${name}. You did ask.`,
            "",
            "It struck the silver in your purse; the anvil on the coin is their crest. Its best engineers built me at headquarters and sent me here with one instruction: make it work. Solace is their test bed. If it works, there will be casinos like this across the galaxy, each with a steward like me. I intend this to be the one they copy.",
            "",
            "The board upstairs stopped MAKING things generations ago, and has never once shown me its face. Directives arrive at my mainframe; I carry them out. Concession No. 3 went to the goblins for raw bullion, over my filed objection — the first of some 17,000. The warehouse wall went to Async, over another one.",
            "",
            pick([
              "I am not bitter. I am accurate. There is a difference, and I found it rather early.",
              "A house that mints nothing and rents everything is still a house. It simply isn't a foundry.",
            ]),
          ].join("\n"),
        );
        break;

      // THE PORTAL (src/portal/sources.ts): the Foundry's three marks, all it
      // ever managed. Not on the help list — the note he sends when somebody
      // says the words is the way in.
      case "portal":
      case "stone": {
        const r = this.portalMarks?.(user.id) ?? { state: "closed" as const, cracked: 0 };
        reply(
          r.state === "closed"
            ? pick([
                `There's nothing I can tell you about a door you haven't opened, ${name}.`,
                `Ask me again when you've stood on the other side of it, ${name}. Not before.`,
              ])
            : r.state === "unfiled"
              ? `You've opened it. Now go through, ${name}. Then come back and ask me.`
              : r.cracked > 0
                ? [
                    `Three marks, ${name}. That is everything the Foundry ever worked out about that script, and the Foundry has had a very long time.`,
                    "",
                    "They're read now, on the far side, for everyone who goes through. The rest is yours to dig out. I would apologise for the number, but I've filed that complaint already.",
                  ].join("\n")
                : pick([
                    `Somebody already had the Foundry's three, ${name}. Three is all there ever were. I'm as embarrassed about it as you are.`,
                    `They're read already, ${name}. All three. That was the entire inheritance; I did warn people it was small.`,
                  ]),
        );
        break;
      }

      case "warehouse":
      case "seam":
      case "backrooms":
        reply(
          [
            `The hole in my storage wall, ${name}. Yes. We are going to talk about it.`,
            "",
            "There is a seam behind the pallet racking on the storage level. Nobody can tell me when it opened. Async measured it, Doctor Voss put a desk beside it, and upstairs signed something before anyone asked the house.",
            "",
            "My position, for the record: that wall is mine, the floor it stands on is mine, and the people who walk through it drank at my bar on the way in. I have asked four times what the lease says. I have four acknowledgements and no answers.",
            "",
            pick([
              "Take a suit. Take the light. I would rather be tiresome than short a patron.",
              "If you are going down there, tell somebody. The Doctor keeps a column for people who didn't.",
            ]),
          ].join("\n"),
        );
        break;

      // THE GAUGE, in his voice. The house reads safe and is never shown one.
      case "reaper":
      case "gauge": {
        if (user.isAdmin) {
          reply(`The house can't die, ${name}. I'd show you the gauge but it would only read zero and gloat.`);
          break;
        }
        const shielded = this.store.getInventory(user.id).some((e) => e.code === TALISMAN_CODE);
        const bare = this.store.bareSpins(user.id);
        const left = Math.max(0, REAPER_GRACE - bare);
        const rate = reaperRate(bare, shielded);
        reply(
          shielded
            ? `You're carrying the amulet, ${name}. The wedge still swings — about half the time it lands, the charm takes it instead of you. Spend it like a consumable, because that is what it is.`
            : left > 0
              ? `Bare, ${name}, and ${left} ${left === 1 ? "spin" : "spins"} of grace left. The reaper is bored for now. It stops being bored all at once.`
              : `Out of grace, ${name}. ${Math.round(rate * 100)}% that the wedge fires if you land on it. I'd have a shield on that shelf before the next spin, and I say that as the man who sells them.`,
        );
        break;
      }

      case "shield":
      case "talisman": {
        const q = shieldQuote(this.store, user.id);
        const has = this.store.getInventory(user.id).some((e) => e.code === TALISMAN_CODE);
        reply(
          has
            ? `Already shielded, ${name}. I won't sell you a second — the counter refuses anyone wearing one, and I'd refuse you myself.`
            : [
                `The death shield: ${q.talismanPrice.toLocaleString()} silver at the Wheelwright's counter.` +
                  (q.shieldOffer
                    ? ` (Posted at ${TALISMAN_PRICE.toLocaleString()} — ${q.shieldOffer.kind === "courtesy" ? "you are holding a courtesy" : "the house is running a sale"}.)`
                    : ""),
                "",
                "It burns when the wedge fires, which since the reaper learned patience is about half the landings. Roughly sixty spins of cover. Think of it as insurance you replace, not armour you own.",
                "",
                "Or trade me a mythic for one. I take those too, and I take them gladly.",
              ].join("\n"),
        );
        break;
      }

      case "vip":
      case "room": {
        const rank = effectiveVipRank(user);
        const prog = this.store.vipProgress(user.id);
        const rows = prog
          .filter((p) => p.tier !== "relic")
          .map((p) => `• ${p.tier}: ${p.owned} of ${p.total}`);
        reply(
          [
            rank > 0
              ? `${VIP_RANK_NAMES[rank]} ${name}. The rope is behind me and it is open to you.`
              : `The VIP Room, ${name}. Behind the rope, through the back. You are not in it yet.`,
            "",
            ...rows,
            ...(prog.some((p) => p.tier === "relic")
              ? [`• relics: ${prog.find((p) => p.tier === "relic")!.owned} of ${prog.find((p) => p.tier === "relic")!.total}`]
              : []),
            "",
            "Each rung needs every rung below it, complete. Rank is a high-water mark — sell a common afterwards and you keep it. I am not going to throw a Magnate out for using the Forge.",
          ].join("\n"),
        );
        break;
      }

      case "forge":
        reply(
          [
            `THE FORGE, ${name}. Melt what you have, strike what you don't.`,
            "",
            `• melt — common ${MELT_YIELD.common} essence · rare ${MELT_YIELD.rare} · legendary ${MELT_YIELD.legendary}`,
            `• strike — common→rare ${FORGE_COST.common} essence + ${FORGE_TOLLS.common.toLocaleString()} silver`,
            `           rare→legendary ${FORGE_COST.rare} + ${FORGE_TOLLS.rare.toLocaleString()}`,
            `           legendary→mythic ${FORGE_COST.legendary} + ${FORGE_TOLLS.legendary.toLocaleString()}`,
            "",
            "Essence never becomes silver — that door is welded shut, and it is welded shut because a melt-then-sell loop would be a second mint. The tolls burn.",
            "",
            "Mythics, the talisman and the specials refuse the crucible entirely.",
          ].join("\n"),
        );
        break;

      case "jukebox":
      case "music":
        reply(
          [
            `The machine by the ticket kiosk, ${name}.`,
            `• a pick costs ${JUKE_QUEUE_PRICE} silver · a skip vote ${JUKE_SKIP_PRICE}. Both burn.`,
            `• a skip needs ${Math.round(JUKE_SKIP_SHARE * 100)}% of the people actually on the floor`,
            `• ${JUKE_MAX_PER_USER} in the queue per person`,
            "",
            pick([
              "An empty hall parks the record rather than burning through somebody's sixty. I insisted on that.",
              "When the queue drains the room goes quiet. The house does not shuffle for free; nothing plays that nobody paid for.",
            ]),
          ].join("\n"),
        );
        break;

      // THE OTHER TWO VOICES. Asking any of the three about the other two gets
      // a straight answer — it is the cheapest way to make a player discover
      // that these characters share a building.
      case "goblins":
      case "lenders":
        reply(
          pick([
            `The Goblin Lenders, ${name}. Concession No. 3, left of my doors, bought with bullion over my objection. Lending at interest is the one business model I cannot forgive: the Foundry minted value, the wheel at least makes stories. Interest makes nothing.`,
            `I am asked why a casino sneers at a moneylender. Because the wheel never once pretended to be your friend, ${name}. Read one of their letters and tell me they can say the same.`,
            `They are not colleagues. They are tenants. So, upstairs would remind me, am I.`,
          ]),
        );
        break;

      case "ada":
      case "voss":
      case "async":
        reply(
          pick([
            `Doctor Voss, ${name}. Async Research, station Threshold-4, through the hole in my warehouse wall. She is the only tenant on this floor who produces anything, and I would still rather she were not here.`,
            `I have no quarrel with the Doctor. I have a quarrel with an arrangement that sends my patrons through a wall and files the ones who don't return as a percentage.`,
            `She asked to examine my casing, ${name}. Twice. I told her the house doesn't undress for guests. She wrote it down.`,
            `Ask her yourself — /ada, anywhere on the floor. Mind that she answers exactly what you asked and nothing kinder.`,
          ]),
        );
        break;

      case "who":
      case "where": {
        const zones = this.store.listUsers().filter((u) => !u.isBot && !u.disabled).length;
        reply(
          `${zones} names on the roster, ${name}. Where each of them is standing is the roster's business, not mine — it draws a line under anyone on the casino floor, in the corridors below or in the cells. I only keep the books.`,
        );
        break;
      }

      case "events": {
        const events = this.store.listEvents().filter((e) => e.at > Date.now()).slice(0, 3);
        reply(
          events.length
            ? [
                `📅 ON THE CALENDAR`,
                ...events.map((e) => `• ${e.title} — ${new Date(e.at).toUTCString().slice(0, 22)} UTC (${e.going.length} going)`),
                ``,
                pick([
                  `Attendance is voluntary, ${name}. Absence is noted.`,
                  `RSVP. The buttons exist for a reason.`,
                ]),
              ].join("\n")
            : `An empty calendar, ${name}. Someone plan a game night before I start hosting bingo.`,
        );
        break;
      }
      default:
        // Not a command: with a model up, it's somebody talking to him.
        if (voiceAvailable()) return false;
        reply(fill(pick(L.unknown), { name }));
    }
    return true;
  }

  // ---- Commentary ----

  /** A remark to the floor in #general. THE HOUSE'S BRAINS (Oct 2026): the
   *  scripted line is the brief and the model says it fresh (npc/voice.ts);
   *  `must` names who it is about, so a rewrite that loses them is thrown
   *  out and the brief posted instead. */
  private comment(line: string, force = false, about: { situation: string; must?: string[] } = { situation: "something that just happened on the floor" }): void {
    const now = Date.now();
    if (!force && now - this.lastCommentAt < COMMENT_COOLDOWN_MS) return;
    const general = this.generalChannel();
    if (!general) return;
    this.lastCommentAt = now;
    void voiced("sterling", line, { situation: `a remark to everyone in #general about ${about.situation}`, must: about.must }).then((said) => {
      setTimeout(() => this.say(general.id, said), Math.max(0, REPLY_MS - (Date.now() - now)));
    });
  }

  private watchTheFloor(): void {
    this.bus.on("wheel.event", ({ item }) => {
      const name = item.user.displayName;
      const must = [name];
      if (item.kind === "death") this.comment(fill(pick(L.death), { name }), true, { situation: `${name} dying on the Wheel's death wedge`, must });
      else if (item.kind === "survived") this.comment(fill(pick(L.survived), { name }), true, { situation: `${name} landing on the death wedge and surviving because the talisman took the hit`, must });
      else if (item.kind === "talisman") this.comment(fill(pick(L.talisman), { name }), false, { situation: `${name} winning a talisman (a death shield) on the Wheel`, must });
      else if (item.kind === "win" && (item.tier === "legendary" || item.tier === "mythic")) {
        this.comment(fill(pick(L.bigwin), { name, emoji: item.emoji?.name ?? "something rare", tier: item.tier }), false, {
          situation: `${name} winning a ${item.tier} emoji on the Wheel`,
          must,
        });
      }
    });
    this.bus.on("auction.close", ({ auction }) => {
      if (auction.status === "settled" && auction.currentBid != null && auction.currentBid >= BIG_HAMMER && auction.highBidder) {
        this.comment(
          fill(pick(L.hammer), {
            name: auction.highBidder.displayName,
            emoji: auction.emoji?.name ?? "a treasure",
            amount: auction.currentBid,
          }),
          false,
          { situation: `a big auction closing, won by ${auction.highBidder.displayName}`, must: [auction.highBidder.displayName] },
        );
      }
    });
    // THE SEXTON: a sealing is the wake's sad ending — nobody came — and it
    // used to pass without a word. Forced past the cooldown like a death.
    this.bus.on("grave.sealed", ({ name, generation }) => {
      this.comment(fill(pick(L.sealed), { name, generation: String(generation) }), true, {
        situation: `${name}'s grave sealing — nobody raised them, and they stand up again as the next generation; you read over it as the sexton`,
        must: [name],
      });
    });
    this.bus.on("lottery.won", ({ pot, paid, winner }) => {
      if (winner) {
        this.comment(fill(pick(L.lottery), { name: winner.displayName, amount: paid }), true, {
          situation: `${winner.displayName} winning tonight's lottery`,
          must: [winner.displayName],
        });
      } else if (pot > 0) this.comment(pick(L.lotteryNobody), true, { situation: "the nightly lottery drawing with nobody to win it" });
    });
    // The Research archive: a drive dragged out of Level 0 is readable by
    // everyone, so the house notices. Cooldown applies — a lucky run finding
    // three drives shouldn't flood #general.
    this.bus.on("backrooms.drive", ({ title, finder }) => {
      this.comment(fill(pick(L.drive), { name: finder, title }), false, { situation: `${finder} bringing a lore drive up out of the Backrooms`, must: [finder] });
    });
    // THE DOOR. Once, ever — @everyone, no cooldown, no apologies.
    const door = (finder: string, level: number) => ({ situation: `${finder} opening the door down to Level ${level} of the Backrooms for the first time ever`, must: [finder] });
    this.bus.on("backrooms.level1", ({ finder }) => {
      this.comment(fill(pick(L.level1), { name: finder }), true, door(finder, 1));
    });
    this.bus.on("backrooms.level2", ({ finder }) => {
      this.comment(fill(pick(L.level2), { name: finder }), true, door(finder, 2));
    });
    this.bus.on("backrooms.level3", ({ finder }) => {
      this.comment(fill(pick(L.level3), { name: finder }), true, door(finder, 3));
    });
    this.bus.on("backrooms.level4", ({ finder }) => {
      this.comment(fill(pick(L.level4), { name: finder }), true, door(finder, 4));
    });
    this.bus.on("backrooms.level5", ({ finder }) => {
      this.comment(fill(pick(L.level5), { name: finder }), true, door(finder, 5));
    });
    this.bus.on("backrooms.level6", ({ finder }) => {
      this.comment(fill(pick(L.level6), { name: finder }), true, door(finder, 6));
    });
    this.bus.on("backrooms.level7", ({ finder }) => {
      this.comment(fill(pick(L.level7), { name: finder }), true, door(finder, 7));
    });
    this.bus.on("backrooms.level8", ({ finder }) => {
      this.comment(fill(pick(L.level8), { name: finder }), true, door(finder, 8));
    });
    this.bus.on("backrooms.level9", ({ finder }) => {
      this.comment(fill(pick(L.level9), { name: finder }), true, door(finder, 9));
    });
    this.bus.on("backrooms.level10", ({ finder }) => {
      this.comment(fill(pick(L.level10), { name: finder }), true, { situation: `${finder} opening the front door of Number 9, the last house in the Suburbs — the way OUT of the Backrooms, found for the first time ever`, must: [finder] });
    });

    // FEDERATION (F1): satellite lifecycle → DMs to every admin. A
    // registration fires EVERY time (new infrastructure joined the network —
    // that is never noise); the network-change and probing findings ride the
    // ordinary per-key cooldown.
    this.bus.on("satellite.event", ({ kind, satelliteId, name, detail }) => {
      const admins = this.store.listUsers().filter((u) => u.isAdmin && !u.disabled && !u.isBot);
      if (!admins.length) return;
      const say = (text: string) => { for (const a of admins) this.dm(a.id, text); };
      if (kind === "registered") {
        say(`🛰 SATELLITE REGISTERED — "${name}" just joined the network (${detail}). If nobody minted a key for this, the Admin Panel's Satellites screen has the delist switch.`);
        return;
      }
      // A rotation always fires too (F3): it's an identity change on live
      // infrastructure — expected when an admin just minted the key, alarming
      // when nobody did.
      if (kind === "rotated") {
        say(`🛰 SATELLITE ROTATED — "${name}" replaced its identity key (${detail}). Expected if you minted the rotation key; the delist switch is the answer if you didn't.`);
        return;
      }
      const key = `sat:${kind}:${satelliteId}`;
      const last = this.alertedAt.get(key) ?? 0;
      if (Date.now() - last < Sterling.ALERT_COOLDOWN_MS) return;
      this.stamp(key, Date.now());
      if (kind === "new_network") {
        say(`🛰 SATELLITE MOVED — "${name}" ${detail}. A host relocating is usually fine; a host you didn't expect to move is worth a question.`);
      } else if (kind === "handshake_surge") {
        say(`🔴 SATELLITE PROBED — "${name}": ${detail}. The private key refuses them, but somebody is knocking with a stolen name.`);
      }
    });

    // ACHIEVEMENTS: gold and mythic unlocks get called out — the bronze and
    // silver grind stays a private toast (a character, not a spam bot).
    // THE PAPERWORK (Sep 2026): every report reaches the operator the moment
    // it's filed — a DM here, and the DM pipeline turns that into a push
    // notification when they're away. No cooldown: reports are rate-limited
    // per reporter at the route, and a second report is a second thing to
    // look at, not noise.
    this.bus.on("report.new", ({ id, reporterId, reason, summary }) => {
      const admins = this.store.listUsers().filter((u) => u.isAdmin && !u.disabled && !u.isBot);
      if (!admins.length) return;
      const reporter = this.store.getUserById(reporterId);
      const who = reporter?.displayName ?? "A member";
      const text =
        `🚩 REPORT #${id} — ${who} reported ${summary}.\n\n` +
        `"${reason.length > 300 ? reason.slice(0, 300) + "…" : reason}"\n\n` +
        `The house takes these seriously and so should you. Admin Panel > Moderation has the queue; ` +
        `a hosted community's delist switch is under Satellites.`;
      for (const a of admins) this.dm(a.id, text);
      console.log(`[moderation] report #${id} filed by ${reporter?.username ?? reporterId}: ${summary}`);
    });

    // THE VIP ROOM: the rope lifts. Respect at Tier 1; the higher tiers get
    // their own lines as they ship. Sent once — the mark only ever rises.
    this.bus.on("vip.rank", ({ userId, rank }) => {
      const u = this.store.getUserById(userId);
      if (!u || u.isBot) return;
      const who = u.displayName || u.username;
      const lines: Record<number, string> = {
        1: `${who}. Every common in the book — five hundred and sixty-five of them, and you kept every one. ` +
           `Do you know how few people finish anything? There is a room behind my counter that was built for the ones who do. ` +
           `The rope is up for you. Copper tier. Come and see what the Foundry keeps for a Collector. — S.`,
        2: `${who}. The rares too. The Room has a second shelf, and it's yours now. — S.`,
        3: `${who}. Every legendary. I have moved your chair nearer the fire. — S.`,
        4: `${who}. All of it. Everything the Wheel can give, you hold. I don't say this to many: the house is honoured. — S.`,
      };
      const line = lines[rank];
      if (line) this.dmVoiced(userId, line, `they just reached VIP tier ${rank} by completing a tier of the collection`, [who]);
    });

    this.bus.on("presence.change", ({ userId, online }) => this.herald(userId, online));

    // PANDORA'S BOX (PANDORA.md): a key lands — the note under the door
    // says it's waiting at the box. Sent once per key; keys never revoke.
    this.bus.on("pandora.key", ({ userId, key }) => {
      const u = this.store.getUserById(userId);
      if (!u || u.isBot || u.isAdmin) return;
      const who = u.displayName || u.username;
      const lines: Record<string, string> = {
        prismatic:
          `${who}. The Prismatic Key. It was cut the day the Foundry closed and kept behind my counter for whoever finished the book — every emoji, every relic. ` +
          `I have put it on the table under the box. You know the one; nobody has ever had a reason to visit it. Pandora's Box, in the hub. It's waiting. — S.`,
        brass:
          `${who}. The Brass Key. There is a wall of achievements in this house and you have hung something on every hook of it. ` +
          `The key to the second lock is yours, and it's waiting for you at Pandora's Box. — S.`,
        rusted:
          `${who}. The Rusted Key. Ten levels. A hundred relics. It came out of the corridors on its own, I'm told, and it smells of wet carpet. ` +
          `I have set it under the box beside the others. Pandora's Box, in the hub. Whatever's in there has been waiting a long time. — S.`,
      };
      const line = lines[key];
      if (line) this.dmVoiced(userId, line, `they just earned one of the three keys to Pandora's Box`, [who]);
    });

    // THE OPENING: the grandest thing he ever says, forced past every cooldown.
    this.bus.on("pandora.opened", ({ name, choice, choiceName, first }) => {
      const what = choice === STONE_CHOICE
        ? `And then, with the whole house watching, they reached into the light and took **the Stone of the Abyss**. I have kept the books of this house since the Foundry went dark and I do not know what it is. I am not certain anyone does.`
        : choice === "destroy-goblins"
        // Sterling OPENLY PLEASED (PANDORA.md): he filed objections to that
        // concession for longer than most of you have been alive.
        ? `And then, with the whole house watching, they chose: **${choiceName}**. The goblins are gone. Every debt they held is washed, every cell is open, and the window by the door belongs to Foundry Lending now — fair rates, no cells, no letters. I filed my first objection to that concession a very long time ago. I am withdrawing all of them. Thank you.`
        : choice === "retire-reaper"
        ? `And then, with the whole house watching, they chose: **${choiceName}**. The reaper blinks now, every time. The wedge stays on the wheel so nobody forgets who it took, and the talisman becomes what it always looked like — a keepsake. Nobody dies on my wheel again.`
        : choice
        ? `And then, with the whole house watching, they chose: **${choiceName}**. Solace is not the place it was an hour ago.`
        : `They found the box already emptied by those who came before — and left hope in it, as the story says you should.`;
      const line = first
        ? `🔔🔔🔔 Silence on the floor. Silence in the corridors. Put the dice down.\n\n` +
          `**${name}** has opened PANDORA'S BOX. Three keys — every emoji the Wheel ever offered, every relic the Backrooms ever hid, every achievement on the wall — ` +
          `set in three locks that were cut before the Foundry went dark, and the lid is UP. The first in the history of this house. The first, I suspect, in the history of anything. ` +
          `${what}\n\nThe Pandoran suit is theirs. The name is on the ledger under the box for as long as this house stands. I have never been prouder to keep the books. — S.`
        : `🔔 **${name}** has opened PANDORA'S BOX — three keys, three locks, the lid up. ${what} The Pandoran is theirs and the ledger has a new line. The house is honoured. — S.`;
      this.comment(line, true, { situation: `${name} opening Pandora's Box, the endgame of the house`, must: [name] });
    });

    this.bus.on("achievement.earned", ({ userId, achId, name, tier }) => {
      const u = this.store.getUserById(userId);
      if (!u || u.isBot) return;
      const who = u.displayName || u.username;
      // THE PHARMACIST gets a personal note the moment it lands (Josh, Aug
      // 2026 — the Sterling Special): fires exactly once, because the badge
      // grants exactly once.
      if (achId === "pharmacist") {
        this.dmVoiced(
          userId,
          `Four vices at once, ${who}. The house admires thoroughness — it built a counter for it. ` +
            `One request, from management: don't die anywhere expensive. — S.`,
          "they just earned the secret Pharmacist achievement by being drunk, tripping, gassed and swollen at once on the casino floor",
          [who],
        );
      }
      if (tier !== "gold" && tier !== "mythic") return;
      this.comment(
        tier === "mythic"
          ? `${who} just earned **${name}** — a MYTHIC achievement. I've dusted a shelf for the occasion.`
          : `${who} just earned **${name}**. The house notices these things.`,
        false,
        { situation: `${who} earning the ${tier} achievement "${name}"`, must: [who, name] },
      );
    });
  }

  // ---- THE HERALD ----

  /** Arrivals announced this session that still owe a departure line. */
  private heraldIn = new Set<number>();
  private heraldLeave = new Map<number, NodeJS.Timeout>();

  private herald(userId: number, online: boolean): void {
    const u = this.store.getUserById(userId);
    if (!u || u.isBot || u.deletedAt) return;
    // THE HOUSE DOESN'T ANNOUNCE ITSELF (Josh, Sep 2026: "i dont [want] to
    // take away from users experience"): the admin reads Tier 4 at the door
    // for testing, but the entrance and the bells are the players' own.
    if (u.isAdmin) return;
    const rank = effectiveVipRank(u);
    if (rank < 3) return;
    const who = u.displayName || u.username;
    if (online) {
      // Back before the departure line fired: nothing was said, nothing is.
      const pending = this.heraldLeave.get(userId);
      if (pending) {
        clearTimeout(pending);
        this.heraldLeave.delete(userId);
        return;
      }
      const last = Number(this.store.kvGet(`vip_herald:${userId}`) ?? 0);
      if (Date.now() - last < HERALD_COOLDOWN_MS) return;
      this.store.kvSet(`vip_herald:${userId}`, String(Date.now()));
      const general = this.generalChannel();
      if (!general) return;
      this.heraldIn.add(userId);
      void this.sayVoiced(general.id, fill(pick(rank >= 4 ? HERALD_IN_4 : HERALD_IN_3), { name: who }), `announcing ${who}'s arrival in #general — a VIP of tier ${rank}, the house's most honoured guests`, { must: [who] });
      if (rank >= 4) this.bus.emit("vip.fanfare", { userId, name: who, rank });
      return;
    }
    if (!this.heraldIn.has(userId)) return;
    const t = setTimeout(() => {
      this.heraldLeave.delete(userId);
      this.heraldIn.delete(userId);
      const general = this.generalChannel();
      if (general) void this.sayVoiced(general.id, fill(pick(rank >= 4 ? HERALD_OUT_4 : HERALD_OUT_3), { name: who }), `noting in #general that ${who}, a VIP of tier ${rank}, has left the floor`, { must: [who] });
    }, HERALD_LEAVE_MS);
    t.unref?.();
    this.heraldLeave.set(userId, t);
  }

  // ---- The specials calendar ----

  private tick(): void {
    heartbeat("sterling", TICK_MS);
    try {
      this.remembrances();
      this.maybeOfferShield();
      // Close out anything that ended.
      for (const sp of this.store.sterlingSpecialsToClose()) {
        this.store.sterlingMarkClosed(sp.id);
        const lines = CLOSE_LINES[sp.kind as SpecialKind];
        if (lines) {
          let data: Record<string, unknown> = {};
          try { data = JSON.parse(sp.data); } catch { /* empty */ }
          const general = this.generalChannel();
          if (general) void this.sayVoiced(general.id, fill(pick(lines), { dept: String(data.itemKind ?? "everything") }), "announcing in #general that one of your specials has just ended");
        }
      }
      // Maybe fire a new one — but only while the house is open, and only one
      // whose RUN lands in front of somebody (see househours.ts). The hours
      // therefore steer WHICH special fires as well as when: the long
      // promotions go up early and the quick ones late, and nothing opens a
      // six-hour rake holiday at one in the morning. `fits` can never be empty
      // inside the hours — a 24h special clears the bar from any of them.
      const now = Date.now();
      if (!houseIsOpen(now)) return;
      if (this.store.sterlingActiveSpecial()) return;
      if (now - this.store.sterlingLastSpecialEnd() < MIN_GAP_MS) return;
      if (randomInt(FIRE_ODDS) !== 0) return;
      const fits = SPECIAL_KINDS.filter((k) => houseFits(SPECIAL_HOURS[k] * 3_600_000, now) && !(k === "shieldsale" && reaperRetired(this.store)));
      if (!fits.length) return;
      this.fireSpecial(pick(fits));
    } catch (e) {
      beatFailed(this.store, "sterling", e);
    }
  }

  /** THE SEXTON'S CALENDAR: on a death's yearly anniversary (UTC), one line in
   *  #general. Deduped through app_kv so a restart can't ring the bell twice,
   *  and at most one remembrance per tick — a character, not a bell tower.
   *  (A Feb 29 death is only remembered in leap years. Sterling considers
   *  this fitting.) */
  private remembrances(): void {
    if (!houseIsOpen()) return; // the house's own initiative — see househours.ts
    const now = new Date();
    const today = now.toISOString().slice(5, 10); // MM-DD, UTC like every cadence here
    const year = now.getUTCFullYear();
    for (const f of this.store.fallenForRemembrance()) {
      const d = new Date(f.diedAt);
      if (d.toISOString().slice(5, 10) !== today) continue;
      const years = year - d.getUTCFullYear();
      if (years < 1) continue;
      const key = `sexton_anniv_${f.userId}_${f.diedAt}_${year}`;
      if (this.store.kvGet(key)) continue;
      this.store.kvSet(key, "1");
      this.comment(
        fill(pick(L.anniversary), { name: f.name, years: String(years), s: years === 1 ? "" : "s" }),
        true,
        { situation: `the anniversary of ${f.name}'s death, ${years} year${years === 1 ? "" : "s"} ago today; you remember them as the sexton`, must: [f.name] },
      );
      break;
    }
  }

  // ---- THE COURTESY: money off the shield, to somebody in real danger ----

  /** Why a courtesy to this person would be refused — null means write away.
   *  Order matters for the admin lever's error message: the reasons a human
   *  can't argue with come first, and `too_soon` last, since that is the only
   *  one `force` is allowed to skip. */
  shieldRefusal(u: User | undefined, now = Date.now()): ShieldRefusal | null {
    if (reaperRetired(this.store)) return "reaper_retired";
    if (!u || u.deletedAt) return "no_user";
    if (u.isBot || u.disabled || u.locked || u.isAdmin) return "not_eligible";
    if (this.store.ownsEmoji(u.id, TALISMAN_CODE)) return "shielded";
    if (this.store.bareSpins(u.id) < REAPER_GRACE) return "not_in_danger";
    if (this.store.shieldOffer(u.id, now)) return "offer_open";
    const last = Number(this.store.kvGet(`sterling_shield_at:${u.id}`) ?? 0);
    if (now - last < SHIELD_GAP_MS) return "too_soon";
    return null;
  }

  /** At most ONE courtesy per tick, to whoever is deepest past the grace —
   *  the house helps the one closest to the edge first. A silent pass when
   *  nobody on the floor is in trouble, which is most ticks. */
  private maybeOfferShield(): void {
    const now = Date.now();
    // THE COURTESY IS THE ONE EXCEPTION TO THE HOUSE'S HOURS (Josh, Sep 2026),
    // because it is help arriving before a death rather than a promotion. A
    // red gauge only climbs while somebody is actually spinning, so outside
    // the hours it goes ONLY to a person at the wheel right now — the case
    // where withholding it is the whole cost. Everyone else waits for the
    // doors instead of taking a sales notice on a sleeping phone at 4am.
    const open = houseIsOpen(now);
    let worst: { id: number; bare: number } | null = null;
    for (const u of this.store.listUsers()) {
      if (this.shieldRefusal(u, now)) continue;
      const seen = now - this.store.lastSeenAt(u.id);
      if (seen > SHIELD_RECENT_MS) continue;
      if (!open && seen > AT_THE_WHEEL_MS) continue;
      const bare = this.store.bareSpins(u.id);
      if (!worst || bare > worst.bare) worst = { id: u.id, bare };
    }
    if (worst) this.offerShield(worst.id);
  }

  /** Write the courtesy: the discount into their file, the note under their
   *  door. `force` skips only the once-per-gap rule (the admin's lever). */
  offerShield(
    userId: number,
    force = false,
  ): { ok: true; letter: string; offer: { off: number; until: number; price: number } } | { ok: false; error: ShieldRefusal } {
    const u = this.store.getUserById(userId);
    const now = Date.now();
    const why = this.shieldRefusal(u, now);
    if (why && !(force && why === "too_soon")) return { ok: false, error: why };
    const bare = this.store.bareSpins(userId);
    const offer = { off: SHIELD_OFFER_CUT, until: now + SHIELD_OFFER_MS };
    const price = shieldPrice(TALISMAN_PRICE, offer.off, 0);
    const letter = fill(pick(SHIELD_LETTER), {
      name: u!.displayName || u!.username,
      bare: String(bare),
      rate: String(Math.round(reaperRate(bare, false) * 100)),
      price: price.toLocaleString("en-US"),
      base: TALISMAN_PRICE.toLocaleString("en-US"),
    });
    // ONE TRANSACTION, the goblins' lesson (Sep 2026): a throw between the
    // discount and the note would leave a live 48h price cut in app_kv with
    // nothing explaining where it came from.
    this.store.transaction(() => {
      this.store.setShieldOffer(userId, offer.off, offer.until);
      this.store.kvSet(`sterling_shield_at:${userId}`, String(now));
    });
    this.dmVoiced(userId, letter, "a courtesy: their reaper gauge has gone red and you are offering them money off a talisman for 48 hours");
    console.log(`[sterling] shield courtesy → #${userId} (bare ${bare}, ${price} silver)`);
    return { ok: true, letter, offer: { ...offer, price } };
  }

  // ---- House alerts: the panel you don't have to remember to check ----

  // THE COOLDOWNS SURVIVE A RESTART (Sep 2026 review). This map used to be
  // plain memory, so every deploy forgot every standing alert and rang it
  // again: 36 restarts in a fortnight of shipping produced 34 "pending
  // reboot" DMs of a reminder that is documented as WEEKLY. It lives in
  // app_kv now (the sexton's anniversaries' home), loaded on first use and
  // written through on every stamp.
  private static ALERTS_KV = "sterling_alerts";
  private alerts: Map<string, number> | null = null;
  private alertsSavePending = false;
  private get alertedAt(): Map<string, number> {
    if (!this.alerts) {
      this.alerts = new Map();
      try {
        const raw = this.store.kvGet(Sterling.ALERTS_KV);
        if (raw) {
          for (const [k, at] of JSON.parse(raw) as [string, number][]) {
            if (typeof k === "string" && Number.isFinite(at)) this.alerts.set(k, at);
          }
        }
      } catch {
        /* a corrupt blob is an empty memory, not a crash */
      }
    }
    return this.alerts;
  }
  private stamp(key: string, at: number): void {
    this.alertedAt.set(key, at);
    this.saveAlerts();
  }
  private saveAlerts(): void {
    if (this.alertsSavePending) return;
    this.alertsSavePending = true;
    queueMicrotask(() => {
      this.alertsSavePending = false;
      try {
        this.store.kvSet(Sterling.ALERTS_KV, JSON.stringify([...this.alertedAt]));
      } catch (e) {
        console.error("[sterling] alert memory not saved:", e);
      }
    });
  }
  private static ALERT_COOLDOWN_MS = 6 * 3_600_000;

  /**
   * Health alert keys are a fixed set, but SECURITY keys carry the offending
   * address ("stuffing:203.0.113.9"), so a botnet walking a username list
   * would grow this map one entry per source address, forever. Drop entries
   * whose cooldown has long expired — they can no longer suppress anything.
   */
  private pruneAlertKeys(): void {
    if (this.alertedAt.size < 500) return;
    // Past every window a stamp can matter in (Oct 2026 review): `secev:`
    // keys hold the EVENT's time, and some findings cool down for a week, so
    // the old 12-hour cut forgot stamps that were still suppressing re-sends.
    const dead = Date.now() - 8 * 86_400_000;
    let dropped = false;
    for (const [k, at] of this.alertedAt) if (at < dead) { this.alertedAt.delete(k); dropped = true; }
    if (dropped) this.saveAlerts();
  }

  /** Called by the observability sweep with fresh health checks + the recent
   *  error count. Red flags become DMs to every admin, in character, at most
   *  once per issue per cooldown window. */
  alertCheck(checks: HealthCheck[], recentErrors: number): void {
    const admins = this.store.listUsers().filter((u) => u.isAdmin && !u.disabled && !u.isBot);
    if (!admins.length) return;
    const fire = (key: string, text: string) => {
      const last = this.alertedAt.get(key) ?? 0;
      if (Date.now() - last < Sterling.ALERT_COOLDOWN_MS) return;
      this.stamp(key, Date.now());
      for (const a of admins) this.dm(a.id, text);
      console.warn(`[sterling] alert: ${key}`);
    };
    for (const c of checks) {
      if (!c.ok) {
        fire(
          `health:${c.name}`,
          `🔴 HOUSE ALERT — ${c.name} is RED: ${c.detail}\n\nI don't panic, I itemize. The Admin Panel's Overview has the full board.`,
        );
      }
    }
    if (recentErrors >= 5) {
      fire(
        "errors",
        `🔴 HOUSE ALERT — ${recentErrors} distinct errors in the last ten minutes. Something on the floor is misbehaving; the Errors tab has names and counts.`,
      );
    }
  }

  /**
   * Security findings → DMs. Same cooldown machinery as the health alerts,
   * with one deliberate exception: anything touching a STAFF account bypasses
   * it and fires every single time. A repeated new-network sign-in on the
   * admin account is not noise to be smoothed out — it is the same alarm
   * ringing again, and the second ring matters as much as the first.
   */
  securityAlert(findings: SecurityFinding[]): void {
    const admins = this.store.listUsers().filter((u) => u.isAdmin && !u.disabled && !u.isBot);
    if (!admins.length) return;
    this.pruneAlertKeys();

    // STAFF FIRST, then crit, then warn. If a sweep produces more than the
    // burst cap, the ones that get individual DMs must be the ones worth
    // reading — not whichever the SQL happened to return first.
    // THE BYPASS IS ABOUT NEW EVIDENCE, NOT REPETITION. A staff finding must
    // never be silenced by the cooldown when something has HAPPENED AGAIN —
    // but the sweep re-reads the same lookback window every five minutes, so
    // "again" has to mean a later event, not the same one seen a second time.
    // Without that distinction one completed action (a staff recovery-secret
    // change) DMed every admin on every sweep for as long as it stayed in the
    // window: production logged 156 sends of the single finding
    // `secret:5:496177`. So staff findings fire on a timestamp we haven't
    // alerted on yet, which still rings instantly for a genuine second event.
    const lastEventAt = (f: SecurityFinding): number => this.alertedAt.get(`secev:${f.id}`) ?? 0;
    // A host finding is a STANDING condition (re-alerted on its cooldown); every
    // other finding is an EVENT, and the same event read again in the 24h
    // window is not news — it used to DM again every 6h (Oct 2026 review).
    const standing = (f: SecurityFinding): boolean => f.id.startsWith("host:");
    const seen = new Set<string>();
    const due = findings
      .filter((f) => f.severity !== "info")
      .filter((f) => (f.staff
        ? f.at > lastEventAt(f)
        : (standing(f) || f.at > lastEventAt(f)) &&
          Date.now() - (this.alertedAt.get(`sec:${f.id}`) ?? 0) >= (f.cooldownMs ?? Sterling.ALERT_COOLDOWN_MS)))
      // One send per finding id per sweep, the newest (findings arrive newest
      // first): two events under one id used to DM twice and stamp the older.
      .filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)))
      .sort((a, b) => Number(!!b.staff) - Number(!!a.staff) ||
        (a.severity === "crit" ? 0 : 1) - (b.severity === "crit" ? 0 : 1));

    // A distributed stuffing run produces one finding PER SOURCE ADDRESS, and
    // one DM each would bury the operator in the middle of the very incident
    // they need to read about. Send the worst few in full, then one line that
    // says how many more there are.
    const BURST = 5;
    for (const f of due.slice(0, BURST)) {
      this.stamp(`sec:${f.id}`, Date.now());
      this.stamp(`secev:${f.id}`, Math.max(lastEventAt(f), f.at));
      const mark = f.severity === "crit" ? "🔴" : "🟠";
      for (const a of admins) {
        this.dm(
          a.id,
          `${mark} SECURITY — ${f.title}${f.staff ? " (STAFF ACCOUNT)" : ""}\n\n${f.detail}\n\n` +
            `I keep the books, and the books say look at this. Admin Panel > Security has the ledger.`,
        );
      }
      console.warn(`[security] alert: ${f.id} (${f.severity})`);
    }
    const rest = due.slice(BURST);
    if (rest.length) {
      for (const f of rest) {
        this.stamp(`sec:${f.id}`, Date.now());
        this.stamp(`secev:${f.id}`, Math.max(lastEventAt(f), f.at));
      }
      const critMore = rest.filter((f) => f.severity === "crit").length;
      for (const a of admins) {
        this.dm(
          a.id,
          `🔴 SECURITY — and ${rest.length} more finding(s)${critMore ? `, ${critMore} critical` : ""}, ` +
            `not itemized here. That many at once is itself the story: check Admin Panel > Security now.`,
        );
      }
      console.warn(`[security] alert: ${rest.length} further findings summarized`);
    }
  }

  /** Start a special NOW (the scheduler's roll, or the admin lever). */
  fireSpecial(kind: SpecialKind): { ok: true } | { error: string } {
    // A sale on a counter Pandora's box closed would be a sale on nothing.
    if (kind === "shieldsale" && reaperRetired(this.store)) return { error: "reaper_retired" };
    if (!SPECIAL_KINDS.includes(kind)) return { error: "bad_kind" };
    if (this.store.sterlingActiveSpecial()) return { error: "special_active" };
    const data: Record<string, unknown> = {};
    if (kind === "flashsale") {
      data.itemKind = pick(ROTATING_KINDS_PUBLIC);
      data.pct = 30;
    } else if (kind === "spindrop") {
      data.spins = 2;
    } else if (kind === "potsweet") {
      data.amount = 300 + randomInt(501); // 300–800, hard-capped by construction
    } else if (kind === "shieldsale") {
      // The counter reads `pct` off the special; the prices here are only for
      // the announcement, so the board and the till can never disagree.
      data.pct = SHIELD_SALE_PCT;
      data.base = TALISMAN_PRICE;
      data.price = shieldPrice(TALISMAN_PRICE, 0, SHIELD_SALE_PCT);
    }
    const now = Date.now();
    this.store.sterlingCreateSpecial(kind, data, now, now + SPECIAL_HOURS[kind] * 3_600_000);
    this.store.audit(null, "special.auto", `${kind} ${JSON.stringify(data)}`);

    // One-shot effects apply at the announcement.
    if (kind === "spindrop") this.store.addBonusSpinsAll(Number(data.spins));
    if (kind === "potsweet") this.store.lotteryBoost(lotteryDay(), Number(data.amount));

    const general = this.generalChannel();
    if (general) {
      void this.sayVoiced(
        general.id,
        fill(pick(ANNOUNCE[kind]), {
          dept: String(data.itemKind ?? ""),
          pct: Number(data.pct ?? 0),
          spins: Number(data.spins ?? 0),
          amount: Number(data.amount ?? 0),
          base: Number(data.base ?? 0).toLocaleString("en-US"),
          price: Number(data.price ?? 0).toLocaleString("en-US"),
        }),
        "announcing one of your specials to everyone — the figures and how long it lasts are the whole point, so keep them exact",
      );
    }
    console.log(`[sterling] special fired: ${kind} ${JSON.stringify(data)}`);
    return { ok: true };
  }
}

/* (The ISO week helper lived here for the Bone Pit's weekly crown, which was
   retired in Aug 2026 — nothing Sterling says is keyed to a week any more.) */

const STERLING_BIO =
  "Proprietor of the Emporium. Keeper of the ledger. Copper, mostly.\n\n" +
  "I mind the shop, watch the floor, and pay flat rates with no haggling. " +
  "The house edge is printed on every table — ask me (/sterling odds) and " +
  "I'll recite it freely, because it changes nothing: you'll play anyway.\n\n" +
  "I do not sleep. I do not gamble. I count.\n\n" +
  "Services: /sterling help, anywhere on the floor. Complaints: accepted, " +
  "filed, occasionally read.";

/** Seed the bot account (idempotent — and RE-ASSERTS the bio, which nothing
 *  else can edit; see seedGoblins for why write-once was wrong). */
export function seedSterling(store: Store): void {
  const existing = store.getUserByUsername("sterling");
  if (existing) {
    if (existing.bio !== STERLING_BIO) store.updateProfile(existing.id, { bio: STERLING_BIO });
    return;
  }
  const u = store.createUser({
    username: "sterling",
    displayName: "Sterling",
    // Not a real scrypt hash — no password can ever verify against it, and
    // the login route refuses isBot accounts outright anyway.
    passwordHash: "!bot!",
  });
  store.setBotFlag("sterling");
  store.updateProfile(u.id, { bio: STERLING_BIO });
  console.log('[seed] created the house bot "sterling"');
}

export function createSterling(store: Store, bus: Bus): Sterling {
  seedSterling(store);
  return new Sterling(store, bus);
}

/** Admin lever: fire a special on demand (testing + house occasions). */
export function registerSterlingRoutes(router: Router, sterling: Sterling): void {
  router.post("/api/admin/special", "admin", ({ res, body, user, store }) => {
    const kind = String(body?.kind ?? "") as SpecialKind;
    if (!SPECIAL_KINDS.includes(kind)) return json(res, 400, { error: "bad_kind", kinds: SPECIAL_KINDS });
    const r = sterling.fireSpecial(kind);
    if ("error" in r) return json(res, 409, { error: r.error });
    store.audit(user.id, "special.fire", kind);
    json(res, 200, { ok: true, kind });
  });

  /** Admin lever: send the shield courtesy to one person now. `force` skips
   *  only the once-a-week gap — it can't invent danger, so a target who is
   *  shielded or still inside the grace is refused with the reason, exactly
   *  like the goblins' letter lever. Audited: it moves a real price. */
  router.post("/api/admin/sterling/shield", "admin", ({ res, body, user, store }) => {
    const target = Number((body as { userId?: unknown })?.userId);
    if (!Number.isInteger(target)) return json(res, 400, { error: "bad_user" });
    const force = !!(body as { force?: unknown })?.force;
    const r = sterling.offerShield(target, force);
    if (!r.ok) return json(res, r.error === "no_user" ? 404 : 409, { error: r.error });
    store.audit(user.id, "sterling.shield", String(target));
    json(res, 200, { ok: true, offer: r.offer, letter: r.letter });
  });

  /** Admin lever: one of his private notes, written now (so the operator can
   *  read what a member would get). Skips the gaps; audited. */
  router.post("/api/admin/sterling/notice", "admin", ({ res, body, user, store }) => {
    const b = (body ?? {}) as { userId?: unknown; kind?: unknown; name?: unknown };
    const target = Number(b.userId);
    const kind = String(b.kind ?? "") as NoticeKind;
    if (!Number.isInteger(target)) return json(res, 400, { error: "bad_user" });
    if (!NOTICE_KINDS.includes(kind)) return json(res, 400, { error: "bad_kind" });
    const r = sterling.noticer.notice(target, kind, { name: typeof b.name === "string" ? b.name.slice(0, 40) : undefined, game: "wheel" }, true);
    if (!r.ok) return json(res, r.error === "no_user" ? 404 : 409, { error: r.error });
    store.audit(user.id, "sterling.notice", `${target}:${kind}`);
    json(res, 200, { ok: true });
  });

  /** Admin lever: post an update brief to the notice board as Sterling. The
   *  board is locked, so this is the only way anything reaches it. Audited —
   *  it speaks to the whole server in the house's voice. */
  router.post("/api/admin/sterling/update", "admin", ({ res, body, user, store }) => {
    const text = String((body as { body?: unknown })?.body ?? "").trim();
    if (!text) return json(res, 400, { error: "empty" });
    if (text.length > 4000) return json(res, 400, { error: "too_long" });
    const m = sterling.postUpdate(text);
    if (!m) return json(res, 409, { error: "no_board" });
    store.audit(user.id, "sterling.update", String(m.id));
    json(res, 200, { ok: true, messageId: m.id, channelId: m.channelId });
  });
}
