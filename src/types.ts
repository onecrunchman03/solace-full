import { TERMS_VERSION } from "./legal";

/** Per-user client preferences (theme, chat font). Private — sent only to the
 *  user themself so their UI follows them across devices. Values are validated
 *  against whitelists in the route; unknown keys are dropped. */
export interface UserPrefs {
  theme?: string;
  font?: string;
  /** User-set keyboard shortcuts: action → combo (e.g. "Ctrl+Shift+M"). */
  keybinds?: Record<string, string>;
  /** Voice processing/mode picks — account-level so they follow logins.
   *  (Device ids stay in localStorage: they're per-machine by nature.) */
  voice?: { neuralNS?: boolean; ptt?: boolean };
  /** UI zoom percentage (80–150). Unset = 100 in browsers, 110 in the
   *  desktop shell (whose webview has no native zoom memory). */
  uiScale?: number;
  /** Manually chosen presence status ("away" | "busy"; unset = online).
   *  Follows the account; auto-away is transient and never stored. */
  status?: string;
  /** READ RECEIPTS (Sep 2026): false = this account neither sends nor
   *  sees them (the WhatsApp rule — you can't watch others without being
   *  watched). Unset = on. */
  readReceipts?: boolean;
  /** THE CASINO JUKEBOX, per Josh's "just in case they want to play in the
   *  casino without music". Account-level so it follows a login rather than a
   *  machine — someone who does not want the music does not want it anywhere.
   *  `volume` is 0..1 of the room's own level, not a master gain. */
  jukebox?: { muted?: boolean; volume?: number };
}

/** A user exactly as stored. `passwordHash` must never leave the server. */
export interface User {
  id: number;
  username: string;
  displayName: string;
  passwordHash: string;
  isAdmin: boolean;
  /** A house character (Sterling), not a person: can't log in, exempt from
   *  idle/moderation sweeps, and clients badge it. Public. */
  isBot: boolean;
  /** "user" (default) or "moderator" — mods ban/suspend/mint invites. */
  role: string;
  disabled: boolean;
  /** Admin lock: can't log in, but NOT dead — no graveyard, fully reversible. */
  locked: boolean;
  /** Timed suspension: refused login until this passes (null = none). */
  suspendedUntil: number | null;
  createdAt: number;
  /** When the Wheel took them (null = alive). Public — the graveyard shows it. */
  diedAt: number | null;
  /** Which life this is. Everyone starts at 1; sealing a grave stands the same
   *  account up as the next generation (migration 68 — see src/mortality.ts).
   *  PUBLIC: "Josh II" is the point of the mechanic. */
  generation: number;
  /** When this grave seals, after which the account is reborn rather than
   *  raised. Null means alive — or, for anyone who died before migration 68,
   *  sealed under the old rules. Public: the graveyard shows the countdown,
   *  because a revival needs somebody to notice it in time. */
  graveSealsAt: number | null;
  /** When the goblins took them (null = at liberty). A jailed account is
   *  `disabled` like a corpse — which is what keeps its session out of every
   *  ordinary route — but its `diedAt` stays NULL, deliberately: the Wake's
   *  self-revive is cheaper than bail, and a debtor must not be able to buy
   *  their way out of a million-silver debt by pretending to be dead.
   *  PUBLIC: the roster shows who is inside, because bail needs a witness. */
  jailedAt: number | null;
  /** When the cell door locks for good and the life is carved up (the ordinary
   *  Inheritance, with the goblins' debt taken off the top). Null = at
   *  liberty, or already sealed. Public, like a grave's countdown. */
  jailSealsAt: number | null;
  /** When this account was DELETED (scrubbed). The row survives so old
   *  messages still resolve to a name, but it is no longer a member: rosters,
   *  pickers and moderation lists skip it. Stripped from PublicUser. */
  deletedAt: number | null;
  /** THE VIP ROOM (migration 92): the highest collection tier this account
   *  has EVER completed — a high-water mark, never lowered (src/vip.ts).
   *  Public: the rank is the prestige. Admins read as 4 at the door. */
  vipTier: number;
  /** THE PAPERWORK (migration 86): the Terms version this account accepted
   *  (null = never — the client's TermsGate stands in the way) and when.
   *  Self view only; the acceptance ledger holds the evidence. */
  termsVersion: number | null;
  termsAcceptedAt: number | null;
  /** Uploaded avatar filename (served at /avatars/<file>), or null for initials. */
  avatar: string | null;
  /** Uploaded profile-banner image (served at /banners/<file>), or null. */
  banner: string | null;
  /** Free-text "about me", shown on the profile page. */
  bio: string | null;
  /** Silver-coin balance. Private — minted only by selling emoji to the Trader. */
  coins: number;
  /** Client preferences (theme/font). Private — self-only, like coins. */
  prefs: UserPrefs;
  /** Tombstone inscription, set while alive. Public only via the graveyard. */
  epitaph: string | null;
  /** Who inherits the estate on death. Private — self-only. */
  willBeneficiaryId: number | null;
  /** Equipped Emporium cosmetics — PUBLIC (everyone renders your border/flair). */
  cosmetics: Cosmetics;
  /** scrypt hash of the recovery secret (null until set). Server-only — never
   *  leaves the process (stripped from PublicUser like passwordHash). */
  secretHash: string | null;
}

