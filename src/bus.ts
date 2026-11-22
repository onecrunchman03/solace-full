import { EventEmitter } from "node:events";
import type { MessageWithAuthor, ChannelDTO, PageDTO, WheelFeedItem, PublicUser, DmMessageWithReply, TradeDTO, AuctionDTO, BjLobbyDTO, RouletteStateDTO, CrapsStateDTO, HoldemLobbyDTO, DerbyStateDTO, ChessStateDTO, FeedbackItem } from "./types";
import type { PitStateDTO } from "./bonepit";
import type { JukeboxStateDTO } from "./casino/jukebox";

/**
 * The set of events HTTP handlers can raise and the realtime layer listens for.
 * Keeping this typed means a typo in an event name or payload is a compile error.
 */
export interface BusEvents {
  message: { message: MessageWithAuthor };
  "message.update": { message: MessageWithAuthor };
  "message.delete": { message: MessageWithAuthor };
  "message.react": { messageId: number; channelId: number; code: string; userId: number; added: boolean };
  /** READ RECEIPTS: a member's cursor in a channel moved. Page-scoped like
   *  every channel frame; only emitted when the reader sends receipts. */
  "read.cursor": { channelId: number; userId: number; lastReadId: number };
  /** The DM twin — recipient-scoped to the two participants. */
  "dm.read": { userIds: number[]; conversationId: number; userId: number; lastReadId: number };
  "channel.create": { channel: ChannelDTO };
  "channel.update": { channel: ChannelDTO };
  // pageId rides along because the channel row is already deleted by the
  // time realtime needs to decide who may hear about it.
  "channel.delete": { channelId: number; pageId: number };
  "channels.reorder": { channels: ChannelDTO[] };
  // PAGES. A private page's existence is itself private, so these carry the
  // member list and are delivered to those sockets only — the DM
  // recipient-scoping rule applied to a room. `role` is filled per recipient.
  // `tellAll` widens one frame to every socket: set when a page just turned
  // INVISIBLE (visible → hidden), so the outsiders holding its card hear the
  // change that tells them to drop it — the new state alone would scope the
  // frame to members and leave stale cards on every other screen. Realtime
  // re-derives members/online/pending authoritatively; the DTO here mostly
  // feeds the id and flags.
  "page.change": { page: PageDTO; members: number[]; tellAll?: boolean };
  /** PAGE ROLES changed (a role, an assignment, a channel's role gates) —
   *  the page refetches. */
  "page.roles": { pageId: number };
  // `tellAll` here too: a deleted page whose CARD was public knowledge
  // (open or discoverable) must vanish from every picker, not only its
  // members' — the same rule as a page turning hidden. Realtime also unions
  // staff into the targeted case, since staff hold hidden pages' cards.
  "page.gone": { pageId: number; members: number[]; tellAll?: boolean };
  // Ordered page ids after a staff reorder; realtime filters per recipient
  // (a hidden page's id must not leak through the order list).
  "pages.reorder": { ids: number[] };
  // FEDERATION (F1): satellite lifecycle moments Sterling escalates to the
  // admins — a registration (always), a connect from a new network, a burst
  // of failed handshakes against a real id (identity probing).
  "satellite.event": { kind: string; satelliteId: number | null; name: string; detail: string };
  "user.update": { user: PublicUser };
  "wheel.event": { item: WheelFeedItem };
  /** EVERY spin, unlike `wheel.event` which only carries NOTABLE outcomes and
   *  no slot. THE FLOOR's stage wheel needs the actual slot to rest on, and
   *  needs it for commons and blanks too, so it gets its own event. Purely
   *  presentational — the spin has already been applied by the time this fires,
   *  and nothing downstream of it may touch the economy. */
  "wheel.spin": {
    userId: number;
    slotIndex: number;
    died: boolean;
    /** Presentational outcome for the stage's RESULT SCREEN (and the
     *  legendary party): the spin type, and the emoji when one was won.
     *  Nothing here moves money — the feed already broadcasts notable wins
     *  with full identity; this only lets the room's screen show commons too. */
    outcome?: string;
    tier?: string;
    emojiFile?: string;
    emojiName?: string;
    /** What the 32 wedges were showing for this spin, the landed one carrying
     *  the award — so the whole room watches the SAME wheel land on the SAME
     *  prize (files only; the emoji catalog is public art). */
    face?: ({ file: string } | null)[];
  };
  /** Every Slots pull — the floor mirrors the payline on the cabinet the
   *  puller is standing at, so the room sees the reels a player is watching.
   *  Symbols only, never the payout or balance (coins stay private); applied
   *  before this fires, presentational downstream — the wheel.spin rules. */
  "slots.pull": { userId: number; reels: string[]; stake?: number };
  // Direct messages carry the participant ids so realtime can deliver to just
  // those two users' sockets (recipient-scoped, not broadcast-to-everyone).
  "dm.message": { userIds: number[]; message: DmMessageWithReply };
  "dm.message.update": { userIds: number[]; message: DmMessageWithReply };
  "dm.message.delete": { userIds: number[]; message: DmMessageWithReply };
  // THE HOUSE'S BRAINS (Oct 2026): one of the three is writing a reply. In a
  // channel it rides the ordinary typing frame to the channel's audience; in
  // a DM it goes to the one person waiting.
  "npc.typing": {
    userId: number;
    username: string;
    channelId?: number;
    dm?: { userId: number; conversationId: number };
  };
  // Direct trades are also recipient-scoped (both parties only).
  "trade.new": { userIds: number[]; trade: TradeDTO };
  "trade.update": { userIds: number[]; trade: TradeDTO };
  // Auctions are a public marketplace — broadcast to everyone.
  "auction.new": { auction: AuctionDTO };
  "auction.bid": { auction: AuctionDTO };
  "auction.close": { auction: AuctionDTO };
  // Blackjack tables are public rooms — full lobby state on every change
  // (the DTO already excludes the dealer's hole card until the reveal).
  "bj.state": { lobby: BjLobbyDTO };
  // The shared roulette table is a public room — full state on every change.
  "roulette.state": { state: RouletteStateDTO };
  // The shared craps table — same public-room shape.
  "craps.state": { state: CrapsStateDTO };
  // Hold'em tables are public rooms, but hole cards are NOT: the lobby
  // broadcast is sanitized and each player's two cards ride holdem.cards to
  // their own sockets only (the pit.dice rule — never broadcast a hand).
  "holdem.state": { lobby: HoldemLobbyDTO };
  "holdem.cards": { userIds: number[]; tableId: number; handId: number; cards: { r: number; s: number }[] };
  // The Emoji Derby is a public track — full state on every change.
  "derby.state": { state: DerbyStateDTO };
  // The nightly lottery paid out (public — the pot was public all day).
  "lottery.won": { day: string; pot: number; paid: number; winner: { id: number; displayName: string } | null };
  // Chess duels are public boards (perfect information; spectators welcome).
  "chess.state": { state: ChessStateDTO };
  // THE CASINO JUKEBOX: what the hall is listening to. Public within the
  // casino — the floor relay forwards it to the people actually in the room.
  // Carries a filename and a playhead, never a wallet.
  "jukebox.state": { state: JukeboxStateDTO };
  // Graveyard respects are public — everyone sees flowers laid on a grave.
  "grave.respect": { deadUserId: number; userId: number; code: string; added: boolean };
  /** A candle lit or flowers left (Graveyard v2). Public like respects — the
   *  scene updates live; the price burned on the way in, never on the wire. */
  "grave.tribute": { deadUserId: number; byUserId: number; kind: string; at: number };
  /** Somebody came back out of a fresh grave — raised by a friend who burned
   *  the price, or self-bought. Public: the room should see a rescue. */
  "grave.raised": {
    userId: number;
    byUserId: number | null;
    kind: "silver" | "mythic" | "self";
    name: string;
    by: string;
  };
  /** A grave ran out its 48 hours and sealed: that life is a monument now, and
   *  the same account stood up as the next generation. */
  "grave.sealed": { userId: number; generation: number; name: string };
  // Feedback is a public board — new filings and triage flips go to everyone.
  /** A member filed a report (moderation). Sterling DMs every admin — a
   *  report the operator doesn't hear about is the liability Josh worried
   *  about (Sep 2026). Carries only what the DM needs; the queue is one GET. */
  "report.new": { id: number; kind: string; refId: number; reporterId: number; reason: string; summary: string };
  "feedback.new": { item: FeedbackItem };
  "feedback.status": { item: FeedbackItem };
  /** The house soundboard's library changed (add/delete) — open pad panels
   *  refetch. Payload-free: the list is one GET away. */
  "soundboard.change": Record<string, never>;
  // The Bone Pit: table state is public (spectating welcome) — but each
  // player's CUP rides pit.dice to their own sockets only. Never broadcast
  // dice; the secrecy IS the game.
  "pit.state": { state: PitStateDTO };
  "pit.dice": { userIds: number[]; gameId: string; dice: number[] };
  // Game nights are public: list changes + the T-minus reminder.
  "event.change": { events: unknown[] };
  "event.remind": { id: number; title: string; at: number };
  // Spectator side bets: pool changes + settlements are public (amounts are
  // pooled aggregates; individual wallets never ride the wire).
  "sidebet.change": { kind: "chess" | "pit"; gameId: string; pools: Record<number, number> };
  // Moderation: a ban/suspension/scrub killed this user's sessions — realtime
  // must also close their LIVE sockets (a dead session row doesn't hang up an
  // already-open WebSocket).
  "user.kick": { userId: number };
  /** one session of this user's was signed out (the others stand): a socket opened with it is not theirs any more */
  "session.ended": { userId: number };
  // The goblins took somebody (migration 72). Public: bail needs a witness,
  // and a cell nobody hears about is just a deleted account.
  "lender.jailed": { userId: number; name: string };
  /** Somebody's public standing with the goblins moved (Sep 2026): a day
   *  missed, a payment made, a bail, a seal, a release. Payload-free —
   *  realtime re-reads the whole debtor list from the store (it is short by
   *  construction) and broadcasts it, so the mark can never drift from the
   *  loans table. Also refreshes any open kiosk (cells, pot, shelf). */
  "lender.change": Record<string, never>;
  /** THE COLLECTORS' NOTICE — one person, one line about what the goblins just
   *  did to them (or for them). Realtime targets that user's sockets; push
   *  reaches them with the app closed. Never carries another user's wallet. */
  /** THE AFFINITY METER crossed a tier (src/npc/affinity.ts) — to that
   *  player's own sockets only. */
  "npc.affinity": { userId: number; npc: "sterling" | "goblins" | "voss"; tier: number; tierName: string; up: boolean };
  "lender.notice": { userId: number; title: string; body: string; kind: "visit" | "gift" | "bail" | "shelf" };
  /** THE WALLET (migration 110): silver sent wallet to wallet. Both parties
   *  hear it on their own sockets; the recipient gets a push when away. */
  "wallet.transfer": { id: number; fromId: number; toId: number; amount: number; note: string | null; fromName: string };
  // WHERE IN THE HOUSE somebody is (Josh, Aug 2026: roster status shows the
  // casino floor / the backrooms + level / the escape complex). Each game
  // socket emits its own on/off as bodies enter and leave; realtime keeps
  // the merged picture and broadcasts it. `detail` is the backrooms level
  // ("level0" | "pools"), null elsewhere.
  "zone.presence": {
    userId: number;
    zone: "casino" | "backrooms" | "escape";
    on: boolean;
    detail: string | null;
  };
  // The Backrooms design rule: entering the game force-disconnects you from
  // Solace voice (in there, comms are proximity only). Realtime clears the
  // room presence and tells the user's Solace tabs to hang up LiveKit.
  "voice.kick": { userId: number };
  // THE RESEARCH ARCHIVE. A lore drive found in Level 0 unlocks for EVERYONE
  // on Solace, so the whole app hears about it — not just the players inside.
  "backrooms.drive": { driveId: string; title: string; finder: string };
  // The community end goal: the key reached the door and LEVEL 1 — THE
  // POOLROOMS — is open for good. Fires exactly once in the life of the server.
  "backrooms.level1": { finder: string };
  /** The Poolrooms' drain hatch opened: Pipe Dreams is open to everyone. */
  "backrooms.level2": { finder: string };
  /** Pipe Dreams' fuse box full: the pressure door to Level 3 is open. */
  "backrooms.level3": { finder: string };
  /** All six of the station's breakers on: the lift shutter has power. */
  "backrooms.level4": { finder: string };
  /** The office's keycard badged at the stairwell door: the way on to Level 5
   *  is open. */
  "backrooms.level5": { finder: string };
  /** The hotel's Boiler Key turned in the rusty door: the way on to Level 6
   *  is open. */
  "backrooms.level6": { finder: string };
  "backrooms.level7": { finder: string };
  "backrooms.level8": { finder: string };
  "backrooms.level9": { finder: string };
  "backrooms.level10": { finder: string };
  "sidebet.settled": {
    kind: "chess" | "pit";
    gameId: string;
    refunded: boolean;
    pool: number;
    rake: number;
    payouts: { userId: number; payout: number }[];
  };
  // ACHIEVEMENTS (Aug 2026): fired exactly once per (user, badge) by the
  // engine. Realtime toasts the earner; Sterling announces gold+ in #general.
  // THE VIP ROOM (Sep 2026): the high-water mark rose. Realtime tells the
  // earner; Sterling slides the welcome under the door.
  "vip.rank": { userId: number; rank: number };
  /** A user's FIRST socket opened / LAST socket closed (realtime). Sterling's
   *  herald listens; nothing else should treat this as a per-tab event. */
  "presence.change": { userId: number; online: boolean };
  /** THE HERALD's fanfare for a Tier-4 arrival: realtime broadcasts it and
   *  every client plays the bells. */
  "vip.fanfare": { userId: number; name: string; rank: number };
  "achievement.earned": {
    userId: number;
    achId: string;
    name: string;
    desc: string;
    tier: "bronze" | "silver" | "gold" | "mythic";
    rewardItem: string | null;
  };
  // PANDORA'S BOX (Sep 2026, PANDORA.md): a key landed (realtime tells the
  // earner, Sterling slides the note under the door), and the box opened
  // (Sterling's grand announcement; realtime broadcasts the fanfare).
  "pandora.key": { userId: number; key: "prismatic" | "brass" | "rusted" };
  "pandora.opened": { userId: number; name: string; choice: string | null; choiceName: string | null; first: boolean };
  // THE STONE OF THE ABYSS (src/abyss.ts): the phrase was spoken and THE
  // PORTAL opened for this one member (realtime tells their sockets only).
  "abyss.opened": { userId: number };
  /** The stone was taken back (the admin lever): shut that member's Portal. */
  "abyss.closed": { userId: number };
  // THE PORTAL (src/portal/hall.ts): something changed in the hall; every open
  // reader refetches what they're looking at. A cracked glyph is also news.
  "portal.changed": { what: "member" | "post" | "react" | "glyph" | "ishaal"; room?: string };
  "portal.glyph": { userId: number; glyph: number; source: string };
  /** A mark of the fold school's notation cracked (the second cipher). */
  "portal.notation": { userId: number; mark: number; source: string };
}

/**
 * A tiny typed wrapper over EventEmitter. HTTP routes `emit` when something
 * happens; the realtime layer subscribes with `on` and pushes to clients. This
 * keeps the HTTP layer unaware of WebSockets entirely.
 */
export class Bus {
  private ee = new EventEmitter();

  emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]): void {
    this.ee.emit(event, payload);
  }

  on<K extends keyof BusEvents>(event: K, handler: (payload: BusEvents[K]) => void): void {
    this.ee.on(event, handler as (payload: unknown) => void);
  }
}
