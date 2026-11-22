// Thin wrapper over fetch for talking to the Solace backend. Stores the session
// token in localStorage and attaches it to every request.

// type-only: erased at build, so it pulls nothing of the game into this chunk
import type { OperatorView } from "../backrooms/gamenet";

const TOKEN_KEY = "solace_token";

// THE SURVIVORZ STREAM PAGE (survivorz/show/StreamView.svelte) runs on the rig's stream token, not a
// session: it is set here, in memory only, and never written to localStorage.
let tokenOverride: string | null = null;
export function useStreamToken(token: string): void {
  tokenOverride = token;
}

export function getToken(): string | null {
  return tokenOverride ?? localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/** An error carrying the HTTP status and the backend's error code. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    /** The full JSON error body (e.g. { retryAfter } on a lockout). */
    public data?: any,
  ) {
    super(message ?? code);
  }
}

async function request<T = any>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // THE PAPERWORK: the server refuses everything until the current Terms
    // are accepted. Tell the app so the gate can appear (App.svelte listens).
    if (res.status === 403 && data?.error === "terms_required") {
      window.dispatchEvent(new Event("solace:terms-required"));
    }
    throw new ApiError(res.status, data?.error ?? "error", data?.message, data);
  }
  return data as T;
}

/** POST raw bytes (e.g. an image upload). The server sniffs the real type. */
async function upload<T = any>(path: string, file: Blob): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (file.type) headers["content-type"] = file.type;
  const res = await fetch(path, { method: "POST", headers, body: file });
  const data = await res.json().catch(() => null);
  // Same ApiError shape as request() — including the data payload.
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "error", data?.message, data);
  return data as T;
}

export interface UserPrefs {
  theme?: string;
  font?: string;
  /** User-set keyboard shortcuts: action → combo (e.g. "Ctrl+Shift+M"). */
  keybinds?: Record<string, string>;
  /** Voice processing/mode picks — account-level (devices stay per-machine). */
  voice?: { neuralNS?: boolean; ptt?: boolean };
  /** UI zoom percentage (80–150); unset = platform default. */
  uiScale?: number;
  /** Manually chosen presence ("away" | "busy"; unset = online). */
  status?: string;
  /** The casino jukebox, per listener: off entirely, and how loud (0..1). */
  jukebox?: { muted?: boolean; volume?: number };
  /** Read receipts: false = neither sent nor seen. Unset = on. */
  readReceipts?: boolean;
}

/** THE HOUSE'S BRAINS — what the admin sees (src/npc/brain.ts status()). */
/** THE AFFINITY METER (server: src/npc/affinity.ts). */
export interface NpcAffinity {
  npc: string;
  name: string;
  points: number;
  tier: number;
  tierName: string;
  /** Points to the next tier, or null at the top. */
  next: number | null;
  /** What earns it, in plain words. */
  earns: string[];
}

export interface NpcBrainStatus {
  configured: boolean;
  /** false: the house's AI is archived (server config.npcHouseAi) — the engines run the Survivorz show only */
  houseAi?: boolean;
  enabled: boolean;
  online: boolean;
  model: string;
  inflight: number;
  stats: {
    asked: number;
    answered: number;
    scripted: number;
    rejected: number;
    timeouts: number;
    errors: number;
    limited: number;
    byKind: Record<string, number>;
    lastLatencyMs: number | null;
    avgLatencyMs: number | null;
    lastError: string | null;
    lastErrorAt: number | null;
    voiced?: number;
    voiceKept?: number;
    bubbles?: number;
  };
}

/** A record in the casino jukebox's library. */
export interface JukeboxSong {
  id: number;
  title: string;
  artist: string;
  durationMs: number;
  plays: number;
  addedAt?: number;
}

/** What the hall is listening to. Mirrors the server's JukeboxStateDTO; also
 *  arrives live on the floor socket. */
/** GET /api/admin/maps/:level — what the map editor opens on. */
/** What a draft changes against the live library (designs.ts libraryChanges). */
export interface MapChanges {
  added: string[];
  removed: string[];
  reshaped: string[];
  doorsMoved: string[];
  propsChanged: string[];
  propsAdded: number;
  propsRemoved: number;
  looksChanged: string[];
  marksChanged: string[];
}

export interface MapEditorState {
  level: number;
  name: string;
  /** What players walk now: version 0 is the repo's frozen map. */
  live: { version: number; sectorId: string; seed: number; playing: string };
  draft: { savedAt: number; savedBy: string | null } | null;
  /** The draft's rooms if there is one, else the live map's. */
  tiles: unknown[];
  seed: number;
  versions: { version: number; sectorId: string; seed: number; fingerprint: string; note: string | null; publishedAt: number; publishedBy: string | null; rooms: number }[];
  /** Players connected on the level (a publish waits for them). */
  inside: number;
  /** Textures uploaded in the editor (surfaces.ts CustomSurface). */
  surfaces?: import("../../../src/backrooms/surfaces").CustomSurface[];
  /** A test play of this level in progress. */
  testing?: { by: number; since: number; sectorId: string } | null;
}

export interface JukeboxState {
  now:
    | (JukeboxSong & { file: string; posMs: number; by: string | null; byId: number | null })
    | null;
  queue: (JukeboxSong & { by: string | null; byId: number | null })[];
  votes: number;
  need: number;
  listeners: number;
  price: number;
  skipPrice: number;
}

/** Equipped Emporium cosmetics (public — rendered on avatars/names everywhere). */
export interface Cosmetics {
  border?: string;
  flair?: string;
  title?: string;
  tombstone?: string;
  banner?: string;
  cardback?: string;
  dice?: string;
  epitaph?: string;
  /** Custom UPLOADED voice sounds (file uuids under /sounds/). An uploaded
   *  enter/leave sound overrides the default join/leave pair. */
  enterSound?: string;
  leaveSound?: string;
}

/** One uploaded sound as reported by the upload/remove endpoints. */
export interface UserSound {
  slot: string;
  file: string;
  name: string;
  bytes: number;
}

/** One record in the shared house soundboard — playable by anyone in voice. */
export interface BoardSound {
  id: number;
  ownerId: number;
  owner: string;
  file: string;
  name: string;
  emoji: string | null;
  bytes: number;
}

export interface EmporiumItem {
  id: string;
  kind:
    | "theme" | "border" | "flair" | "tombstone" | "title"
    | "banner" | "cardback" | "dice" | "epitaph" | "suit";
  name: string;
  blurb: string;
  price: number;
  /** Pre-deal price (differs from price only on the daily deal). */
  basePrice: number;
  owned: boolean;
  /** On today's shelf (themes always are; admins see everything). */
  inStock: boolean;
  /** Today's 20%-off pick. */
  deal: boolean;
  /** New on the shelf since yesterday. */
  fresh: boolean;
}

/** THE VIP ROOM's shelves (behind the rope at Sterling's; src/vip.ts). */
export interface VipItem {
  id: string;
  kind: EmporiumItem["kind"];
  name: string;
  blurb: string;
  /** The rank that opens this shelf, 1–4. */
  tier: number;
  price: number;
  owned: boolean;
  /** Above my rank — shown behind glass. */
  locked: boolean;
}
/** THE PERKS that ride Tier 4, and where this life's consolidation stands. */
export interface VipPerks {
  rank: number;
  active: boolean;
  consolidation: { used: boolean; hasLoan: boolean; eligible: boolean };
}
// PANDORA'S BOX (Sep 2026, PANDORA.md)
export type PandoraKeyId = "prismatic" | "brass" | "rusted";
export interface PandoraKeyState {
  key: PandoraKeyId;
  name: string;
  rule: string;
  held: boolean;
  earnedAt: number | null;
  inserted: boolean;
  live: boolean;
}
export interface PandoraChoiceState {
  id: string;
  name: string;
  desc: string;
  /** Once-ever server-wide (a regime change) vs repeatable (the Stone). */
  once: boolean;
  taken: boolean;
  takenBy: { name: string; at: number } | null;
  /** For a repeatable choice: how many openers have reached for it. */
  takers: number;
}

/** THE STONE OF THE ABYSS: mine or not, what it says (only with it in
 *  hand), and whether I've said it back. */
export interface AbyssState {
  stone: boolean;
  code: string;
  phrase: string | null;
  opened: boolean;
  openedAt: number | null;
}
// ---- THE PORTAL (src/portal/hall.ts). Glyph ids and separators only; a
// sound, a meaning or the English arrives once the reader has earned it.
export interface PortalRoomRow { id: string; name: number[] | null; kind: "text" | "log" | "last" | "voice"; last: number[] | null; posts: number; ghost?: boolean; open?: boolean }
export interface PortalOverview {
  rooms: PortalRoomRow[]; sounds: Record<number, string>; cracked: number; glyphCount: number; words: number;
  signs: number[][]; status: string[]; now: number[]; keystone: number; first: boolean;
}
export interface PortalReact { sign: number; n: number; mine: boolean }
/** One mark on the claim wall: who read it and how, once it is read. */
export interface PortalWallCell { glyph: number; sound: string | null; who: number[] | null; source: "stone" | "sterling" | "relic" | "survey" | "ishaal" | "bench" | "deduction" | "admin" | null; relic: string | null; galaxy: number[] | null; stamp: number[] | null }
/** One mark of the fold school's notation on the wall: the script glyph it stands for, once cracked. */
export interface PortalNotationCell { mark: number; glyph: number | null; who: number[] | null; source: string | null; stamp: number[] | null }
export interface PortalIshaalMove { n: number; ring: number; spoke: number }
export interface PortalIshaal {
  recorded: { moves: PortalIshaalMove[]; names: { even: number[]; odd: number[]; paelu: number[] }; ply: number; mine: PortalIshaalMove | null };
  opponents: { id: string; name: number[]; side: "even" | "odd"; beaten: boolean }[];
  bot: { opp: string; you: "even" | "odd"; moves: PortalIshaalMove[]; done: "even" | "odd" | "none" | null } | null;
  live: { id: number; status: "open" | "live" | "done"; winner: string | null; even: number[] | null; odd: number[] | null; you: "even" | "odd" | null; moves: PortalIshaalMove[] }[];
}
export interface PortalVoiceState { enabled: boolean; here: { name: number[]; you: boolean }[]; fault: { clip: string; at: number } | null; now: number }
export interface PortalBench {
  exercises: { id: string; depth: number[]; open: boolean; done: boolean }[];
  readings: { zero: number[]; drift: number[]; design: number[] };
}
export interface PortalSurveySource { id: string; x: number; y: number; period: number; phase: number; kind: "pulse" | "hiccup" | "stopped" }
export interface PortalSurveyGalaxy {
  id: string; name: number[]; x: number; y: number; r: number; tilt: number; charted: boolean;
  sources: PortalSurveySource[]; catalogue: { id: string; period: number[] | null; mark: "stutter" | "pause" | null }[];
  match: Record<string, string> | null;
}
export interface PortalSurvey {
  galaxies: PortalSurveyGalaxy[]; left: number; window: number; turns: number[][];
  weather: { knot: { galaxy: string; from: number; to: number }; links: { a: string; b: string; from: number; to: number }[] } | null;
}
export interface PortalPost {
  key: string; author?: number[]; sign?: number; mine?: boolean; draft?: boolean; stamp: number[];
  tokens: number[]; glosses: (string | null)[]; en: string | null; reacts?: PortalReact[]; ghost?: boolean;
}
export interface PortalRoom {
  id: string; kind: "text" | "log" | "last"; notation?: boolean; locked?: boolean;
  pinned?: { key: string; tokens: number[]; glosses: (string | null)[]; en: string | null }[];
  posts: PortalPost[]; sounds: Record<number, string>;
  glitch?: { kind: "corrupt"; key: string; word: number } | null;
}
export interface PortalRosterRow { kind: "ghost" | "member"; key: string; name: number[]; keystone: number[]; online: boolean; mark: string | null; seen: number[]; you?: boolean }
export interface PortalProfile {
  key: string; name: number[]; keystone: number[]; joined: number[]; seen: number[]; mark: string | null;
  status: { tokens: number[]; glosses: (string | null)[]; en: string | null } | null;
  bio: { tokens: number[]; glosses: (string | null)[]; en: string | null } | null;
}
export interface PandoraOpening {
  id: number;
  at: number;
  choice: string | null;
  user: User;
}
export interface PandoraState {
  keys: PandoraKeyState[];
  progress: {
    vipTier: number;
    vipMax: number;
    badges: { earned: number; total: number };
    relics: { owned: number; total: number; placed: number };
    levels: { built: number; total: number; perLevel: { owned: number; total: number }[] };
  };
  canOpen: boolean;
  opened: { id: number; at: number; choice: string | null } | null;
  choices: PandoraChoiceState[];
  ledger: PandoraOpening[];
  suit: string;
  suitOwned: boolean;
}
export interface VipProgress {
  tier: "common" | "rare" | "legendary" | "mythic" | "relic";
  owned: number;
  total: number;
}

export interface User {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
  /** A house character (Sterling) — badge it, never expect it online. */
  isBot?: boolean;
  /** "user" (default) or "moderator" — mods ban/suspend/mint invites. */
  role?: string;
  disabled: boolean;
  /** Admin lock — can't log in, but not dead (no graveyard). */
  locked?: boolean;
  createdAt: number;
  /** Uploaded avatar filename (served at /avatars/<file>), or null for initials. */
  avatar: string | null;
  /** Uploaded profile-banner image (served at /banners/<file>), or null. */
  banner?: string | null;
  /** Private client preferences — present only on the self view (login/me). */
  prefs?: UserPrefs;
  /** When the Wheel took them (null = alive). */
  diedAt?: number | null;
  /** Which life this is — sealing a grave stands the same account up as the
   *  next generation. Public: "Josh II" is the point. */
  generation?: number;
  /** When this grave seals, after which they are reborn rather than raised.
   *  Null = alive, or a grave dug before the Wake shipped. Public, because a
   *  rescue needs somebody to notice the countdown in time. */
  graveSealsAt?: number | null;
  /** Equipped Emporium cosmetics (public). */
  cosmetics?: Cosmetics;
  /** THE VIP ROOM: the highest collection tier ever completed (0–4, a
   *  high-water mark). Public — the rank is the prestige. */
  vipTier?: number;
  /** Self view only: tombstone inscription + will beneficiary. */
  epitaph?: string | null;
  willBeneficiaryId?: number | null;
  /** Self view only: whether a recovery secret is set (the secret never leaves
   *  the server). false ⇒ prompt the user to set one. */
  hasSecret?: boolean;
  /** Self view only: the Terms version this account accepted (null = never;
   *  the TermsGate compares it to /api/legal's current version). */
  termsVersion?: number | null;
  /** Self view only: the Terms version in force right now. */
  termsCurrent?: number;
}

/** The current document versions (GET /api/legal). */
export interface LegalInfo {
  termsVersion: number;
  hostingVersion: number;
  urls: { index: string; terms: string; guidelines: string; privacy: string; hosting: string; copyright: string };
}