/** Equipped cosmetics by slot; values are owned Emporium item ids. */
export interface Cosmetics {
  border?: string;
  flair?: string;
  title?: string;
  tombstone?: string;
  /** Profile header backdrop. */
  banner?: string;
  /** Blackjack card-back skin (styles the face-down cards you see). */
  cardback?: string;
  /** Bone Pit dice skin (your cup + how your dice read in reveals). */
  dice?: string;
  /** Tombstone engraving script (Graveyard epitaph font). */
  epitaph?: string;
  /** Custom UPLOADED voice sounds (migration 46) — file uuids under
   *  /sounds/, mirrored here from user_sounds so every client can play
   *  them. (The chime/bubble COSMETICS retired with migration 48.) */
  enterSound?: string;
  leaveSound?: string;
}

/** A user safe to send to clients — no password hash, no bio (profile-only), no
 *  coin balance (a private wallet, fetched via the shop endpoint), no prefs,
 *  and no legacy fields (epitaph surfaces via the graveyard; the will is
 *  nobody's business until it executes). */
export type PublicUser = Omit<
  User,
  "passwordHash" | "secretHash" | "bio" | "coins" | "prefs" | "epitaph" | "willBeneficiaryId"
  | "suspendedUntil" | "deletedAt" | "termsVersion" | "termsAcceptedAt"
>;

/** The user's own view of themself: public shape + private prefs + legacy.
 *  `hasSecret` tells the client whether a recovery secret is set (the hash
 *  itself never leaves the server). `termsVersion` is the Terms version
 *  they accepted (null = not yet — the TermsGate). */
export type SelfUser = PublicUser & {
  prefs: UserPrefs;
  epitaph: string | null;
  willBeneficiaryId: number | null;
  hasSecret: boolean;
  termsVersion: number | null;
  /** The Terms version IN FORCE, riding the self view so the client's gate
   *  decision is synchronous — no round-trip during which the app renders
   *  ungated, no fetch failure that quietly skips the gate. */
  termsCurrent: number;
};

export interface Session {
  token: string;
  userId: number;
  /** When the token was issued — fixed, never slid (migration 65). */
  createdAt: number;
  /** Last authenticated use. This is the clock the sliding TTL runs on. */
  lastSeenAt: number;
  ip?: string | null;
  ua?: string | null;
  network?: string | null;
}

/** Where a session token was issued from (migration 65). */
export interface SessionMeta {
  ip?: string | null;
  ua?: string | null;
  network?: string | null;
}

/**
 * Every way a sign-in attempt can end, as recorded in `login_events`.
 * `ok` covers a completed sign-in from a known network; `challenge_passed` is
 * the same thing from a NEW one, having also produced the recovery secret —
 * the single highest-signal event in the system, since it means whoever it was
 * held both credentials.
 */
export type LoginOutcome =
  | "ok"
  | "register"
  | "challenged"
  | "challenge_passed"
  | "bad_password"
  | "bad_secret"
  | "unknown_user"
  | "account_closed"
  | "locked"
  | "suspended"
  | "rate_limited"
  | "reset_ok"
  | "reset_failed"
  | "password_changed"
  | "secret_changed";

/** One recorded sign-in attempt. Admin-only — it carries raw IPs. */
export interface LoginEvent {
  id: number;
  at: number;
  userId: number | null;
  username: string;
  outcome: LoginOutcome;
  ip: string;
  network: string;
  ua: string | null;
}

/** A chat channel. Everyone can *read* every channel; `createdBy` is the owner
 *  for management. `parentId` nests a sub-channel under an owned channel (one
 *  level deep); `position` is the admin-set sort order within a sibling group;
 *  `locked` restricts posting to the owner/admins + an allow-list. */
/** THE GENERAL PAGE. Created by migration 63, holds everything chat was
 *  before pages existed, and is the one page that can't be deleted or left. */
export const GENERAL_PAGE_ID = 1;

/** A PAGE — a community space that houses channels (Josh, Aug 2026).
 *  `isPublic` pages are visible and joinable by anyone; private ones are
 *  listed only to their members, and only admins/moderators may add people. */
/** How the door opens (migration 77). `isPublic` remains the CONTENT-privacy
 *  flag and is maintained as exactly (joinPolicy === "open") — every wire
 *  check keyed off it keeps meaning what it always did. */
export type PageJoinPolicy = "open" | "request" | "invite";

export interface Page {
  id: number;
  name: string;
  description: string | null;
  /** Uploaded icon file, served at /pageicons/<file>; null = initials tile. */
  icon: string | null;
  isPublic: boolean;
  /** Listed in the picker for non-members? A discoverable page shows its
   *  CARD (name, icon, description, counts) — never its channels. */
  discoverable: boolean;
  joinPolicy: PageJoinPolicy;
  createdBy: number;
  createdAt: number;
  position: number;
  /** Where members land when they walk into this page. Null = the first text
   *  channel. Cleared automatically if that channel is deleted. */
  defaultChannelId: number | null;
  /** WHERE THE HOUSE TALKS TO ITSELF (migration 102). The channel the three
   *  bots post their UNPROMPTED lines into — commentary, specials, heralds,
   *  the goblins' barker, Voss's field notices. Null = the old rule (#general
   *  by name, else the first unlocked channel). A command is always answered
   *  where it was typed, whatever this says. Cleared if the channel is
   *  deleted. Only Solace General is ever read for this today, since that is
   *  the only page the house speaks on. */
  botChannelId: number | null;
  /** FEDERATION (F2): non-null = this page's message content lives on a
   *  self-hosted satellite; the hub keeps the structure (channels,
   *  membership, permissions) and relays the content. */
  satelliteId: number | null;
  /** PAGE CHAT POLICY (migration 89 — Josh: "the same settings that a
   *  satellite would get for things like chat/pictures/gifs/retention").
   *  Set by the page's authority (admin or manager); enforced server-side
   *  at post time and by the retention sweeps. */
  allowImages: boolean;
  allowGifs: boolean;
  /** Days before this page's image/text attachments expire (null = the
   *  server default, ATTACH_STATIC_DAYS). */
  staticDays: number | null;
  /** Days before this page's GIFs expire (null = ATTACH_ANIMATED_DAYS). */
  animatedDays: number | null;
  /** Days a MESSAGE lives before the sweep deletes it (null = forever). */
  messageDays: number | null;
}

export const PAGE_DAYS_MIN = 1;
export const PAGE_DAYS_MAX = 3650;

/** A page's membership row. `manager` is authority over THIS PAGE only —
 *  its channels and its description/icon — granted by an admin or mod. */
export type PageRole = "member" | "manager";

/** A page as sent to clients: adds the caller's own standing plus the counts
 *  the picker shows. `role` is null when the caller isn't a member. */
export interface PageDTO extends Page {
  role: PageRole | null;
  members: number;
  online: number;
  /** Does THIS caller have a pending join request? (per-recipient) */
  requested?: boolean;
  /** Pending join-request count — the knock badge for managers/staff. */
  pending?: number;
  /** FEDERATION: for a satellite page, whether its host is linked right now.
   *  False = the card shows "community offline" and content requests 503. */
  remoteUp?: boolean;
}