/** Login step 1 can succeed, demand a new-network secret challenge, or log in
 *  a legacy account that still needs to set a recovery secret. */
export type LoginResult =
  | { token: string; user: User; mustSetSecret?: boolean; wake?: boolean; jail?: boolean }
  | { challenge: "secret" };

export interface Grave {
  user: User;
  diedAt: number;
  epitaph: string | null;
  /** Carved at death (migration 76): "wheel" | "goblins". NULL on graves dug
   *  before the cause was witnessed. */
  deathCause: string | null;
  /** Emoji buried with them (whatever the will didn't pass on). */
  buriedWith: number;
  respects: { code: string; userIds: number[] }[];
  /** Standing candles + flowers (Graveyard v2). Decay states derive from the
   *  server clock in the graveyard payload, never the browser's. */
  tributes: { kind: string; byUserId: number; at: number }[];
}

/** A life that ran out its wake and sealed — a permanent monument. Somebody on
 *  their third generation has two of these. */
export interface Monument {
  userId: number;
  generation: number;
  bornAt: number;
  diedAt: number;
  sealedAt: number;
  epitaph: string | null;
  /** What that life held when it ended. */
  coins: number;
  emojiCount: number;
  /** The heirlooms the next generation carried out. */
  keptCodes: string[];
  /** How the life ended ("wheel" | "goblins"); NULL on pre-76 monuments. */
  deathCause: string | null;
  /** The eulogies said at that wake, carved in at the sealing. */
  eulogies: { byUserId: number; text: string; at: number }[];
}

/** What a dead-but-fresh account sees of its own grave. */
/** THE CELL (migration 72): what a jailed debtor can see. The mirror of
 *  WakeState, and reachable only with a jailed session. */
export interface CellState {
  /** The prisoner's public row — the rank fields decide whether the house
   *  will settle for them (Tier 4, or the admin who reads as Tier 4). */
  user: { id: number; displayName: string; avatar: string | null; vipTier?: number; isAdmin?: boolean };
  jailedAt: number;
  sealsAt: number;
  debt: number;
  bail: number;
  /** The line scratched on the cell card (Sep 2026), or null. */
  plea: string | null;
  /** THE BAIL POT: how much friends have chipped in so far, and who. */
  pot: number;
  contributors: { userId: number; amount: number; user: { id: number; displayName: string; avatar: string | null } | null }[];
}

export interface WakeState {
  user: { id: number; username: string; displayName: string; generation: number };
  diedAt: number | null;
  sealsAt: number | null;
  collection: number;
  quote: { coins: number; burn: number; raisePrice: number };
  /** False when the quote is nothing at all — a broke account with no
   *  collection has no price to pay, and the server refuses rather than
   *  handing out a free resurrection (see mortality.canSelfRevive). */
  canPay: boolean;
  minCoins: number;
}

export type AchievementTier = "bronze" | "silver" | "gold" | "mythic";
export interface Achievement {
  id: string;
  name: string;
  desc: string;
  tier: AchievementTier;
  /** null = not earned yet (locked). */
  earnedAt: number | null;
  /** Live progress for locked stat badges (absent on event badges). */
  cur?: number;
  goal?: number;
}

export interface ProfileData {
  user: User;
  bio: string | null;
  inventory: Emoji[];
  count: number;
  achievements: Achievement[];
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
  /** PAGE ROLES: role ids that may see the channel (empty = whole page)
   *  and, when locked, post in it beside the allow-list. */
  viewRoles?: number[];
  postRoles?: number[];
  /** "text" or "voice". Voice channels use locked+allow as who-may-JOIN. */
  kind: string;
  /** User ids allowed to post when locked (empty when open). */
  postAllow: number[];
  /** Which PAGE this channel lives in (migration 63). */
  pageId: number;
}

/** A PAGE — a community that houses channels. `role` is the caller's own
 *  standing (null = not a member); the counts drive the picker. */
export type PageJoinPolicy = "open" | "request" | "invite";

export interface PageDTO {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  isPublic: boolean;
  /** Non-members see this page's CARD in the picker (never its channels). */
  discoverable: boolean;
  /** open = walk in · request = knock, a manager approves · invite = added by hand. */
  joinPolicy: PageJoinPolicy;
  createdBy: number;
  createdAt: number;
  position: number;
  /** Where members land when they open this page (null = first text channel). */
  defaultChannelId: number | null;
  /** Where the three house bots post their UNPROMPTED lines (null = #general).
   *  A command is always answered where it was typed. Admin-set. */
  botChannelId: number | null;
  /** Non-null = this community's messages live on a self-hosted satellite. */
  satelliteId: number | null;
  /** PAGE CHAT POLICY: what the rooms accept and how long they keep it. */
  allowImages: boolean;
  allowGifs: boolean;
  /** Retention in days; null = the server default. */
  staticDays: number | null;
  animatedDays: number | null;
  /** Message lifetime in days; null = forever. */
  messageDays: number | null;
  role: "member" | "manager" | null;
  members: number;
  online: number;
  /** Do I have a pending join request? */
  requested?: boolean;
  /** Pending knock count (shown to managers/staff). */
  pending?: number;
  /** For a satellite page: is its host linked right now? */
  remoteUp?: boolean;
}

/** PAGE ROLES (Sep 2026) — the permission vocabulary, mirrored from src/roles.ts. */
export type Perm =
  | "post" | "attach" | "gif" | "mention_everyone"
  | "create_channels" | "manage_channels" | "manage_members" | "manage_roles";
export interface PageRoleDef {
  id: number;
  pageId: number;
  name: string;
  color: string | null;
  /** Higher = more senior; @everyone is 0. */
  position: number;
  perms: Perm[];
  isEveryone: boolean;
}

export interface PageMember {
  user: User;
  role: "member" | "manager";
  online: boolean;
  /** When they joined the page (ms). */
  since: number;
}

export interface Reaction {
  code: string;
  userIds: number[];
}

export interface ReplyPreview {
  id: number;
  author: { id: number; displayName: string } | null;
  excerpt: string;
  deleted: boolean;
}

/** An uploaded file on a message. A `purged` attachment's file has expired
 *  (retention) — render the "expired" tile, not an <img>. */
export interface Attachment {
  id: number;
  file: string; // served at /attachments/<file>
  name: string;
  kind: "image" | "gif" | "text";
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  purged: boolean;
}

/** A scheduled game night. */
export interface HouseEvent {
  id: number;
  title: string;
  note: string | null;
  at: number;
  createdBy: number;
  going: number[];
  declined: number[];
}

// ---- The Bone Pit (Liar's Dice) ----
export interface PitPlayer {
  user: User | null;
  diceCount: number;
  eliminated: boolean;
}
export interface PitGame {
  id: string;
  stake: number;
  hostId: number;
  phase: "gathering" | "playing" | "done";
  players: PitPlayer[];
  turnUserId: number | null;
  turnDeadline: number | null;
  bid: { count: number; face: number; byUserId: number } | null;
  round: number;
  reveal: {
    bid: { count: number; face: number };
    actual: number;
    bidderId: number;
    callerId: number;
    loserId: number;
    cups: { userId: number; dice: number[] }[];
  } | null;
  winnerId: number | null;
  pot: number;
  totalDice: number;
}
export interface PitState {
  games: PitGame[];
}

export interface Message {
  id: number;
  channelId: number;
  userId: number;
  body: string;
  createdAt: number;
  editedAt: number | null;
  deletedAt: number | null;
  replyToId: number | null;
  /** PAGE ROLES: an @everyone the author was allowed to send. */
  everyone?: boolean;
  reactions: Reaction[];
  replyTo: ReplyPreview | null;
  author: User | null;
  attachments: Attachment[];
}


export interface DmMessage {
  id: number;
  conversationId: number;
  senderId: number;
  body: string;
  createdAt: number;
  editedAt: number | null;
  deletedAt: number | null;
  replyToId: number | null;
  /** Present on thread messages + live events; omitted on list previews. */
  replyTo?: ReplyPreview | null;
  /** Ditto — hydrated on thread messages + live events. */
  attachments?: Attachment[];
}

export interface DmConversation {
  id: number;
  otherUser: User;
  lastMessage: DmMessage | null;
  unread: number;
}

export interface Emoji {
  code: string;
  tier: string;
  name: string;
  file: string;
  animated: boolean;
}

export type TradeStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface Trade {
  id: number;
  fromUser: User;
  toUser: User;
  offered: Emoji[];
  requested: Emoji[];
  status: TradeStatus;
  note: string | null;
  createdAt: number;
  resolvedAt: number | null;
}

export type AuctionStatus = "open" | "settled" | "expired" | "cancelled";

export interface AuctionBid {
  bidder: User;
  amount: number;
  at: number;
}

export interface Auction {
  id: number;
  seller: User;
  /** The lot is EITHER an emoji or a backrooms relic. */
  emoji: Emoji | null;
  /** Relic slug when this is a relic lot (name + art come from RELIC_META). */
  relicSlug: string | null;
  startPrice: number;
  currentBid: number | null;
  highBidder: User | null;
  minNextBid: number;
  bidCount: number;
  status: AuctionStatus;
  createdAt: number;
  endsAt: number;
  settledAt: number | null;
  bids: AuctionBid[];
}

export interface FeedbackItem {
  id: number;
  user: User | null;
  kind: "bug" | "idea";
  body: string;
  status: "open" | "done";
  createdAt: number;
  resolvedAt: number | null;
}

export type ChessStake =
  | { kind: "emoji"; emoji: Emoji }
  | { kind: "silver"; amount: number };

/** What a client sends to stake — an emoji code, or a silver amount. */
export type ChessStakeSpec = { kind: "emoji"; code: string } | { kind: "silver"; amount: number };

export interface ChessChallenge {
  id: string;
  challenger: User;
  stake: ChessStake;
  minutes: number;
  createdAt: number;
}

export interface ChessGame {
  id: string;
  white: User;
  black: User;
  whiteStake: ChessStake;
  blackStake: ChessStake;
  minutes: number;
  fen: string;
  turn: "w" | "b";
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

export interface ChessState {
  challenges: ChessChallenge[];
  games: ChessGame[];
}

export interface BjCard {
  r: string;
  s: string;
}

export interface BjSeat {
  user: User;
  bet: number;
  cards: BjCard[];
  value: number;
  blackjack: boolean;
  doubled: boolean;
  done: boolean;
  left: boolean;
  result: "blackjack" | "win" | "push" | "lose" | "bust" | null;
  payout: number;
  split: boolean;
  cards2: BjCard[];
  value2: number;
  bet2: number;
  doubled2: boolean;
  result2: "blackjack" | "win" | "push" | "lose" | "bust" | null;
  payout2: number;
  activeHand: 0 | 1;
  canSplit: boolean;
}

export interface BjLobby {
  index: number;
  name: string;
  minBet: number;
  maxBet: number;
  phase: "betting" | "acting" | "dealer" | "settle";
  round: number;
  seats: (BjSeat | null)[];
  /** Dealer cards; a null entry is the face-down hole card. */
  dealer: (BjCard | null)[];
  dealerValue: number;
  activeSeat: number;
  endsAt: number | null;
  /** Cards still in the six-deck shoe (reshuffled at the cut card). */
  shoeLeft: number;
  shoeSize: number;
  shuffled: boolean;
}

/** An entry in the admin report queue. */
export interface ReportItem {
  id: number;
  kind: "message" | "dm" | "user" | "page";
  reason: string;
  status: "open" | "resolved";
  at: number;
  /** Excerpt of the reported message (null for user reports / deleted). */
  excerpt: string | null;
  reporter: User | null;
  /** The author of the reported content (or the reported user; a page's creator). */
  target: User | null;
  /** For page reports and hosted-community messages: which page. */
  pageId: number | null;
  pageName: string | null;
}

/** The Emoji Derby broadcast state (winner+seed present from race start;
 *  the UI reveals only when the runners cross the line). */
export interface DerbyState {
  phase: "idle" | "betting" | "racing" | "settled";
  round: number;
  endsAt: number | null;
  racers: { key: string; name: string; desc: string; form: number }[];
  pools: Record<string, number>;
  winner: string | null;
  placings: string[];
  seed: number;
  winners: { userId: number; payout: number; place: number }[];
  history: { name: string; key: string }[];
  careerWins: Record<string, number>;
  startedAt: number | null;
  raceMs: number;
  serverNow: number;
  refunded: boolean;
  results: { round: number; at: number; placings: string[] }[];
}

export interface LotteryInfo {
  day: string;
  drawAt: number;
  price: number;
  maxPerDay: number;
  pot: number;
  tickets: number;
  players: number;
  boost: number;
  mine: number;
  last: { day: string; pot: number; paid: number; winner: User | null } | null;
  coins: number;
}

/** One placed roulette bet, as shown on the shared felt. */
export interface RouletteBet {
  user: User;
  kind: string;
  target: number | null;
  amount: number;
}

export interface RouletteState {
  phase: "idle" | "betting" | "spinning" | "settled";
  round: number;
  endsAt: number | null;
  /** The winning pocket — present from spin start; the UI keeps it hidden
   *  until the wheel animation lands. */
  pocket: number | null;
  bets: RouletteBet[];
  history: number[];
  winners: { user: User; total: number }[];
}

/** A playing card on the wire (rank 2..14, suit 0..3 = ♠♥♦♣). */
export interface PlayingCard {
  r: number;
  s: number;
}

export interface HoldemSeat {
  user: User;
  stack: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  acting: boolean;
  button: boolean;
  /** Non-null only when a showdown reveals this contender's hand. */
  cards: PlayingCard[] | null;
  handName: string | null;
  won: number;
  /** The engine's own "may raise now" (acting seat only). */
  canRaise: boolean;
}

export interface HoldemTable {
  id: number;
  name: string;
  sb: number;
  bb: number;
  minBuy: number;
  maxBuy: number;
  phase: "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown" | "settle";
  handId: number;
  board: PlayingCard[];
  pot: number;
  currentBet: number;
  minRaiseTo: number;
  deadline: number | null;
  winners: { user: User; amount: number; hand: string | null }[];
  seats: (HoldemSeat | null)[];
}

export interface HoldemLobby {
  tables: HoldemTable[];
}

export interface HoldemMine {
  tableId: number;
  handId: number;
  cards: PlayingCard[];
}

/** What a craps roll meant for the table. */
export type CrapsEvent = "natural" | "craps" | "point-set" | "point-made" | "seven-out" | "roll";

/** One craps bet on the shared felt. */
export interface CrapsBet {
  user: User;
  kind: string;
  num: number | null;
  amount: number;
}

export interface CrapsState {
  phase: "idle" | "comeout" | "point" | "rolling";
  point: number | null;
  /** Present from the throw; the UI tumbles and reveals only on landing. */
  dice: [number, number] | null;
  rollEndsAt: number | null;
  autoRollAt: number | null;
  shooter: User | null;
  round: number;
  bets: CrapsBet[];
  history: { d1: number; d2: number; event: CrapsEvent }[];
  outcome: {
    event: CrapsEvent;
    total: number;
    point: number | null;
    prevPoint: number | null;
    winners: { user: User; total: number }[];
  } | null;
}

/** One server performance sample (Admin Panel; src/perf.ts server-side). */
export interface PerfSample {
  at: number;
  cpu: number;
  load1: number;
  rssMb: number;
  heapMb: number;
  memUsedMb: number;
  memTotalMb: number;
  diskUsedGb: number;
  diskFreeGb: number;
  netRxKbps: number | null;
  netTxKbps: number | null;
  wsClients: number;
  httpReqs: number;
  /** Event-loop delay over the 15s window, ms (absent from older servers). */
  loopP99Ms?: number;
  loopMaxMs?: number;
}

/** One row of the per-user storage report. */
/** One recorded sign-in attempt (Admin Panel > Security). Carries raw IPs —
 *  admin-only, except /api/me/security which returns only your own rows. */
export interface LoginEvent {
  id: number;
  at: number;
  userId: number | null;
  username: string;
  outcome: string;
  ip: string;
  network: string;
  ua: string | null;
}

/** A live session token, addressed by handle — the token never leaves the
 *  server, so a handle is safe to render and to revoke by. */
export interface SessionRow {
  handle: string;
  userId: number;
  createdAt: number;
  lastSeenAt: number;
  ip: string | null;
  network: string | null;
  device: string;
  current: boolean;
}

export interface PostureCheck {
  name: string;
  ok: boolean;
  detail: string;
  severity: "info" | "warn" | "crit";
}

export interface SecurityFinding {
  id: string;
  severity: "info" | "warn" | "crit";
  title: string;
  detail: string;
  at: number;
  staff?: boolean;
}

export interface StorageRow {
  id: number;
  username: string;
  displayName: string;
  avatar: string | null;
  attachBytes: number;
  attachCount: number;
  soundBytes: number;
  messages: number;
  dms: number;
  avatarBytes: number;
  bannerBytes: number;
  totalBytes: number;
}

export interface ShelfRow {
  tier: string;
  price: number;
  size: number;
  items: (Emoji & { price: number; bought: boolean })[];
}

export interface ShopState {
  coins: number;
  /** Trader buy price per sellable tier (talisman/special absent = unsellable). */
  sellPrices: Record<string, number>;
  /** Silver cost of one extra Wheel spin. */
  spinPrice: number;
  /** Silver cost of the death-shield talisman at Sterling's counter — YOUR
   *  price, with any courtesy or live shield sale already applied. */
  talismanPrice: number;
  /** Pandora's box retired the reaper; the talisman counters are closed. */
  reaperRetired?: boolean;
  /** What it costs everyone else, for the struck-through tag. */
  talismanBasePrice: number;
  /** Which offer is cutting your price, if either is: Sterling's personal
   *  `courtesy` (DMed when your reaper gauge went red) or a house-wide
   *  `sale`. Null at full price. The server picks the winner — the client
   *  must not re-derive the comparison or the tag can drift from the till. */
  shieldOffer: { kind: "courtesy" | "sale"; pct: number; until: number } | null;
  /** Whether you're already shielded (the purchase is refused if so). */
  hasTalisman: boolean;
  /** Silver cost of a random unowned mythic at Sterling's top shelf. */
  mythicPrice: number;
  /** What Sterling charges per drink at the bar. */
  drinkPrices: Record<string, number>;
  /** …and for the vial under it. Ten minutes, then the carpet. */
  slorpPrice: number;
  drugBase?: { slorp: number; stardust: number; ego: number };
  /** …and the STAR DUST canister beside the vial. Three huffs to a can. */
  stardustPrice: number;
  /** Sterling's shelf multiplier (buy back at this × the sell price). */
  /** Sterling's daily shelves, per tier (src/shelf.ts). */
  shelfPrices?: Record<string, number>;
  /** Your emoji essence (the Forge's material). */
  essence?: number;
  /** …and the EGO goop, per shot. Confidence, by volume. */
  egoPrice: number;
  /** The big-ticket listing under the counter, name verbatim from the server. */
  gunName: string;
  gunPrice: number;
  /** …and its spare magazines. */
  clipPrice: number;
}

/** A carried casino item ('gun' — qty is its loaded rounds — or 'clip'). */
export interface CasinoInvItem {
  item: string;
  qty: number;
}
/** A locker pigeonhole's contents. */
export interface CasinoLockerItem {
  slot: number;
  item: string;
  qty: number;
}

export interface SpinResult {
  type: "blank" | "emoji" | "talisman" | "mystery_spins" | "death_survived" | "death";
  tier?: string;
  emoji?: Emoji;
  downgraded?: boolean;
  /** Landed the legendary slot but the 50% roll fell to a rare. */
  nearMiss?: boolean;
  /** This prize came out of the mystery box. */
  mystery?: boolean;
  /** mystery_spins: how many bonus spins the box held. */
  spins?: number;
  alreadyHad?: boolean;
  bonusGranted?: boolean;
  ownsEverything?: boolean;
  immune?: boolean;
  /** blank: the wheel landed on death but the reaper didn't fire (52%). */
  reaperMissed?: boolean;
}

export type SlotsResult =
  | { type: "win"; line: string; payout: number }
  | { type: "lose" };

export interface SlotsPull {
  ok: boolean;
  result: SlotsResult;
  reels: string[]; // three payline symbol ids the reels land on
  coins: number; // balance after the pull (cost debited, any payout credited)
  /** Escape-room balances after the pull (E3b): a free pull consumes first,
   *  chips cover the cost before silver. */
  freePulls?: number;
  chips?: number;
  paidWith?: "free" | "chips" | "coins";
  /** the stake the pull was played at (the cabinet's section) */
  stake?: number;
}

/** One wedge's advertised prize, decided server-side (src/wheel.ts). */
export interface WheelFaceSlot {
  code: string;
  name: string;
  file: string;
}

export interface WheelStatus {
  slots: string[];
  /** What the 32 wedges are showing — real emoji you don't own yet. */
  face: (WheelFaceSlot | null)[];
  spins: { bucket: number; bonus: number; total: number };
  nextReset: number;
  tierCounts: Record<string, number>;
  owned: number;
  hasTalisman: boolean;
  /** THE REAPER'S PATIENCE — how the death wedge would treat you right now.
   *  A hazard you can't see is just bad luck arriving, so this is rules, not
   *  decoration. `rate` is what a landing would do; `graceLeft` is how many
   *  more spins you can take bare before it starts climbing. */
  reaper: {
    bare: number;
    grace: number;
    graceLeft: number;
    rate: number;
    shielded: boolean;
    immune: boolean;
    /** Pandora's box retired the reaper: it blinks every time, for everyone. */
    retired?: boolean;
  };
}


export interface WheelFeedItem {
  id: string;
  kind: "win" | "talisman" | "death" | "survived";
  user: { id: number; username: string; displayName: string };
  tier?: string;
  emoji?: { code: string; name: string; file: string; animated: boolean };
  at: number;
}

export interface LeaderRow {
  id: number;
  username: string;
  displayName: string;
  count: number;
  score: number;
  legendary: number;
  mythic: number;
  diedAt: number | null;
}

export interface DeathRow {
  id: number;
  username: string;
  displayName: string;
  diedAt: number;
}


export interface EmojiLite {
  code: string;
  name: string;
  file: string;
  animated: boolean;
}

export interface TierLeader {
  id: number;
  displayName: string;
  count: number;
  diedAt: number | null;
}

export interface AuthConfig {
  allowRegistration: boolean;
  requireInvite: boolean;
}

export interface Invite {
  code: string;
  createdBy: number;
  createdAt: number;
  maxUses: number;
  uses: number;
  expiresAt: number | null;
  revoked: boolean;
  note: string | null;
  creator: User | null;
  status: "active" | "used" | "expired" | "revoked";
}

/** One silver transfer, from where the reader stands. */
export interface WalletTransfer {
  id: number;
  dir: "sent" | "received";
  other: User | null;
  amount: number;
  note: string | null;
  at: number;
}

export const api = {
  login: (username: string, password: string) =>
    request<LoginResult>("/api/login", {
      method: "POST",
      body: { username, password },
    }),
  loginVerify: (username: string, password: string, secret: string) =>
    request<{ token: string; user: User; wake?: boolean; jail?: boolean }>("/api/login/verify", {
      method: "POST",
      body: { username, password, secret },
    }),
  register: (username: string, displayName: string, password: string, secret: string, inviteCode?: string, rerollToken?: string, acceptTerms?: boolean) =>
    request<{ token: string; user: User; mustSetSecret?: boolean }>("/api/register", {
      method: "POST",
      body: { username, displayName, password, secret, inviteCode, rerollToken, acceptTerms },
    }),
  setSecret: (currentPassword: string, secret: string) =>
    request<{ ok: true; user: User }>("/api/me/secret", {
      method: "POST",
      body: { currentPassword, secret },
    }),
  resetPassword: (username: string, secret: string, newPassword: string) =>
    request<{ ok: true }>("/api/reset-password", {
      method: "POST",
      body: { username, secret, newPassword },
    }),
  authConfig: () => request<AuthConfig>("/api/auth-config"),
  me: () => request<{ user: User }>("/api/me"),
  // THE PAPERWORK: current document versions + the gate's accept button.
  legal: () => request<LegalInfo>("/api/legal"),
  acceptTerms: (version: number) =>
    request<{ ok: true; user: User }>("/api/me/accept-terms", { method: "POST", body: { version } }),
  logout: () => request<{ ok: true }>("/api/logout", { method: "POST" }),
  // Profiles & avatars.
  profile: (userId: number) => request<ProfileData>(`/api/users/${userId}/profile`),
  updateProfile: (fields: { displayName?: string; bio?: string }) =>
    request<{ user: User; bio: string | null }>("/api/me", { method: "PATCH", body: fields }),
  uploadAvatar: (file: File) => upload<{ avatar: string }>("/api/me/avatar", file),
  removeAvatar: () => request<{ ok: true }>("/api/me/avatar", { method: "DELETE" }),
  // Custom uploads (migration 46): profile banner + voice sounds.
  uploadBanner: (file: File) => upload<{ banner: string }>("/api/me/banner", file),
  removeBanner: () => request<{ ok: true }>("/api/me/banner", { method: "DELETE" }),
  uploadSound: (slot: "enter" | "leave", file: File) =>
    upload<{ ok: true; slot: string; file: string; sounds: UserSound[] }>(
      `/api/me/sounds/${slot}?name=${encodeURIComponent(file.name.replace(/\.[^.]+$/, ""))}`,
      file,
    ),
  removeSound: (slot: "enter" | "leave") =>
    request<{ ok: true; sounds: UserSound[] }>(`/api/me/sounds/${slot}`, { method: "DELETE" }),
  mySounds: () => request<{ sounds: UserSound[] }>("/api/me/sounds"),
  // The house soundboard (migration 73): one shared library.
  soundboard: () => request<{ sounds: BoardSound[]; max: number; mine: number }>("/api/soundboard"),
  addBoardSound: (file: File, name: string, emoji: string) =>
    upload<{ ok: true; sounds: BoardSound[]; mine: number }>(
      `/api/soundboard?name=${encodeURIComponent(name)}&emoji=${encodeURIComponent(emoji)}`,
      file,
    ),
  removeBoardSound: (id: number) =>
    request<{ ok: true; sounds: BoardSound[]; mine: number }>(`/api/soundboard/${id}`, { method: "DELETE" }),
  // Web Push (migration 74): per-device subscriptions for closed-app pings.
  pushKey: () => request<{ key: string }>("/api/push/key"),
  pushSubscribe: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    request<{ ok: true }>("/api/push/subscribe", { method: "POST", body: sub }),
  pushUnsubscribe: (endpoint: string) =>
    request<{ ok: true }>("/api/push/unsubscribe", { method: "POST", body: { endpoint } }),
  updatePrefs: (fields: { [K in keyof UserPrefs]?: UserPrefs[K] | null }) =>
    request<{ prefs: UserPrefs }>("/api/me/prefs", { method: "PATCH", body: fields }),
  changePassword: (current: string, next: string) =>
    request<{ ok: true }>("/api/me/password", { method: "POST", body: { current, next } }),
  users: () => request<{ users: User[] }>("/api/users"),
  channels: () =>
    request<{ channels: Channel[]; unread: Record<string, number> }>("/api/channels"),
  markChannelRead: (id: number) =>
    request<{ ok: true; lastReadId: number }>(`/api/channels/${id}/read`, { method: "POST" }),
  /** READ RECEIPTS: everyone's cursor in a channel (minus the opted-out). */
  channelReaders: (id: number) =>
    request<{ readers: { userId: number; lastReadId: number }[] }>(`/api/channels/${id}/readers`),
  createChannel: (name: string, topic?: string, parentId?: number, kind?: "text" | "voice", pageId?: number) =>
    request<{ channel: Channel }>("/api/channels", {
      method: "POST",
      body: { name, topic, parentId, kind, pageId },
    }),
  // PAGES (migration 63) — communities that house channels.
  pages: () => request<{ pages: PageDTO[] }>("/api/pages"),
  createPage: (fields: { name: string; description?: string; joinPolicy: PageJoinPolicy; discoverable: boolean }) =>
    request<{ page: PageDTO }>("/api/pages", { method: "POST", body: fields }),
  updatePage: (
    id: number,
    fields: {
      name?: string;
      description?: string | null;
      joinPolicy?: PageJoinPolicy;
      discoverable?: boolean;
      defaultChannelId?: number | null;
      botChannelId?: number | null;
      allowImages?: boolean;
      allowGifs?: boolean;
      staticDays?: number | null;
      animatedDays?: number | null;
      messageDays?: number | null;
    },
  ) => request<{ page: PageDTO }>(`/api/pages/${id}`, { method: "PATCH", body: fields }),
  reorderPages: (ids: number[]) =>
    request<{ ok: true }>("/api/pages/reorder", { method: "POST", body: { ids } }),
  // The Windows satellite-app installer — members only, so it's fetched with
  // the header-auth Blob pattern (an <a download> can't carry a bearer token;
  // there is deliberately no public /desktop/ copy of this one).
  satelliteAppBlob: async (): Promise<Blob> => {
    const token = getToken();
    const res = await fetch("/api/satellite/app", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, res.status === 404 ? "not_available" : "download_failed");
    return res.blob();
  },
  // FEDERATION (F1) — the satellite registry, admin-only.
  adminSatellites: () =>
    request<{
      satellites: {
        id: number; name: string; ownerUserId: number; version: string; status: string;
        network: string | null; lastSeenAt: number | null; createdAt: number;
        connected: boolean; owner: User | null;
        pageId: number | null; pageName: string | null;
        /** Open reports pointing into this community (page or messages). */
        openReports: number;
        /** The Host Agreement version on file (null = registered before it existed). */
        hostingVersion: number | null; hostingAcceptedAt: number | null;
      }[];
      keys: {
        id: number; ownerUserId: number; note: string | null; createdAt: number;
        expiresAt: number; usedAt: number | null; usedBySatelliteId: number | null;
        revoked: boolean; owner: User | null;
      }[];
      events: { id: number; at: number; satelliteId: number | null; kind: string; ip: string | null; detail: string | null }[];
      errorCount: number;
      now: number;
    }>("/api/admin/satellites"),
  // F6: the host-error ledger — export the unfixed signatures as TXT (the
  // weekly paste-to-a-session workflow), then mark them processed.
  satErrorsExportBlob: async (): Promise<Blob> => {
    const token = getToken();
    const res = await fetch("/api/admin/satellites/errors/export", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, "export_failed");
    return res.blob();
  },
  satErrorsProcessed: () =>
    request<{ ok: true; fixed: number }>("/api/admin/satellites/errors/processed", { method: "POST" }),
  mintSatelliteKey: (ownerUserId: number, ttlHours?: number, note?: string) =>
    request<{ ok: true; id: number; code: string; expiresAt: number }>("/api/admin/satellites/keys", {
      method: "POST", body: { ownerUserId, ttlHours, note },
    }),
  // F3: a ROTATION key — redeeming it replaces that satellite's identity
  // keypair (new box, lost disk) instead of registering a new satellite.
  mintSatelliteRotationKey: (satelliteId: number, ttlHours?: number) =>
    request<{ ok: true; id: number; code: string; expiresAt: number }>("/api/admin/satellites/keys", {
      method: "POST", body: { satelliteId, ttlHours },
    }),
  revokeSatelliteKey: (id: number) =>
    request<{ ok: true }>(`/api/admin/satellites/keys/${id}/revoke`, { method: "POST" }),
  delistSatellite: (id: number) =>
    request<{ ok: true }>(`/api/admin/satellites/${id}/delist`, { method: "POST" }),
  reinstateSatellite: (id: number) =>
    request<{ ok: true }>(`/api/admin/satellites/${id}/reinstate`, { method: "POST" }),
  createSatellitePage: (id: number, name: string, joinPolicy: PageJoinPolicy = "request") =>
    request<{ page: PageDTO; channel: Channel }>(`/api/admin/satellites/${id}/page`, {
      method: "POST", body: { name, joinPolicy },
    }),
  deletePage: (id: number) => request<{ ok: true; channels: number }>(`/api/pages/${id}`, { method: "DELETE" }),
  setPageIcon: (id: number, file: File) => upload<{ icon: string }>(`/api/pages/${id}/icon`, file),
  clearPageIcon: (id: number) => request<{ ok: true }>(`/api/pages/${id}/icon`, { method: "DELETE" }),
  pageMembers: (id: number) => request<{ members: PageMember[] }>(`/api/pages/${id}/members`),
  addPageMember: (id: number, userId: number, role: "member" | "manager" = "member") =>
    request<{ ok: true }>(`/api/pages/${id}/members`, { method: "POST", body: { userId, role } }),
  setPageMemberRole: (id: number, userId: number, role: "member" | "manager") =>
    request<{ ok: true }>(`/api/pages/${id}/members/${userId}`, { method: "PATCH", body: { role } }),
  removePageMember: (id: number, userId: number) =>
    request<{ ok: true }>(`/api/pages/${id}/members/${userId}`, { method: "DELETE" }),
  joinPage: (id: number) =>
    request<{ ok: true; joined?: boolean; requested?: boolean }>(`/api/pages/${id}/join`, { method: "POST" }),
  cancelPageRequest: (id: number) => request<{ ok: true }>(`/api/pages/${id}/join`, { method: "DELETE" }),
  pageRequests: (id: number) => request<{ requests: { user: User; at: number }[] }>(`/api/pages/${id}/requests`),
  answerPageRequest: (id: number, userId: number, approve: boolean) =>
    request<{ ok: true; approved: boolean }>(`/api/pages/${id}/requests/${userId}`, {
      method: "POST",
      body: { approve },
    }),
  leavePage: (id: number) => request<{ ok: true }>(`/api/pages/${id}/leave`, { method: "POST" }),
  // Voice (LiveKit).
  voiceConfig: () => request<{ enabled: boolean; url: string | null }>("/api/voice/config"),
  voiceToken: (channelId: number, viewer = false) =>
    request<{ token: string; url: string; room: string }>(`/api/voice/${channelId}/token`, {
      method: "POST",
      body: { viewer },
    }).then((r) => ({
      ...r,
      // F5b: a satellite-hosted room's relay URL arrives RELATIVE
      // ("/satvoice/<id>") — prefix this page's own origin so the same
      // answer works behind Caddy, the Vite proxy, and a bare dev port.
      url: r.url.startsWith("/")
        ? (location.protocol === "https:" ? "wss://" : "ws://") + location.host + r.url
        : r.url,
    })),
  updateChannel: (id: number, fields: { name?: string; topic?: string | null; locked?: boolean; makeDefault?: boolean }) =>
    request<{ channel: Channel }>(`/api/channels/${id}`, { method: "PATCH", body: fields }),
  deleteChannel: (id: number) => request<{ ok: true }>(`/api/channels/${id}`, { method: "DELETE" }),
  reorderChannels: (ids: number[]) =>
    request<{ channels: Channel[] }>("/api/channels/reorder", { method: "POST", body: { ids } }),
  channelAllow: (id: number) => request<{ userIds: number[] }>(`/api/channels/${id}/allow`),
  // PAGE ROLES
  pageRoles: (pageId: number) =>
    request<{ roles: PageRoleDef[]; assignments: Record<number, number[]>; mine: "all" | Perm[]; top: number | null; permInfo: Record<string, { name: string; desc: string }> }>(`/api/pages/${pageId}/roles`),
  createRole: (pageId: number, body: { name: string; color: string | null; perms: Perm[] }) =>
    request<{ role: PageRoleDef }>(`/api/pages/${pageId}/roles`, { method: "POST", body }),
  updateRole: (pageId: number, roleId: number, body: { name?: string; color?: string | null; perms?: Perm[] }) =>
    request<{ role: PageRoleDef }>(`/api/pages/${pageId}/roles/${roleId}`, { method: "PATCH", body }),
  deleteRole: (pageId: number, roleId: number) =>
    request<{ ok: true }>(`/api/pages/${pageId}/roles/${roleId}`, { method: "DELETE" }),
  reorderRoles: (pageId: number, ids: number[]) =>
    request<{ ok: true }>(`/api/pages/${pageId}/roles/reorder`, { method: "POST", body: { ids } }),
  setMemberRoles: (pageId: number, userId: number, roleIds: number[]) =>
    request<{ ok: true; roleIds: number[] }>(`/api/pages/${pageId}/members/${userId}/roles`, { method: "PATCH", body: { roleIds } }),
  channelRoles: (id: number) => request<{ view: number[]; post: number[] }>(`/api/channels/${id}/roles`),
  setChannelRoles: (id: number, body: { view: number[]; post: number[] }) =>
    request<{ view: number[]; post: number[] }>(`/api/channels/${id}/roles`, { method: "PATCH", body }),
  setChannelAllow: (id: number, userIds: number[]) =>
    request<{ channel: Channel }>(`/api/channels/${id}/allow`, { method: "PATCH", body: { userIds } }),
  messages: (channelId: number, before?: number) =>
    request<{ messages: Message[] }>(
      `/api/channels/${channelId}/messages${before ? `?before=${before}` : ""}`,
    ),
  postMessage: (channelId: number, body: string, replyToId?: number, attachmentIds?: number[]) =>
    request<{ message: Message }>(`/api/channels/${channelId}/messages`, {
      method: "POST",
      body: {
        body,
        ...(replyToId != null ? { replyToId } : {}),
        ...(attachmentIds?.length ? { attachmentIds } : {}),
      },
    }),
  // Chat-attachment uploads (two-phase: upload → stage → send claims them).
  uploadAttachment: (file: Blob, name: string, w?: number, h?: number) =>
    upload<{ attachment: Attachment }>(
      `/api/uploads?name=${encodeURIComponent(name)}${w && h ? `&w=${w}&h=${h}` : ""}`,
      file,
    ),
  deleteUpload: (id: number) =>
    request<{ ok: true }>(`/api/uploads/${id}`, { method: "DELETE" }),
  reactToMessage: (messageId: number, code: string) =>
    request<{ added: boolean }>(`/api/messages/${messageId}/react`, {
      method: "POST",
      body: { code },
    }),
  editMessage: (id: number, body: string) =>
    request<{ message: Message }>(`/api/messages/${id}`, { method: "PATCH", body: { body } }),
  deleteMessage: (id: number) =>
    request<{ message: Message }>(`/api/messages/${id}`, { method: "DELETE" }),
  // Direct messages.
  dmConversations: () => request<{ conversations: DmConversation[] }>("/api/dm"),
  startDm: (userId: number) =>
    request<{ conversation: DmConversation }>("/api/dm", { method: "POST", body: { userId } }),
  // THE HOUSE'S BRAINS: what Sterling, the goblins and Dr. Voss remember about
  // you (your own notes only), and forgetting it.
  npcMemory: () =>
    request<{ memories: { npc: string; name: string; notes: string; updatedAt: number | null }[] }>("/api/me/npc-memory"),
  forgetNpcMemory: (npc: string) => request<{ ok: true }>(`/api/me/npc-memory/${npc}`, { method: "DELETE" }),
  // THE AFFINITY METER: your standing with each of the three.
  npcAffinity: () => request<{ house: boolean; affinity: NpcAffinity[]; on?: boolean }>("/api/me/npc-affinity"),
  // Counter talk written for you, and a reaction said in their own words
  // (lib/npcvoice.ts). 503 = no model; the scripted lines are used.
  npcLines: (npc: string, venue: string, fresh = false) =>
    request<{ lines: string[] }>("/api/npc/lines", { method: "POST", body: { npc, venue, fresh } }),
  npcVoice: (npc: string, venue: string, line: string, event: string) =>
    request<{ line: string }>("/api/npc/voice", { method: "POST", body: { npc, venue, line, event } }),
  dmMessages: (convId: number, before?: number) =>
    request<{ messages: DmMessage[]; theirLastReadId?: number | null }>(`/api/dm/${convId}/messages${before ? `?before=${before}` : ""}`),
  sendDm: (convId: number, body: string, replyToId?: number, attachmentIds?: number[]) =>
    request<{ message: DmMessage }>(`/api/dm/${convId}/messages`, {
      method: "POST",
      body: {
        body,
        ...(replyToId != null ? { replyToId } : {}),
        ...(attachmentIds?.length ? { attachmentIds } : {}),
      },
    }),
  markDmRead: (convId: number) =>
    request<{ ok: true; unread: number }>(`/api/dm/${convId}/read`, { method: "POST" }),
  editDm: (id: number, body: string) =>
    request<{ message: DmMessage }>(`/api/dm/messages/${id}`, { method: "PATCH", body: { body } }),
  deleteDm: (id: number) =>
    request<{ message: DmMessage }>(`/api/dm/messages/${id}`, { method: "DELETE" }),
  wheel: () => request<WheelStatus>("/api/wheel"),
  spin: () =>
    request<{ ok: boolean; result: SpinResult; spinsLeft: number; slotIndex: number; face: (WheelFaceSlot | null)[] }>(
      "/api/wheel/spin",
      { method: "POST" },
    ),
  inventory: () => request<{ emoji: Emoji[]; count: number }>("/api/inventory"),
  slotsStatus: () => request<{ cost: number; coins: number; freePulls?: number; chips?: number }>("/api/slots"),
  slotsPull: (stake?: number) =>
    request<SlotsPull>("/api/slots/pull", { method: "POST", body: stake === undefined ? undefined : { stake } }),
  // Direct trades.
  trades: () => request<{ incoming: Trade[]; outgoing: Trade[] }>("/api/trades"),
  createTrade: (toUser: number, offered: string[], requested: string[], note?: string) =>
    request<{ trade: Trade }>("/api/trades", { method: "POST", body: { toUser, offered, requested, note } }),
  acceptTrade: (id: number) => request<{ trade: Trade }>(`/api/trades/${id}/accept`, { method: "POST" }),
  declineTrade: (id: number) => request<{ trade: Trade }>(`/api/trades/${id}/decline`, { method: "POST" }),
  cancelTrade: (id: number) => request<{ trade: Trade }>(`/api/trades/${id}/cancel`, { method: "POST" }),
  // Auction house (public silver marketplace).
  auctions: () => request<{ open: Auction[]; recent: Auction[] }>("/api/auctions"),
  createAuction: (code: string, startPrice: number, hours: number) =>
    request<{ auction: Auction }>("/api/auctions", { method: "POST", body: { code, startPrice, hours } }),
  /** List a DUPLICATE relic (a backrooms locker row) for silver bids. */
  createRelicAuction: (relicItemId: number, startPrice: number, hours: number) =>
    request<{ auction: Auction }>("/api/auctions", { method: "POST", body: { relicItemId, startPrice, hours } }),
  bidAuction: (id: number, amount: number) =>
    request<{ auction: Auction; coins: number }>(`/api/auctions/${id}/bid`, { method: "POST", body: { amount } }),
  cancelAuction: (id: number) =>
    request<{ auction: Auction }>(`/api/auctions/${id}/cancel`, { method: "POST" }),
  // Blackjack (four house tables, silver stakes).
  feedback: () => request<{ items: FeedbackItem[] }>("/api/feedback"),
  sendFeedback: (kind: "bug" | "idea", body: string) =>
    request<{ ok: true; item: FeedbackItem }>("/api/feedback", { method: "POST", body: { kind, body } }),
  setFeedbackStatus: (id: number, done: boolean) =>
    request<{ ok: true; item: FeedbackItem }>(`/api/feedback/${id}/status`, { method: "POST", body: { done } }),
  chess: () => request<ChessState>("/api/chess"),
  chessChallenge: (stake: ChessStakeSpec, minutes: number) =>
    request<{ ok: true; coins: number }>("/api/chess/challenge", { method: "POST", body: { ...stake, minutes } }),
  chessCancelChallenge: () =>
    request<{ ok: true; coins: number }>("/api/chess/challenge/cancel", { method: "POST", body: {} }),
  chessAccept: (challengeId: string, stake: ChessStakeSpec) =>
    request<{ ok: true; gameId: string; coins: number }>("/api/chess/accept", { method: "POST", body: { challengeId, ...stake } }),
  chessMove: (gameId: string, from: string, to: string, promotion?: string) =>
    request<{ ok: true }>("/api/chess/move", { method: "POST", body: { gameId, from, to, promotion } }),
  chessResign: (gameId: string) =>
    request<{ ok: true }>("/api/chess/resign", { method: "POST", body: { gameId } }),
  blackjack: () => request<{ lobbies: BjLobby[] }>("/api/blackjack"),
  bjJoin: (lobby: number) => request<{ ok: true }>(`/api/blackjack/${lobby}/join`, { method: "POST", body: {} }),
  bjLeave: (lobby: number) => request<{ ok: true }>(`/api/blackjack/${lobby}/leave`, { method: "POST", body: {} }),
  bjBet: (lobby: number, amount: number) =>
    request<{ ok: true; coins: number }>(`/api/blackjack/${lobby}/bet`, { method: "POST", body: { amount } }),
  bjAction: (lobby: number, move: "hit" | "stand" | "double" | "split") =>
    request<{ ok: true; coins: number }>(`/api/blackjack/${lobby}/action`, { method: "POST", body: { move } }),
  // Moderation: blocks + reports (iOS-store readiness, useful everywhere).
  blocks: () => request<{ blocked: number[] }>("/api/blocks"),
  blockUser: (id: number) => request<{ blocked: number[] }>(`/api/blocks/${id}`, { method: "POST", body: {} }),
  unblockUser: (id: number) => request<{ blocked: number[] }>(`/api/blocks/${id}`, { method: "DELETE" }),
  report: (kind: "message" | "dm" | "user" | "page", refId: number, reason: string) =>
    request<{ ok: true; id: number }>("/api/report", { method: "POST", body: { kind, refId, reason } }),
  adminReports: () => request<{ reports: ReportItem[] }>("/api/admin/reports"),
  setReportStatus: (id: number, status: "open" | "resolved") =>
    request<{ ok: true }>(`/api/admin/reports/${id}/status`, { method: "POST", body: { status } }),
  deleteAccount: (password: string) =>
    request<{ ok: true }>("/api/me/delete", { method: "POST", body: { password } }),
  // Roulette (the shared house table).
  rouletteStatus: () => request<{ state: RouletteState; coins: number }>("/api/roulette"),
  rouletteBet: (kind: string, target: number | null, amount: number) =>
    request<{ state: RouletteState; coins: number }>("/api/roulette/bet", {
      method: "POST",
      body: { kind, target, amount },
    }),
  rouletteClear: () =>
    request<{ state: RouletteState; coins: number }>("/api/roulette/clear", { method: "POST", body: {} }),
  // Craps (the shared house table).
  crapsStatus: () => request<{ state: CrapsState; coins: number }>("/api/craps"),
  crapsBet: (kind: string, num: number | null, amount: number) =>
    request<{ state: CrapsState; coins: number }>("/api/craps/bet", {
      method: "POST",
      body: { kind, num, amount },
    }),
  crapsTakeDown: (kind: string, num: number | null) =>
    request<{ state: CrapsState; coins: number }>("/api/craps/takedown", {
      method: "POST",
      body: { kind, num },
    }),
  crapsRoll: () => request<{ state: CrapsState }>("/api/craps/roll", { method: "POST", body: {} }),
  // Texas Hold'em (three house tables).
  holdemStatus: () =>
    request<{ lobby: HoldemLobby; coins: number; mine: HoldemMine | null }>("/api/holdem"),
  holdemSit: (tableId: number, seat: number, buyIn: number) =>
    request<{ lobby: HoldemLobby; coins: number }>("/api/holdem/sit", {
      method: "POST",
      body: { tableId, seat, buyIn },
    }),
  holdemLeave: (tableId: number) =>
    request<{ lobby: HoldemLobby; coins: number }>("/api/holdem/leave", {
      method: "POST",
      body: { tableId },
    }),
  holdemAction: (tableId: number, action: string, amount: number | null = null) =>
    request<{ lobby: HoldemLobby }>("/api/holdem/action", {
      method: "POST",
      body: { tableId, action, amount },
    }),
  // Sterling's levers (admin).
  /** THE NOTICE BOARD: post a brief to #Solace Updates in Sterling's voice. */
  adminSterlingUpdate: (body: string) =>
    request<{ ok: true; messageId: number; channelId: number }>("/api/admin/sterling/update", { method: "POST", body: { body } }),
  /** One of his private notes to a member, written now (src/sterling-notice.ts). */
  adminSterlingNotice: (userId: number, kind: "first_legendary" | "streak" | "back" | "friend_death") =>
    request<{ ok: true }>("/api/admin/sterling/notice", { method: "POST", body: { userId, kind } }),
  adminFireSpecial: (kind: string) =>
    request<{ ok: true; kind: string }>("/api/admin/special", { method: "POST", body: { kind } }),
  adminResetStats: () =>
    request<{ ok: true; cleared: number }>("/api/admin/stats/reset", { method: "POST", body: {} }),
  // THE HOUSE'S BRAINS (src/npc): status + the off switch.
  adminNpcBrain: () => request<NpcBrainStatus>("/api/admin/npc-brain"),
  adminSetNpcBrain: (on: boolean) => request<NpcBrainStatus>("/api/admin/npc-brain", { method: "POST", body: { on } }),
  /** SURVIVORZ ON AIR: is the show live (any member). */
  survivorzOnAir: () => request<{ onAir: boolean; adminView?: boolean; test?: boolean; walk?: boolean; watching: number; map: string | null; runNo: number | null }>("/api/survivorz/onair"),
  /** SURVIVORZ CHARACTERS (Admin Panel → Characters): the repo's cast and the list kept in the DB. */
  // the character creator's bodies (docs/survivorz/CREATOR.md): uploads go by XHR in CreatorBodies.svelte (progress)
  adminCreatorBodies: () => request<CreatorBodiesPayload>("/api/admin/survivorz/bodies"),
  adminCreatorBodyEdit: (id: string, patch: { licence?: string | null; credit?: string | null; heightM?: number | null; suited?: boolean }) =>
    request<{ body: CreatorBody }>(`/api/admin/survivorz/bodies/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
  /** bake a ready body's grabs, bites and rescues (from the "pairs" step, the rest kept) */
  adminCreatorBodyPairs: (id: string) => request<{ body: CreatorBody }>(`/api/admin/survivorz/bodies/${encodeURIComponent(id)}/pairs`, { method: "POST" }),
  adminCreatorBodyRebake: (id: string) => request<{ body: CreatorBody }>(`/api/admin/survivorz/bodies/${encodeURIComponent(id)}/rebake`, { method: "POST" }),
  adminCreatorBodyPause: (id: string) => request<{ body: CreatorBody }>(`/api/admin/survivorz/bodies/${encodeURIComponent(id)}/pause`, { method: "POST" }),
  adminCreatorBodyResume: (id: string) => request<{ body: CreatorBody }>(`/api/admin/survivorz/bodies/${encodeURIComponent(id)}/resume`, { method: "POST" }),
  /** the waiting bodies in the order they should bake */
  adminCreatorQueue: (ids: string[]) => request<{ ok: true }>("/api/admin/survivorz/bodies/queue", { method: "POST", body: { ids } }),
  adminCreatorBodyDelete: (id: string) => request<{ ok: true }>(`/api/admin/survivorz/bodies/${encodeURIComponent(id)}`, { method: "DELETE" }),
  adminCast: () => request<CastPayload>("/api/admin/survivorz/cast"),
  adminCastBible: (id: string) => request<{ text: string | null }>(`/api/admin/survivorz/cast/bible/${id}`),
  adminSurvivorzRoster: () => request<{ roster: RosterEntry[] }>("/api/admin/survivorz/roster"),
  adminCastStatus: (id: string, status: "cast" | "bench" | "draft") =>
    request<{ ok: true; live: boolean; held: string | null; warnings: CastProblem[] }>(`/api/admin/survivorz/cast/${id}/status`, { method: "POST", body: { status } }),
  adminCastCheck: (char: CastCharacter) => request<CastCheck>("/api/admin/survivorz/cast/check", { method: "POST", body: { char } }),
  adminCastSave: (char: CastCharacter, regardIn: Record<string, number | null>) =>
    request<{ ok: true; warnings: CastProblem[]; live: boolean; held: string | null }>("/api/admin/survivorz/cast/save", { method: "POST", body: { char, regardIn } }),
  adminCastDelete: (id: string) => request<{ ok: true }>(`/api/admin/survivorz/cast/${id}`, { method: "DELETE" }),
  /** delete a character: gone from the show at once (a show character can be brought back) */
  adminCastDeleteCharacter: (id: string) => request<{ ok: true; pending: boolean }>(`/api/admin/survivorz/cast/${id}/delete`, { method: "POST" }),
  adminCastHear: (char: CastCharacter, situation: string) =>
    request<{ line: string | null; ms?: number; note: string }>("/api/admin/survivorz/cast/hear", { method: "POST", body: { char, situation } }),
  // Observability (the operations console).
  adminLogs: (after = 0) =>
    request<{ epoch: number; lines: { id: number; at: number; level: string; line: string }[] }>(`/api/admin/logs?after=${after}`),
  // The perf-log export as a Blob (auth via header — a browser <a download>
  // can't set one, and query-token auth is restricted to /ws + the beacon).
  adminPerfExportBlob: async (): Promise<Blob> => {
    const token = getToken();
    const res = await fetch("/api/admin/perf/export", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, "export_failed");
    return res.blob();
  },
  // The weekly stability report (text) — same header-auth Blob pattern.
  adminWeeklyReportBlob: async (): Promise<Blob> => {
    const token = getToken();
    const res = await fetch("/api/admin/weekly-report", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, "export_failed");
    return res.blob();
  },
  // ---- The Backrooms (Solace-side: community map + door status) ----
  backroomsMap: (level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 0) =>
    request<{
      sector: string; size: number;
      level?: number;
      /** THE DOOR has been opened — Level 1 is selectable for everyone. */
      level1Open?: boolean;
      /** Pipe Dreams' door has been opened (the admin may enter regardless). */
      level2Open?: boolean;
      /** The Electrical Station: its door is open AND the ship gate let members in. */
      level3Open?: boolean;
      /** The Abandoned Office: the shutter powered AND its ship gate open. */
      level4Open?: boolean;
      /** The Terror Hotel: the stairwell door open AND its ship gate open. */
      level5Open?: boolean;
      /** Lights Out: the rusty door open AND its ship gate open. */
      level6Open?: boolean;
      /** Thalassophobia: the sea hatch open AND its ship gate open. */
      level7Open?: boolean;
      /** The Cave System: the subway stair open AND its ship gate open. */
      level8Open?: boolean;
      /** The Suburbs: the Chimney's rope fixed AND its ship gate open. */
      level9Open?: boolean;
      explored: string; wallN: string; wallW: string; solid: string; // base64 bitsets
      exploredCells: number; totalCells: number;
      landmarks: { name: string; x: number; y: number }[];
      doors: { name: string; x: number; y: number; edge: string }[];
      // No `bodies`: corpse locations are never published to the map — they
      // stream in game only, within 50m (Josh, July 2026).
      // ADMIN ONLY (the server attaches this for admins and nobody else): the
      // operator's view of everything players are meant to hunt for.
      debug?: {
        entities: { id: number; x: number; y: number; mode: string }[];
        relics: { x: number; y: number; name: string }[];
        drives: { id: string; x: number; y: number }[];
        door: { x: number; y: number; open: boolean };
        key: { x: number; y: number; held: boolean };
      };
      /** ADMIN ONLY: the level's whole hunt — monsters, relics, drives,
       *  objectives — in one shape on every level (BrService.operatorView). */
      operator?: OperatorView;
    }>(`/api/backrooms/map?level=${level}`),
  backroomsStatus: () =>
    request<{
      /** Runs in progress, INCLUDING frozen ones (socket lost, grace window
       *  still running) — they hold a slot and can still be killed. */
      inside: number;
      /** The subset with a live wire. The reset guard uses this, because it is
       *  what the server enforces. */
      connected: number;
      cap: number;
      doors: { name: string; inside: number }[];
      exploredCells: number; totalCells: number;
      players: { name: string; x: number; y: number }[];
      /** THE DOOR has been opened — Level 1 is selectable for everyone. */
      level1Open?: boolean;
      /** The Poolrooms' four arrival rooms (index 0 = The Landing). */
      poolsDoors?: { name: string; x: number; y: number }[];
      /** Pipe Dreams has been opened for everyone. */
      level2Open?: boolean;
      /** Pipe Dreams' one entrance (The Drain). */
      pipesDoors?: { name: string; x: number; y: number }[];
      /** The Electrical Station is open to members (door + ship gate). */
      level3Open?: boolean;
      /** The pressure door is open; the station waits on the admin's gate. */
      stationReady?: boolean;
      /** The ship gate's switch, on its own. */
      stationGate?: boolean;
      /** The station's one entrance (The Pressure Door). */
      stationDoors?: { name: string; x: number; y: number }[];
      /** The office: open to members, waiting on its gate, the gate itself, and its door (The Lift). */
      level4Open?: boolean;
      officeReady?: boolean;
      officeGate?: boolean;
      officeDoors?: { name: string; x: number; y: number }[];
      /** The Terror Hotel: open to members, waiting on its gate, the gate itself, and its door (The Service Stair). */
      level5Open?: boolean;
      hotelReady?: boolean;
      hotelGate?: boolean;
      hotelDoors?: { name: string; x: number; y: number }[];
      /** Lights Out: open to members, waiting on its gate, the gate itself, and its door (The Stair). */
      level6Open?: boolean;
      lightsReady?: boolean;
      lightsGate?: boolean;
      lightsDoors?: { name: string; x: number; y: number }[];
      /** Thalassophobia: open to members, waiting on its gate, the gate itself, and its door (The Hatch). */
      level7Open?: boolean;
      oceanReady?: boolean;
      oceanGate?: boolean;
      oceanDoors?: { name: string; x: number; y: number }[];
      level8Open?: boolean;
      caveReady?: boolean;
      caveGate?: boolean;
      caveDoors?: { name: string; x: number; y: number }[];
      /** The Suburbs: open to members, waiting on its gate, the gate itself,
       *  its door (The Manhole), and the way out found (Number 9's door open). */
      level9Open?: boolean;
      suburbsReady?: boolean;
      suburbsGate?: boolean;
      suburbDoors?: { name: string; x: number; y: number }[];
      level10Open?: boolean;
      /** Live session counts per level: [level0, level1, level2, level3]. */
      insideByLevel?: number[];
      /** YOUR run, if one is still standing. `waiting` = you left without an
       *  exit and it is frozen; any door resumes it, on its own level, and it
       *  is lost to the dark after `lostInMs`. */
      myRun?: { level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; waiting: boolean; lostInMs: number | null } | null;
    }>("/api/backrooms/status"),
  /** ADMIN: THE SHIP GATE for the Electrical Station (CLAUDE.md). */
  backroomsOpenStation: (open: boolean) =>
    request<{ ok: boolean; open: boolean }>("/api/admin/backrooms/open-station", { method: "POST", body: { open } }),
  /** ADMIN: THE SHIP GATE for the Abandoned Office. */
  backroomsOpenOffice: (open: boolean) =>
    request<{ ok: boolean; open: boolean }>("/api/admin/backrooms/open-office", { method: "POST", body: { open } }),
  /** ADMIN: THE SHIP GATE for the Terror Hotel. */
  backroomsOpenHotel: (open: boolean) =>
    request<{ ok: boolean; open: boolean }>("/api/admin/backrooms/open-hotel", { method: "POST", body: { open } }),
  backroomsOpenLights: (open: boolean) =>
    request<{ ok: boolean; open: boolean }>("/api/admin/backrooms/open-lights", { method: "POST", body: { open } }),
  /** ADMIN: THE SHIP GATE for Thalassophobia. */
  backroomsOpenOcean: (open: boolean) =>
    request<{ ok: boolean; open: boolean }>("/api/admin/backrooms/open-ocean", { method: "POST", body: { open } }),
  /** ADMIN: THE SHIP GATE for the Suburbs. */
  backroomsOpenSuburbs: (open: boolean) =>
    request<{ ok: boolean; open: boolean }>("/api/admin/backrooms/open-suburbs", { method: "POST", body: { open } }),
  /** ADMIN: THE SHIP GATE for the Cave System. */
  backroomsOpenCave: (open: boolean) =>
    request<{ ok: boolean; open: boolean }>("/api/admin/backrooms/open-cave", { method: "POST", body: { open } }),
  /** THRESHOLD-4 runs on SILVER since Sep 2026 (src/backrooms/grant.ts).
   *  `grant` is Async's remaining research budget — what Voss can still pay
   *  out for findings — and it is public on purpose: a counter that might
   *  refuse you should say so before you walk back with a relic. */
  backroomsMe: () =>
    request<{
      coins: number;
      grant: { silver: number; seed: number; state: "funded" | "low" | "dry" };
      lockerSlots: number;
      items: { id: number; kind: string; level: number; color: string | null }[];
      relics: { relicId: string; unlockedAt: number }[];
      catalog: { kind: string; name: string; price: number; maxLevel: number; levels: string[]; desc: string }[];
      prices: {
        upgrade: number[];
        relic: number; footage: Record<string, number>;
        suit: number; suitColors: string[];
        sprayColors: string[]; sprayColorCost: number;
        lockerUpgrade: number; lockerMax: number;
      };
    }>("/api/backrooms/me"),
  backroomsBuy: (kind: string, color?: string) =>
    request<{ coins: number; itemId: number }>("/api/backrooms/buy", { method: "POST", body: { kind, color } }),
  backroomsUpgrade: (itemId: number) =>
    request<{ coins: number; level: number }>("/api/backrooms/upgrade", { method: "POST", body: { itemId } }),
  backroomsSprayColor: (itemId: number, color: string) =>
    request<{ coins: number }>("/api/backrooms/spraycolor", { method: "POST", body: { itemId, color } }),
  backroomsLockerUpgrade: () =>
    request<{ coins: number; lockerSlots: number }>("/api/backrooms/locker-upgrade", { method: "POST", body: {} }),
  backroomsKit: (code: string) =>
    request<{ coins: number }>("/api/backrooms/kit", { method: "POST", body: { code } }),
  /** Throw a locker item away. Free, moves no money — equipment has no
   *  resale value at Threshold-4 (Voss buys findings, not kit). */
  backroomsDiscard: (itemId: number) =>
    request<{ ok: boolean }>("/api/backrooms/discard", { method: "POST", body: { itemId } }),
  /** FOUNDRY'S DISBURSEMENT — adjust Async's research budget (admin). */
  adminBrGrant: (amount: number) =>
    request<{ grant: number }>("/api/admin/backrooms/grant", { method: "POST", body: { amount } }),
  adminBrImmortal: (on: boolean) =>
    request<{ on: boolean }>("/api/admin/backrooms/immortal", { method: "POST", body: { on } }),
  /** THE BLEEDER playtest: out round the nearest corner, light or not. */
  /** THE GRABBER playtest: round behind you, now. */
  adminBrSummonGrabber: () =>
    request<{ ok: boolean }>("/api/admin/backrooms/summon-grabber", { method: "POST", body: {} }),
  adminBrSummonBleeder: () =>
    request<{ ok: boolean }>("/api/admin/backrooms/summon-bleeder", { method: "POST", body: {} }),
  adminBrSummonTemp: () =>
    request<{ ok: boolean }>("/api/admin/backrooms/summon-temp", { method: "POST", body: {} }),
  /** THE DEATHMOTHS playtest: the nearest swarm wakes and comes for you. */
  adminBrSummonMoths: () =>
    request<{ ok: boolean }>("/api/admin/backrooms/summon-moths", { method: "POST", body: {} }),
  adminBrSummonListener: () =>
    request<{ ok: boolean }>("/api/admin/backrooms/summon-listener", { method: "POST", body: {} }),
  adminBrSummonDeep: () =>
    request<{ ok: boolean }>("/api/admin/backrooms/summon-deep", { method: "POST", body: {} }),
  adminBrSummonBurrower: () =>
    request<{ ok: boolean }>("/api/admin/backrooms/summon-burrower", { method: "POST", body: {} }),
  /** THE NEIGHBORHOOD WATCH sent at the admin (the Suburbs, outdoors in the dark). */
  adminBrSummonWatch: () =>
    request<{ ok: boolean }>("/api/admin/backrooms/summon-watch", { method: "POST", body: {} }),
  adminBrSummon: () =>
    request<{ armed: boolean }>("/api/admin/backrooms/summon", { method: "POST", body: {} }),
  /** ADMIN: wipe the community map — fog, spray, bodies, drops, deaths.
   *  `deep` ALSO erases progress: every relic anyone has unlocked, the whole
   *  lore archive and THE DOOR. Unrecoverable; for testing the discovery loop. */
  backroomsOpenPools: () =>
    request<{ ok: boolean; fresh: boolean; openedBy: string | null; at: number }>(
      "/api/admin/backrooms/open-pools",
      { method: "POST", body: {} },
    ),
  backroomsReset: (deep = false) =>
    request<{
      ok: boolean; deep: boolean;
      fog: number; marks: number; corpses: number; drops: number; deaths: number;
      relics: number; drives: number; flags: number;
    }>("/api/admin/backrooms/reset", { method: "POST", body: { deep } }),
  backroomsDeaths: () =>
    request<{ deaths: { name: string; cause: string; at: number }[] }>("/api/backrooms/deaths"),
  /** THE RESEARCH ARCHIVE — only drives somebody has actually found in Level 0
   *  come back (text and all). Locked ones don't exist on the wire. */
  backroomsResearch: () =>
    request<{
      entries: { id: string; title: string; file: string; body: string; desc: string; ada: string; level: number; finder: string; at: number }[];
      door: { open: boolean; openedBy: string | null; at: number | null };
    }>("/api/backrooms/research"),
  backroomsSellItem: (itemId: number) =>
    request<{ coins: number; gained: number; grant: number }>("/api/backrooms/sellitem", { method: "POST", body: { itemId } }),
  adminErrors: () =>
    request<{ errors: { id: number; kind: string; message: string; stack: string | null; route: string | null; userId: number | null; count: number; firstAt: number; lastAt: number }[] }>("/api/admin/errors"),
  adminClearErrors: () =>
    request<{ ok: true; cleared: number }>("/api/admin/errors/clear", { method: "POST", body: {} }),
  adminHealth: () =>
    request<{ checks: { name: string; ok: boolean; detail: string }[] }>("/api/admin/health"),
  adminEconomy: () =>
    request<{
      now: { totalCoins: number; escrows: { name: string; total: number }[]; escrow: number; potPending: number; vault: number; grant: number };
      snapshots: { day: string; at: number; totalCoins: number; escrow: number; potPending: number; vault: number | null; grant?: number | null; houseMints?: number | null; exchangeFloat?: number | null }[];
    }>("/api/admin/economy"),
  adminConnections: () =>
    request<{ connections: { user: User | null; sockets: number; ips: string[]; agents: string[]; voiceChannelId: number | null; status: string }[] }>("/api/admin/connections"),
  adminAudit: () =>
    request<{ audit: { id: number; at: number; actorId: number | null; action: string; detail: string | null; actor: { id: number; displayName: string } | null }[] }>("/api/admin/audit"),
  // ---- Security (Admin Panel > Security, and your own sessions) ----------
  adminSecurity: (hours = 24) =>
    request<{
      windowMs: number;
      posture: PostureCheck[];
      host: PostureCheck[];
      findings: SecurityFinding[];
      counts: { outcome: string; n: number }[];
      failedByAccount: { userId: number | null; username: string; fails: number; ips: number; lastAt: number }[];
      failedByIp: { ip: string; network: string; fails: number; users: number; names: string; lastAt: number }[];
      staff: { id: number; username: string; isAdmin: number; role: string; lastLoginAt: number | null; recent: LoginEvent[] }[];
    }>(`/api/admin/security?hours=${hours}`),
  adminSecurityEvents: (opts: { limit?: number; userId?: number; outcome?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.limit) q.set("limit", String(opts.limit));
    if (opts.userId) q.set("userId", String(opts.userId));
    if (opts.outcome) q.set("outcome", opts.outcome);
    return request<{ events: LoginEvent[] }>(`/api/admin/security/events?${q}`);
  },
  adminSecuritySessions: () =>
    request<{ sessions: (SessionRow & { user: User | null })[] }>("/api/admin/security/sessions"),
  adminRevokeSessions: (body: { handle?: string; userId?: number }) =>
    request<{ ok: true; revoked: number }>("/api/admin/security/sessions/revoke", { method: "POST", body }),
  mySessions: () => request<{ sessions: SessionRow[] }>("/api/me/sessions"),
  myRevokeSession: (body: { handle?: string; others?: boolean }) =>
    request<{ ok: true; revoked: number }>("/api/me/sessions/revoke", { method: "POST", body }),
  mySecurity: () => request<{ events: LoginEvent[]; windowMs: number }>("/api/me/security"),
  reportClientError: (message: string, stack?: string, url?: string) =>
    request<{ ok: true }>("/api/client-error", { method: "POST", body: { message, stack, url } }),
  // The Emoji Derby.
  derbyStatus: () =>
    request<{ state: DerbyState; mine: Record<string, number>; coins: number }>("/api/derby"),
  derbyBet: (racer: string, amount: number) =>
    request<{ state: DerbyState; mine: Record<string, number>; coins: number }>("/api/derby/bet", {
      method: "POST",
      body: { racer, amount },
    }),
  derbyCancel: () =>
    request<{ state: DerbyState; mine: Record<string, number>; coins: number; refunded: number }>("/api/derby/cancel", {
      method: "POST",
      body: {},
    }),
  // THE MAP EDITOR (Admin Panel → Map editor; routes/mapeditor.ts). Rooms
  // travel as the room-library JSON the repo file holds (pipes-tiles TileDef).
  mapEditor: (level: number) => request<MapEditorState>(`/api/admin/maps/${level}`),
  mapSaveDraft: (level: number, tiles: unknown[], seed: number) =>
    request<{ ok: true; savedAt: number; rooms: number; problems: number }>(`/api/admin/maps/${level}/draft`, { method: "POST", body: { tiles, seed } }),
  mapDropDraft: (level: number) => request<{ ok: true; dropped: boolean }>(`/api/admin/maps/${level}/draft`, { method: "DELETE" }),
  mapBuild: (level: number, tiles: unknown[], seed: number) =>
    request<Record<string, unknown> & { problems: string[]; fingerprint: string; keepsMap: boolean; seedChanged: boolean; changes: MapChanges; inside: number }>(`/api/admin/maps/${level}/build`, { method: "POST", body: { tiles, seed } }),
  mapPublish: (level: number, tiles: unknown[], seed: number, note: string) =>
    request<{ ok: true; version: number; sectorId: string; voided: number; kept: boolean; chunks?: number }>(`/api/admin/maps/${level}/publish`, { method: "POST", body: { tiles, seed, note } }),
  mapHeat: (level: number) =>
    request<{ sectorId: string; size: number; fingerprint: string; deaths: { x: number; y: number; cause: string; at: number }[]; explored: string }>(`/api/admin/maps/${level}/heat`),
  mapCompare: (level: number, version: number, tiles: unknown[], seed: number) =>
    request<{ version: number; before: Record<string, unknown>; after: Record<string, unknown>; sameMap: boolean; changes: MapChanges }>(`/api/admin/maps/${level}/compare`, { method: "POST", body: { version, tiles, seed } }),
  mapPlaytest: (level: number, tiles: unknown[], seed: number) =>
    request<{ ok: true; sectorId: string; problems: string[] }>(`/api/admin/maps/${level}/playtest`, { method: "POST", body: { tiles, seed } }),
  mapPlaytestEnd: (level: number) => request<{ ok: true; sent: number[] }>(`/api/admin/maps/${level}/playtest/end`, { method: "POST" }),
  mapRevert: (level: number, version: number) =>
    request<{ ok: true; savedAt: number; version: number }>(`/api/admin/maps/${level}/revert`, { method: "POST", body: { version } }),
  mapExport: (level: number) => request<{ level: number; version: number; sectorId: string; seed: number; file: string }>(`/api/admin/maps/${level}/export`),
  mapSurfaceUpload: (kind: string, name: string, sizeM: number, level: boolean, file: Blob) =>
    upload<{ ok: true; id: string; surfaces: import("../../../src/backrooms/surfaces").CustomSurface[] }>(
      `/api/admin/map-surfaces?kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}&sizeM=${sizeM}&level=${level ? 1 : 0}`,
      file,
    ),
  // THE JUKEBOX (the casino floor). The playing state also arrives live on the
  // floor socket; these are the library and the actions that cost silver.
  jukebox: () =>
    request<{ state: JukeboxState; library: JukeboxSong[]; price: number; skipPrice: number }>(
      "/api/jukebox",
    ),
  jukeboxQueue: (songId: number) =>
    request<{ state: JukeboxState; coins: number }>("/api/jukebox/queue", {
      method: "POST",
      body: { songId },
    }),
  jukeboxSkip: () =>
    request<{ state: JukeboxState; skipped: boolean; coins: number }>("/api/jukebox/skip", {
      method: "POST",
      body: {},
    }),
  adminJukebox: () => request<{ songs: JukeboxSong[] }>("/api/admin/jukebox"),
  adminJukeboxAdd: (file: File, title: string, artist: string) =>
    upload<{ song: JukeboxSong }>(
      `/api/admin/jukebox?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`,
      file,
    ),
  adminJukeboxRename: (id: number, title: string, artist: string) =>
    request<{ song: JukeboxSong }>(`/api/admin/jukebox/${id}`, {
      method: "PATCH",
      body: { title, artist },
    }),
  adminJukeboxRemove: (id: number) =>
    request<{ ok: true }>(`/api/admin/jukebox/${id}`, { method: "DELETE" }),
  // The Nightly Lottery.
  lottery: () => request<LotteryInfo>("/api/lottery"),
  lotteryBuy: (count: number) =>
    request<{ ok: true; mine: number; coins: number; pot: number; tickets: number }>("/api/lottery/buy", {
      method: "POST",
      body: { count },
    }),
  // Sterling's Emporium (cosmetics for silver).
  emporium: () =>
    request<{ items: EmporiumItem[]; cosmetics: Cosmetics; coins: number; restockAt: number; dealPct: number }>("/api/emporium"),
  emporiumBuy: (itemId: string, expect?: number) =>
    request<{ ok: true; itemId: string; coins: number }>("/api/emporium/buy", {
      method: "POST",
      body: { itemId, expect },
    }),
  // PANDORA'S BOX (the endgame, PANDORA.md).
  pandora: () => request<PandoraState>("/api/pandora"),
  pandoraInsert: (key: PandoraKeyId) =>
    request<{ ok: true; inserted: PandoraKeyId[] }>("/api/pandora/insert", { method: "POST", body: { key } }),
  pandoraOpen: (choice: string | null) =>
    request<{ ok: true; id: number; at: number; choice: string | null; suit: string }>("/api/pandora/open", { method: "POST", body: { choice } }),
  adminPandoraKey: (userId: number, key: PandoraKeyId, revoke = false) =>
    request<{ ok: true; granted?: boolean; revoked?: boolean }>("/api/admin/pandora/key", { method: "POST", body: { userId, key, revoke } }),
  adminPandoraReset: (userId: number) =>
    request<{ ok: true; cleared: boolean }>("/api/admin/pandora/reset", { method: "POST", body: { userId } }),
  // THE STONE OF THE ABYSS
  abyss: () => request<AbyssState>("/api/abyss"),
  portal: () => request<PortalOverview>("/api/portal"),
  portalRoom: (id: string) => request<PortalRoom>(`/api/portal/rooms/${encodeURIComponent(id)}`),
  portalRoster: () => request<{ roster: PortalRosterRow[] }>("/api/portal/roster"),
  portalWall: () => request<{ wall: PortalWallCell[]; notation: PortalNotationCell[] }>("/api/portal/wall"),
  portalGuessNotation: (mark: number, glyph: number) => request<{ ok: true; right: boolean; left: number }>("/api/portal/guess/notation", { method: "POST", body: { mark, glyph } }),
  portalIshaal: () => request<PortalIshaal>("/api/portal/ishaal"),
  portalIshaalDo: (what: string, body: Record<string, unknown> = {}) =>
    request<{ ok: true; done?: "even" | "odd" | "none" | null; cracked?: number | null; winner?: string | null; id?: number }>(`/api/portal/ishaal/${what}`, { method: "POST", body }),
  portalBench: () => request<PortalBench>("/api/portal/bench"),
  portalVoice: (room: string) => request<PortalVoiceState>(`/api/portal/voice/${encodeURIComponent(room)}`),
  portalVoiceBeat: (room: string) => request<PortalVoiceState>(`/api/portal/voice/${encodeURIComponent(room)}/beat`, { method: "POST", body: {} }),
  portalVoiceLeave: (room: string) => request<{ ok: true }>(`/api/portal/voice/${encodeURIComponent(room)}/leave`, { method: "POST", body: {} }),
  portalVoiceToken: (room: string) => request<{ token: string; url: string; room: string }>(`/api/portal/voice/${encodeURIComponent(room)}/token`, { method: "POST", body: {} }),
  portalBenchStart: (id: string) => request<{ ok: true; seed: number }>("/api/portal/bench/start", { method: "POST", body: { id } }),
  portalBenchFinish: (bleeds: [number, number][]) => request<{ ok: true; held: boolean; cracked: number | null; mark: number | null }>("/api/portal/bench/finish", { method: "POST", body: { bleeds } }),
  portalSurvey: () => request<PortalSurvey>("/api/portal/survey"),
  portalChart: (galaxy: string, pairs: Record<string, string>) =>
    request<{ ok: true; right: boolean; left: number; cracked: number | null }>("/api/portal/survey/chart", { method: "POST", body: { galaxy, pairs } }),
  portalProfile: (key: string) => request<PortalProfile>(`/api/portal/profile/${encodeURIComponent(key)}`),
  portalPost: (room: string, tokens: number[]) => request<{ ok: true; id: number }>(`/api/portal/rooms/${encodeURIComponent(room)}/posts`, { method: "POST", body: { tokens } }),
  portalReact: (target: string, sign: string) => request<{ ok: true; on: boolean }>("/api/portal/react", { method: "POST", body: { target, sign } }),
  portalGuessGlyph: (glyph: number, sound: string) => request<{ ok: true; right: boolean; left: number }>("/api/portal/guess/glyph", { method: "POST", body: { glyph, sound } }),
  portalGuessWord: (target: string, word: number, piece: number, meaning: string) =>
    request<{ ok: true; right: boolean; left: number; learned?: string }>("/api/portal/guess/word", { method: "POST", body: { target, word, piece, meaning } }),
  abyssSpeak: () => request<{ ok: true; opened: true; openedAt: number; first: boolean }>("/api/abyss/speak", { method: "POST", body: {} }),
  adminAbyssStone: (userId: number, revoke = false) =>
    request<{ ok: true; granted?: boolean; revoked?: boolean }>("/api/admin/abyss/stone", { method: "POST", body: { userId, revoke } }),
  // THE VIP ROOM (behind the rope at Sterling's).
  vip: () =>
    request<{
      rank: number; max: number; live: number; names: readonly string[]; tiers: readonly string[];
      progress: VipProgress[]; relicNeed: number[]; items: VipItem[]; cosmetics: Cosmetics; coins: number; perks: VipPerks;
    }>("/api/vip"),
  vipConsolidate: () =>
    request<{ ok: true; paid: number; released: boolean; coins: number }>("/api/vip/consolidate", { method: "POST" }),
  cellConsolidate: () =>
    request<{ ok: true; paid: number; released: boolean }>("/api/cell/consolidate", { method: "POST" }),
  vipBuy: (itemId: string) =>
    request<{ ok: true; itemId: string; coins: number }>("/api/vip/buy", { method: "POST", body: { itemId } }),
  emporiumEquip: (slot: string, itemId: string | null) =>
    request<{ cosmetics: Cosmetics }>("/api/emporium/equip", { method: "POST", body: { slot, itemId } }),
  adminGrantCoins: (amount: number, userId?: number) =>
    request<{ ok: true; userId: number; coins: number }>("/api/admin/coins", {
      method: "POST",
      body: { amount, userId },
    }),
  adminSetItemPrice: (itemId: string, price: number | null) =>
    request<{ ok: true; itemId: string; price: number }>("/api/admin/emporium/price", {
      method: "POST",
      body: { itemId, price },
    }),
  // The Graveyard (respects, epitaphs, wills) — plus the fresh graves that can
  // still be raised, and the monuments of lives that sealed.
  graveyard: () =>
    request<{
      graves: Grave[];
      lives: Monument[];
      raisePrice: number;
      candlePrice: number;
      flowersPrice: number;
      maxEulogy: number;
      necrology: Record<string, number>;
      now: number;
    }>("/api/graveyard"),
  /** One account's whole story with death: the family plot, the revival
   *  history, and (while they lie dead) the open grave's eulogies. */
  graveMemorial: (userId: number) =>
    request<{
      lives: Monument[];
      revivals: { byUserId: number | null; kind: string; cost: number | null; mythicCode: string | null; at: number }[];
      eulogies: { byUserId: number; text: string; at: number }[];
    }>(`/api/graveyard/${userId}/memorial`),
  /** Light a candle (25) or leave flowers (100) — silver burned. */
  graveTribute: (userId: number, kind: "candle" | "flowers") =>
    request<{ ok: true; coins: number }>(`/api/graveyard/${userId}/tribute`, {
      method: "POST",
      body: { kind },
    }),
  /** Write (or rewrite) your eulogy on a grave. Free. */
  setGraveEulogy: (userId: number, text: string) =>
    request<{ ok: true }>(`/api/graveyard/${userId}/eulogy`, { method: "POST", body: { text } }),
  /** Take your eulogy back — or, with authorId, staff sweeping somebody else's. */
  deleteGraveEulogy: (userId: number, authorId?: number) =>
    request<{ ok: true }>(
      authorId != null ? `/api/graveyard/${userId}/eulogy/${authorId}` : `/api/graveyard/${userId}/eulogy`,
      { method: "DELETE" },
    ),
  /** Burn the price to stand somebody back up. Never your own grave. */
  raiseGrave: (userId: number, kind: "silver" | "mythic", code?: string) =>
    request<{ ok: true; coins: number }>(`/api/graveyard/${userId}/raise`, {
      method: "POST",
      body: { kind, code },
    }),
  /** Your own wake — only reachable with a wake session (a dead-but-fresh
   *  account). Every other endpoint 401s for that token. */
  wake: () => request<WakeState>("/api/wake"),
  wakeRevive: () =>
    request<{ ok: true; burnedCoins: number; burned: string[] }>("/api/wake/revive", {
      method: "POST",
    }),
  graveRespect: (userId: number, code: string) =>
    request<{ added: boolean }>(`/api/graveyard/${userId}/respect`, { method: "POST", body: { code } }),
  updateLegacy: (fields: { epitaph?: string | null; willBeneficiaryId?: number | null }) =>
    request<{ epitaph: string | null; willBeneficiaryId: number | null }>("/api/me/legacy", {
      method: "PATCH",
      body: fields,
    }),
  // The Casino Escape Room threshold (ESCAPE.md — the pass, Sterling's
  // ante-room counter, the two lockers).
  escape: () =>
    request<{
      pass: boolean;
      stakeTier: string;
      coins: number;
      inv: { item: string; qty: number }[];
      locker: { item: string; qty: number }[];
      tools: Record<string, { name: string; price: number; blurb: string }>;
      invSlots: number;
      lockerSlots: number;
      gunCarried: boolean;
    }>("/api/escape"),
  escapeStake: (code: string) =>
    request<{ ok: true; pass: true }>("/api/escape/stake", { method: "POST", body: { code } }),
  escapeBuy: (item: string) =>
    request<{ ok: true; coins: number; inv: { item: string; qty: number }[] }>("/api/escape/buy", {
      method: "POST",
      body: { item },
    }),
  escapeLockerStore: (item: string, qty: number) =>
    request<{ ok: true; inv: { item: string; qty: number }[]; locker: { item: string; qty: number }[] }>(
      "/api/escape/locker/store",
      { method: "POST", body: { item, qty } },
    ),
  escapeLockerTake: (item: string, qty: number) =>
    request<{ ok: true; inv: { item: string; qty: number }[]; locker: { item: string; qty: number }[] }>(
      "/api/escape/locker/take",
      { method: "POST", body: { item, qty } },
    ),
  // Emoji Shop / Trader (silver coins).
  shop: () => request<ShopState>("/api/shop"),
  sellEmoji: (codes: string[]) =>
    request<{ coins: number; gained: number }>("/api/shop/sell", { method: "POST", body: { codes } }),
  /** STERLING'S SHELVES: today's spread — top shelf first — the same for
   *  everyone, each listing once per person per UTC day. */
  sterlingStock: () =>
    request<{ day: number; restockAt: number; prices: Record<string, number>; shelves: ShelfRow[] }>("/api/shop/stock"),
  buyFromSterling: (codes: string[]) =>
    request<{ coins: number; spent: number; emoji: Emoji[] }>("/api/shop/buy", { method: "POST", body: { codes } }),
  /** THE FORGE: melt for essence, spend essence to raise a tier. */
  forge: () =>
    request<{ essence: number; coins: number; meltYield: Record<string, number>; upgradeCost: Record<string, number>; nextTier: Record<string, string>; mythicToll: number; tolls: Record<string, number> }>("/api/forge"),
  forgeMelt: (codes: string[]) =>
    request<{ essence: number; gained: number }>("/api/forge/melt", { method: "POST", body: { codes } }),
  forgeUpgrade: (code: string) =>
    request<{ essence: number; coins: number; emoji: Emoji; consumed: Emoji; cost: number; toll: number }>("/api/forge/upgrade", { method: "POST", body: { code } }),
  buySpins: (count: number) =>
    request<{ coins: number; spins: number; bought: number }>("/api/shop/buy-spins", {
      method: "POST",
      body: { count },
    }),
  buyTalisman: (code: string) =>
    request<{ ok: true }>("/api/shop/talisman", { method: "POST", body: { code } }),
  buyTalismanWithSilver: (expect?: number) =>
    request<{ ok: true; coins: number }>("/api/shop/talisman-silver", { method: "POST", body: { expect } }),
  buyMythic: () =>
    request<{ ok: true; coins: number; emoji: Emoji }>("/api/shop/mythic", { method: "POST" }),
  buyDrink: (drink: string) =>
    request<{ ok: true; drink: string; coins: number }>("/api/shop/drink", { method: "POST", body: { drink } }),
  /** SLORP, under the counter. The silver burns; the ten minutes that follow
   *  are entirely the casino floor's business. */
  buySlorp: () =>
    request<{ ok: true; coins: number }>("/api/shop/slorp", { method: "POST" }),
  /** STAR DUST, the canister next to the vial. Same deal: the burn is here,
   *  the three huffs and the detonation are the floor's. */
  buyStardust: () =>
    request<{ ok: true; coins: number }>("/api/shop/stardust", { method: "POST" }),
  /** EGO, one goopy shot. Burned here; the swelling is the floor's. */
  buyEgo: () =>
    request<{ ok: true; coins: number }>("/api/shop/ego", { method: "POST" }),
  /** Buy another player on the casino floor a drink or a drug: it goes
   *  straight into their pockets. */
  casinoTreat: (item: string, to: number) =>
    request<{ ok: true; coins: number; item: string; price: number }>("/api/casino/treat", { method: "POST", body: { item, to } }),
  /** THE WALLET: your balance and your last transfers, both directions. */
  wallet: () =>
    request<{ coins: number; maxSend: number; owesGoblins: boolean; transfers: WalletTransfer[] }>("/api/wallet"),
  sendSilver: (toUserId: number, amount: number, note?: string) =>
    request<{ ok: true; coins: number; id: number }>("/api/wallet/send", { method: "POST", body: { toUserId, amount, note } }),
  // GOBLIN LENDERS — the goblin bank. Every number on these screens is
  // the server's; the client never proposes a rate, a limit or a bail price.
  lender: () =>
    request<{
      /** Who runs the window: the goblins, or Foundry Lending once Pandora's
       *  box has destroyed them. Absent on an older server = the goblins. */
      regime?: "goblins" | "foundry";
      vault: number;
      purse: number;
      worth: number;
      tiers: { amount: number; rate: number; base: number; allowed: boolean; affordable: boolean }[];
      loan: {
        principal: number; rate: number; interest: number; payoff: number; settle?: number;
        stage: number; missed: number; bail: number;
      } | null;
      /** A standing introductory rate from one of their letters (points off
       *  every window until `until`), or null. */
      offer: { off: number; until: number } | null;
      jailedAt: number | null;
      jailSealsAt: number | null;
      /** The goblins' lifetime books — lent out and taken back, ever. */
      books: { lent: number; taken: number };
      prisoners: {
        userId: number; jailedAt: number; jailSealsAt: number; debt: number; bail: number;
        user: { id: number; displayName: string; avatar: string | null } | null;
        plea: string | null;
        pot: number;
        contributors: { userId: number; amount: number; user: { id: number; displayName: string; avatar: string | null } | null }[];
      }[];
      /** The marked (stage 1-4, not jailed): who a friend may settle for. */
      marked: {
        userId: number; stage: number; interest: number; payoff: number; settle?: number;
        user: { id: number; displayName: string; avatar: string | null } | null;
      }[];
      /** THE REPO SHELF: what the goblins took, for sale. */
      shelf: {
        id: number; code: string; name: string; tier: string; file: string;
        price: number; seizedAt: number; fromUserId: number;
        from: { id: number; displayName: string; avatar: string | null } | null;
      }[];
    }>("/api/lender"),
  /** SETTLE FOR A FRIEND — pay somebody else's loan down from your wallet. */
  lenderPayFor: (userId: number, amount: number) =>
    request<{ coins: number; loan: unknown; cleared: boolean }>(`/api/lender/pay/${userId}`, {
      method: "POST",
      body: { amount },
    }),
  /** THE BAIL POT — chip in toward somebody's bail. */
  lenderChipIn: (userId: number, amount: number) =>
    request<{ coins: number; pot: number; price: number; released: boolean; took: number }>(
      `/api/lender/pot/${userId}`,
      { method: "POST", body: { amount } },
    ),
  /** THE REPO SHELF — buy what the goblins took off somebody. */
  lenderBuy: (id: number) =>
    request<{ coins: number; code: string; price: number; wasYours: boolean }>(`/api/lender/shelf/${id}/buy`, {
      method: "POST",
    }),
  /** THE PLEA — one line on your own cell card (jail auth). */
  cellPlea: (text: string) =>
    request<{ plea: string | null }>("/api/cell/plea", { method: "POST", body: { text } }),
  // NB: request() stringifies the body itself — passing a pre-stringified body
  // double-encodes it into a JSON *string*, whose .amount is undefined, and the
  // server refuses every borrow/payment with bad_amount ("not a number we
  // recognise"). Shipped broken for four days; the harness never caught it
  // because test_lender.mjs posts raw JSON, bypassing this wrapper.
  lenderBorrow: (amount: number) =>
    request<{ coins: number; loan: unknown }>("/api/lender/borrow", {
      method: "POST",
      body: { amount },
    }),
  lenderPay: (amount: number, service = false) =>
    request<{ coins: number; loan: unknown; cleared: boolean }>("/api/lender/pay", {
      method: "POST",
      body: { amount, service },
    }),
  lenderBail: (userId: number) =>
    request<{ coins: number; price: number }>(`/api/lender/bail/${userId}`, { method: "POST" }),
  lenderHistory: () =>
    request<{ events: { at: number; kind: string; amount: number; note: string | null }[] }>(
      "/api/lender/history",
    ),
  /** THE CELL — reachable only with a jailed session (auth level "jail"). */
  cell: () => request<CellState>("/api/cell"),
  // The Casino Gun + its magazines (both burns, like everything at Sterling's).
  buyGun: () =>
    request<{ ok: true; coins: number }>("/api/shop/gun", { method: "POST" }),
  buyGunClip: () =>
    request<{ ok: true; coins: number; clips: number }>("/api/shop/gunclip", { method: "POST" }),
  /** Tonight's biggest win at the tables (the Gazette's log): the Boulevard's board. */
  casinoTonight: () =>
    request<{ biggest: { name: string | null; amount: number; brief: string; at: number } | null }>("/api/casino/tonight"),
  // The casino item drawer: what you carry + the 50-slot locker.
  casinoItems: () =>
    request<{ inv: CasinoInvItem[]; locker: CasinoLockerItem[]; slots: number }>("/api/casino/items"),
  casinoStore: (item: string, qty = 1, slot?: number) =>
    request<{ ok: true; slot: number; inv: CasinoInvItem[]; locker: CasinoLockerItem[] }>("/api/casino/locker/store", { method: "POST", body: slot === undefined ? { item, qty } : { item, qty, slot } }),
  casinoTake: (slot: number) =>
    request<{ ok: true; item: string; qty: number; inv: CasinoInvItem[]; locker: CasinoLockerItem[] }>("/api/casino/locker/take", { method: "POST", body: { slot } }),
  casinoMove: (from: number, to: number) =>
    request<{ ok: true; inv: CasinoInvItem[]; locker: CasinoLockerItem[] }>("/api/casino/locker/move", { method: "POST", body: { from, to } }),
  // The Bone Pit (Liar's Dice).
  pit: () =>
    request<{ state: PitState; myDice: { gameId: string; dice: number[] } | null; coins: number; minStake: number; maxStake: number }>("/api/pit"),
  pitCreate: (stake: number) =>
    request<{ ok: true; gameId: string; coins: number }>("/api/pit/tables", { method: "POST", body: { stake } }),
  pitJoin: (id: string) =>
    request<{ ok: true; coins: number }>(`/api/pit/tables/${id}/join`, { method: "POST" }),
  pitLeave: (id: string) =>
    request<{ ok: true; coins: number }>(`/api/pit/tables/${id}/leave`, { method: "POST" }),
  pitStart: (id: string) =>
    request<{ ok: true }>(`/api/pit/tables/${id}/start`, { method: "POST" }),
  pitBid: (id: string, count: number, face: number) =>
    request<{ ok: true }>(`/api/pit/tables/${id}/bid`, { method: "POST", body: { count, face } }),
  pitLiar: (id: string) =>
    request<{ ok: true }>(`/api/pit/tables/${id}/liar`, { method: "POST" }),
  // The House Ledger (public aggregates).
  ledger: () =>
    request<{
      stats: Record<string, number>;
      boards: Record<string, { user: User; value: number }[]>;
      /** The caller's own standing per board key (absent = nothing on record). */
      mine: Record<string, { value: number; rank: number }>;
    }>("/api/ledger"),
  // Game nights.
  events: () => request<{ events: HouseEvent[] }>("/api/events"),
  createEvent: (title: string, at: number, note?: string) =>
    request<{ ok: true; id: number }>("/api/events", { method: "POST", body: { title, at, note } }),
  rsvpEvent: (id: number, going: boolean) =>
    request<{ ok: true }>(`/api/events/${id}/rsvp`, { method: "POST", body: { going } }),
  deleteEvent: (id: number) =>
    request<{ ok: true }>(`/api/events/${id}`, { method: "DELETE" }),
  // Admin/moderator account controls.
  adminLockUser: (id: number, locked: boolean) =>
    request<{ ok: true }>(`/api/admin/users/${id}/lock`, { method: "POST", body: { locked } }),
  adminSuspendUser: (id: number, hours: number) =>
    request<{ ok: true; until: number | null }>(`/api/admin/users/${id}/suspend`, { method: "POST", body: { hours } }),
  adminSetRole: (id: number, role: "user" | "moderator") =>
    request<{ ok: true; role: string }>(`/api/admin/users/${id}/role`, { method: "POST", body: { role } }),
  adminDeleteUser: (id: number) =>
    request<{ ok: true }>(`/api/admin/users/${id}/delete`, { method: "POST" }),
  adminUnlockLogin: (id: number) =>
    request<{ ok: true }>(`/api/admin/users/${id}/unlock-login`, { method: "POST" }),
  adminResetPassword: (id: number, password: string) =>
    request<{ ok: true }>(`/api/admin/users/${id}/password`, { method: "POST", body: { password } }),
  adminResetSecret: (id: number, secret: string) =>
    request<{ ok: true }>(`/api/admin/users/${id}/secret`, { method: "POST", body: { secret } }),
  // Admin observability (the Admin Panel).
  adminStats: () =>
    request<{ now: PerfSample | null; samples: PerfSample[] }>("/api/admin/stats"),
  adminStorage: (q = "") =>
    request<{ users: StorageRow[] }>(`/api/admin/storage?q=${encodeURIComponent(q)}`),
  // Spectator side bets (pari-mutuel).
  sideBet: (kind: "chess" | "pit", gameId: string, onUserId: number, amount: number) =>
    request<{ ok: true; coins: number; pools: Record<number, number> }>("/api/sidebet", {
      method: "POST",
      body: { kind, gameId, onUserId, amount },
    }),
  sideBets: (kind: "chess" | "pit", gameId: string) =>
    request<{ pools: Record<number, number>; mine: { onUserId: number; amount: number }[]; min: number; max: number }>(
      `/api/sidebet/${kind}/${gameId}`,
    ),
  // Message search (FTS5).
  search: (q: string) =>
    request<{
      channels: { id: number; channelId: number; channelName: string; body: string; createdAt: number; author: User | null }[];
      dms: { id: number; conversationId: number; body: string; createdAt: number; author: User | null; otherUser: User | null }[];
    }>(`/api/search?q=${encodeURIComponent(q)}`),
  feed: () => request<{ feed: WheelFeedItem[] }>("/api/wheel/feed"),
  leaderboard: () => request<{ leaders: LeaderRow[] }>("/api/leaderboard"),
  deaths: () => request<{ deaths: DeathRow[] }>("/api/deaths"),
  catalog: () => request<{ catalog: Record<string, EmojiLite[]> }>("/api/catalog"),
  leaderboardTiers: () => request<{ tiers: Record<string, TierLeader[]> }>("/api/leaderboard/tiers"),
  // Admin economy tools (server enforces admin auth; 403 otherwise).
  adminResetSpins: (userId?: number) =>
    request<{ ok: true; userId: number; spins: { bucket: number; bonus: number; total: number } }>(
      "/api/admin/spins/reset",
      { method: "POST", body: userId !== undefined ? { userId } : {} },
    ),
  adminRigLegendary: (userId: number, clear = false) =>
    request<{ ok: true; userId: number; rigged: string | null }>("/api/admin/spins/rig-legendary", {
      method: "POST",
      body: { userId, clear },
    }),
  adminRigDeath: (userId: number, clear = false) =>
    // `shielded`/`immune` say what the rigged wedge will ACTUALLY do — a rig
    // is not a guaranteed kill, and most accounts are carrying a talisman.
    request<{ ok: true; userId: number; rigged: string | null; shielded: boolean; immune: boolean }>("/api/admin/spins/rig-death", {
      method: "POST",
      body: { userId, clear },
    }),
  adminGrantTalisman: (userId: number) =>
    request<{ ok: true; userId: number }>("/api/admin/talisman", {
      method: "POST",
      body: { userId },
    }),
  adminReviveUser: (userId: number) =>
    request<{ ok: true; userId: number }>("/api/admin/users/revive", {
      method: "POST",
      body: { userId },
    }),
  // Invites (admin-minted registration codes).
  adminInvites: () => request<{ invites: Invite[] }>("/api/admin/invites"),
  adminCreateInvite: (opts: { maxUses?: number; ttlHours?: number; note?: string } = {}) =>
    request<{ invite: Invite }>("/api/admin/invites", { method: "POST", body: opts }),
  adminRevokeInvite: (code: string) =>
    request<{ ok: true }>(`/api/admin/invites/${code}/revoke`, { method: "POST" }),
};

/** A body dropped into the character creator, as it bakes (src/routes/survivorz-bodies.ts). */
export interface CreatorBodyStep { state: "pending" | "running" | "done" | "failed"; startedAt?: number; endedAt?: number; error?: string; progress?: number; expectMs?: number }
export interface CreatorBody {
  id: string;
  status: "queued" | "baking" | "paused" | "ready" | "failed";
  paused: "me" | "game" | null;
  resumeFrom: string | null;
  sourceName: string;
  sourceBytes: number;
  heightM: number | null;
  licence: string | null;
  credit: string | null;
  /** 1 = a sealed suit (no backpack over the air pack, a muffled voice) */
  suited?: number;
  steps: Record<string, CreatorBodyStep>;
  report: { family?: string; height?: number; tris?: number; trisIn?: number; fixed?: string[]; warnings?: string[]; errors?: string[]; missing?: string[] } | null;
  error: string | null;
  worker: string | null;
  claimedAt: number | null;
  createdAt: number;
  updatedAt: number;
  baked: boolean;
  /** its grabs, bites and rescues are baked (the bake's "pairs" step) */
  pairs: boolean;
  /** its place in the bake queue, smallest first */
  queueOrder: number | null;
}
/** a body a character wears that isn't baked yet, and who wears it */
export interface CreatorUnbaked { body: string; characters: { id: string; name: string; status: string }[] }
export interface CreatorBodiesPayload { bodies: CreatorBody[]; unbaked: CreatorUnbaked[]; worker: { configured: boolean; seenAt: number | null; name: string | null } }

/** A Survivorz character as its file holds it (src/survivorz/cast/rules.ts is the authority). */
export interface CastCharacter {
  id: string;
  status: "cast" | "bench" | "draft";
  /** set by the server (a new character goes after everyone); the creator never shows them */
  order?: number;
  strip?: number;
  name: string;
  short: string;
  tag: string;
  body: string;
  /** 0..10 each (vocab.genes); one left out is 5 */
  genes: Record<string, number>;
  /** the sixteen skills, 0..10 each (vocab.skills); one left out is its base */
  skills: Record<string, number>;
  kit: { melee: string; gun?: string; mag?: number; ammo?: number; bandage: number; medkit: number; food: number; water: number };
  regard: Record<string, number>;
  voice: { clone: string; kokoro: string };
  sheet: string;
  notes?: string;
}
export interface CastSkillInfo { label: string; group: string; base: number; learns?: boolean; dulls?: boolean; does: string }
export interface CastProblem { field: string; error: string }
/** One character on the Survivorz panel's roster (GET /api/admin/survivorz/roster). */
export interface RosterEntry {
  id: string; status: "cast" | "bench" | "draft"; strip: number; name: string; short: string; tag: string; body: string; suited: boolean;
  /** their three best skills above where anyone starts */
  top: { key: string; label: string; level: number }[];
  steps: CastStep[];
  /** body, grabs and voice all done: they can go in */
  ready: boolean;
  /** in the show's cast right now */
  live: boolean;
  /** why the show is holding them back, if it is */
  held: string | null;
}
export interface CastCheck { errors: CastProblem[]; warnings: CastProblem[] }
export interface CastListEntry { char: CastCharacter; regardIn: Record<string, number>; updatedAt: number; by: string | null; state: "new" | "changed" | "same" | "deleted"; deleted?: true }
/** one step on a character's way into the show (the creator's "what's left") */
export interface CastStep { key: string; label: string; done: boolean; note?: string }
export interface CastPayload {
  /** each character's steps, in order: body baked, grabs and bites, voice, bench or cast, in the show */
  todo: Record<string, CastStep[]>;
  cast: CastCharacter[];
  list: CastListEntry[];
  bodies: string[];
  bibles: Record<string, boolean>;
  vocab: {
    genes: string[]; geneBase: number; melee: string[]; guns: string[]; kokoro: string[]; limits: { sheetMax: number }; geneMeans: Record<string, string>;
    /** THE SKILLS (Nov 5 2026: skills and genes, nothing else): what each does, its group, where a new
     *  character starts it, whether it grows during a run; and the suggested total of all of them */
    skills: string[]; skillInfo: Record<string, CastSkillInfo>; skillGroups: { id: string; label: string }[]; skillBudget: number;
  };
  /** the baked bodies that are sealed suits */
  suited: string[];
  canHear: boolean;
}