export interface Channel {
  id: number;
  name: string;
  topic: string | null;
  createdBy: number;
  createdAt: number;
  parentId: number | null;
  position: number;
  locked: boolean;
  /** "text" or "voice". Voice channels reuse locked+allow as who-may-JOIN. */
  kind: string;
  /** Which PAGE this channel lives in (migration 63; everything that existed
   *  before belongs to GENERAL_PAGE_ID). */
  pageId: number;
}

/** A channel as sent to clients: adds the post allow-list (empty when unlocked). */
export interface ChannelDTO extends Channel {
  postAllow: number[];
  /** PAGE ROLES: role ids that may SEE the channel (empty = everyone in the
   *  page) and, when locked, POST in it (beside the allow-list). */
  viewRoles: number[];
  postRoles: number[];
}

/** A page's custom role (migration 90). `position` orders the hierarchy —
 *  higher is more senior; @everyone sits at 0 and is never deleted. */
export interface PageRoleDef {
  id: number;
  pageId: number;
  name: string;
  color: string | null;
  position: number;
  perms: import("./roles").Perm[];
  isEveryone: boolean;
}

/** A posted message. A soft-deleted message keeps its row (so history stays
 *  intact) but has `deletedAt` set and its body cleared — a "tombstone". */
export interface Message {
  id: number;
  channelId: number;
  userId: number;
  body: string;
  createdAt: number;
  editedAt: number | null;
  deletedAt: number | null;
  /** The message this one is replying to, if any. */
  replyToId: number | null;
  /** PAGE ROLES: the author held `mention_everyone` (or was the house /
   *  staff) and the body carries @everyone — the client pings on it. */
  everyone?: boolean;
}

/** Reactions on a message, aggregated per emoji: who reacted with `code`. */
export interface ReactionSummary {
  code: string;
  userIds: number[];
}

/** A compact preview of a replied-to message, for the quote bar. */
export interface ReplyPreview {
  id: number;
  author: { id: number; displayName: string } | null;
  excerpt: string;
  deleted: boolean;
}

/** An uploaded file attached to a message, as sent to clients. `kind` doubles
 *  as the retention tier: "gif" (animated) expires before "image"/"text"
 *  (static). A purged attachment's FILE is gone but the row (and dimensions,
 *  for layout) outlives it — the chat shows an "expired" tile. */
export interface AttachmentDTO {
  id: number;
  /** Served at /attachments/<file> (uuid name — treat as a capability URL). */
  file: string;
  /** Original filename, sanitized (display + download). */
  name: string;
  kind: "image" | "gif" | "text";
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  purged: boolean;
}

/** A message with its author, reactions, and reply-preview attached, for clients. */
export interface MessageWithAuthor extends Message {
  author: PublicUser | null;
  reactions: ReactionSummary[];
  replyTo: ReplyPreview | null;
  attachments: AttachmentDTO[];
}

/** A private message inside a 1:1 conversation. Tombstoned like channel messages. */
export interface DmMessage {
  id: number;
  conversationId: number;
  senderId: number;
  body: string;
  createdAt: number;
  editedAt: number | null;
  deletedAt: number | null;
  /** The DM this one is replying to, if any. */
  replyToId: number | null;
}

/** A DM with its reply-preview attached, for the thread + live events. */
export interface DmMessageWithReply extends DmMessage {
  replyTo: ReplyPreview | null;
  attachments: AttachmentDTO[];
}

/** A 1:1 conversation as seen by one participant: the *other* person, a preview,
 *  and how many messages from them this participant hasn't read. */
export interface DmConversation {
  id: number;
  otherUser: PublicUser;
  lastMessage: DmMessage | null;
  unread: number;
}

export type TradeStatus = "pending" | "accepted" | "declined" | "cancelled";

/** A 1:1 barter offer. `fromUser` offers `offered` emoji in exchange for the
 *  recipient's `requested` emoji. Settlement is atomic and validated at accept
 *  time (no escrow) — see `store.acceptTrade`. */
export interface TradeDTO {
  id: number;
  fromUser: PublicUser;
  toUser: PublicUser;
  offered: Emoji[];
  requested: Emoji[];
  status: TradeStatus;
  note: string | null;
  createdAt: number;
  resolvedAt: number | null;
}

export type AuctionStatus = "open" | "settled" | "expired" | "cancelled";

/** One bid in an auction's history (public — auctions are a shared marketplace). */
export interface AuctionBidDTO {
  bidder: PublicUser;
  amount: number;
  at: number;
}

/** A public English auction: `seller` lists one escrowed `emoji`; bidders compete
 *  in silver. Full escrow — the emoji leaves the seller's inventory and each bid's
 *  silver is held (refunded when outbid). Settlement is atomic (`store.closeAuction`):
 *  emoji → winner, 95% of the winning bid → seller, 5% burned as a sink. */
export interface AuctionDTO {
  id: number;
  seller: PublicUser;
  /** The lot is EITHER an emoji or a backrooms relic (migration 58). */
  emoji: Emoji | null;
  /** Relic slug when this is a relic lot; the client resolves name + art. */
  relicSlug: string | null;
  startPrice: number;
  currentBid: number | null;
  highBidder: PublicUser | null;
  /** The smallest silver amount the next bid may be (start price, or current + step). */
  minNextBid: number;
  bidCount: number;
  status: AuctionStatus;
  createdAt: number;
  endsAt: number;
  settledAt: number | null;
  /** Most-recent bids first (capped), for the history strip. */
  bids: AuctionBidDTO[];
}

/** A playing card on a blackjack table. Suits are literal glyphs. */
export interface BjCard {
  r: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
  s: "♠" | "♥" | "♦" | "♣";
}

/** One occupied blackjack seat as clients see it. */
export interface BjSeatDTO {
  user: PublicUser;
  bet: number;
  cards: BjCard[];
  value: number;
  blackjack: boolean;
  doubled: boolean;
  done: boolean;
  left: boolean;
  result: "blackjack" | "win" | "push" | "lose" | "bust" | null;
  payout: number;
  /** Split state: hand two mirrors hand one with its own equal bet. */
  split: boolean;
  cards2: BjCard[];
  value2: number;
  bet2: number;
  doubled2: boolean;
  result2: "blackjack" | "win" | "push" | "lose" | "bust" | null;
  payout2: number;
  activeHand: 0 | 1;
  /** Server-truth: this seat's first two cards may be split right now. */
  canSplit: boolean;
}

/** A blackjack table as broadcast to clients. The dealer's hole card is a
 *  literal `null` until the reveal — it never leaves the server early. */
export interface BjLobbyDTO {
  index: number;
  name: string;
  minBet: number;
  maxBet: number;
  phase: "betting" | "acting" | "dealer" | "settle";
  round: number;
  seats: (BjSeatDTO | null)[];
  dealer: (BjCard | null)[];
  dealerValue: number;
  activeSeat: number;
  endsAt: number | null;
  /** Cards still in the six-deck shoe (reshuffled at the cut card). */
  shoeLeft: number;
  shoeSize: number;
  /** This round came off a freshly shuffled shoe. */
  shuffled: boolean;
}

/** One placed roulette bet, as everyone sees it on the shared felt. */
export interface RouletteBetDTO {
  user: PublicUser;
  kind: string;
  /** Pocket number for straight bets; null for outside bets. */
  target: number | null;
  amount: number;
}

/** The shared roulette table as broadcast to clients. Never carries balances;
 *  `pocket` appears the moment the ball is rolled (clients keep it hidden
 *  until their wheel animation lands). */
export interface RouletteStateDTO {
  phase: "idle" | "betting" | "spinning" | "settled";
  round: number;
  endsAt: number | null;
  pocket: number | null;
  bets: RouletteBetDTO[];
  /** Recent winning pockets, newest first (the classic history board). */
  history: number[];
  /** Per-player total returned this round (stake + winnings), settled only. */
  winners: { user: PublicUser; total: number }[];
}

/** One Hold'em seat as everyone sees it. `cards` stays null until a showdown
 *  reveals a contender's hand — hole cards otherwise ride recipient-scoped
 *  `holdem.cards` frames only (the Bone Pit secrecy rule). */
export interface HoldemSeatDTO {
  user: PublicUser;
  stack: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  acting: boolean;
  button: boolean;
  cards: { r: number; s: number }[] | null;
  handName: string | null;
  /** Last hand's winnings (settle banner). */
  won: number;
  /** True only on the acting seat when a raise is legal — the engine's own
   *  rule (a short all-in never reopens action; chips beyond the bet). */
  canRaise: boolean;
}

export interface HoldemTableDTO {
  id: number;
  name: string;
  sb: number;
  bb: number;
  minBuy: number;
  maxBuy: number;
  phase: "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown" | "settle";
  handId: number;
  board: { r: number; s: number }[];
  pot: number;
  currentBet: number;
  /** The legal minimum raise-to for the acting player's UI. */
  minRaiseTo: number;
  deadline: number | null;
  winners: { user: PublicUser; amount: number; hand: string | null }[];
  seats: (HoldemSeatDTO | null)[];
}

export interface HoldemLobbyDTO {
  tables: HoldemTableDTO[];
}

/** What a craps roll meant for the table. */
export type CrapsEvent = "natural" | "craps" | "point-set" | "point-made" | "seven-out" | "roll";

/** One craps bet on the shared felt, as everyone sees it. */
export interface CrapsBetDTO {
  user: PublicUser;
  kind: string;
  /** Box number for place/hardway/odds bets; null for line + field bets. */
  num: number | null;
  amount: number;
}

/** The shared craps table as broadcast. Never carries balances; the `dice`
 *  appear the moment they're thrown (clients tumble them and reveal only when
 *  the animation lands — the no-spoiler rule). During "rolling", `point` and
 *  `bets` are already POST-roll; `outcome.prevPoint` lets clients display the
 *  pre-roll table until the dice land. */
export interface CrapsStateDTO {
  phase: "idle" | "comeout" | "point" | "rolling";
  point: number | null;
  dice: [number, number] | null;
  /** When the dice animation lands on every screen. */
  rollEndsAt: number | null;
  /** Auto-roll deadline for the current betting window (null = not rollable). */
  autoRollAt: number | null;
  shooter: PublicUser | null;
  /** Shooter hands (increments on every seven-out). */
  round: number;
  bets: CrapsBetDTO[];
  /** Recent rolls, newest first. */
  history: { d1: number; d2: number; event: CrapsEvent }[];
  /** The last roll's story, for banners + reveals. */
  outcome: {
    event: CrapsEvent;
    total: number;
    point: number | null;
    prevPoint: number | null;
    winners: { user: PublicUser; total: number }[];
  } | null;
}

/** The Emoji Derby table as broadcast. `winner`/`seed` appear the moment the
 *  race starts (clients animate to the known finish and reveal at the line);
 *  never carries balances. */
export interface DerbyStateDTO {
  phase: "idle" | "betting" | "racing" | "settled";
  round: number;
  endsAt: number | null;
  /** The fixed cast with this race's rolled form. */
  racers: { key: string; name: string; desc: string; form: number }[];
  /** Pool totals per racer key (drives the odds board). */
  pools: Record<string, number>;
  winner: string | null;
  /** Full finish order once racing (1st first); empty otherwise. */
  placings: string[];
  seed: number;
  winners: { userId: number; payout: number; place: number }[];
  history: { name: string; key: string }[];
  /** All-time wins per cast member (racer-card lore). */
  careerWins: Record<string, number>;
  /** DERBY v2: the gun, on the SERVER's clock (null outside a race). Every
   *  screen runs the race from here, so a late joiner or a slow clock sees
   *  the same horses in the same places — not a fresh race from the gate. */
  startedAt: number | null;
  /** The whole race, countdown included (the server's DERBY_RACE_MS). */
  raceMs: number;
  /** The server's clock when this state was built (clients measure their skew). */
  serverNow: number;
  /** Nobody backed the podium: every ticket was refunded less the rake. */
  refunded: boolean;
  /** The last races' full finish orders, newest first — the history strip and
   *  every runner's form guide. Kept across restarts. */
  results: { round: number; at: number; placings: string[] }[];
}

/** What's on the board in a Casino Chess Duel — one owned emoji, or silver. */
export type ChessStake =
  | { kind: "emoji"; emoji: Emoji }
  | { kind: "silver"; amount: number };

/** An open Casino Chess Duel challenge waiting for a taker. */
export interface ChessChallengeDTO {
  id: string;
  challenger: PublicUser;
  stake: ChessStake;
  minutes: number;
  createdAt: number;
}

/** A chess duel as broadcast to clients (chess is perfect-information —
 *  the full board is public; spectators welcome, that's the casino way). */
export interface ChessGameDTO {
  id: string;
  white: PublicUser;
  black: PublicUser;
  whiteStake: ChessStake;
  blackStake: ChessStake;
  minutes: number;
  fen: string;
  turn: "w" | "b";
  /** Banked clock per side (ms); the side to move's clock runs from lastMoveAt. */
  wMs: number;
  bMs: number;
  lastMoveAt: number;
  status: "active" | "finished";
  winner: "white" | "black" | "draw" | null;
  endReason:
    | "checkmate"
    | "timeout"
    | "resign"
    | "stalemate"
    | "insufficient"
    | "threefold"
    | "fifty-move"
    | null;
  lastMove: { from: string; to: string } | null;
  inCheck: boolean;
}

export interface ChessStateDTO {
  challenges: ChessChallengeDTO[];
  games: ChessGameDTO[];
}

/** A filed bug report or improvement suggestion. `user` is null if the author
 *  was deleted. */
export interface FeedbackItem {
  id: number;
  user: PublicUser | null;
  kind: "bug" | "idea";
  body: string;
  status: "open" | "done";
  createdAt: number;
  resolvedAt: number | null;
}

/** An admin-minted registration invite. `maxUses` caps redemptions (1 = single-use);
 *  `expiresAt` is an optional TTL (null = never); `revoked` kills it early. */
export interface Invite {
  code: string;
  createdBy: number;
  createdAt: number;
  maxUses: number;
  uses: number;
  expiresAt: number | null;
  revoked: boolean;
  note: string | null;
}

/** An invite as shown in the admin list: adds the minter and a derived status. */
export interface InviteDTO extends Invite {
  creator: PublicUser | null;
  /** "active" (redeemable now), "used" (exhausted), "expired", or "revoked". */
  status: "active" | "used" | "expired" | "revoked";
}

/** A collectible emoji from the catalog. `tier` is common/rare/legendary/mythic
 *  (or "talisman" for the special death-shield). */
export interface Emoji {
  code: string;
  tier: string;
  name: string;
  file: string;
  animated: boolean;
}

/** A notable wheel outcome, shown in the live feed. */
export interface WheelFeedItem {
  id: string;
  kind: "win" | "talisman" | "death" | "survived";
  user: { id: number; username: string; displayName: string };
  tier?: string;
  emoji?: { code: string; name: string; file: string; animated: boolean };
  at: number;
}

/** A record in THE JUKEBOX's library (migration 67). The MP3 lives at
 *  /music/<file>; everything else is catalogue. Public — the song list is
 *  exactly what the casino's search box is for. */
export interface JukeboxSong {
  id: number;
  title: string;
  artist: string;
  file: string;
  durationMs: number;
  addedBy: number | null;
  addedAt: number;
  plays: number;
}

/** One record in the shared house soundboard (migration 73). Public — the
 *  whole library is playable by anyone in a voice room. */
export interface BoardSoundRow {
  id: number;
  ownerId: number;
  /** Owner's display name, joined in for the pad tooltip. */
  owner: string;
  file: string;
  name: string;
  emoji: string | null;
  bytes: number;
}

/** Strip the password hash, profile-only bio, private coin balance, and private
 *  prefs before a user goes over the wire. */
export function toPublicUser(u: User): PublicUser {
  const {
    passwordHash: _pw, secretHash: _sec, bio: _bio, coins: _coins, prefs: _prefs,
    epitaph: _ep, willBeneficiaryId: _will, suspendedUntil: _su, deletedAt: _del,
    termsVersion: _tv, termsAcceptedAt: _ta, ...rest
  } = u;
  return rest;
}

/** The self view: everything public, plus the user's own private prefs and
 *  legacy (epitaph + will), and whether a recovery secret is set. Used by
 *  login/register/me. */
export function toSelfUser(u: User): SelfUser {
  return {
    ...toPublicUser(u),
    prefs: u.prefs,
    epitaph: u.epitaph,
    willBeneficiaryId: u.willBeneficiaryId,
    hasSecret: !!u.secretHash,
    termsVersion: u.termsVersion,
    termsCurrent: TERMS_VERSION,
  };
}

/** Display-name cap, enforced at sign-up, at PATCH /api/me and inside the
 *  store's inserts (the row rides every PublicUser payload forever). */
export const MAX_DISPLAY_NAME = 40;
