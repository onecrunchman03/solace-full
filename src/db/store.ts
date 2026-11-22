import { DatabaseSync } from "node:sqlite";
import { createHash, randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  User, UserPrefs, PublicUser, Cosmetics, Session, SessionMeta, Channel, Message, Emoji, DmMessage, DmConversation,
  TradeDTO, TradeStatus, AuctionDTO, AuctionStatus, AuctionBidDTO, Invite, InviteDTO,
  Page, PageRole, PageJoinPolicy, LoginEvent, LoginOutcome, JukeboxSong, BoardSoundRow,
} from "../types";
import { toPublicUser, GENERAL_PAGE_ID, MAX_DISPLAY_NAME, type PageRoleDef } from "../types";
import { minNextBid, splitBid, BID_HISTORY, ANTI_SNIPE_MS } from "../auction";
import { lotteryDay, TICKET_PRICE, HOUSE_TITHE } from "../lottery";
import { GRANT_TITHE } from "../backrooms/grant";
// The Trader's own price table: the goblins value a seized collection at half
// of it, so both counters move together when a price is retuned.
import { SELL_PRICES } from "../shop";
import { countedRelics } from "../backrooms/relics";
import { PANDORAN_ITEM, PANDORAN_COLOR, choiceById, type PandoraKey, type PandoraFacts } from "../pandora";
import { STONE_CODE, STONE_CHOICE, isBound } from "../abyss";
import { REAPER_GRACE, TALISMAN_CODE } from "../wheel";
import { DEFAULT_EVERYONE_PERMS, EVERYONE_NAME, isPerm, type Perm } from "../roles";
import {
  GRAVE_FRESH_MS, RAISE_PRICE, RAISE_MYTHIC_TIER,
  graveIsFresh, heirlooms, inheritedCoins, selfBurnCount, canSelfRevive,
  tributeGoneMs, tributeActive, type TributeKind,
} from "../mortality";
import {
  JAIL_FRESH_MS, RATE_STEP, TIERS, bailPrice, dayKey, daysBetween, garnishOf,
  interestFor, jailIsFresh, missPenalty, quote, repoOrder, seizeValue, teaserRate,
  stageFor, tierAllowed, shelfPrice, potRemaining, minWorth, canMoveValue, type LoanQuote, type Stage,
  FOUNDRY_TOP_STAGE, ratesFor, rateCapFor,
} from "../lender";
import { upgradeCharacter } from "../survivorz/cast/rules";

/** What one debtor's daily visit did — returned so the sweep can announce it
 *  (the collectors' notice, Sep 2026). `missedDays` is how many of the days
 *  charged went unpaid; `stage` is where the ladder stands afterwards. */
/** A body dropped into the Survivorz character creator (migration 118). */
export interface SurvivorzBodyRow {
  id: string;
  status: "queued" | "baking" | "paused" | "ready" | "failed";
  /** who paused it: "me" (the admin) or "game" (the worker, while a game runs) — migration 120 */
  paused: "me" | "game" | null;
  /** the step a paused or stopped bake starts again from */
  resumeFrom: string | null;
  /** its place in the bake queue, smallest first — migration 121 */
  queueOrder: number | null;
  /** 1 = a sealed suit (no backpack over the air pack, a muffled voice) — migration 122 */
  suited: number;
  sourceName: string;
  sourceFile: string;
  sourceBytes: number;
  heightM: number | null;
  licence: string | null;
  credit: string | null;
  steps: string;
  report: string | null;
  error: string | null;
  worker: string | null;
  claimedAt: number | null;
  createdAt: number;
  createdBy: number | null;
  updatedAt: number;
}

export interface CollectResult {
  charged: boolean;
  jailed: boolean;
  took: number;
  seized: string[];
  missedDays: number;
  stage: Stage;
}
import type { AttachmentDTO, FeedbackItem } from "../types";

// Spins refill in fixed windows aligned to the UTC epoch (which starts at
// midnight UTC), so with a 2-hour window the resets land at 00:00, 02:00,
// 04:00 … UTC. 7 spins per window.
const SPIN_PERIOD_MS = 2 * 60 * 60 * 1000;

/** A single forward-only schema change. */
interface Migration {
  id: number;
  name: string;
  up: (db: DatabaseSync) => void;
}

/**
 * Every schema change, applied in order. To evolve the schema you APPEND a new
 * entry here — never edit an existing one — so any database, fresh or old,
 * converges to exactly the same shape. Each later phase adds its tables here.
 */
const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "users_and_sessions",
    up: (db) => {
      db.exec(`
        CREATE TABLE users (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          username     TEXT    NOT NULL UNIQUE,
          displayName  TEXT    NOT NULL,
          passwordHash TEXT    NOT NULL,
          isAdmin      INTEGER NOT NULL DEFAULT 0,
          disabled     INTEGER NOT NULL DEFAULT 0,
          createdAt    INTEGER NOT NULL
        );

        CREATE TABLE sessions (
          token     TEXT    PRIMARY KEY,
          userId    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          createdAt INTEGER NOT NULL
        );

        CREATE INDEX idx_sessions_user ON sessions(userId);
      `);
    },
  },
  {
    id: 2,
    name: "channels",
    up: (db) => {
      db.exec(`
        CREATE TABLE channels (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          name      TEXT    NOT NULL,
          topic     TEXT,
          createdBy INTEGER NOT NULL REFERENCES users(id),
          createdAt INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 3,
    name: "messages",
    up: (db) => {
      db.exec(`
        CREATE TABLE messages (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          channelId INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          userId    INTEGER NOT NULL REFERENCES users(id),
          body      TEXT    NOT NULL,
          createdAt INTEGER NOT NULL,
          editedAt  INTEGER,
          deletedAt INTEGER
        );
        CREATE INDEX idx_messages_channel ON messages(channelId, id);
      `);
    },
  },
  {
    id: 4,
    name: "emoji_economy",
    up: (db) => {
      db.exec(`
        CREATE TABLE emoji (
          code     TEXT    PRIMARY KEY,
          tier     TEXT    NOT NULL,
          name     TEXT    NOT NULL,
          file     TEXT    NOT NULL,
          animated INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_emoji_tier ON emoji(tier);

        -- Binary ownership: a user owns at most one of each emoji.
        CREATE TABLE user_emoji (
          userId     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          code       TEXT    NOT NULL,
          acquiredAt INTEGER NOT NULL,
          PRIMARY KEY (userId, code)
        );
        CREATE INDEX idx_user_emoji_user ON user_emoji(userId);
      `);
      // Wheel economy fields on the user.
      db.exec(`ALTER TABLE users ADD COLUMN bonusSpins INTEGER NOT NULL DEFAULT 0;`);
      db.exec(`ALTER TABLE users ADD COLUMN spinBucket INTEGER NOT NULL DEFAULT 7;`);
      db.exec(`ALTER TABLE users ADD COLUMN spinHour   INTEGER NOT NULL DEFAULT 0;`);
      db.exec(`ALTER TABLE users ADD COLUMN diedAt     INTEGER;`);
    },
  },
  {
    id: 5,
    name: "admin_rigged_spin",
    up: (db) => {
      // Admin tool: force a specific wheel slot on a user's next spin (e.g. "death").
      // NULL = no rig; a slot name (e.g. "death") = the next spin lands there.
      db.exec(`ALTER TABLE users ADD COLUMN riggedNextSpin TEXT;`);
    },
  },
  {
    id: 6,
    name: "reactions_and_replies",
    up: (db) => {
      // Reply-to pointer (nullable; no FK via ALTER — validated in the route).
      db.exec(`ALTER TABLE messages ADD COLUMN replyToId INTEGER;`);
      // Collectible-emoji reactions: a user reacts to a message with an owned emoji.
      db.exec(`
        CREATE TABLE message_reactions (
          messageId INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          userId    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
          code      TEXT    NOT NULL,
          createdAt INTEGER NOT NULL,
          PRIMARY KEY (messageId, userId, code)
        );
        CREATE INDEX idx_reactions_message ON message_reactions(messageId);
      `);
    },
  },
  {
    id: 7,
    name: "user_profiles",
    up: (db) => {
      db.exec(`ALTER TABLE users ADD COLUMN avatar TEXT;`); // uploaded avatar filename
      db.exec(`ALTER TABLE users ADD COLUMN bio    TEXT;`); // "about me"
    },
  },
  {
    id: 8,
    name: "channel_org",
    up: (db) => {
      // Sub-channels (nullable parent; validated in the route, no FK via ALTER),
      // an admin-set sort order, and a post-lock flag.
      db.exec(`ALTER TABLE channels ADD COLUMN parentId INTEGER;`);
      db.exec(`ALTER TABLE channels ADD COLUMN position INTEGER NOT NULL DEFAULT 0;`);
      db.exec(`ALTER TABLE channels ADD COLUMN locked   INTEGER NOT NULL DEFAULT 0;`);
      // Seed a stable, distinct order for pre-existing channels (was id order).
      db.exec(`UPDATE channels SET position = id;`);
      // Per-channel allow-list of who may post when the channel is locked.
      db.exec(`
        CREATE TABLE channel_post_allow (
          channelId INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          userId    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
          PRIMARY KEY (channelId, userId)
        );
      `);
    },
  },
  {
    id: 9,
    name: "direct_messages",
    up: (db) => {
      db.exec(`
        CREATE TABLE dm_conversations (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          userA     INTEGER NOT NULL REFERENCES users(id),
          userB     INTEGER NOT NULL REFERENCES users(id),
          createdAt INTEGER NOT NULL,
          UNIQUE(userA, userB)
        );
        CREATE TABLE dm_messages (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          conversationId INTEGER NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
          senderId       INTEGER NOT NULL REFERENCES users(id),
          body           TEXT    NOT NULL,
          createdAt      INTEGER NOT NULL,
          editedAt       INTEGER,
          deletedAt      INTEGER
        );
        CREATE INDEX idx_dm_messages_conv ON dm_messages(conversationId, id);
        CREATE TABLE dm_reads (
          conversationId INTEGER NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
          userId         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          lastReadId     INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (conversationId, userId)
        );
      `);
    },
  },
  {
    id: 10,
    name: "slots_pulls",
    up: (db) => {
      // Slots has its own pull allowance (refills each 2-hour window), kept
      // separate from the Wheel's spins.
      db.exec(`ALTER TABLE users ADD COLUMN slotsBucket INTEGER NOT NULL DEFAULT 5;`);
      db.exec(`ALTER TABLE users ADD COLUMN slotsHour   INTEGER NOT NULL DEFAULT 0;`);
    },
  },
  {
    id: 11,
    name: "direct_trades",
    up: (db) => {
      db.exec(`
        CREATE TABLE trades (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          fromUser   INTEGER NOT NULL REFERENCES users(id),
          toUser     INTEGER NOT NULL REFERENCES users(id),
          status     TEXT    NOT NULL DEFAULT 'pending',
          note       TEXT,
          createdAt  INTEGER NOT NULL,
          resolvedAt INTEGER
        );
        CREATE TABLE trade_items (
          tradeId INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
          side    TEXT    NOT NULL,   -- 'offer' (from fromUser) | 'request' (from toUser)
          code    TEXT    NOT NULL,
          PRIMARY KEY (tradeId, side, code)
        );
        CREATE INDEX idx_trades_to   ON trades(toUser, status);
        CREATE INDEX idx_trades_from ON trades(fromUser, status);
      `);
    },
  },
  {
    id: 12,
    name: "silver_coins",
    up: (db) => {
      // The currency. Minted only by selling emoji to the Trader; spent on Slots
      // pulls, extra Wheel spins, and Auction bids. New users start at 0.
      db.exec(`ALTER TABLE users ADD COLUMN coins INTEGER NOT NULL DEFAULT 0;`);
    },
  },
  {
    id: 13,
    name: "auction_house",
    up: (db) => {
      // Public English auctions. The listed emoji is escrowed (removed from the
      // seller and held on the row via `code`); the current high bid's silver is
      // escrowed on the bidder side. `highBidder`/`currentBid` are null until the
      // first bid. Settlement moves escrowed assets atomically (store.closeAuction).
      db.exec(`
        CREATE TABLE auctions (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          sellerId   INTEGER NOT NULL REFERENCES users(id),
          code       TEXT    NOT NULL,
          startPrice INTEGER NOT NULL,
          currentBid INTEGER,
          highBidder INTEGER REFERENCES users(id),
          status     TEXT    NOT NULL DEFAULT 'open',
          createdAt  INTEGER NOT NULL,
          endsAt     INTEGER NOT NULL,
          settledAt  INTEGER
        );
        CREATE TABLE auction_bids (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          auctionId INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
          bidderId  INTEGER NOT NULL REFERENCES users(id),
          amount    INTEGER NOT NULL,
          at        INTEGER NOT NULL
        );
        CREATE INDEX idx_auctions_status ON auctions(status, endsAt);
        CREATE INDEX idx_auction_bids ON auction_bids(auctionId, id);
      `);
    },
  },
  {
    id: 14,
    name: "vault",
    up: (db) => {
      // The shared Mastermind Vault (mythic source). A single row holds the
      // current round + secret combination (server-only). Guesses are per (round,
      // user); wins are the public crack feed. `combo` is a comma-joined index list.
      db.exec(`
        CREATE TABLE vault (
          id           INTEGER PRIMARY KEY CHECK (id = 1),
          round        INTEGER NOT NULL,
          combo        TEXT    NOT NULL,
          updatedAt    INTEGER NOT NULL
        );
        CREATE TABLE vault_guesses (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          round  INTEGER NOT NULL,
          userId INTEGER NOT NULL REFERENCES users(id),
          guess  TEXT    NOT NULL,
          exact  INTEGER NOT NULL,
          near   INTEGER NOT NULL,
          at     INTEGER NOT NULL
        );
        CREATE TABLE vault_wins (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          round  INTEGER NOT NULL,
          userId INTEGER NOT NULL REFERENCES users(id),
          code   TEXT,
          at     INTEGER NOT NULL
        );
        CREATE INDEX idx_vault_guesses ON vault_guesses(round, userId, id);
      `);
    },
  },
  {
    id: 15,
    name: "vault_riddles",
    up: (db) => {
      // Pivot the Vault from a Mastermind combination to a shared RIDDLE. The
      // vault row now tracks the current riddle index (into a server-only bank);
      // a buy-in grants answer attempts (vault_attempts), and every submitted
      // answer is recorded (vault_answers). The old `combo` column + the
      // vault_guesses table are left in place but unused (dead).
      db.exec(`
        ALTER TABLE vault ADD COLUMN riddle INTEGER NOT NULL DEFAULT 0;
        CREATE TABLE vault_attempts (
          round     INTEGER NOT NULL,
          userId    INTEGER NOT NULL REFERENCES users(id),
          remaining INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (round, userId)
        );
        CREATE TABLE vault_answers (
          id      INTEGER PRIMARY KEY AUTOINCREMENT,
          round   INTEGER NOT NULL,
          userId  INTEGER NOT NULL REFERENCES users(id),
          answer  TEXT    NOT NULL,
          correct INTEGER NOT NULL,
          at      INTEGER NOT NULL
        );
        CREATE INDEX idx_vault_answers ON vault_answers(round, userId, id);
      `);
    },
  },
  {
    id: 16,
    name: "dm_reply",
    up: (db) => {
      // Reply-to pointer for direct messages (nullable; validated in the route).
      db.exec(`ALTER TABLE dm_messages ADD COLUMN replyToId INTEGER;`);
    },
  },
  {
    id: 17,
    name: "invites",
    up: (db) => {
      // Admin-minted registration invites. `maxUses` caps redemptions (1 =
      // single-use); `expiresAt` is an optional TTL; `revoked` kills it early.
      // Redemption is a guarded atomic UPDATE (see createUserViaInvite).
      db.exec(`
        CREATE TABLE invites (
          code      TEXT    PRIMARY KEY,
          createdBy INTEGER NOT NULL REFERENCES users(id),
          createdAt INTEGER NOT NULL,
          maxUses   INTEGER NOT NULL DEFAULT 1,
          uses      INTEGER NOT NULL DEFAULT 0,
          expiresAt INTEGER,
          revoked   INTEGER NOT NULL DEFAULT 0,
          note      TEXT
        );
        -- Audit: which invite code a user joined through (null for seeded/admin).
        ALTER TABLE users ADD COLUMN invitedVia TEXT;
      `);
    },
  },
  {
    id: 18,
    name: "user_prefs",
    up: (db) => {
      // Private per-user client preferences (theme, chat font) as a small JSON
      // blob, so the UI follows the user across devices. Kept as one column —
      // future prefs are new keys, not new migrations.
      db.exec(`ALTER TABLE users ADD COLUMN prefs TEXT NOT NULL DEFAULT '{}';`);
    },
  },
  {
    id: 19,
    name: "channel_reads",
    up: (db) => {
      // Per-user read cursor per channel (mirrors dm_reads) so the sidebar can
      // show unread counts. Unread = messages by *others* with id > lastReadId.
      db.exec(`
        CREATE TABLE channel_reads (
          channelId  INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          userId     INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
          lastReadId INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (channelId, userId)
        );
      `);
    },
  },
  {
    id: 20,
    name: "blackjack_bets",
    up: (db) => {
      // Escrow for live blackjack bets. A row exists exactly while a bet is at
      // risk on a table: inserted with the debit, deleted at settlement (both
      // in one transaction each). Rows found at boot are crash orphans and are
      // refunded — a restart can never eat a player's stake.
      db.exec(`
        CREATE TABLE blackjack_bets (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL REFERENCES users(id),
          amount INTEGER NOT NULL,
          lobby  INTEGER NOT NULL,
          at     INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 21,
    name: "channel_reads_backfill",
    up: (db) => {
      // Backfill read cursors for every existing user × channel to "caught
      // up". Without this, the first boot after the unread feature ships
      // counts a channel's ENTIRE history as unread for everyone — a wall of
      // 99+ badges on day one. New arrivals after this migration start at 0
      // and simply see genuinely-new messages as unread. No-op on fresh DBs.
      db.exec(`
        INSERT INTO channel_reads (channelId, userId, lastReadId)
        SELECT c.id, u.id,
               COALESCE((SELECT MAX(m.id) FROM messages m WHERE m.channelId = c.id), 0)
        FROM channels c CROSS JOIN users u
        WHERE true
        ON CONFLICT(channelId, userId) DO NOTHING;
      `);
    },
  },
  {
    id: 22,
    name: "house_trivia",
    up: (db) => {
      // House Trivia (the Vault's replacement as the mythic source). One
      // global question at a time; `answers` is a server-only JSON array of
      // normalized accepted answers, FROZEN at generation time. Attempts and
      // answer history are per (round, user), wins are the public feed —
      // the same proven shape as the old vault_* tables (which stay dead).
      db.exec(`
        CREATE TABLE trivia (
          id        INTEGER PRIMARY KEY CHECK (id = 1),
          round     INTEGER NOT NULL,
          qkey      TEXT    NOT NULL,
          category  TEXT    NOT NULL,
          question  TEXT    NOT NULL,
          answers   TEXT    NOT NULL,
          updatedAt INTEGER NOT NULL
        );
        CREATE TABLE trivia_attempts (
          round     INTEGER NOT NULL,
          userId    INTEGER NOT NULL REFERENCES users(id),
          remaining INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (round, userId)
        );
        CREATE TABLE trivia_answers (
          id      INTEGER PRIMARY KEY AUTOINCREMENT,
          round   INTEGER NOT NULL,
          userId  INTEGER NOT NULL REFERENCES users(id),
          answer  TEXT    NOT NULL,
          correct INTEGER NOT NULL,
          at      INTEGER NOT NULL
        );
        CREATE TABLE trivia_wins (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          round  INTEGER NOT NULL,
          userId INTEGER NOT NULL REFERENCES users(id),
          code   TEXT,
          at     INTEGER NOT NULL
        );
        CREATE INDEX idx_trivia_answers ON trivia_answers(round, userId, id);
      `);
    },
  },
  {
    id: 23,
    name: "trivia_cadence",
    up: (db) => {
      // Cadence caps: a solve CLOSES the round (solvedAt set) instead of
      // instantly posting the next question — the next one only posts at the
      // next 6h UTC boundary, capping mythics at 4/day server-wide. NULL =
      // the current question is live.
      db.exec(`ALTER TABLE trivia ADD COLUMN solvedAt INTEGER;`);
    },
  },
  {
    id: 24,
    name: "graveyard_legacy",
    up: (db) => {
      // The Graveyard: an epitaph carved onto your tombstone (set while
      // alive), a will naming who inherits your emoji + silver on death, and
      // respects — owned-emoji reactions other players leave on your grave.
      db.exec(`
        ALTER TABLE users ADD COLUMN epitaph TEXT;
        ALTER TABLE users ADD COLUMN willBeneficiaryId INTEGER;
        CREATE TABLE grave_respects (
          deadUserId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          userId     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          code       TEXT    NOT NULL,
          createdAt  INTEGER NOT NULL,
          PRIMARY KEY (deadUserId, userId, code)
        );
      `);
    },
  },
  {
    id: 25,
    name: "emporium",
    up: (db) => {
      // Sterling's Emporium: owned cosmetic items, admin price overrides, and
      // the user's equipped cosmetics (a public JSON blob — border/flair/
      // title/tombstone — everyone sees these, unlike private prefs).
      db.exec(`
        CREATE TABLE user_items (
          userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          itemId TEXT    NOT NULL,
          at     INTEGER NOT NULL,
          PRIMARY KEY (userId, itemId)
        );
        CREATE TABLE item_prices (
          itemId TEXT    PRIMARY KEY,
          price  INTEGER NOT NULL
        );
        ALTER TABLE users ADD COLUMN cosmetics TEXT NOT NULL DEFAULT '{}';
      `);
    },
  },
  {
    id: 26,
    name: "voice_channels",
    up: (db) => {
      // Voice channels live in the channels table with kind='voice' — they
      // reuse the whole permission model (locked + allow-list = who may JOIN,
      // mirroring who-may-POST on text channels). Audio itself is LiveKit's
      // job; we only store the room's identity + permissions.
      db.exec(`ALTER TABLE channels ADD COLUMN kind TEXT NOT NULL DEFAULT 'text';`);
    },
  },
  {
    id: 27,
    name: "retire_kidcore",
    up: (db) => {
      // The Kidcore theme was retired from the Emporium catalog. Owners are
      // made whole: full default-price refund (800 silver), the item removed,
      // and anyone wearing it is reset to the default theme so nobody is left
      // on a theme whose CSS no longer exists.
      const owners = db.prepare("SELECT userId FROM user_items WHERE itemId = 'theme-kidcore'").all() as {
        userId: number;
      }[];
      for (const { userId } of owners) {
        db.prepare("UPDATE users SET coins = coins + 800 WHERE id = ?").run(userId);
      }
      db.exec(`
        DELETE FROM user_items WHERE itemId = 'theme-kidcore';
        DELETE FROM item_prices WHERE itemId = 'theme-kidcore';
      `);
      const wearers = db.prepare("SELECT id, prefs FROM users WHERE prefs LIKE '%kidcore%'").all() as {
        id: number;
        prefs: string;
      }[];
      for (const { id, prefs } of wearers) {
        try {
          const p = JSON.parse(prefs || "{}");
          if (p?.theme === "kidcore") {
            delete p.theme;
            db.prepare("UPDATE users SET prefs = ? WHERE id = ?").run(JSON.stringify(p), id);
          }
        } catch {
          /* corrupt prefs blob — parsePrefs already treats it as {} */
        }
      }
    },
  },
  {
    id: 28,
    name: "chess_stakes",
    up: (db) => {
      // Escrow for Casino Chess Duel stakes. A row exists exactly while an
      // emoji is at risk on a board (challenge posted or game live): inserted
      // when the emoji leaves the owner's inventory, deleted at settlement —
      // both inside one transaction each, mirroring blackjack_bets. Rows
      // found at boot are crash orphans and are returned to their owners.
      db.exec(`
        CREATE TABLE chess_stakes (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          gameId TEXT    NOT NULL,
          userId INTEGER NOT NULL REFERENCES users(id),
          code   TEXT    NOT NULL,
          at     INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 29,
    name: "account_security",
    up: (db) => {
      // Account-security layer:
      //  - secretHash: a scrypt-hashed recovery secret (null until set). Used
      //    to clear a new-network login challenge AND to reset a forgotten
      //    password. Never leaves the server (stripped from PublicUser).
      //  - failedLogins / lockedUntil: brute-force lockout state, cleared on
      //    a successful login.
      //  - login_networks: the normalized networks (IPv4 /24, IPv6 /64) an
      //    account has verified from; a login from an unlisted one is
      //    challenged for the recovery secret.
      db.exec(`
        ALTER TABLE users ADD COLUMN secretHash TEXT;
        ALTER TABLE users ADD COLUMN failedLogins INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN lockedUntil INTEGER NOT NULL DEFAULT 0;
        CREATE TABLE login_networks (
          userId    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          network   TEXT    NOT NULL,
          createdAt INTEGER NOT NULL,
          lastSeenAt INTEGER NOT NULL,
          PRIMARY KEY (userId, network)
        );
      `);
    },
  },
  {
    id: 30,
    name: "feedback",
    up: (db) => {
      // In-app bug reports + improvement suggestions (the Feedback view under
      // Emoji Rumble in the rail). Anyone can file; admins triage (status
      // open → done). Plain rows — no realtime, no economy.
      db.exec(`
        CREATE TABLE feedback (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          userId    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind      TEXT    NOT NULL CHECK (kind IN ('bug', 'idea')),
          body      TEXT    NOT NULL,
          status    TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
          createdAt INTEGER NOT NULL,
          resolvedAt INTEGER
        );
      `);
    },
  },
  {
    id: 31,
    name: "chess_silver_stakes",
    up: (db) => {
      // Silver escrow for Casino Chess Duel (the coin counterpart to
      // chess_stakes' emoji escrow). A row holds a player's staked silver
      // while a duel is live; settled to the winner (or refunded on draw/
      // cancel) atomically, and refunded to owners on boot after a crash.
      db.exec(`
        CREATE TABLE chess_silver_stakes (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          gameId TEXT    NOT NULL,
          userId INTEGER NOT NULL REFERENCES users(id),
          amount INTEGER NOT NULL,
          at     INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 32,
    name: "attachments",
    up: (db) => {
      // Chat attachments (images + plain-text docs). Two-phase lifecycle: an
      // upload creates an unattached row (scope/messageId NULL); sending a
      // message claims it. The retention sweep deletes FILES on a tier
      // schedule (kind 'gif' = animated tier, sooner; 'image'/'text' later)
      // and stamps purgedAt — the ROW stays so chat history keeps its shape.
      // Never-claimed orphans are deleted outright after an hour.
      db.exec(`
        CREATE TABLE attachments (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          ownerId   INTEGER NOT NULL REFERENCES users(id),
          scope     TEXT,
          messageId INTEGER,
          file      TEXT    NOT NULL,
          name      TEXT    NOT NULL,
          kind      TEXT    NOT NULL,
          mime      TEXT    NOT NULL,
          bytes     INTEGER NOT NULL,
          width     INTEGER,
          height    INTEGER,
          createdAt INTEGER NOT NULL,
          purgedAt  INTEGER
        );
        CREATE INDEX idx_attach_msg ON attachments(scope, messageId);
        CREATE INDEX idx_attach_sweep ON attachments(purgedAt, createdAt);
      `);
    },
  },
  {
    id: 33,
    name: "bonepit",
    up: (db) => {
      // The Bone Pit (Liar's Dice). Games are in-memory like blackjack/chess;
      // silver buy-ins escrow here (crash → boot refund; settle in one txn,
      // winner takes the pot — coin-neutral PvP). bonepit_weeks records which
      // ISO week's MYTHIC CROWN has been claimed: the first completed game
      // each week with 3+ players awards a random unowned mythic, and the
      // atomic INSERT on this table is what enforces exactly-one-per-week.
      db.exec(`
        CREATE TABLE bonepit_stakes (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          gameId TEXT    NOT NULL,
          userId INTEGER NOT NULL REFERENCES users(id),
          amount INTEGER NOT NULL,
          at     INTEGER NOT NULL
        );
        CREATE TABLE bonepit_weeks (
          weekId    TEXT    PRIMARY KEY,
          winnerId  INTEGER NOT NULL,
          emojiCode TEXT,
          at        INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 34,
    name: "message_search",
    up: (db) => {
      // Full-text search over channel + DM messages (FTS5, external-content
      // tables synced by triggers). Tombstoning clears body via UPDATE, so
      // the update trigger naturally drops deleted text from the index.
      db.exec(`
        CREATE VIRTUAL TABLE messages_fts USING fts5(body, content='messages', content_rowid='id');
        CREATE TRIGGER messages_fts_ai AFTER INSERT ON messages BEGIN
          INSERT INTO messages_fts(rowid, body) VALUES (new.id, new.body);
        END;
        CREATE TRIGGER messages_fts_ad AFTER DELETE ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, body) VALUES ('delete', old.id, old.body);
        END;
        CREATE TRIGGER messages_fts_au AFTER UPDATE ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, body) VALUES ('delete', old.id, old.body);
          INSERT INTO messages_fts(rowid, body) VALUES (new.id, new.body);
        END;
        INSERT INTO messages_fts(rowid, body) SELECT id, body FROM messages WHERE deletedAt IS NULL;

        CREATE VIRTUAL TABLE dm_messages_fts USING fts5(body, content='dm_messages', content_rowid='id');
        CREATE TRIGGER dm_fts_ai AFTER INSERT ON dm_messages BEGIN
          INSERT INTO dm_messages_fts(rowid, body) VALUES (new.id, new.body);
        END;
        CREATE TRIGGER dm_fts_ad AFTER DELETE ON dm_messages BEGIN
          INSERT INTO dm_messages_fts(dm_messages_fts, rowid, body) VALUES ('delete', old.id, old.body);
        END;
        CREATE TRIGGER dm_fts_au AFTER UPDATE ON dm_messages BEGIN
          INSERT INTO dm_messages_fts(dm_messages_fts, rowid, body) VALUES ('delete', old.id, old.body);
          INSERT INTO dm_messages_fts(rowid, body) VALUES (new.id, new.body);
        END;
        INSERT INTO dm_messages_fts(rowid, body) SELECT id, body FROM dm_messages WHERE deletedAt IS NULL;
      `);
    },
  },
  {
    id: 35,
    name: "events",
    up: (db) => {
      // Game nights: lightweight scheduled events with RSVPs. remindedAt
      // marks that the T-minus reminder broadcast already fired (the 60s
      // sweep in routes/events.ts is what sends it).
      db.exec(`
        CREATE TABLE events (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          title      TEXT    NOT NULL,
          note       TEXT,
          at         INTEGER NOT NULL,
          createdBy  INTEGER NOT NULL REFERENCES users(id),
          createdAt  INTEGER NOT NULL,
          remindedAt INTEGER
        );
        CREATE TABLE event_rsvps (
          eventId INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          userId  INTEGER NOT NULL REFERENCES users(id),
          going   INTEGER NOT NULL,
          PRIMARY KEY (eventId, userId)
        );
      `);
    },
  },
  {
    id: 36,
    name: "account_lock",
    up: (db) => {
      // Admin lock: refused at login + token resolution, but NOT dead — no
      // graveyard entry, no estate execution, fully reversible.
      db.exec("ALTER TABLE users ADD COLUMN locked INTEGER NOT NULL DEFAULT 0");
    },
  },
  {
    id: 37,
    name: "side_bets",
    up: (db) => {
      // Spectator side-betting on chess duels + Bone Pit games. Pari-mutuel:
      // stakes escrow here, winners split the pool pro-rata after a 5% house
      // rake (burned — the auction rule). Draw/fold/no-winning-tickets →
      // full refund; boot refunds orphans like every other escrow.
      db.exec(`
        CREATE TABLE side_bets (
          id       INTEGER PRIMARY KEY AUTOINCREMENT,
          kind     TEXT    NOT NULL,
          gameId   TEXT    NOT NULL,
          bettorId INTEGER NOT NULL REFERENCES users(id),
          onUserId INTEGER NOT NULL,
          amount   INTEGER NOT NULL,
          at       INTEGER NOT NULL
        );
        CREATE INDEX idx_side_bets_game ON side_bets(kind, gameId);
      `);
    },
  },
  {
    id: 38,
    name: "roulette_bets",
    up: (db) => {
      // Roulette (the shared house table). One escrow row per placed bet,
      // same discipline as blackjack_bets: debit+insert one txn, credit+delete
      // one txn (guarded), boot refunds orphans. Rounds live in memory.
      db.exec(`
        CREATE TABLE roulette_bets (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL REFERENCES users(id),
          kind   TEXT    NOT NULL,
          target INTEGER,
          amount INTEGER NOT NULL,
          at     INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 39,
    name: "blocks_and_reports",
    up: (db) => {
      // iOS-readiness moderation layer (App Store guideline 1.2, but good
      // hygiene everywhere): per-user blocks and private content reports.
      db.exec(`
        CREATE TABLE user_blocks (
          userId    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          blockedId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          at        INTEGER NOT NULL,
          PRIMARY KEY (userId, blockedId)
        );
        CREATE TABLE reports (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          reporterId INTEGER NOT NULL REFERENCES users(id),
          kind       TEXT    NOT NULL,
          refId      INTEGER NOT NULL,
          reason     TEXT    NOT NULL,
          status     TEXT    NOT NULL DEFAULT 'open',
          at         INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 40,
    name: "user_stats",
    up: (db) => {
      // Per-user activity counters for the Ledger leaderboards: spins taken,
      // slots pulled, biggest wins, silver gambled. Pure bragging-rights
      // telemetry — never money-bearing state.
      db.exec(`
        CREATE TABLE user_stats (
          userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          key    TEXT    NOT NULL,
          value  INTEGER NOT NULL,
          PRIMARY KEY (userId, key)
        );
      `);
    },
  },
  {
    id: 41,
    name: "derby_and_lottery",
    up: (db) => {
      // The Emoji Derby: pari-mutuel race betting. Stakes escrow here per
      // race (SEVENTH escrow — count it in conservation audits); settle is
      // the side-bet split (5% burned rake, pro-rata), boot refunds orphans.
      //
      // The Nightly Lottery: tickets are SPENT (not escrowed) into the day's
      // pot; the draw at UTC midnight pays 90% to a ticket-weighted winner
      // and burns the rest. Crash-safe by design: tickets persist and an
      // undrawn day is drawn lazily after boot.
      db.exec(`
        CREATE TABLE derby_bets (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          raceId TEXT    NOT NULL,
          userId INTEGER NOT NULL REFERENCES users(id),
          racer  TEXT    NOT NULL,
          amount INTEGER NOT NULL,
          at     INTEGER NOT NULL
        );
        CREATE INDEX idx_derby_bets_race ON derby_bets(raceId);
        CREATE TABLE lottery_tickets (
          day    TEXT    NOT NULL,
          userId INTEGER NOT NULL REFERENCES users(id),
          count  INTEGER NOT NULL,
          PRIMARY KEY (day, userId)
        );
        CREATE TABLE lottery_draws (
          day      TEXT    PRIMARY KEY,
          winnerId INTEGER,
          pot      INTEGER NOT NULL,
          paid     INTEGER NOT NULL,
          at       INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 42,
    name: "derby_wins",
    up: (db) => {
      // Career records for the Derby's fixed cast — pure lore, shown on the
      // racer-card modal ("Old Reliable — 14 career wins").
      db.exec(`
        CREATE TABLE derby_wins (
          racer TEXT PRIMARY KEY,
          wins  INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 43,
    name: "lottery_boosts",
    up: (db) => {
      // Casino rakes (Derby / Auction / side bets — the old burned 5%) now
      // seed the nightly lottery pot instead. One accumulator row per UTC
      // day; consumed at that day's draw, rolled forward if the day had no
      // tickets so a pot can never evaporate.
      db.exec(`
        CREATE TABLE lottery_boosts (
          day    TEXT PRIMARY KEY,
          amount INTEGER NOT NULL DEFAULT 0
        );
      `);
    },
  },
  {
    id: 44,
    name: "perf_samples",
    up: (db) => {
      // Server performance history (src/perf.ts): one row per minute,
      // pruned at 7 days. Feeds the Admin Panel's live stats + export.
      db.exec(`
        CREATE TABLE perf_samples (
          at         INTEGER PRIMARY KEY,
          cpu        REAL    NOT NULL,
          load1      REAL    NOT NULL,
          rssMb      REAL    NOT NULL,
          heapMb     REAL    NOT NULL,
          memUsedMb  REAL    NOT NULL,
          memTotalMb REAL    NOT NULL,
          diskUsedGb REAL    NOT NULL,
          diskFreeGb REAL    NOT NULL,
          netRxKbps  REAL,
          netTxKbps  REAL,
          wsClients  INTEGER NOT NULL,
          httpReqs   INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 45,
    name: "user_roles",
    up: (db) => {
      // Roles: 'user' (default) or 'moderator' — mods can ban, suspend, and
      // mint invites (route auth level "mod"; admins do everything a mod
      // can). suspendedUntil = a timed suspension; permanent bans keep using
      // the existing `locked` flag.
      db.exec(`
        ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
        ALTER TABLE users ADD COLUMN suspendedUntil INTEGER;
      `);
    },
  },
  {
    id: 46,
    name: "custom_uploads",
    up: (db) => {
      // Discord-style personal uploads (replacing the Emporium's chime +
      // banner catalogs): a profile banner image, custom voice enter/leave
      // sounds, and three soundboard slots. Sound refs are mirrored into
      // users.cosmetics (enterSound/leaveSound/board) so the existing
      // public user.update plumbing carries them to every client.
      db.exec(`
        ALTER TABLE users ADD COLUMN banner TEXT;
        CREATE TABLE user_sounds (
          userId    INTEGER NOT NULL REFERENCES users(id),
          slot      TEXT    NOT NULL,
          file      TEXT    NOT NULL,
          name      TEXT    NOT NULL,
          bytes     INTEGER NOT NULL,
          createdAt INTEGER NOT NULL,
          PRIMARY KEY (userId, slot)
        );
      `);
    },
  },
  {
    id: 47,
    name: "craps_bets",
    up: (db) => {
      // Craps escrow (the EIGHTH escrow surface — conservation audits must
      // count it). Same discipline as roulette_bets: debit+insert one txn,
      // settle = guarded credit+delete, boot refund. Multi-roll bets (pass,
      // place, hardways) live here across many rolls; `num` is the box number
      // for place/hard bets (NULL for line/field bets).
      db.exec(`
        CREATE TABLE craps_bets (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL REFERENCES users(id),
          kind   TEXT    NOT NULL,
          num    INTEGER,
          amount INTEGER NOT NULL,
          at     INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 48,
    name: "retire_chimes_bubbles",
    up: (db) => {
      // Entrance chimes + chat bubble tints were retired from the Emporium
      // (Josh's call — chimes are superseded by custom uploaded sounds, and
      // bubble washes are gone outright). The Kidcore precedent: owners are
      // made whole at full DEFAULT price, the items vanish, and anything
      // equipped is unequipped so nobody wears a cosmetic that no longer
      // exists. Prices are frozen here on purpose — migrations never read
      // the live catalog.
      const REFUNDS: Record<string, number> = {
        "chime-gong": 350, "chime-register": 400, "chime-scratch": 400, "chime-bell": 350,
        "chime-chirp": 300, "chime-horn": 450, "chime-drip": 300, "chime-laser": 400,
        "chime-owl": 350, "chime-powerup": 400,
        "bubble-ember": 450, "bubble-twilight": 450, "bubble-moss": 450, "bubble-gold": 550,
        "bubble-blood": 500, "bubble-ice": 450, "bubble-vapor": 500, "bubble-royal": 500,
        "bubble-smoke": 450,
      };
      const ids = Object.keys(REFUNDS);
      const marks = ids.map(() => "?").join(",");
      const owned = db
        .prepare(`SELECT userId, itemId FROM user_items WHERE itemId IN (${marks})`)
        .all(...ids) as { userId: number; itemId: string }[];
      for (const row of owned) {
        db.prepare("UPDATE users SET coins = coins + ? WHERE id = ?").run(REFUNDS[row.itemId], row.userId);
      }
      db.prepare(`DELETE FROM user_items WHERE itemId IN (${marks})`).run(...ids);
      db.prepare(`DELETE FROM item_prices WHERE itemId IN (${marks})`).run(...ids);
      // Unequip: clear the chime/bubble cosmetic slots (NEVER the upload-
      // mirror keys enterSound/leaveSound/board — those are custom sounds).
      const wearers = db
        .prepare("SELECT id, cosmetics FROM users WHERE cosmetics LIKE '%chime%' OR cosmetics LIKE '%bubble%'")
        .all() as { id: number; cosmetics: string }[];
      for (const { id, cosmetics } of wearers) {
        try {
          const c = JSON.parse(cosmetics || "{}");
          if (c && typeof c === "object" && ("chime" in c || "bubble" in c)) {
            delete c.chime;
            delete c.bubble;
            db.prepare("UPDATE users SET cosmetics = ? WHERE id = ?").run(JSON.stringify(c), id);
          }
        } catch {
          /* corrupt cosmetics blob — ignored, same as parse elsewhere */
        }
      }
    },
  },
  {
    id: 49,
    name: "holdem_stacks",
    up: (db) => {
      // Hold'em seat escrow (the NINTH escrow surface — conservation audits
      // must count it). A row holds a seat's whole buy-in and moves ONLY at
      // sit / hand settlement / leave; mid-hand chips are in-memory, so a
      // crash abandons the hand and boot refunds every row in full.
      db.exec(`
        CREATE TABLE holdem_stacks (
          tableId INTEGER NOT NULL,
          userId  INTEGER NOT NULL REFERENCES users(id),
          stack   INTEGER NOT NULL,
          at      INTEGER NOT NULL,
          PRIMARY KEY (tableId, userId)
        );
      `);
    },
  },
  {
    id: 50,
    name: "sterling_bot",
    up: (db) => {
      // Sterling steps out of the shop: a house BOT account (users.isBot) and
      // the specials calendar he runs. Specials rows persist so restarts
      // resume an active special instead of re-rolling it.
      db.exec(`
        ALTER TABLE users ADD COLUMN isBot INTEGER NOT NULL DEFAULT 0;
        CREATE TABLE specials (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          kind        TEXT    NOT NULL,
          data        TEXT    NOT NULL DEFAULT '{}',
          startsAt    INTEGER NOT NULL,
          endsAt      INTEGER NOT NULL,
          announcedAt INTEGER,
          closedAt    INTEGER
        );
      `);
    },
  },
  {
    id: 51,
    name: "observability",
    up: (db) => {
      // The Admin Panel grows real operator eyes: a deduplicated error
      // tracker (server exceptions + friends' browser crashes), an audit
      // trail of admin/house actions, and daily economy snapshots so coin
      // drift is visible without outside help.
      db.exec(`
        CREATE TABLE errors (
          id      INTEGER PRIMARY KEY AUTOINCREMENT,
          kind    TEXT    NOT NULL,
          hash    TEXT    NOT NULL UNIQUE,
          message TEXT    NOT NULL,
          stack   TEXT,
          route   TEXT,
          userId  INTEGER,
          count   INTEGER NOT NULL DEFAULT 1,
          firstAt INTEGER NOT NULL,
          lastAt  INTEGER NOT NULL
        );
        CREATE TABLE audit (
          id      INTEGER PRIMARY KEY AUTOINCREMENT,
          at      INTEGER NOT NULL,
          actorId INTEGER,
          action  TEXT    NOT NULL,
          detail  TEXT
        );
        CREATE TABLE economy_snapshots (
          day        TEXT PRIMARY KEY,
          at         INTEGER NOT NULL,
          totalCoins INTEGER NOT NULL,
          escrow     INTEGER NOT NULL,
          potPending INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 52,
    name: "backrooms_fog",
    up: (db) => {
      // The Backrooms community fog-of-war: one row per sector, a packed
      // bitset (1 bit per cell) of every cell ANYONE has ever explored.
      // Exploration is permanent by design — this only ever gains bits.
      db.exec(`
        CREATE TABLE backrooms_fog (
          sector   TEXT PRIMARY KEY,
          explored BLOB NOT NULL,
          updated  INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 53,
    name: "backrooms_economy",
    up: (db) => {
      // B3: Research Credits (Voss's CLOSED currency — minted only by
      // selling emoji/relics/footage to her, spent only at her counter;
      // it never touches silver, so the sole-faucet doctrine holds), the
      // locker (gear INSTANCES with upgrade levels — two flashlights at
      // different levels are two rows), and unlocked relics.
      db.exec(`
        CREATE TABLE backrooms_players (
          userId      INTEGER PRIMARY KEY,
          rc          INTEGER NOT NULL DEFAULT 0,
          lockerSlots INTEGER NOT NULL DEFAULT 20
        );
        CREATE TABLE backrooms_locker (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          userId    INTEGER NOT NULL,
          kind      TEXT    NOT NULL,
          level     INTEGER NOT NULL DEFAULT 0,
          color     TEXT,
          createdAt INTEGER NOT NULL
        );
        CREATE INDEX idx_br_locker_user ON backrooms_locker (userId);
        CREATE TABLE backrooms_relics (
          userId     INTEGER NOT NULL,
          relicId    TEXT    NOT NULL,
          unlockedAt INTEGER NOT NULL,
          PRIMARY KEY (userId, relicId)
        );
      `);
    },
  },
  {
    id: 54,
    name: "backrooms_marks",
    up: (db) => {
      // Spray paint: PERMANENT world marks (the map-permanence lock — spray
      // persists forever). One row per spray dot; dots are throttled
      // client+server side so a full can is at most ~2k rows. cellX/cellY
      // are the integer cell holding the marked wall face — the chunk
      // fetch's index.
      db.exec(`
        CREATE TABLE backrooms_marks (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          sector    TEXT    NOT NULL,
          cellX     INTEGER NOT NULL,
          cellY     INTEGER NOT NULL,
          face      TEXT    NOT NULL,
          u         REAL    NOT NULL,
          v         REAL    NOT NULL,
          color     TEXT    NOT NULL,
          userId    INTEGER NOT NULL,
          createdAt INTEGER NOT NULL
        );
        CREATE INDEX idx_br_marks_cell ON backrooms_marks (sector, cellX, cellY);
      `);
    },
  },
  {
    id: 55,
    name: "backrooms_deaths",
    up: (db) => {
      // The entity's ledger (and any future cause). Feeds the section's
      // RECENT DEATHS and, later, map markers + corpse recovery.
      db.exec(`
        CREATE TABLE backrooms_deaths (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL,
          name   TEXT    NOT NULL,
          x      REAL    NOT NULL,
          y      REAL    NOT NULL,
          cause  TEXT    NOT NULL,
          at     INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 56,
    name: "backrooms_corpses",
    up: (db) => {
      // The Tarkov loop: a death drops a BODY holding everything carried
      // (gear + unbanked relics). Anyone who finds it loots what they
      // want; an emptied corpse is removed. Persists restarts — the maze
      // keeps what it takes until someone carries it out.
      db.exec(`
        CREATE TABLE backrooms_corpses (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL,
          name   TEXT    NOT NULL,
          x      REAL    NOT NULL,
          y      REAL    NOT NULL,
          at     INTEGER NOT NULL,
          items  TEXT    NOT NULL
        );
      `);
    },
  },
  {
    id: 57,
    name: "backrooms_drops",
    up: (db) => {
      // G-dropped gear left on the carpet. The persistence rules (Josh):
      // SPRAY PAINT is the only forever mark — bodies and dropped items
      // ROT after an hour (BR_DESPAWN_MS), so the maze doesn't silt up with
      // free loot. One row per dropped item; it holds the item's real level
      // and color, so what you drop is exactly what the finder gets.
      db.exec(`
        CREATE TABLE backrooms_drops (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          sector TEXT    NOT NULL,
          x      REAL    NOT NULL,
          y      REAL    NOT NULL,
          kind   TEXT    NOT NULL,
          level  INTEGER NOT NULL DEFAULT 0,
          color  TEXT,
          -- Seconds of battery/paint/tape left when it hit the floor (NULL =
          -- unknown → full). Without this, dropping a dead flashlight and
          -- picking it straight back up would be a free recharge.
          charge REAL,
          at     INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 58,
    name: "auction_relics",
    up: (db) => {
      // RELICS REACH SILVER ONLY VIA THE PLAYER MARKET (the B3 doctrine): Voss
      // pays Research Credits for a duplicate, never coins, so the auction
      // house is the one place a relic converts to silver — and that silver
      // moves player→player, never minted.
      //
      // An auction is now EITHER an emoji (`code`) or a relic (`relicSlug`).
      // `code` is NOT NULL from migration 13 and SQLite can't relax that
      // without rebuilding the table, so relic listings store code = '' and
      // every read branches on relicSlug. Every relic locker row is by
      // definition a duplicate (the first of a kind unlocks the collection
      // entry and creates no row), so listing one can never cost a collector
      // their trophy.
      db.exec(`ALTER TABLE auctions ADD COLUMN relicSlug TEXT`);
    },
  },
  {
    id: 59,
    name: "backrooms_drops_charge_repair",
    up: (db) => {
      // THE NEVER-EDIT-AN-OLD-MIGRATION RULE, learned the hard way (2026-07-27):
      // migration 57 was authored, applied by a running dev server on its next
      // watch-restart, and only THEN gained its `charge` column — so that dev DB
      // recorded 57 as applied while missing the column, and every read of
      // backrooms_drops threw "no such column: charge" at boot. A migration is
      // "old" the moment ANY database has run it, uncommitted or not.
      //
      // This is the repair: add the column only where it's missing. A no-op on
      // any DB that got 57's final shape, so fresh installs and production are
      // untouched.
      const cols = db.prepare("PRAGMA table_info(backrooms_drops)").all() as { name: string }[];
      if (!cols.some((c) => c.name === "charge")) {
        db.exec(`ALTER TABLE backrooms_drops ADD COLUMN charge REAL`);
      }
    },
  },
  {
    id: 60,
    name: "backrooms_lore",
    up: (db) => {
      // THE RESEARCH ARCHIVE. A drive found by ANYONE unlocks for EVERYONE, so
      // this table is global, not per-user: one row = one drive that Solace
      // has recovered, with the finder credited forever. It only ever grows —
      // no resets, not even the admin world wipe (the archive is the
      // community's history, not the map's state).
      //
      // backrooms_flags holds one-time WORLD events, of which there is exactly
      // one so far: the door to Level 1 being opened. A row's existence IS the
      // event, so it can never fire twice.
      db.exec(`
        CREATE TABLE backrooms_drives (
          driveId TEXT    PRIMARY KEY,
          userId  INTEGER NOT NULL,
          name    TEXT    NOT NULL,
          at      INTEGER NOT NULL
        );
        CREATE TABLE backrooms_flags (
          flag   TEXT    PRIMARY KEY,
          userId INTEGER,
          name   TEXT,
          at     INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 61,
    name: "backrooms_corpses_sector",
    up: (db) => {
      // THE POOLROOMS (Level 1) share the corpse table with Level 0, so a body
      // needs to say which world it fell in. Every existing body fell in A3.
      db.exec(`ALTER TABLE backrooms_corpses ADD COLUMN sector TEXT NOT NULL DEFAULT 'A3';`);
    },
  },
  {
    id: 62,
    name: "achievements",
    up: (db) => {
      // THE ACHIEVEMENT LEDGER (Josh, Aug 2026). One row per earned badge —
      // the catalog itself lives in code (src/achievements.ts, the emporium
      // pattern), so adding badges never needs a migration. Stat-kind badges
      // are checked lazily against user_stats + derived counts (fully
      // retroactive); event-kind ones are awarded at the moment by hooks.
      db.exec(`
        CREATE TABLE user_achievements (
          userId   INTEGER NOT NULL,
          achId    TEXT    NOT NULL,
          earnedAt INTEGER NOT NULL,
          PRIMARY KEY (userId, achId)
        );
        CREATE INDEX idx_user_ach_user ON user_achievements (userId);
      `);
    },
  },
  {
    id: 63,
    name: "pages",
    up: (db) => {
      // PAGES (Josh, Aug 2026) — communities that HOUSE channels, the layer
      // above everything chat has been until now. A page can be public
      // (anyone may look in) or private (members only, and only admins and
      // moderators may add people). Inside a page a member can be promoted
      // to MANAGER, which is authority over that page alone.
      //
      // Everything that exists today becomes SOLACE GENERAL, page 1: the
      // channels are re-parented to it and every existing account is
      // enrolled, so nobody logs in to find their chat gone. New accounts
      // join it at creation (see createUser).
      db.exec(`
        CREATE TABLE pages (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT    NOT NULL,
          description TEXT,
          icon        TEXT,
          isPublic    INTEGER NOT NULL DEFAULT 1,
          createdBy   INTEGER NOT NULL,
          createdAt   INTEGER NOT NULL,
          position    INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE page_members (
          pageId  INTEGER NOT NULL,
          userId  INTEGER NOT NULL,
          role    TEXT    NOT NULL DEFAULT 'member',
          addedAt INTEGER NOT NULL,
          PRIMARY KEY (pageId, userId)
        );
        CREATE INDEX idx_page_members_user ON page_members (userId);
        ALTER TABLE channels ADD COLUMN pageId INTEGER NOT NULL DEFAULT 1;
        CREATE INDEX idx_channels_page ON channels (pageId);
      `);
      const now = Date.now();
      // The general page is id 1 by construction — the channels ALTER above
      // defaults every existing channel to it, and the client treats it as
      // the one page that can never be left or deleted.
      db.prepare(
        "INSERT INTO pages (id, name, description, icon, isPublic, createdBy, createdAt, position)" +
          " VALUES (1, 'Solace General', ?, NULL, 1, 0, ?, 0)",
      ).run("Everything Solace — the main hall, and where every member starts.", now);
      db.prepare(
        "INSERT OR IGNORE INTO page_members (pageId, userId, role, addedAt) SELECT 1, id, 'member', ? FROM users",
      ).run(now);
    },
  },
  {
    id: 64,
    name: "page_default_channel",
    up: (db) => {
      // WHERE A PAGE DROPS YOU (Josh, Aug 2026): "give a setting that makes
      // that text channel the default text everyone goes when joining." Null
      // means "no preference — take the first text channel", which is what
      // every page does until somebody nominates one. Cleared automatically
      // if the nominated channel is deleted.
      db.exec(`ALTER TABLE pages ADD COLUMN defaultChannelId INTEGER;`);
    },
  },
  {
    id: 65,
    name: "security_ledger",
    up: (db) => {
      // THE SIGN-IN LEDGER (Josh, Aug 2026: "make sure the server doesn't have
      // any unauthorized access"). Until now a SUCCESSFUL login left no record
      // at all — just a lastSeenAt bump on a login_networks row — and a failed
      // one left a counter that the next success wiped. There was no way to
      // answer "who signed in last week, and from where".
      //
      // `username` is stored as typed (not just userId) so probes against
      // accounts that don't exist are visible too — that pattern, one IP
      // walking a list of names, is the loudest thing a stuffing run does.
      // Rows are pruned on a rolling window (SECURITY_RETENTION_DAYS).
      db.exec(`
        CREATE TABLE login_events (
          id       INTEGER PRIMARY KEY AUTOINCREMENT,
          at       INTEGER NOT NULL,
          userId   INTEGER,
          username TEXT    NOT NULL,
          outcome  TEXT    NOT NULL,
          ip       TEXT    NOT NULL,
          network  TEXT    NOT NULL,
          ua       TEXT
        );
        CREATE INDEX idx_login_events_at   ON login_events(at);
        CREATE INDEX idx_login_events_user ON login_events(userId, at);
        CREATE INDEX idx_login_events_ip   ON login_events(ip, at);
      `);

      // Session provenance. Three columns of "where did this token come from",
      // plus the split that makes `createdAt` mean something again:
      // touchSession used to OVERWRITE createdAt on every sliding renewal, so
      // a session's real age was unknowable. Now createdAt is fixed at issue
      // and lastSeenAt is the clock the TTL slides on — which also fixes a
      // quiet bug: under the old half-TTL renewal a session last used on day
      // 14 still died on day 30, despite the documented invariant being 30
      // days of DISUSE. Existing rows backfill lastSeenAt from createdAt, so
      // nobody currently signed in is logged out by this migration.
      db.exec(`
        ALTER TABLE sessions ADD COLUMN ip TEXT;
        ALTER TABLE sessions ADD COLUMN ua TEXT;
        ALTER TABLE sessions ADD COLUMN network TEXT;
        ALTER TABLE sessions ADD COLUMN lastSeenAt INTEGER NOT NULL DEFAULT 0;
        UPDATE sessions SET lastSeenAt = createdAt;
      `);
    },
  },
  {
    id: 66,
    name: "user_deleted_at",
    up: (db) => {
      // A DELETED ACCOUNT SHOULD LEAVE THE LIST (Josh, Aug 2026: "when i
      // delete accounts they should be removed from the list").
      //
      // Deletion here is a SCRUB, not a DELETE: the row survives so that old
      // messages, trades and graveyard entries still resolve to a name instead
      // of dangling. But nothing marked that a row was scrubbed, so the only
      // way to spot one was its "deleted user" display name — which a live
      // account can set for itself, and a username pattern anyone may
      // register. Guessing at it would have been a way to hide a real member
      // from moderation.
      db.exec(`ALTER TABLE users ADD COLUMN deletedAt INTEGER;`);
      // Backfill the ones already scrubbed. Deliberately narrow — all three
      // marks at once, and only for accounts that are also sealed — so it
      // cannot catch somebody who merely named themselves "deleted user".
      db.prepare(
        `UPDATE users SET deletedAt = ?
           WHERE deletedAt IS NULL AND locked = 1
             AND displayName = 'deleted user'
             AND username LIKE 'deleted-%'
             AND passwordHash IS NOT NULL`,
      ).run(Date.now());
    },
  },
  {
    id: 67,
    name: "jukebox_songs",
    up: (db) => {
      // THE JUKEBOX (Josh, Aug 2026) — the casino's record library. The MP3s
      // themselves live under data/uploads/music like every other upload here
      // (gitignored, UUID-named, must ride backups); this is the catalogue the
      // floor plays from and the admin screen manages.
      //
      // `durationMs` is parsed from the file's own frame headers at ingest,
      // NOT reported by a client — the server advances the queue on that clock,
      // so a lie about it would be a lie about when the next song starts.
      db.exec(`
        CREATE TABLE jukebox_songs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          artist TEXT NOT NULL DEFAULT '',
          file TEXT NOT NULL UNIQUE,
          durationMs INTEGER NOT NULL,
          addedBy INTEGER,
          addedAt INTEGER NOT NULL,
          plays INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_jukebox_title ON jukebox_songs(title);
      `);
    },
  },
  {
    id: 68,
    name: "the_wake_and_the_inheritance",
    up: (db) => {
      // DEATH STOPS BEING A DOOR SLAM (Josh, Aug 2026). He kept the mechanic —
      // you really can lose the account — but at 1.5% a spin a committed player
      // was losing one about weekly, which is attrition, and the thing most
      // likely to make somebody walk after months. The fire rate went to 1.0%;
      // this is the other half, and it is two mechanics working in sequence:
      //
      //   THE WAKE — you die exactly as before (tombstoned, Terminated plays,
      //   locked out), but the grave is FRESH for 48 hours. Another living
      //   player can pay to raise you, or you can buy yourself back at a
      //   steeper price. Nobody comes, and it seals.
      //
      //   THE INHERITANCE — a sealed grave is not a dead end. The life is
      //   carved into `lives` with everything it held, and the SAME account
      //   walks out as the next generation carrying its achievements, titles,
      //   a quarter of its silver and the rarest tenth of its collection.
      //
      // Reusing the account row rather than minting a new one is deliberate:
      // a new userId would orphan that person's messages, DMs, sessions and
      // cosmetics for nothing a player would ever see.
      db.exec(`ALTER TABLE users ADD COLUMN generation INTEGER NOT NULL DEFAULT 1;`);
      // When this grave seals. Set at death, cleared the moment somebody comes
      // back — so "is this grave still fresh" is one nullable column and a
      // clock, and survives a restart mid-window without any in-memory state.
      db.exec(`ALTER TABLE users ADD COLUMN graveSealsAt INTEGER;`);
      db.exec(`
        CREATE TABLE lives (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          userId      INTEGER NOT NULL,
          generation  INTEGER NOT NULL,
          bornAt      INTEGER NOT NULL,
          diedAt      INTEGER NOT NULL,
          sealedAt    INTEGER NOT NULL,
          epitaph     TEXT,
          coins       INTEGER NOT NULL,
          emojiCount  INTEGER NOT NULL,
          codes       TEXT    NOT NULL,
          keptCodes   TEXT    NOT NULL,
          keptCoins   INTEGER NOT NULL,
          UNIQUE(userId, generation)
        );
        CREATE INDEX idx_lives_user ON lives(userId);
        CREATE TABLE revivals (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          userId      INTEGER NOT NULL,
          byUserId    INTEGER,
          kind        TEXT    NOT NULL,
          cost        INTEGER NOT NULL,
          mythicCode  TEXT,
          burnedCodes TEXT,
          at          INTEGER NOT NULL
        );
        CREATE INDEX idx_revivals_user ON revivals(userId);
      `);
      // EXISTING GRAVES STAY SEALED. Everyone tombstoned before today died
      // under the old rules, and quietly handing them a 48h window would raise
      // the dead on deploy — including accounts whose estates have already been
      // executed and handed to an heir, which would mint the estate twice.
      // graveSealsAt defaults to NULL, which reads as "sealed", so this needs
      // no backfill at all. It is called out because the absence of one is the
      // load-bearing decision.
    },
  },
  {
    id: 69,
    name: "casino_items",
    up: (db) => {
      // THE CASINO GUN + THE CASINO LOCKER (Josh, Aug 2026). Durable floor
      // items, unlike the bottles (which stay client state on purpose — see
      // client/src/casino/drink.ts). Two tables rather than a `stored` flag,
      // because the locker is SLOT-ADDRESSED (50 numbered pigeonholes, Josh's
      // spec) and carried items aren't.
      //
      // 'gun': qty IS the rounds loaded (0..9) — the row moving between the
      // tables carries its load with it. 'clip': qty = spare magazines.
      // Vocabulary + prices live in src/casino/items.ts.
      db.exec(`
        CREATE TABLE casino_inv (
          userId INTEGER NOT NULL,
          item   TEXT    NOT NULL,
          qty    INTEGER NOT NULL,
          PRIMARY KEY (userId, item)
        );
        CREATE TABLE casino_locker (
          userId INTEGER NOT NULL,
          slot   INTEGER NOT NULL,
          item   TEXT    NOT NULL,
          qty    INTEGER NOT NULL,
          PRIMARY KEY (userId, slot)
        );
      `);
    },
  },
  {
    id: 70,
    name: "escape_room",
    up: (db) => {
      // THE CASINO ESCAPE ROOM (ESCAPE.md). The whole schema lands at once so
      // later phases add code, not columns.
      //
      // er_passes: THE PASS is a durable condition, not an item — stake one
      // rare emoji (BURNED at stake time; there is no returning condition, so
      // escrow would be machinery with no purpose) and hold the pass until
      // you die inside. endedAt NULL = active; the partial unique index is
      // what makes "one active pass per person" a database fact rather than a
      // route's good intentions.
      //
      // chips / freePulls: the chest mint's two restricted balances — private
      // like coins, unsellable, untradeable. Chips spend at the HOUSE games
      // only; the split columns on the two escrow tables exist because a
      // chips-paid bet refunded as silver would be a free 1:1 converter.
      db.exec(`
        CREATE TABLE er_passes (
          id      INTEGER PRIMARY KEY AUTOINCREMENT,
          userId  INTEGER NOT NULL,
          code    TEXT    NOT NULL,
          at      INTEGER NOT NULL,
          endedAt INTEGER,
          endReason TEXT
        );
        CREATE UNIQUE INDEX idx_er_pass_active ON er_passes(userId) WHERE endedAt IS NULL;
        CREATE TABLE er_inventory (
          userId INTEGER NOT NULL,
          item   TEXT    NOT NULL,
          qty    INTEGER NOT NULL,
          PRIMARY KEY (userId, item)
        );
        CREATE TABLE er_locker (
          userId INTEGER NOT NULL,
          item   TEXT    NOT NULL,
          qty    INTEGER NOT NULL,
          PRIMARY KEY (userId, item)
        );
        CREATE TABLE er_opens (
          userId INTEGER NOT NULL,
          day    TEXT    NOT NULL,
          count  INTEGER NOT NULL,
          PRIMARY KEY (userId, day)
        );
        CREATE TABLE er_discoveries (
          userId INTEGER NOT NULL,
          skin   TEXT    NOT NULL,
          at     INTEGER NOT NULL,
          PRIMARY KEY (userId, skin)
        );
      `);
      db.exec(`ALTER TABLE users ADD COLUMN chips INTEGER NOT NULL DEFAULT 0;`);
      db.exec(`ALTER TABLE users ADD COLUMN freePulls INTEGER NOT NULL DEFAULT 0;`);
      db.exec(`ALTER TABLE blackjack_bets ADD COLUMN chips INTEGER NOT NULL DEFAULT 0;`);
      db.exec(`ALTER TABLE roulette_bets ADD COLUMN chips INTEGER NOT NULL DEFAULT 0;`);
    },
  },
  {
    id: 71,
    name: "er_mint_ledger",
    up: (db) => {
      // THE MINT'S OWN BOOKS (E3b). Every chest grant lands a row-bump here,
      // per UTC day, inside the SAME transaction as the grant — so the
      // tripwire (a red health check at 25k silver-equivalent/day, which
      // Sterling escalates like any red check) and the weekly report read
      // the mint's actual output, not an inference from wallet deltas.
      db.exec(`
        CREATE TABLE er_mint (
          day    TEXT PRIMARY KEY,
          silver INTEGER NOT NULL DEFAULT 0,
          chips  INTEGER NOT NULL DEFAULT 0,
          spins  INTEGER NOT NULL DEFAULT 0,
          pulls  INTEGER NOT NULL DEFAULT 0,
          opens  INTEGER NOT NULL DEFAULT 0
        );
      `);
    },
  },
  {
    id: 72,
    name: "chosen_people_lenders",
    up: (db) => {
      // GOBLIN LENDERS — the goblin bank (src/lender.ts has the rules).
      //
      // THE VAULT IS THE FAUCET GUARD. The goblins are interstellar and
      // brought their own capital: VAULT_SEED enters the world exactly once,
      // here, and every coin they lend afterwards comes out of this row while
      // every coin repaid goes back into it. So the lender can never mint —
      // conservation is auditable as wallets + escrows + this one number, and
      // lending the vault dry is a legal state ("come back tomorrow").
      db.exec(`
        CREATE TABLE goblin_vault (
          id     INTEGER PRIMARY KEY CHECK (id = 1),
          silver INTEGER NOT NULL,
          lent   INTEGER NOT NULL DEFAULT 0,
          taken  INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO goblin_vault (id, silver) VALUES (1, 5000000);
        CREATE TABLE loans (
          userId     INTEGER PRIMARY KEY,
          principal  INTEGER NOT NULL,
          rate       REAL    NOT NULL,
          opened     INTEGER NOT NULL,
          borrowed   INTEGER NOT NULL,
          lastDay    TEXT    NOT NULL,
          missed     INTEGER NOT NULL DEFAULT 0,
          paid       INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE loan_events (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL,
          at     INTEGER NOT NULL,
          kind   TEXT    NOT NULL,
          amount INTEGER NOT NULL DEFAULT 0,
          note   TEXT
        );
        CREATE INDEX idx_loan_events_user ON loan_events (userId, at);
      `);
      // THE CELL. Deliberately NOT the grave's columns: a jailed account keeps
      // diedAt NULL so the Wake's own (cheaper) self-revive can't be used to
      // walk out of a debt. `disabled` is shared, which is what keeps a jailed
      // session out of every ordinary route for free — the cell gets its own
      // resolver, exactly as the wake does. At sealing the cell BECOMES a
      // grave and the ordinary inheritance runs.
      db.exec(`ALTER TABLE users ADD COLUMN jailedAt     INTEGER;`);
      db.exec(`ALTER TABLE users ADD COLUMN jailSealsAt  INTEGER;`);
    },
  },
  {
    id: 73,
    name: "soundboard_library",
    up: (db) => {
      // THE HOUSE SOUNDBOARD (Josh, Aug 2026). Personal pads become one
      // shared library: anyone can add a sound (per-user cap enforced in the
      // route), and everyone in a voice room can play any of them. The three
      // old board slots migrate in as the library's founding records; the
      // enter/leave slots stay personal in user_sounds.
      db.exec(`
        CREATE TABLE board_sounds (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          ownerId   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          file      TEXT    NOT NULL,
          name      TEXT    NOT NULL,
          emoji     TEXT,
          bytes     INTEGER NOT NULL,
          createdAt INTEGER NOT NULL
        );
        CREATE INDEX idx_board_sounds_owner ON board_sounds (ownerId);
      `);
      const olds = db
        .prepare("SELECT userId, file, name, bytes, createdAt FROM user_sounds WHERE slot LIKE 'board%' ORDER BY userId, slot")
        .all() as { userId: number; file: string; name: string; bytes: number; createdAt: number }[];
      const ins = db.prepare(
        "INSERT INTO board_sounds (ownerId, file, name, emoji, bytes, createdAt) VALUES (?, ?, ?, NULL, ?, ?)",
      );
      for (const r of olds) ins.run(r.userId, r.file, r.name, r.bytes, r.createdAt);
      db.prepare("DELETE FROM user_sounds WHERE slot LIKE 'board%'").run();
      // The cosmetics mirror loses its `board` key — pads are no longer a
      // per-user cosmetic, they're library rows the client fetches.
      const users = db
        .prepare(`SELECT id, cosmetics FROM users WHERE cosmetics LIKE '%"board"%'`)
        .all() as { id: number; cosmetics: string }[];
      const upd = db.prepare("UPDATE users SET cosmetics = ? WHERE id = ?");
      for (const u of users) {
        try {
          const cs = JSON.parse(u.cosmetics) as Record<string, unknown>;
          delete cs.board;
          upd.run(JSON.stringify(cs), u.id);
        } catch {
          /* corrupt blob — leave it; the mirror rebuild heals it */
        }
      }
    },
  },
  {
    id: 74,
    name: "web_push",
    up: (db) => {
      // WEB PUSH (Aug 2026): notifications that reach a device with Solace
      // fully closed. A subscription is a per-device push-service endpoint +
      // its encryption keys; the endpoint is the natural primary key (a
      // device re-subscribing replaces its own row). app_kv holds the VAPID
      // keypair, generated once at boot — no env config to forget.
      db.exec(`
        CREATE TABLE push_subscriptions (
          endpoint  TEXT    PRIMARY KEY,
          userId    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          p256dh    TEXT    NOT NULL,
          auth      TEXT    NOT NULL,
          ua        TEXT,
          createdAt INTEGER NOT NULL
        );
        CREATE INDEX idx_push_subs_user ON push_subscriptions (userId);
        CREATE TABLE app_kv (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    },
  },
  {
    id: 75,
    name: "economy_snapshot_vault",
    up: (db) => {
      // THE AUDIT LEARNS ABOUT THE GOBLINS (Aug 2026). The lender's own
      // invariant (see the migration-72 block) is that
      // wallets + escrows + goblin_vault.silver is constant — but the daily
      // economy snapshot only summed wallets + escrow + pot, so every loan
      // draw read as an unexplained mint in the weekly drift check and every
      // repayment as a burn. Record the vault alongside the rest. NULL on
      // pre-75 rows means "not measured then", never zero — the drift math
      // must not compare a vault-bearing row against a blind one.
      db.exec("ALTER TABLE economy_snapshots ADD COLUMN vault INTEGER");
    },
  },
  {
    id: 76,
    name: "graveyard_v2",
    up: (db) => {
      // GRAVEYARD v2 (Aug 2026). Three pieces:
      //
      // deathCause — carved at death, going FORWARD only: existing stones stay
      // uninscribed (NULL = "unwitnessed"), because inventing a cause for a
      // grave nobody recorded would be fiction in a ledger. "wheel" | "goblins"
      // today; TEXT so a future reaper needs no migration.
      //
      // grave_tributes — candles (25, burned) and flowers (100, burned), the
      // graveyard's first real sinks. Rows decay by age (candle 24h, flowers
      // 7d) and are pruned lazily on the graveyard read.
      //
      // grave_eulogies — one per mourner per grave, free, author- or
      // staff-deletable. At a SEALING they carve into the monument
      // (lives.eulogies, JSON) — they were said at that wake — and every
      // grave-scoped row (respects, tributes, eulogies) clears when the grave
      // resolves, so a second death starts with clean ground.
      db.exec(`
        ALTER TABLE users ADD COLUMN deathCause TEXT;
        ALTER TABLE lives ADD COLUMN deathCause TEXT;
        ALTER TABLE lives ADD COLUMN eulogies TEXT;
        CREATE TABLE grave_tributes (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          deadUserId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          byUserId   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind       TEXT    NOT NULL,
          at         INTEGER NOT NULL
        );
        CREATE INDEX idx_tributes_dead ON grave_tributes (deadUserId, kind);
        CREATE TABLE grave_eulogies (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          deadUserId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          byUserId   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          text       TEXT    NOT NULL,
          at         INTEGER NOT NULL,
          UNIQUE (deadUserId, byUserId)
        );
      `);
    },
  },
  {
    id: 77,
    name: "page_privacy_modes",
    up: (db) => {
      // PAGE PRIVACY, TWO INDEPENDENT DIALS (Josh, Sep 2026): joinPolicy
      // (open = walk in · request = knock and a manager approves · invite =
      // added by hand) and discoverable (does the picker show the page's
      // CARD to non-members — never its channels). `isPublic` STAYS and is
      // maintained as exactly (joinPolicy = 'open'): it is the content-
      // privacy flag every wire check already keys off, so nothing about
      // "PRIVATE MEANS PRIVATE ON THE WIRE" changes shape. Backfill keeps
      // both existing modes exactly as they were: public → open+listed,
      // private → invite+hidden.
      db.exec(`
        ALTER TABLE pages ADD COLUMN discoverable INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE pages ADD COLUMN joinPolicy TEXT NOT NULL DEFAULT 'open';
        UPDATE pages SET discoverable = 0, joinPolicy = 'invite' WHERE isPublic = 0;
        CREATE TABLE page_join_requests (
          pageId INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
          userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          at     INTEGER NOT NULL,
          PRIMARY KEY (pageId, userId)
        );
      `);
    },
  },
  {
    id: 78,
    name: "scrub_leaves_pages",
    up: (db) => {
      // A deleted account leaves every page (Josh, Sep 2026: "why do deleted
      // players keep showing up"). scrubUser burned everything the account
      // owned but never touched page_members, so every scrub sat in Page
      // Settings' Members list as "deleted user" forever and padded the
      // picker cards' member counts. scrubUser deletes both rows going
      // forward; this sweeps the ones already left behind. Dead-but-revivable
      // accounts (disabled, deletedAt NULL) keep their memberships — only a
      // scrub is forever.
      db.exec(`
        DELETE FROM page_members
          WHERE userId IN (SELECT id FROM users WHERE deletedAt IS NOT NULL);
        DELETE FROM page_join_requests
          WHERE userId IN (SELECT id FROM users WHERE deletedAt IS NOT NULL);
      `);
    },
  },
  {
    id: 79,
    name: "federation_f1",
    up: (db) => {
      // FEDERATION F1 (FEDERATION.md, Sep 2026): the satellite registry.
      // A satellite is a self-hosted community server bound to an
      // accountable hub account. Its standing credential is an Ed25519
      // PUBLIC key — the private half never leaves the host's box, so this
      // table holds nothing a DB leak could use to impersonate anyone.
      // Provisioning keys are invite-shaped: admin-minted, single-use,
      // expiring, HASHED at rest. Events are the login_events shape.
      db.exec(`
        CREATE TABLE satellites (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT    NOT NULL,
          ownerUserId INTEGER NOT NULL REFERENCES users(id),
          pubkey      TEXT    NOT NULL,
          version     TEXT    NOT NULL DEFAULT '',
          status      TEXT    NOT NULL DEFAULT 'active',
          network     TEXT,
          lastSeenAt  INTEGER,
          createdAt   INTEGER NOT NULL
        );
        CREATE TABLE satellite_keys (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          codeHash    TEXT    NOT NULL UNIQUE,
          ownerUserId INTEGER NOT NULL REFERENCES users(id),
          note        TEXT,
          createdBy   INTEGER NOT NULL,
          createdAt   INTEGER NOT NULL,
          expiresAt   INTEGER NOT NULL,
          usedAt      INTEGER,
          usedBySatelliteId INTEGER,
          revoked     INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE satellite_events (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          at          INTEGER NOT NULL,
          satelliteId INTEGER,
          kind        TEXT    NOT NULL,
          ip          TEXT,
          detail      TEXT
        );
        CREATE INDEX idx_satellite_events_at ON satellite_events(at);
      `);
    },
  },
  {
    id: 80,
    name: "federation_f2_remote_pages",
    up: (db) => {
      // FEDERATION F2: a page whose CONTENT lives on a satellite. The hub
      // keeps the structure (the page row, its channels, membership, every
      // permission check); message bodies live on the host's disk and relay
      // through the link. remote_messages is the hub's INDEX of that content
      // — id/author/timestamp only, never a body — which is what keeps
      // unread counts, edit/delete authority and mention parsing entirely
      // hub-side without the hub storing the community's words. Ids in it
      // are GLOBAL (satelliteId * 1e9 + the satellite's own id), so they can
      // never collide with hub message ids on the wire.
      db.exec(`
        ALTER TABLE pages ADD COLUMN satelliteId INTEGER;
        CREATE TABLE remote_messages (
          channelId INTEGER NOT NULL,
          id        INTEGER NOT NULL,
          userId    INTEGER NOT NULL,
          at        INTEGER NOT NULL,
          deletedAt INTEGER,
          PRIMARY KEY (channelId, id)
        );
        CREATE INDEX idx_remote_messages_id ON remote_messages(id);
      `);
    },
  },
  {
    id: 81,
    name: "federation_f3_files_rotation",
    up: (db) => {
      // FEDERATION F3. attachments.satelliteId: NULL = the file is on the
      // hub's disk (every pre-F3 row, every DM/local-channel row, and a
      // remote row whose transfer hasn't completed yet); set = the file was
      // shipped to that satellite and the hub copy unlinked — serving
      // relays through the link. satellite_keys.rotatesSatelliteId: a
      // provisioning key minted to ROTATE an existing satellite's identity
      // (lost/compromised host box) — redeeming it replaces the stored
      // pubkey on that row instead of registering a new satellite, so the
      // community, its page and its history binding all survive the move.
      db.exec(`
        ALTER TABLE attachments ADD COLUMN satelliteId INTEGER;
        ALTER TABLE satellite_keys ADD COLUMN rotatesSatelliteId INTEGER;
      `);
    },
  },
  {
    id: 82,
    name: "reactions_take_remote_ids",
    up: (db) => {
      // FEDERATION F3: reactions live hub-side keyed by GLOBAL id for remote
      // messages — but message_reactions carried `REFERENCES messages(id)`,
      // which a global id can never satisfy (found by the F3 harness: every
      // remote react 500'd on the FK). SQLite can't drop one constraint, so
      // the table rebuilds without it; the users FK stays. What the dropped
      // FK's ON DELETE CASCADE used to do (clear reactions when a channel
      // delete cascades its messages away) is now an explicit statement in
      // deleteChannel/deletePage, same as the remote-id cleanup.
      db.exec(`
        CREATE TABLE message_reactions_v2 (
          messageId INTEGER NOT NULL,
          userId    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          code      TEXT    NOT NULL,
          createdAt INTEGER NOT NULL,
          PRIMARY KEY (messageId, userId, code)
        );
        INSERT INTO message_reactions_v2 SELECT messageId, userId, code, createdAt FROM message_reactions;
        DROP TABLE message_reactions;
        ALTER TABLE message_reactions_v2 RENAME TO message_reactions;
        CREATE INDEX idx_reactions_message ON message_reactions(messageId);
      `);
    },
  },
  {
    id: 83,
    name: "satellite_error_ledger",
    up: (db) => {
      // FEDERATION F6: error reports drained from satellite hosts, deduped
      // by signature per satellite (the hub errors table's shape). Josh's
      // workflow: export the NEW ones weekly/monthly for processing, mark
      // them fixed afterwards — fixed signatures stay (that's the "already
      // handled" memory that prevents redundant work) but REOPEN if the
      // same error recurs after the fix (a regression must resurface).
      // Rows older than a year prune on the sweep.
      db.exec(`
        CREATE TABLE satellite_errors (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          satelliteId INTEGER NOT NULL,
          hash        TEXT    NOT NULL,
          kind        TEXT    NOT NULL,
          message     TEXT    NOT NULL,
          firstSeenAt INTEGER NOT NULL,
          lastSeenAt  INTEGER NOT NULL,
          count       INTEGER NOT NULL DEFAULT 1,
          status      TEXT    NOT NULL DEFAULT 'new',
          fixedAt     INTEGER
        );
        CREATE UNIQUE INDEX idx_saterr_sig ON satellite_errors(satelliteId, hash);
        CREATE INDEX idx_saterr_status ON satellite_errors(status, lastSeenAt);
      `);
    },
  },
  {
    id: 84,
    name: "satellite_page_prefs",
    up: (db) => {
      // FEDERATION F8: the Linux installer's setup wizard asks the host how
      // private their community should be BEFORE it exists — the answer
      // rides the register call, parks on the satellite row, and
      // ensureSatellitePage reads it when the page auto-creates on first
      // connect. NULL = never expressed a preference (every Windows-app
      // registration) = the open+discoverable defaults, unchanged.
      db.exec(`
        ALTER TABLE satellites ADD COLUMN pageJoinPolicy TEXT;
        ALTER TABLE satellites ADD COLUMN pageDiscoverable INTEGER;
      `);
    },
  },
  {
    id: 85,
    name: "goblin_shelf_pot_plea",
    up: (db) => {
      // GOBLIN LENDERS, round two (Josh, Sep 2026; rules in src/lender.ts).
      //
      // THE REPO SHELF: repossessed emoji used to be deleted. They now sit
      // here until somebody buys them — silver into the vault, the emoji into
      // a new collection. `price` is fixed at seizure (shelfPrice of the
      // Trader's price that day) so a later Trader retune doesn't reprice
      // goods already on the shelf. The same code can be on the shelf twice
      // (seized from two different people) — hence a surrogate id.
      //
      // THE BAIL POT: the TENTH coin escrow. Friends chip in toward a bail;
      // rows live here until the pot clears the price (all of it → vault) or
      // the cell ends some other way (all of it → refunded). Count it in
      // economyTotals/ledgerStats and in the dead-player escrow sweep.
      //
      // THE PLEA: one line a prisoner scratches on their cell card.
      db.exec(`
        CREATE TABLE goblin_stock (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          code       TEXT    NOT NULL,
          fromUserId INTEGER NOT NULL,
          seizedAt   INTEGER NOT NULL,
          price      INTEGER NOT NULL
        );
        CREATE INDEX idx_goblin_stock_at ON goblin_stock (seizedAt);
        CREATE TABLE bail_pot (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          prisonerId INTEGER NOT NULL,
          payerId    INTEGER NOT NULL,
          amount     INTEGER NOT NULL,
          at         INTEGER NOT NULL
        );
        CREATE INDEX idx_bail_pot_prisoner ON bail_pot (prisonerId);
        ALTER TABLE users ADD COLUMN cellPlea TEXT;
      `);
    },
  },
  {
    id: 86,
    name: "the_paperwork",
    up: (db) => {
      // THE PAPERWORK (Josh, Sep 2026: "user agreements and liability
      // protection"). Terms acceptance per account — the column is the fast
      // gate read, the ledger is the evidence (which version, when, from
      // where). The Satellite Host Agreement is stamped on the provisioning
      // KEY when the host accepts (the Ubuntu wizard does it before the
      // daemon registers) and copied onto the satellite row at redemption.
      // Existing accounts read NULL and meet the TermsGate on their next
      // visit; existing satellites read NULL ("no agreement on file").
      db.exec(`
        ALTER TABLE users ADD COLUMN termsVersion INTEGER;
        ALTER TABLE users ADD COLUMN termsAcceptedAt INTEGER;
        CREATE TABLE terms_acceptances (
          id      INTEGER PRIMARY KEY AUTOINCREMENT,
          userId  INTEGER NOT NULL,
          version INTEGER NOT NULL,
          at      INTEGER NOT NULL,
          ip      TEXT,
          ua      TEXT
        );
        CREATE INDEX idx_terms_acceptances_user ON terms_acceptances (userId, at);
        ALTER TABLE satellite_keys ADD COLUMN hostingVersion INTEGER;
        ALTER TABLE satellite_keys ADD COLUMN hostingAcceptedAt INTEGER;
        ALTER TABLE satellite_keys ADD COLUMN hostingIp TEXT;
        ALTER TABLE satellites ADD COLUMN hostingVersion INTEGER;
        ALTER TABLE satellites ADD COLUMN hostingAcceptedAt INTEGER;
        ALTER TABLE satellites ADD COLUMN hostingIp TEXT;
      `);
    },
  },
  {
    id: 87,
    name: "the_review_round",
    up: (db) => {
      // THE SEP-2026 REVIEW ROUND. Three indexes for three full scans that
      // ran on hot paths, and one stamp that closes a door:
      //  · messages(userId) — achievementFacts counted a member's messages
      //    with no index, from every post, game action, login and profile
      //    view (a full scan of the biggest table, per active user, per 4s);
      //  · channel_reads(userId) — /api/channels read a member's cursors by
      //    scanning users × channels, on every boot and reconnect;
      //  · user_stats(key, value DESC) — every leaderboard was a scan plus a
      //    temp sort, 44 of them per Leaderboards open;
      //  · users.rerolledAt — THE REROLL used to be reusable: one grave's
      //    token registered unlimited invite-free accounts for 48 hours.
      //    Stamped on first use, refused after.
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_user ON messages (userId) WHERE deletedAt IS NULL;
        CREATE INDEX IF NOT EXISTS idx_channel_reads_user ON channel_reads (userId);
        CREATE INDEX IF NOT EXISTS idx_user_stats_key ON user_stats (key, value DESC);
        ALTER TABLE users ADD COLUMN rerolledAt INTEGER;
      `);
    },
  },
  {
    id: 88,
    name: "the_review_round_part_two",
    up: (db) => {
      // Part two of the Sep-2026 review round:
      //  · backrooms_deaths(userId) — achievementFacts runs five COUNTs on
      //    it per poke (every post, login, profile view), each a scan;
      //  · display names longer than the cap PATCH /api/me always enforced
      //    (40) could be minted at sign-up, and a name rides every
      //    PublicUser payload the account ever appears in — truncate the
      //    ones that exist, the route + store refuse new ones.
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_br_deaths_user ON backrooms_deaths (userId);
        UPDATE users SET displayName = substr(displayName, 1, ${MAX_DISPLAY_NAME}) WHERE length(displayName) > ${MAX_DISPLAY_NAME};
      `);
    },
  },
  {
    id: 89,
    name: "the_forge_and_the_shelf",
    up: (db) => {
      // THE BIG UPDATE (Josh, Sep 2026):
      //  · sterling_stock — what Sterling has bought from members and will
      //    sell back at double; one row per code, so he never holds a
      //    duplicate (the excess is discarded at the sale);
      //  · users.essence — the Forge's material, private like coins;
      //  · pages.* — per-page chat policy: attachments/GIFs allowed, and the
      //    retention clocks (NULL = server default; messageDays NULL =
      //    forever), the satellite host's dials brought to hub pages.
      db.exec(`
        CREATE TABLE IF NOT EXISTS sterling_stock (
          code  TEXT PRIMARY KEY,
          since INTEGER NOT NULL
        );
        ALTER TABLE users ADD COLUMN essence INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE pages ADD COLUMN allowImages INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE pages ADD COLUMN allowGifs INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE pages ADD COLUMN staticDays INTEGER;
        ALTER TABLE pages ADD COLUMN animatedDays INTEGER;
        ALTER TABLE pages ADD COLUMN messageDays INTEGER;
      `);
    },
  },
  {
    id: 90,
    name: "page_roles",
    up: (db) => {
      // PAGE ROLES (Josh, Sep 2026): Discord-shaped roles, per page.
      //  · page_roles — name/colour/position/perms; one @everyone per page
      //    (isEveryone) carrying the baseline every member gets;
      //  · page_member_roles — who holds what;
      //  · channel_roles — a channel's VIEW gate and, when locked, its POST
      //    gate, by role (the allow-list stays as the per-person override);
      //  · messages.everyone — the @everyone that really pinged.
      // Every existing page gets an @everyone with exactly what members
      // could already do, so nothing changes until a manager decides.
      db.exec(`
        CREATE TABLE IF NOT EXISTS page_roles (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          pageId     INTEGER NOT NULL,
          name       TEXT    NOT NULL,
          color      TEXT,
          position   INTEGER NOT NULL DEFAULT 0,
          perms      TEXT    NOT NULL DEFAULT '[]',
          isEveryone INTEGER NOT NULL DEFAULT 0,
          createdAt  INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_page_roles_page ON page_roles (pageId);
        CREATE TABLE IF NOT EXISTS page_member_roles (
          pageId INTEGER NOT NULL,
          userId INTEGER NOT NULL,
          roleId INTEGER NOT NULL REFERENCES page_roles(id) ON DELETE CASCADE,
          PRIMARY KEY (pageId, userId, roleId)
        );
        CREATE INDEX IF NOT EXISTS idx_pmr_role ON page_member_roles (roleId);
        CREATE TABLE IF NOT EXISTS channel_roles (
          channelId INTEGER NOT NULL,
          roleId    INTEGER NOT NULL REFERENCES page_roles(id) ON DELETE CASCADE,
          kind      TEXT    NOT NULL,
          PRIMARY KEY (channelId, roleId, kind)
        );
        CREATE INDEX IF NOT EXISTS idx_channel_roles_channel ON channel_roles (channelId);
        ALTER TABLE messages ADD COLUMN everyone INTEGER NOT NULL DEFAULT 0;
      `);
      const pages = db.prepare("SELECT id FROM pages").all() as { id: number }[];
      const ins = db.prepare(
        "INSERT INTO page_roles (pageId, name, color, position, perms, isEveryone, createdAt) VALUES (?, ?, NULL, 0, ?, 1, ?)",
      );
      for (const p of pages) ins.run(p.id, EVERYONE_NAME, JSON.stringify(DEFAULT_EVERYONE_PERMS), Date.now());
    },
  },
  {
    id: 91,
    name: "sterling_shelves",
    up: (db) => {
      // STERLING'S SHELVES (Josh, Sep 2026): the sell-back shelf of
      // migration 89 was a mythic faucet through the Forge (twenty-one
      // legendaries at double = a 4,200-silver mythic against a 500,000
      // counter). Sold emoji BURN again; what he sells is a fixed daily
      // spread (src/shelf.ts), each listing once per person per UTC day —
      // this table is that ledger. sterling_stock stays, dead, per the
      // never-edit rule; nothing reads it.
      db.exec(`
        CREATE TABLE IF NOT EXISTS sterling_purchases (
          userId INTEGER NOT NULL,
          day    INTEGER NOT NULL,
          code   TEXT NOT NULL,
          at     INTEGER NOT NULL,
          PRIMARY KEY (userId, day, code)
        );
      `);
    },
  },
  {
    id: 92,
    name: "vip_room",
    up: (db) => {
      // THE VIP ROOM (Josh, Sep 2026): the rank is a high-water mark of
      // completed collection tiers (src/vip.ts), stamped by the achievement
      // poke and never lowered. vipAt is when the current rank was reached.
      db.exec(`
        ALTER TABLE users ADD COLUMN vipTier INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN vipAt INTEGER;
      `);
    },
  },
  {
    id: 93,
    name: "vip_consolidations",
    up: (db) => {
      // THE HOUSE PAYS (the Tier-4 perk, Josh: "the house pays"): once per
      // generation the house settles a member's goblin debt INTO the vault.
      // That is a mint by the house — the only one the lender ever sees —
      // so it is ledgered here and carried by the economy audit as its own
      // term, exactly like the escape room's chest mint.
      db.exec(`
        CREATE TABLE IF NOT EXISTS vip_consolidations (
          userId     INTEGER NOT NULL,
          generation INTEGER NOT NULL,
          amount     INTEGER NOT NULL,
          at         INTEGER NOT NULL,
          PRIMARY KEY (userId, generation)
        );
      `);
    },
  },
  {
    id: 94,
    name: "retire_tier_lookalikes",
    up: (db) => {
      // NOTHING IN THE EMPORIUM LOOKS LIKE A TIER REWARD (Josh, Sep 2026).
      // The VIP Room's shelves are copper, silver, gold and prismatic; the
      // Emporium sold gold rings, a copper ring, silver and rainbow names,
      // gold and silver dice and a gold deck, which made the Room's prizes
      // look like something anybody could buy. The migration-48 shape:
      // owners are made whole at full DEFAULT price (frozen here — a
      // migration never reads the live catalog), the rows vanish, and
      // anything equipped is unequipped so nobody wears a cosmetic that no
      // longer exists. The CSS classes stay harmless.
      const REFUNDS: Record<string, number> = {
        "border-gilded": 450, "border-prism": 650, "border-copper": 300, "border-rosegold": 400, "border-aurora": 700,
        "flair-gilded": 600, "flair-sterling": 400, "flair-prism": 700, "flair-honey": 450,
        "dice-gold": 500, "dice-silver": 350, "cardback-gilded": 450,
      };
      const ids = Object.keys(REFUNDS);
      const marks = ids.map(() => "?").join(",");
      const owned = db
        .prepare(`SELECT userId, itemId FROM user_items WHERE itemId IN (${marks})`)
        .all(...ids) as { userId: number; itemId: string }[];
      for (const row of owned) {
        db.prepare("UPDATE users SET coins = coins + ? WHERE id = ?").run(REFUNDS[row.itemId], row.userId);
      }
      db.prepare(`DELETE FROM user_items WHERE itemId IN (${marks})`).run(...ids);
      db.prepare(`DELETE FROM item_prices WHERE itemId IN (${marks})`).run(...ids);
      const wearers = db
        .prepare("SELECT id, cosmetics FROM users WHERE cosmetics LIKE '%gilded%' OR cosmetics LIKE '%prism%' OR cosmetics LIKE '%copper%' OR cosmetics LIKE '%rosegold%' OR cosmetics LIKE '%aurora%' OR cosmetics LIKE '%sterling%' OR cosmetics LIKE '%honey%' OR cosmetics LIKE '%dice-gold%' OR cosmetics LIKE '%dice-silver%'")
        .all() as { id: number; cosmetics: string }[];
      const gone = new Set(ids);
      for (const { id, cosmetics } of wearers) {
        try {
          const c = JSON.parse(cosmetics || "{}") as Record<string, unknown>;
          let touched = false;
          for (const k of Object.keys(c)) {
            if (typeof c[k] === "string" && gone.has(c[k] as string)) {
              delete c[k];
              touched = true;
            }
          }
          if (touched) db.prepare("UPDATE users SET cosmetics = ? WHERE id = ?").run(JSON.stringify(c), id);
        } catch {
          /* unparseable cosmetics — leave the row alone */
        }
      }
    },
  },
  {
    id: 95,
    name: "snapshot_house_mints",
    up: (db) => {
      // THE DRIFT CHECK SEES THE HOUSE'S MINT (review, Sep 2026 — the
      // migration-75 vault lesson again): economyTotals carried houseMints but
      // the daily snapshot did not, so the first consolidation would have read
      // as an unexplained mint in every drift consumer forever. NULL on older
      // rows means "not measured" — and since no consolidation predates
      // migration 93, a NULL here is safely read as zero.
      db.exec("ALTER TABLE economy_snapshots ADD COLUMN houseMints INTEGER");
    },
  },
  {
    id: 96,
    name: "pandoras_box",
    up: (db) => {
      // PANDORA'S BOX (Josh, Sep 2026 — PANDORA.md): the three keys a member
      // holds (earnedAt) and has set into the box (insertedAt), and the
      // openings ledger — who opened it, when, what they chose (NULL = left
      // hope in the box). The world choices' flags live in app_kv.
      db.exec(`
        CREATE TABLE pandora_keys (
          userId     INTEGER NOT NULL,
          key        TEXT    NOT NULL,
          earnedAt   INTEGER NOT NULL,
          insertedAt INTEGER,
          PRIMARY KEY (userId, key)
        );
        CREATE TABLE pandora_openings (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL,
          at     INTEGER NOT NULL,
          choice TEXT
        );
        CREATE INDEX pandora_openings_user ON pandora_openings(userId);
      `);
    },
  },
  {
    id: 97,
    name: "abyss_portal",
    up: (db) => {
      // THE STONE OF THE ABYSS (Josh, Sep 2026; src/abyss.ts): who has spoken
      // the phrase — THE PORTAL is open for them from then on. The stone
      // itself is an emoji row (tier "abyss") in the ordinary inventory.
      db.exec(`
        CREATE TABLE abyss_portal (
          userId   INTEGER PRIMARY KEY,
          openedAt INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 98,
    name: "reaper_patience",
    up: (db) => {
      // THE REAPER'S PATIENCE (Josh, Sep 2026; src/wheel.ts): how many spins
      // this account has taken since it last held a talisman. The death
      // wedge's fire rate is almost nothing for the first REAPER_GRACE of
      // them and climbs fast after, so the player can SEE death coming and
      // do something about it.
      //
      // EVERYBODY STARTS AT ZERO, including accounts that have been bare for
      // months. Backfilling a number nobody could have watched accumulate
      // would open the new rules by killing the very players who have been
      // here longest, which is the opposite of the point.
      db.exec(`ALTER TABLE users ADD COLUMN bareSpins INTEGER NOT NULL DEFAULT 0;`);
    },
  },
  {
    id: 99,
    name: "async_grant",
    up: (db) => {
      // SILVER REPLACES RESEARCH CREDIT (Josh, Sep 2026; rules in
      // src/backrooms/grant.ts). Async's field programme is paid for out of a
      // FUNDED BUDGET rather than conjured: turn-ins draw from the grant,
      // purchases at Threshold-4 return to it, and the conserved constant
      // gains one term — the goblin vault's shape exactly.
      db.exec(`
        CREATE TABLE async_grant (
          id        INTEGER PRIMARY KEY CHECK (id = 1),
          silver    INTEGER NOT NULL,
          paid      INTEGER NOT NULL DEFAULT 0,
          recovered INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO async_grant (id, silver) VALUES (1, 250000);
      `);

      // The daily snapshot must carry the term the totals carry, or every
      // payout reads as an unexplained burn and every purchase as a mint,
      // forever (the migration-75 vault lesson, learned the hard way). NULL
      // on pre-99 rows means "not measured", never zero.
      //
      // Guarded with PRAGMA table_info the way migration 59 had to be: the
      // column outlives a dropped async_grant table, so a rewind that takes
      // the table without the column would make the re-run die on a
      // duplicate. The quotes are because "grant" is close enough to SQL
      // grammar to be worth never finding out about.
      const snapCols = (db.prepare("PRAGMA table_info(economy_snapshots)").all() as { name: string }[])
        .map((c) => c.name);
      if (!snapCols.includes("grant")) db.exec('ALTER TABLE economy_snapshots ADD COLUMN "grant" INTEGER;');

      // EXISTING RC BECOMES SILVER AT PAR, PAID OUT OF THE GRANT — so the
      // conversion is conservation-neutral and the seed is the only mint.
      // 1:1 because any other rate is a stealth rebalance of a loop nobody
      // asked to have rebalanced, and because at par nobody's balance moves.
      //
      // THE HOUSE'S RC DOES NOT CONVERT. `POST /api/admin/backrooms/rc` is a
      // playtest lever and prod's admin row held 993,430 of it against a
      // TOTAL money supply of 80,318 — converting it would have minted twelve
      // times every coin in the world. Bots are excluded for the same reason
      // they are excluded from every ranking: the house does not compete.
      // Scrubbed accounts are skipped; their holdings were burned on purpose.
      const owed = db
        .prepare(
          `SELECT p.userId AS userId, p.rc AS rc FROM backrooms_players p
             JOIN users u ON u.id = p.userId
            WHERE p.rc > 0 AND u.isAdmin = 0 AND u.isBot = 0 AND u.deletedAt IS NULL`,
        )
        .all() as { userId: number; rc: number }[];
      const payCoins = db.prepare("UPDATE users SET coins = coins + ? WHERE id = ?");
      const drawGrant = db.prepare(
        "UPDATE async_grant SET silver = silver - ?, paid = paid + ? WHERE id = 1",
      );
      for (const row of owed) {
        payCoins.run(row.rc, row.userId);
        drawGrant.run(row.rc, row.rc);
      }
      // The column stays (never edit an applied migration) but is dead from
      // here: nothing reads it, nothing writes it. Zeroing it is what stops a
      // future reader mistaking a stale balance for money somebody still has.
      db.exec("UPDATE backrooms_players SET rc = 0;");
    },
  },
  {
    id: 100,
    name: "foundry_exchange",
    up: (db) => {
      // THE FOUNDRY EXCHANGE (Josh, Sep 2026; design EXCHANGE.md, rules in
      // src/exchange/rules.ts).
      //
      // "a fake stock market that is based off of the real stock market …
      // users can can do all the betting they want, but with silver like
      // futures, puts, day trading etc."
      //
      // THE FLOAT is the whole reason this is allowed to exist beside the
      // faucet doctrine. A market that goes up is structurally a mint, so the
      // desk is funded like the goblin vault and the Async grant: silver
      // enters the world ONCE, here, and after that every coin paid to a
      // winner comes out of the float and every spread, commission, carry,
      // liquidation fee and losing trade goes back into it.
      //
      //   wallets + escrows + goblin vault + Async grant + FLOAT = constant
      //
      // Lend the float dry and the desk shuts until fees refill it — a legal
      // state and a good story, exactly like a run on the goblins' bank.
      db.exec(`
        CREATE TABLE exchange_float (
          id     INTEGER PRIMARY KEY CHECK (id = 1),
          silver INTEGER NOT NULL,
          paid   INTEGER NOT NULL DEFAULT 0,
          taken  INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO exchange_float (id, silver) VALUES (1, 500000);
      `);

      // THE ELEVENTH COIN ESCROW (after bail_pot, the tenth). Count it in
      // economyTotals, ledgerStats and the dead-player sweep.
      //
      // `margin` is the silver posted and it BLEEDS: carry is charged by
      // deducting from it rather than by billing a wallet that might be
      // empty, so a leveraged position left open long enough liquidates
      // itself — which is both what a real venue does and the correct drama.
      // `size` and `entry` are REAL because a share price has cents and a
      // 250-silver position in a 900-silver name has to be a fraction; every
      // WALLET movement is rounded to whole silver on the way out.
      db.exec(`
        CREATE TABLE exchange_positions (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          userId      INTEGER NOT NULL,
          symbol      TEXT    NOT NULL,
          instrument  TEXT    NOT NULL,
          side        TEXT    NOT NULL,
          size        REAL    NOT NULL,
          entry       REAL    NOT NULL,
          margin      INTEGER NOT NULL,
          leverage    REAL    NOT NULL,
          openedAt    INTEGER NOT NULL,
          carryPaidAt INTEGER NOT NULL,
          carryPaid   INTEGER NOT NULL DEFAULT 0,
          stopPrice   REAL,
          targetPrice REAL
        );
        CREATE INDEX idx_exchange_pos_user ON exchange_positions (userId);
        CREATE INDEX idx_exchange_pos_symbol ON exchange_positions (symbol);
      `);

      // OPTIONS ARE BOUGHT, NEVER WRITTEN. The premium is paid up front and
      // goes straight to the float, so a contract carries no margin and can
      // never be liquidated — the most a holder can lose is what they paid.
      // Letting players WRITE options would hand them unbounded downside on
      // an account that cannot go negative, which is a different design
      // conversation and not this one.
      db.exec(`
        CREATE TABLE exchange_options (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          userId    INTEGER NOT NULL,
          symbol    TEXT    NOT NULL,
          kind      TEXT    NOT NULL,
          strike    REAL    NOT NULL,
          expiry    INTEGER NOT NULL,
          contracts REAL    NOT NULL,
          premium   INTEGER NOT NULL,
          iv        REAL    NOT NULL,
          openedAt  INTEGER NOT NULL,
          settledAt INTEGER,
          payout    INTEGER
        );
        CREATE INDEX idx_exchange_opt_user ON exchange_options (userId);
        CREATE INDEX idx_exchange_opt_expiry ON exchange_options (expiry) WHERE settledAt IS NULL;
      `);

      // OUR OWN CANDLES, recorded from the tick stream. Free data tiers sell
      // history separately or not at all, so after a week of uptime this
      // table IS the history and no vendor can take it away. One row per
      // symbol-minute; longer frames are rolled up on read.
      db.exec(`
        CREATE TABLE exchange_candles (
          symbol TEXT    NOT NULL,
          bucket INTEGER NOT NULL,
          o REAL NOT NULL,
          h REAL NOT NULL,
          l REAL NOT NULL,
          c REAL NOT NULL,
          PRIMARY KEY (symbol, bucket)
        ) WITHOUT ROWID;
      `);

      // Resting ENTRY orders. Deliberately unreserved: they are re-validated
      // against the wallet and every cap at fill time and cancelled with a
      // notice if they no longer clear, which is what a real broker does with
      // insufficient buying power. Reserving would have made a twelfth escrow
      // out of an order that may never fill. Stops and targets on an OPEN
      // position are fields on the position row, not orders — they close
      // rather than open, so they need no funds behind them.
      db.exec(`
        CREATE TABLE exchange_orders (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          userId     INTEGER NOT NULL,
          symbol     TEXT    NOT NULL,
          instrument TEXT    NOT NULL,
          side       TEXT    NOT NULL,
          size       REAL    NOT NULL,
          limitPrice REAL    NOT NULL,
          leverage   REAL    NOT NULL,
          placedAt   INTEGER NOT NULL
        );
        CREATE INDEX idx_exchange_ord_user ON exchange_orders (userId);
        CREATE INDEX idx_exchange_ord_symbol ON exchange_orders (symbol);
      `);

      // The blotter: every fill, for the position history, the boards and an
      // audit trail the drift check can be argued against.
      db.exec(`
        CREATE TABLE exchange_trades (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          userId INTEGER NOT NULL,
          symbol TEXT    NOT NULL,
          action TEXT    NOT NULL,
          side   TEXT    NOT NULL,
          size   REAL    NOT NULL,
          price  REAL    NOT NULL,
          pnl    INTEGER,
          fees   INTEGER NOT NULL DEFAULT 0,
          at     INTEGER NOT NULL
        );
        CREATE INDEX idx_exchange_trades_user ON exchange_trades (userId, at);
      `);

      // THE MIGRATION-75 VAULT LESSON, APPLIED BEFORE IT BITES. A term the
      // totals carry and the snapshot doesn't reads as an unexplained mint
      // forever, so the float's column lands in the same commit that creates
      // the float. NULL on pre-100 rows means "not measured", never zero.
      // PRAGMA-guarded the way migration 59 had to be.
      const snapCols = (db.prepare("PRAGMA table_info(economy_snapshots)").all() as { name: string }[])
        .map((c) => c.name);
      if (!snapCols.includes("exchangeFloat")) {
        db.exec("ALTER TABLE economy_snapshots ADD COLUMN exchangeFloat INTEGER;");
      }
    },
  },
  {
    id: 101,
    name: "exchange_volume_and_splits",
    up: (db) => {
      // VOLUME. Half of how a chart is read, and the desk was discarding it:
      // every trade print carries its size and we only ever folded the price.
      // Backfilled history brings real volume with it, so this column starts
      // full rather than empty.
      const candleCols = (db.prepare("PRAGMA table_info(exchange_candles)").all() as { name: string }[]).map((c) => c.name);
      if (!candleCols.includes("v")) {
        db.exec("ALTER TABLE exchange_candles ADD COLUMN v REAL NOT NULL DEFAULT 0;");
      }

      // SPLITS ARE A MONEY PATH, so the adjustment is ledgered like one.
      //
      // Everything here is cash-settled, which means price is the whole
      // truth: a 10:1 forward split drops the print ninety per cent, the
      // sanity band's second print confirms it milliseconds later, and every
      // long on that symbol gaps clean through its liquidation line and pays
      // nothing. The board is mega-caps — exactly the names that split.
      //
      // The row is the idempotency. An adjustment applied twice would halve
      // everybody's entry price a second time and hand out a fortune, and a
      // restart mid-sweep is otherwise indistinguishable from a fresh split.
      db.exec(`
        CREATE TABLE exchange_splits (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol    TEXT    NOT NULL,
          exDate    TEXT    NOT NULL,
          ratio     REAL    NOT NULL,
          positions INTEGER NOT NULL DEFAULT 0,
          options   INTEGER NOT NULL DEFAULT 0,
          orders    INTEGER NOT NULL DEFAULT 0,
          appliedAt INTEGER NOT NULL,
          UNIQUE (symbol, exDate)
        );
      `);
    },
  },
  {
    id: 102,
    name: "page_bot_channel",
    up: (db) => {
      // WHERE THE HOUSE TALKS TO ITSELF (Josh, Sep 2026: "the ability for the
      // admin to designate a text channel for solace general to make the bot
      // only communicate their random talks in").
      //
      // Every unprompted thing the three voices say lands in one room, and
      // until now that room was whatever was called #general. The house has
      // grown a lot of opinions since — deaths, sales, heralds, the barker,
      // Voss's field notices — and this is the valve.
      //
      // NULL means "as before": the channel named #general on the page, else
      // its first unlocked one. It is deliberately NOT backfilled with that
      // channel's id, because the fallback has to stay a live RULE — a
      // renamed or deleted #general must re-resolve — and a stamped id would
      // freeze today's answer forever. Cleared when the nominated channel is
      // deleted, exactly like defaultChannelId above.
      db.exec(`ALTER TABLE pages ADD COLUMN botChannelId INTEGER;`);
    },
  },
  {
    id: 103,
    name: "map_editor",
    up: (db) => {
      // THE MAP EDITOR IN THE ADMIN PANEL (Josh, Sep 2026: "I would the
      // editor to be available in the admin panel so I can design and
      // redesigns maps").
      //
      // A level's ROOM LIBRARY — the hand-drawn rooms its generator arranges
      // — used to live only in the repo (src/backrooms/pipes-rooms.json), so
      // redesigning a map meant a code change and a deploy. It lives here now:
      //
      //   map_drafts    ONE work-in-progress library per level. Saving never
      //                 touches the live map; only publishing does.
      //   map_versions  every PUBLISHED library, in order, with the seed it
      //                 was built on and the fingerprint the build produced.
      //                 The newest row is the live map. The fingerprint is
      //                 re-checked at every boot, so a change to the
      //                 GENERATOR can never quietly move the walls under
      //                 players — the level shuts instead, as the frozen repo
      //                 maps always have. Each version gets its own sector id,
      //                 which is what gives a new map fresh fog, paint and
      //                 bodies without deleting the old ones' rows.
      //
      // No row for a level = the repo's frozen map, exactly as before.
      db.exec(`
        CREATE TABLE map_drafts (
          level   INTEGER PRIMARY KEY,
          tiles   TEXT    NOT NULL,
          seed    INTEGER NOT NULL,
          savedAt INTEGER NOT NULL,
          savedBy INTEGER
        );
        CREATE TABLE map_versions (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          level       INTEGER NOT NULL,
          version     INTEGER NOT NULL,
          sectorId    TEXT    NOT NULL,
          seed        INTEGER NOT NULL,
          tiles       TEXT    NOT NULL,
          fingerprint TEXT    NOT NULL,
          note        TEXT,
          publishedAt INTEGER NOT NULL,
          publishedBy INTEGER,
          UNIQUE (level, version)
        );
      `);
    },
  },
  {
    id: 104,
    name: "map_surfaces",
    up: (db) => {
      // CUSTOM TEXTURES (Josh, Sep 2026: "add a texture in the editor"): a
      // photo uploaded in the map editor becomes a wall, floor or ceiling any
      // room on any level can wear. The FILE lives in uploads/surfaces (served
      // at /api/br-surface/<file>); this row is its name and its real size.
      // Rows are never deleted: a room design names a surface by "c<id>", and
      // a published map that names one must keep finding it.
      db.exec(`
        CREATE TABLE map_surfaces (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          kind      TEXT    NOT NULL,
          name      TEXT    NOT NULL,
          file      TEXT    NOT NULL,
          sizeM     REAL    NOT NULL,
          level     INTEGER NOT NULL DEFAULT 0,
          createdAt INTEGER NOT NULL,
          createdBy INTEGER
        );
      `);
    },
  },
  {
    id: 105,
    name: "backrooms_deaths_where",
    up: (db) => {
      // THE HEATMAP (the map editor's "what players did" view) needs to know
      // WHICH map a death happened on: a position alone means nothing once a
      // level has three maps behind it. Recorded going forward only — the
      // deaths before this can't be placed on any map, and inventing a level
      // for them would put marks where nobody died.
      const cols = (db.prepare("PRAGMA table_info(backrooms_deaths)").all() as { name: string }[]).map((c) => c.name);
      if (!cols.includes("level")) db.exec("ALTER TABLE backrooms_deaths ADD COLUMN level INTEGER");
      if (!cols.includes("sector")) db.exec("ALTER TABLE backrooms_deaths ADD COLUMN sector TEXT");
      db.exec("CREATE INDEX IF NOT EXISTS idx_br_deaths_sector ON backrooms_deaths (sector)");
    },
  },
  {
    id: 106,
    name: "npc_memory",
    up: (db) => {
      // THE HOUSE'S BRAINS, MEMORY (Oct 2026). What each of the three keeps
      // about one person from their PRIVATE conversations — a few short
      // lines the model rewrites after a DM goes quiet. Josh: "as long as
      // private dm data stays private". One row per (person, character):
      // never read into a channel prompt, shown to its owner, erased by them
      // and by an account deletion. `coveredId` is the newest DM id already
      // folded in, so a forget can't be undone by re-reading old messages.
      db.exec(`
        CREATE TABLE IF NOT EXISTS npc_memory (
          userId    INTEGER NOT NULL,
          npc       TEXT    NOT NULL,
          notes     TEXT    NOT NULL DEFAULT '',
          coveredId INTEGER NOT NULL DEFAULT 0,
          updatedAt INTEGER NOT NULL,
          PRIMARY KEY (userId, npc)
        );
      `);
    },
  },
  {
    id: 107,
    name: "npc_affinity",
    up: (db) => {
      // THE AFFINITY METER (Josh, Oct 2026; rules in src/npc/affinity.ts).
      // One meter per (player, character); `lastGainAt` is the fade's clock.
      // `npc_affinity_day` is the per-source daily cap — the row for today
      // holds what that source has already given, so a cap survives a restart.
      db.exec(`
        CREATE TABLE IF NOT EXISTS npc_affinity (
          userId     INTEGER NOT NULL,
          npc        TEXT    NOT NULL,
          points     INTEGER NOT NULL DEFAULT 0,
          lastGainAt INTEGER NOT NULL,
          updatedAt  INTEGER NOT NULL,
          PRIMARY KEY (userId, npc)
        );
        CREATE TABLE IF NOT EXISTS npc_affinity_day (
          userId INTEGER NOT NULL,
          npc    TEXT    NOT NULL,
          source TEXT    NOT NULL,
          day    TEXT    NOT NULL,
          points INTEGER NOT NULL,
          PRIMARY KEY (userId, npc, source, day)
        );
      `);
    },
  },
  {
    id: 108,
    name: "rollo_memory",
    up: (db) => {
      // ROLLO'S BIGGER MEMORY (Josh, Oct 2026: "add more memory to his AI so
      // that he remembers more about players, conversations, and events").
      // His mind used to be one JSON blob in app_kv rewritten whole every 30s;
      // at 2,000 people and 1,000 events that's megabytes a save, so the two
      // big parts get their own tables and only what CHANGED is written. The
      // blob keeps the rest (who he's become, his books). Old blobs are moved
      // over by the runtime the first time it starts (src/npc/rollo.ts).
      db.exec(`
        CREATE TABLE IF NOT EXISTS rollo_people (
          userId   INTEGER PRIMARY KEY,
          data     TEXT    NOT NULL,
          lastSeen INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS rollo_events (
          n    INTEGER PRIMARY KEY,
          at   INTEGER NOT NULL,
          text TEXT    NOT NULL
        );
      `);
    },
  },
  {
    id: 109,
    name: "floor_cast_memory",
    up: (db) => {
      // THE FLOOR CAST (Josh, Oct 2026: "4 in rotation … 2 npcs max at the
      // casino"). Rollo stopped being the only regular, so his two memory
      // tables become everybody's, keyed by WHO is remembering (src/npc/
      // floornpc.ts). His rows are copied across; rollo_people / rollo_events
      // stay behind, dead, per the never-edit rule.
      db.exec(`
        CREATE TABLE IF NOT EXISTS npc_people (
          npc      TEXT    NOT NULL,
          userId   INTEGER NOT NULL,
          data     TEXT    NOT NULL,
          lastSeen INTEGER NOT NULL,
          PRIMARY KEY (npc, userId)
        );
        CREATE TABLE IF NOT EXISTS npc_events (
          npc  TEXT    NOT NULL,
          n    INTEGER NOT NULL,
          at   INTEGER NOT NULL,
          text TEXT    NOT NULL,
          PRIMARY KEY (npc, n)
        );
        INSERT OR IGNORE INTO npc_people (npc, userId, data, lastSeen) SELECT 'rollo', userId, data, lastSeen FROM rollo_people;
        INSERT OR IGNORE INTO npc_events (npc, n, at, text) SELECT 'rollo', n, at, text FROM rollo_events;
      `);
    },
  },
  {
    id: 110,
    name: "wallet_transfers",
    up: (db) => {
      // THE WALLET (Josh, Oct 2026: "a wallet system in solace where players
      // can send each other money"). Silver moves wallet to wallet in one
      // transaction (src/routes/wallet.ts) — a transfer, never a mint — and
      // every one leaves a row here, so both people can see what they sent
      // and what they got. Private like coins: a row is only ever shown to
      // the two people on it.
      db.exec(`
        CREATE TABLE IF NOT EXISTS wallet_transfers (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          fromId INTEGER NOT NULL,
          toId   INTEGER NOT NULL,
          amount INTEGER NOT NULL,
          note   TEXT,
          at     INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS wallet_transfers_from ON wallet_transfers (fromId, at);
        CREATE INDEX IF NOT EXISTS wallet_transfers_to ON wallet_transfers (toId, at);
      `);
    },
  },
  {
    id: 111,
    name: "seasons",
    up: (db) => {
      // SEASONS (SEASONS.md; Josh, Oct 2026): the casino's AI regulars race
      // four-week seasons and the worst is deleted. Their season silver is
      // MINTED and lives in a SEASON PURSE — a second, hidden bot account per
      // regular (users.purseOf = the regular's id) — so every game's own money
      // code can carry it while no player can ever be on the other side of it.
      // season_mints is the ledger of every coin minted into a purse; the
      // economy audit counts it beside the house's other mint.
      const cols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
      if (!cols.includes("purseOf")) db.exec("ALTER TABLE users ADD COLUMN purseOf TEXT");
      db.exec(`
        CREATE TABLE IF NOT EXISTS seasons (
          id        INTEGER PRIMARY KEY,
          startedAt INTEGER NOT NULL,
          endsAt    INTEGER NOT NULL,
          status    TEXT    NOT NULL,
          champion  TEXT,
          loser     TEXT,
          standings TEXT
        );
        CREATE TABLE IF NOT EXISTS season_regulars (
          seasonId   INTEGER NOT NULL,
          npc        TEXT    NOT NULL,
          purseId    INTEGER NOT NULL,
          generation INTEGER NOT NULL DEFAULT 0,
          genome     TEXT    NOT NULL,
          tally      TEXT    NOT NULL,
          state      TEXT    NOT NULL,
          PRIMARY KEY (seasonId, npc)
        );
        CREATE TABLE IF NOT EXISTS season_mints (
          id       INTEGER PRIMARY KEY AUTOINCREMENT,
          seasonId INTEGER NOT NULL,
          npc      TEXT    NOT NULL,
          purseId  INTEGER NOT NULL,
          amount   INTEGER NOT NULL,
          why      TEXT    NOT NULL,
          at       INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS season_mints_season ON season_mints (seasonId, npc);
      `);
    },
  },
  {
    id: 112,
    name: "backrooms_carried_relics",
    up: (db) => {
      // RELICS IN HAND SURVIVE A RESTART (Josh, Oct 2026: "relics do not leave
      // with player"). A run lives in memory, so a deploy or crash used to
      // drop every relic somebody was carrying — the locker gear came home
      // (it never left the locker) and only the relics vanished. The service
      // mirrors each run's carried relics here (every few seconds, at
      // shutdown, and cleared the moment a run ends), and at boot whatever is
      // left is banked exactly as walking out would have banked it.
      db.exec(`
        CREATE TABLE IF NOT EXISTS backrooms_carried (
          userId INTEGER NOT NULL,
          slug   TEXT    NOT NULL,
          n      INTEGER NOT NULL,
          level  INTEGER NOT NULL,
          at     INTEGER NOT NULL,
          PRIMARY KEY (userId, n)
        );
      `);
    },
  },
  {
    id: 113,
    name: "portal_hall",
    up: (db) => {
      // THE PORTAL (PORTAL.md; src/portal/): the far side of the Stone of the
      // Abyss. The archive itself is a read-only bundle (assets/portal); these
      // are the living parts. A member is filed once, with the next keystone
      // after the hall's own (the cast keystones' numbers). A glyph cracked is
      // cracked for EVERYONE (shared decipherment). A word's meaning is each
      // reader's own. Guesses are rationed per day. Players' posts are stored
      // in romanised Eshai — never sent, only drawn as glyphs.
      db.exec(`
        CREATE TABLE IF NOT EXISTS portal_members (
          userId   INTEGER PRIMARY KEY,
          keystone INTEGER NOT NULL UNIQUE,
          filedAt  INTEGER NOT NULL,
          lastSeen INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS portal_glyphs (
          glyph  INTEGER PRIMARY KEY,
          userId INTEGER,
          source TEXT    NOT NULL,
          at     INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS portal_words (
          userId INTEGER NOT NULL,
          word   TEXT    NOT NULL,
          at     INTEGER NOT NULL,
          PRIMARY KEY (userId, word)
        );
        CREATE TABLE IF NOT EXISTS portal_guesses (
          userId INTEGER NOT NULL,
          day    TEXT    NOT NULL,
          kind   TEXT    NOT NULL,
          wrong  INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (userId, day, kind)
        );
        CREATE TABLE IF NOT EXISTS portal_posts (
          id     INTEGER PRIMARY KEY AUTOINCREMENT,
          room   TEXT    NOT NULL,
          userId INTEGER NOT NULL,
          text   TEXT    NOT NULL,
          at     INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS portal_posts_room ON portal_posts (room, id);
        CREATE TABLE IF NOT EXISTS portal_reactions (
          target TEXT    NOT NULL,
          userId INTEGER NOT NULL,
          sign   TEXT    NOT NULL,
          at     INTEGER NOT NULL,
          PRIMARY KEY (target, userId, sign)
        );
      `);
    },
  },
  {
    id: 114,
    name: "portal_survey",
    up: (db) => {
      // THE PORTAL's survey (src/portal/survey.ts): which galaxies each reader
      // has charted. The numeral a galaxy reads is cracked for everyone in
      // portal_glyphs; this is only the reader's own chart, which is personal.
      db.exec(`
        CREATE TABLE IF NOT EXISTS portal_survey (
          userId INTEGER NOT NULL,
          galaxy TEXT    NOT NULL,
          at     INTEGER NOT NULL,
          PRIMARY KEY (userId, galaxy)
        );
      `);
    },
  },
  {
    id: 115,
    name: "portal_games",
    up: (db) => {
      // THE PORTAL, the rest of the build (src/portal/): the fold school's
      // notation marks the community has cracked (a second cipher, shared
      // like portal_glyphs); what each reader has finished (bench exercises,
      // ring-game opponents, the primer, Paelu's move — with a little data);
      // live ring games between members; and Tharvend's repairs, one row per
      // glitch a reader met, read back into its log.
      db.exec(`
        CREATE TABLE IF NOT EXISTS portal_notation (
          mark   INTEGER PRIMARY KEY,
          userId INTEGER,
          source TEXT    NOT NULL,
          at     INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS portal_done (
          userId INTEGER NOT NULL,
          what   TEXT    NOT NULL,
          data   TEXT,
          at     INTEGER NOT NULL,
          PRIMARY KEY (userId, what)
        );
        CREATE TABLE IF NOT EXISTS portal_ishaal (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          evenId    INTEGER NOT NULL,
          oddId     INTEGER,
          moves     TEXT    NOT NULL DEFAULT '[]',
          status    TEXT    NOT NULL,
          winner    TEXT,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS portal_repairs (
          id      INTEGER PRIMARY KEY AUTOINCREMENT,
          at      INTEGER NOT NULL,
          kind    TEXT    NOT NULL,
          subject TEXT    NOT NULL
        );
      `);
    },
  },
  {
    id: 116,
    name: "survivorz_character_list",
    up: (db) => {
      // SOLACE SURVIVORZ — THE CHARACTER LIST (Admin Panel → Characters; Josh, Nov 2026: "put the
      // character creator in the admin panel to make it easy for me to create a list"). The show's
      // characters are files in git (src/survivorz/cast/<id>.json), so the server never writes them:
      // a character made or changed in the panel waits here until scripts/survivorz/pull-cast.mjs
      // brings it into the repo (a new one also needs its body baked and its voice put on slopbot).
      // data = the character's JSON; regardIn = what the others think of them, applied to THEIR files.
      db.exec(`
        CREATE TABLE IF NOT EXISTS survivorz_characters (
          id        TEXT    PRIMARY KEY,
          data      TEXT    NOT NULL,
          regardIn  TEXT    NOT NULL DEFAULT '{}',
          updatedAt INTEGER NOT NULL,
          updatedBy INTEGER
        );
      `);
    },
  },
  {
    id: 117,
    name: "exchange_closed",
    up: (db) => {
      // THE FOUNDRY EXCHANGE IS CLOSED (Josh, Nov 2026: "no one is using it and
      // its not very useful"). Migrations 100/101 stay as written; this one
      // winds the desk down without minting or burning a coin:
      //   · every open position's margin comes home to its owner (escrow ->
      //     wallet, closed at entry like a death always did),
      //   · every unexpired option's premium is refunded out of the float
      //     (float -> wallet),
      //   · whatever is left in the float moves into Async's grant, a funded
      //     pool the totals already count — so the conserved constant is the
      //     same number the day after as the day before,
      //   · and the desk's tables go.
      // economy_snapshots.exchangeFloat stays (old rows carry it); new rows
      // write 0, which is exactly what the float now holds.
      const has = (t: string): boolean =>
        !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
      const pay = db.prepare("UPDATE users SET coins = coins + ? WHERE id = ?");
      if (has("exchange_positions")) {
        const rows = db.prepare("SELECT userId, SUM(margin) AS m FROM exchange_positions GROUP BY userId").all() as { userId: number; m: number }[];
        for (const r of rows) if (r.m > 0) pay.run(r.m, r.userId);
      }
      let float = has("exchange_float")
        ? ((db.prepare("SELECT COALESCE(SUM(silver),0) AS s FROM exchange_float").get() as { s: number }).s)
        : 0;
      if (has("exchange_options")) {
        const rows = db.prepare("SELECT userId, SUM(premium) AS p FROM exchange_options WHERE settledAt IS NULL GROUP BY userId").all() as { userId: number; p: number }[];
        const owed = rows.reduce((n, r) => n + r.p, 0);
        // The float can only pay what it holds; a shortfall is shared out.
        const share = owed > float && owed > 0 ? float / owed : 1;
        for (const r of rows) {
          const amt = Math.floor(r.p * share);
          if (amt > 0) { pay.run(amt, r.userId); float -= amt; }
        }
      }
      if (float > 0 && has("async_grant")) {
        db.prepare("UPDATE async_grant SET silver = silver + ? WHERE id = 1").run(float);
      }
      for (const t of ["exchange_positions", "exchange_options", "exchange_orders", "exchange_trades", "exchange_candles", "exchange_splits", "exchange_float"]) {
        db.exec(`DROP TABLE IF EXISTS ${t};`);
      }
    },
  },
  {
    id: 118,
    name: "survivorz_bodies",
    up: (db) => {
      // THE CHARACTER CREATOR'S BODIES (Josh, Nov 3 2026: "I can drop in rigged 3d models for
      // processing", docs/survivorz/CREATOR.md). A model dropped in the Admin Panel waits here as
      // "queued"; the worker on Josh's PC (scripts/survivorz/creator/worker.mjs) claims it, bakes it
      // (scripts/survivorz/creator/bake.mjs), reports each step, and sends the packed body back to
      // game/<id>.glb on this server. steps = the bake's status.json; report = the intake's findings.
      db.exec(`
        CREATE TABLE IF NOT EXISTS survivorz_bodies (
          id          TEXT    PRIMARY KEY,
          status      TEXT    NOT NULL,
          sourceName  TEXT    NOT NULL,
          sourceFile  TEXT    NOT NULL,
          sourceBytes INTEGER NOT NULL,
          heightM     REAL,
          licence     TEXT,
          credit      TEXT,
          steps       TEXT    NOT NULL DEFAULT '{}',
          report      TEXT,
          error       TEXT,
          worker      TEXT,
          claimedAt   INTEGER,
          createdAt   INTEGER NOT NULL,
          createdBy   INTEGER,
          updatedAt   INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: 119,
    name: "regulars_closed",
    up: (db) => {
      // THE CASINO REGULARS ARE GONE (Josh, Nov 2026): Rollo, Duke, Tasha and
      // Chase no longer walk the floor, and the Seasons show built on them is
      // gone with them. Their personalities stay in src/npc/characters.ts.
      // This winds it down without minting or burning a coin:
      //   · every coin they or their season purses hold — wallet and any open
      //     table escrow — moves into Async's grant, where their first silver
      //     came from (the totals count the grant, so the constant holds),
      //   · a goblin loan of theirs is written off (no coin moves),
      //   · their memory goes (people, events, minds, DM notes),
      //   · and their bot rows are hidden from every roster (deletedAt), kept
      //     so their old messages still carry a name.
      // The season tables stay as written; season_mints is still the mint
      // ledger the drift check subtracts.
      const has = (t: string): boolean =>
        !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
      const cols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
      const regulars = db.prepare("SELECT id FROM users WHERE isBot = 1 AND username IN ('rollo','duke','tasha','chase')").all() as { id: number }[];
      const purses = cols.includes("purseOf")
        ? (db.prepare("SELECT id FROM users WHERE purseOf IS NOT NULL").all() as { id: number }[])
        : [];
      const ids = [...regulars, ...purses].map((r) => r.id);
      let silver = 0;
      if (ids.length) {
        const marks = ids.map(() => "?").join(",");
        const sum = (sql: string): number => ((db.prepare(sql).get(...ids) as { s: number | null }).s ?? 0);
        silver += sum(`SELECT SUM(coins) AS s FROM users WHERE id IN (${marks})`);
        db.prepare(`UPDATE users SET coins = 0 WHERE id IN (${marks})`).run(...ids);
        for (const [t, col] of [["blackjack_bets", "userId"], ["roulette_bets", "userId"], ["derby_bets", "userId"], ["bonepit_stakes", "userId"], ["side_bets", "bettorId"], ["bail_pot", "payerId"]] as const) {
          if (!has(t)) continue;
          silver += sum(`SELECT SUM(amount) AS s FROM ${t} WHERE ${col} IN (${marks})`);
          db.prepare(`DELETE FROM ${t} WHERE ${col} IN (${marks})`).run(...ids);
        }
        if (has("loans")) db.prepare(`DELETE FROM loans WHERE userId IN (${marks})`).run(...ids);
      }
      if (silver > 0 && has("async_grant")) db.prepare("UPDATE async_grant SET silver = silver + ? WHERE id = 1").run(silver);
      for (const t of ["npc_people", "npc_events", "rollo_people", "rollo_events"]) db.exec(`DROP TABLE IF EXISTS ${t};`);
      if (has("npc_memory")) db.prepare("DELETE FROM npc_memory WHERE npc IN ('rollo','duke','tasha','chase')").run();
      if (has("app_kv")) {
        db.prepare("DELETE FROM app_kv WHERE key IN ('rollo_mind','duke_mind','tasha_mind','chase_mind') OR key LIKE 'season%'").run();
      }
      if (regulars.length && cols.includes("deletedAt")) {
        db.prepare(`UPDATE users SET deletedAt = ? WHERE deletedAt IS NULL AND id IN (${regulars.map(() => "?").join(",")})`)
          .run(Date.now(), ...regulars.map((r) => r.id));
      }
    },
  },
  {
    id: 120,
    name: "survivorz_bodies_pause",
    up: (db) => {
      // PAUSING A BAKE (Josh, Nov 3 2026: "allow me to pause a bake to free up the GPU"). paused says
      // who stopped it ("me" = the admin's Pause, "game" = the worker saw a game start, and resumes it
      // itself when the game closes); resumeFrom is the step it was on, which restarts from scratch.
      // (119 is the regulars' closing, written in parallel; this one takes 120.)
      const cols = new Set((db.prepare("PRAGMA table_info(survivorz_bodies)").all() as { name: string }[]).map((c) => c.name));
      if (!cols.has("paused")) db.exec("ALTER TABLE survivorz_bodies ADD COLUMN paused TEXT");
      if (!cols.has("resumeFrom")) db.exec("ALTER TABLE survivorz_bodies ADD COLUMN resumeFrom TEXT");
    },
  },
  {
    id: 121,
    name: "survivorz_bodies_queue",
    up: (db) => {
      // THE BAKE QUEUE IN AN ORDER YOU CHOOSE (Josh, Nov 4 2026: "a queue so multiple bodies can be
      // baked"). The PC bakes one body at a time (each already fills the 3090 Ti); queueOrder is the
      // line, smallest first, and the panel moves bodies up and down it. Backfilled in drop order.
      const cols = new Set((db.prepare("PRAGMA table_info(survivorz_bodies)").all() as { name: string }[]).map((c) => c.name));
      if (!cols.has("queueOrder")) db.exec("ALTER TABLE survivorz_bodies ADD COLUMN queueOrder INTEGER");
      const rows = db.prepare("SELECT id FROM survivorz_bodies ORDER BY createdAt").all() as { id: string }[];
      const set = db.prepare("UPDATE survivorz_bodies SET queueOrder = ? WHERE id = ? AND queueOrder IS NULL");
      rows.forEach((r, i) => set.run(i, r.id));
    },
  },
  {
    id: 122,
    name: "survivorz_skills_only",
    up: (db) => {
      // SKILLS AND GENES, NOTHING ELSE (Josh, Nov 5 2026: "lets remove perks and body stats just put them in a
      // big list of skills"). Every saved character in the panel's list is rewritten in the new shape
      // (cast/rules.ts upgradeCharacter: combat → melee + firearms + the Courage gene, nimble → agility + escape,
      // thinking → quick learner, creative + Scavenger → scavenging, the perks into their skills, `world` gone),
      // and a SEALED SUIT moves onto the body: `suited` on survivorz_bodies (Bodies → "wears a sealed suit").
      // A row a character from before the conversion carried "suited" in its perks ticks its body.
      const cols = new Set((db.prepare("PRAGMA table_info(survivorz_bodies)").all() as { name: string }[]).map((c) => c.name));
      if (!cols.has("suited")) db.exec("ALTER TABLE survivorz_bodies ADD COLUMN suited INTEGER NOT NULL DEFAULT 0");
      const rows = db.prepare("SELECT id, data FROM survivorz_characters").all() as { id: string; data: string }[];
      const put = db.prepare("UPDATE survivorz_characters SET data = ? WHERE id = ?");
      const suit = db.prepare("UPDATE survivorz_bodies SET suited = 1 WHERE id = ?");
      for (const r of rows) {
        let c: Record<string, unknown>;
        try { c = JSON.parse(r.data) as Record<string, unknown>; } catch { continue; }
        if (c.deleted === true) continue;
        const t = (c.traits ?? {}) as Record<string, unknown>;
        const wasSuited = (Array.isArray(c.perks) && (c.perks as unknown[]).includes("suited")) || t.suited === true;
        if (wasSuited && typeof c.body === "string") suit.run(c.body);
        const next = upgradeCharacter(c);
        if (next !== c) put.run(JSON.stringify(next), r.id);
      }
    },
  },
];

/** Parse a stored prefs JSON blob defensively — a corrupt value becomes {}. */
function parsePrefs(raw: unknown): UserPrefs {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as UserPrefs) : {};
  } catch {
    return {};
  }
}

/** A stored attachment file to dispose of (F3): satelliteId NULL = the hub's
 *  own disk (unlink it), set = it lives on that satellite (RPC the delete). */
export interface AttachmentFileRef {
  file: string;
  satelliteId: number | null;
}

/**
 * The single gateway to the database. Everything above this layer (auth, HTTP,
 * the realtime bus) talks to a `Store` instance and never touches SQL directly.
 */
export class Store {
  private db: DatabaseSync;

  /** Memoized prepare (Sep 2026 pages perf pass). node:sqlite compiles the
   *  SQL on EVERY `prepare()` call and this store's methods re-prepared their
   *  statements per call — ~587 sites, so a private-page message paid four
   *  fresh compiles just to compute its broadcast audience. Statements are
   *  synchronous, fully-materializing and auto-resetting, so caching by SQL
   *  string is safe; dynamic SQL (IN-list builders, UPDATE assemblers) just
   *  adds a few bounded extra entries. SQLite re-prepares cached statements
   *  itself if the schema changes underneath them. */
  private stmtCache = new Map<string, ReturnType<DatabaseSync["prepare"]>>();
  private prep(sql: string): ReturnType<DatabaseSync["prepare"]> {
    let s = this.stmtCache.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.stmtCache.set(sql, s);
    }
    return s;
  }

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    // WAL gives us concurrent reads during writes; foreign_keys enforces our
    // ON DELETE CASCADE rules (off by default in SQLite).
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    // A second connection (the nightly backup's .backup, a harness's probe)
    // used to surface as an INSTANT SQLITE_BUSY exception inside a route;
    // now it waits up to 5s. And the WAL is trimmed back to 64MB after a
    // checkpoint instead of growing to whatever the busiest hour left.
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec("PRAGMA journal_size_limit = 67108864;");
    this.migrate();
    this.repairSnapshotColumns();
  }

  /** THE MIS-FILED SNAPSHOTS (Oct 2026 review). From the day the "grant"
   *  column joined the daily snapshot, the insert named eight columns and
   *  passed seven values: the house's mint total landed in "grant" and
   *  houseMints stored NULL. A real row always writes houseMints (it is a
   *  number), so NULL beside a non-NULL grant is exactly a mis-filed row:
   *  move the figure where it belongs and mark the grant unmeasured. Once. */
  private repairSnapshotColumns(): void {
    if (this.kvGet("snapfix_grant_2026_10")) return;
    this.db.exec('UPDATE economy_snapshots SET houseMints = "grant", "grant" = NULL WHERE houseMints IS NULL AND "grant" IS NOT NULL');
    this.kvSet("snapfix_grant_2026_10", "1");
  }

  /** Apply any migrations that haven't run yet. Safe to call on every boot. */
  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id        INTEGER PRIMARY KEY,
        name      TEXT    NOT NULL,
        appliedAt INTEGER NOT NULL
      );
    `);

    const rows = this.prep("SELECT id FROM _migrations").all() as { id: number }[];
    const applied = new Set(rows.map((r) => r.id));

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) continue;
      this.db.exec("BEGIN");
      try {
        migration.up(this.db);
        this.prep("INSERT INTO _migrations (id, name, appliedAt) VALUES (?, ?, ?)")
          .run(migration.id, migration.name, Date.now());
        this.db.exec("COMMIT");
        console.log(`[db] applied migration ${migration.id}: ${migration.name}`);
      } catch (err) {
        this.db.exec("ROLLBACK");
        throw new Error(
          `migration ${migration.id} (${migration.name}) failed: ${(err as Error).message}`,
        );
      }
    }
  }

  // ---- Users -------------------------------------------------------------

  /** SQLite stores booleans as 0/1; convert a raw row into a typed User. */
  private rowToUser(r: Record<string, unknown>): User {
    return {
      id: r.id as number,
      username: r.username as string,
      displayName: r.displayName as string,
      passwordHash: r.passwordHash as string,
      isAdmin: !!r.isAdmin,
      isBot: !!r.isBot,
      role: (r.role as string | null) ?? "user",
      disabled: !!r.disabled,
      locked: !!r.locked,
      suspendedUntil: (r.suspendedUntil as number | null) ?? null,
      createdAt: r.createdAt as number,
      diedAt: (r.diedAt as number | null) ?? null,
      generation: (r.generation as number | null) ?? 1,
      graveSealsAt: (r.graveSealsAt as number | null) ?? null,
      jailedAt: (r.jailedAt as number | null) ?? null,
      jailSealsAt: (r.jailSealsAt as number | null) ?? null,
      avatar: (r.avatar as string | null) ?? null,
      banner: (r.banner as string | null) ?? null,
      bio: (r.bio as string | null) ?? null,
      coins: (r.coins as number | null) ?? 0,
      prefs: parsePrefs(r.prefs),
      epitaph: (r.epitaph as string | null) ?? null,
      willBeneficiaryId: (r.willBeneficiaryId as number | null) ?? null,
      cosmetics: parsePrefs(r.cosmetics) as Cosmetics, // same defensive JSON parse
      secretHash: (r.secretHash as string | null) ?? null,
      deletedAt: (r.deletedAt as number | null) ?? null,
      termsVersion: (r.termsVersion as number | null) ?? null,
      termsAcceptedAt: (r.termsAcceptedAt as number | null) ?? null,
      vipTier: (r.vipTier as number | null) ?? 0,
    };
  }

  // ---- THE VIP ROOM (migration 92) --------------------------------------------

  /** Owned-vs-catalog per collectible tier (the four the Room ranks by;
   *  specials are nobody's tier). One grouped query. */
  vipProgress(userId: number): { tier: string; owned: number; total: number }[] {
    const rows = this.prep(
        `SELECT e.tier AS tier, COUNT(*) AS total, COUNT(ue.code) AS owned
           FROM emoji e LEFT JOIN user_emoji ue ON ue.code = e.code AND ue.userId = ?
          WHERE e.tier IN ('common', 'rare', 'legendary', 'mythic')
          GROUP BY e.tier`,
      )
      .all(userId) as { tier: string; total: number; owned: number }[];
    const order = ["common", "rare", "legendary", "mythic"];
    const out = order.map((t) => {
      const r = rows.find((x) => x.tier === t);
      return { tier: t, owned: r?.owned ?? 0, total: r?.total ?? 0 };
    });
    // THE RELICS JOIN THE LADDER (Josh, Sep 2026): a fifth row — relics
    // unlocked against every relic the maps hold — read by vipRankOf.
    // (owned counts only relics IN the total — a level whose relics spawn
    // before it joins ALL_RELICS must not push the bar past full)
    // A later level counts once its ship gate is open to members — the flag
    // is lore.ts's *_OPEN_FLAG, "level<N>_open_to_members" (the store stays
    // free of the map code that file pulls in).
    const list = countedRelics((level) => !!this.brGetFlag(`level${level}_open_to_members`));
    const counted = new Set(list.map((r) => r.slug));
    const mine = this.prep("SELECT relicId FROM backrooms_relics WHERE userId = ?").all(userId) as { relicId: string }[];
    const relics = mine.filter((r) => counted.has(r.relicId)).length;
    out.push({ tier: "relic", owned: relics, total: list.length });
    return out;
  }

  /** Raise the high-water mark. Returns true only when it actually rose —
   *  the guarded UPDATE is what keeps the welcome firing exactly once. */
  raiseVipTier(userId: number, tier: number): boolean {
    const info = this.prep("UPDATE users SET vipTier = ?, vipAt = ? WHERE id = ? AND vipTier < ?")
      .run(tier, Date.now(), userId, tier);
    return info.changes > 0;
  }

  /** Has this life already had the house settle its goblin debt? */
  vipConsolidationUsed(userId: number, generation: number): boolean {
    return !!this.prep("SELECT 1 FROM vip_consolidations WHERE userId = ? AND generation = ?").get(userId, generation);
  }

  /**
   * THE HOUSE PAYS (Tier 4; Josh: "the house pays, the perks come
   * automatically"). Once per generation: the house pays the goblins the
   * whole payoff INTO the vault — a ledgered house mint, the only silver the
   * lender ever receives from nowhere — the loan row goes, and a prisoner
   * walks (the pot goes home first, as in a bail). The member's wallet is
   * untouched. Rank is the ROUTE's business; this op only knows the life.
   */
  /** Silver a member has sitting in open game escrow right now — the same
   *  tables a death sweeps home. */
  parkedSilver(userId: number): number {
    let total = 0;
    for (const [table, col, amount] of Store.DEAD_ESCROW_SWEEPS) {
      total += (this.prep(`SELECT COALESCE(SUM(${amount}),0) AS s FROM ${table} WHERE ${col} = ?`).get(userId) as { s: number }).s;
    }
    return total;
  }

  vipConsolidate(userId: number): { ok: true; paid: number; fromWallet: number; released: boolean } | { ok: false; error: string } {
    return this.transaction(() => {
      const u = this.getUserById(userId);
      if (!u || u.isBot || u.deletedAt) return { ok: false as const, error: "no_user" };
      if (this.vipConsolidationUsed(userId, u.generation)) return { ok: false as const, error: "already_used" };
      const l = this.loanOf(userId);
      if (!l) return { ok: false as const, error: "no_loan" };
      // A DEBT IN TROUBLE, not a windfall (review, Sep 2026): Josh's words were
      // "if they are in debt from the goblins and cant pay". Settling a loan
      // the moment it was taken would hand a Tier-4 member the largest window
      // their purse opens, once a life, for nothing — so the house pays only
      // once a day has been missed (MARKED or worse) or from the cell.
      if (l.missed < 1 && !u.jailedAt) return { ok: false as const, error: "not_in_trouble" };
      // The same interest rule as settleLoan: a day is owed once, and a day
      // already stamped is already paid for.
      const dueInterest = l.lastDay < dayKey(Date.now()) ? interestFor(l.principal, l.rate) : 0;
      const payoff = l.principal + dueInterest;
      // THE MEMBER PAYS FIRST (Josh, Oct 2026). The house covers only what
      // they can't: their wallet goes in before a coin of the Foundry's does.
      // Silver parked in a game doesn't count as "can't pay" — a stake made
      // the night before was how a member who could pay missed a day on
      // purpose and kept the whole loan — so open escrow is refused until it
      // comes home. A wallet that covers the lot is told to pay it themselves
      // (or, in the cell, to post bail — bail stays dearer than the debt).
      if (this.parkedSilver(userId) > 0) return { ok: false as const, error: "escrow_open" };
      const purse = this.getCoins(userId);
      if (purse >= payoff) return { ok: false as const, error: "can_pay" };
      const fromWallet = purse;
      const houseShare = payoff - fromWallet;
      if (fromWallet > 0) this.prep("UPDATE users SET coins = coins - ? WHERE id = ?").run(fromWallet, userId);
      this.prep("UPDATE goblin_vault SET silver = silver + ?, taken = taken + ? WHERE id = 1").run(payoff, payoff);
      // The ledger holds the HOUSE's share only: that is the mint houseMints
      // counts. The member's part is an ordinary repayment.
      this.prep("INSERT INTO vip_consolidations (userId, generation, amount, at) VALUES (?, ?, ?, ?)")
        .run(userId, u.generation, houseShare, Date.now());
      this.prep("DELETE FROM loans WHERE userId = ?").run(userId);
      if (fromWallet > 0) this.logLoan(userId, "repay", fromWallet, "toward the house's settlement");
      this.logLoan(userId, "house", houseShare);
      let released = false;
      if (u.jailedAt) {
        this.refundBailPot(userId);
        this.releasePrisoner(userId);
        released = true;
      }
      return { ok: true as const, paid: houseShare, fromWallet, released };
    });
  }

  /** A VIP suit is WORN through the backrooms locker like every other suit
   *  (the floor, the escape door and the backrooms all read those rows), so
   *  owning the item issues the locker row — and re-issues it if a body lost
   *  it in the corridors. The wardrobe never runs out. Returns rows added. */
  ensureVipSuits(userId: number, colors: readonly string[]): number {
    let added = 0;
    const cap = this.brPlayer(userId).lockerSlots;
    for (const color of colors) {
      if (this.brLockerCount(userId) >= cap) break; // a full locker waits for a free slot
      const has = this.prep("SELECT 1 FROM backrooms_locker WHERE userId = ? AND kind = 'suit' AND color = ?").get(userId, color);
      if (has) continue;
      this.prep("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, 'suit', 0, ?, ?)")
        .run(userId, color, Date.now());
      added++;
    }
    return added;
  }

  // ---- PANDORA'S BOX (migration 96; design PANDORA.md) --------------------
  // Three keys, high-water marks; a box that opens once all three are set;
  // an openings ledger. The rules live in src/pandora.ts — this is the
  // bookkeeping. Nothing here touches silver.

  /** What the key rules read. `earnable` = the live badge ids (retired ones
   *  already excluded by the caller). */
  pandoraFacts(userId: number, earnable: readonly string[]): PandoraFacts {
    const u = this.getUserById(userId);
    const earned = new Set(this.earnedAchievements(userId).map((r) => r.achId));
    // The key reads the STAMP, deliberately. vipTier is a high-water mark
    // (raiseVipTier never lowers it) and the key is one too, so they agree:
    // selling a common after you finished the book must not retract either.
    // A stamp that predates the relic ladder would open the key without
    // relics — but the ladder shipped BEFORE the key did and prod holds no
    // stamp above 0, so no such stamp exists. Reviewed Sep 2026.
    return {
      vipTier: u?.vipTier ?? 0,
      badgesTotal: earnable.length,
      badgesEarned: earnable.filter((id) => earned.has(id)).length,
      relics: Number((this.prep("SELECT COUNT(*) AS n FROM backrooms_relics WHERE userId = ?").get(userId) as { n: number }).n),
    };
  }

  /** The relic slugs a member has unlocked (the page's per-level bars). */
  relicSlugsOf(userId: number): string[] {
    return (this.prep("SELECT relicId FROM backrooms_relics WHERE userId = ?").all(userId) as { relicId: string }[]).map((r) => r.relicId);
  }

  /** Idempotent grant — true only the FIRST time (that's the note from Sterling). */
  grantPandoraKey(userId: number, key: PandoraKey): boolean {
    const info = this.prep("INSERT OR IGNORE INTO pandora_keys (userId, key, earnedAt) VALUES (?, ?, ?)").run(userId, key, Date.now());
    return Number(info.changes) > 0;
  }

  /** The admin's undo for a test key. Never called by the rules. */
  revokePandoraKey(userId: number, key: PandoraKey): boolean {
    return Number(this.prep("DELETE FROM pandora_keys WHERE userId = ? AND key = ?").run(userId, key).changes) > 0;
  }

  pandoraKeys(userId: number): { key: PandoraKey; earnedAt: number; insertedAt: number | null }[] {
    return this.prep("SELECT key, earnedAt, insertedAt FROM pandora_keys WHERE userId = ? ORDER BY earnedAt").all(userId) as
      { key: PandoraKey; earnedAt: number; insertedAt: number | null }[];
  }

  /** Set a held key into its keyhole. A key already in stays in (idempotent
   *  "ok"); a key not held is refused. */
  insertPandoraKey(userId: number, key: PandoraKey): "ok" | "not_held" {
    const row = this.prep("SELECT insertedAt FROM pandora_keys WHERE userId = ? AND key = ?").get(userId, key) as
      { insertedAt: number | null } | undefined;
    if (!row) return "not_held";
    if (row.insertedAt == null) this.prep("UPDATE pandora_keys SET insertedAt = ? WHERE userId = ? AND key = ?").run(Date.now(), userId, key);
    return "ok";
  }

  pandoraInserted(userId: number): PandoraKey[] {
    return (this.prep("SELECT key FROM pandora_keys WHERE userId = ? AND insertedAt IS NOT NULL").all(userId) as { key: PandoraKey }[]).map((r) => r.key);
  }

  /** The world choices already taken (server-wide, ever). */
  pandoraTakenChoices(): string[] {
    return (this.prep("SELECT choice FROM pandora_openings WHERE choice IS NOT NULL").all() as { choice: string }[]).map((r) => r.choice);
  }

  pandoraOpeningOf(userId: number): { id: number; at: number; choice: string | null } | null {
    return (this.prep("SELECT id, at, choice FROM pandora_openings WHERE userId = ? ORDER BY id LIMIT 1").get(userId) as
      { id: number; at: number; choice: string | null } | undefined) ?? null;
  }

  /** The ledger under the box, oldest first — the monument.
   *
   *  A SCRUBBED ACCOUNT LEAVES IT, like every other public surface (the
   *  graveyard, the lives, all four ranking queries; the rule migration 66
   *  and 78 exist for). The opening itself STAYS in the table — a once-ever
   *  world choice really was taken and must never come back on the table —
   *  but a "deleted user" must not stand on the most prestigious page in the
   *  game forever, and must not be named as the taker of a choice. Found in
   *  the Sep 2026 review round. */
  pandoraOpenings(): { id: number; at: number; choice: string | null; user: PublicUser }[] {
    const rows = this.prep("SELECT id, userId, at, choice FROM pandora_openings ORDER BY id").all() as
      { id: number; userId: number; at: number; choice: string | null }[];
    const out: { id: number; at: number; choice: string | null; user: PublicUser }[] = [];
    for (const r of rows) {
      const u = this.getUserById(r.userId);
      if (u && u.deletedAt == null) out.push({ id: r.id, at: r.at, choice: r.choice, user: toPublicUser(u) });
    }
    return out;
  }

  /** THE OPENING. All three keys set, once per opener, the choice still
   *  available (or NULL — hope left in the box). Records the opening,
   *  stamps the world flag, issues THE PANDORAN (the item + its locker
   *  row). One transaction; a refusal changes nothing. */
  openPandora(
    userId: number,
    choice: string | null,
    canTake: (id: string | null, taken: readonly string[]) => boolean,
  ): { ok: true; id: number; at: number; washed: { debtors: number[]; freed: number[] } | null } | { ok: false; error: "keys_missing" | "already_opened" | "choice_taken" } {
    return this.transaction(() => {
      const inserted = this.pandoraInserted(userId);
      if (inserted.length < 3) return { ok: false as const, error: "keys_missing" as const };
      if (this.pandoraOpeningOf(userId)) return { ok: false as const, error: "already_opened" as const };
      if (!canTake(choice, this.pandoraTakenChoices())) return { ok: false as const, error: "choice_taken" as const };
      const at = Date.now();
      const info = this.prep("INSERT INTO pandora_openings (userId, at, choice) VALUES (?, ?, ?)").run(userId, at, choice);
      // A once-ever choice stamps the world; the Stone is handed over instead.
      if (choice && choiceById(choice)?.once) this.kvSet(`pandora:${choice}`, JSON.stringify({ userId, at }));
      if (choice === STONE_CHOICE) this.addEmoji(userId, STONE_CODE);
      const washed = choice === "destroy-goblins" ? this.washGoblinDebts() : null;
      this.grantItemFree(userId, PANDORAN_ITEM);
      this.ensureVipSuits(userId, [PANDORAN_COLOR]);
      return { ok: true as const, id: Number(info.lastInsertRowid), at, washed };
    });
  }

  /** The admin's undo for a TEST opening: the row, its world flag, the
   *  suit item and its locker row all go. */
  clearPandoraOpening(userId: number): boolean {
    return this.transaction(() => {
      const o = this.pandoraOpeningOf(userId);
      if (!o) return false;
      this.prep("DELETE FROM pandora_openings WHERE id = ?").run(o.id);
      if (o.choice) this.prep("DELETE FROM app_kv WHERE key = ?").run(`pandora:${o.choice}`);
      if (o.choice === STONE_CHOICE) this.revokeStone(userId);
      this.prep("DELETE FROM user_items WHERE userId = ? AND itemId = ?").run(userId, PANDORAN_ITEM);
      this.prep("DELETE FROM backrooms_locker WHERE userId = ? AND kind = 'suit' AND color = ?").run(userId, PANDORAN_COLOR);
      return true;
    });
  }

  // ---- THE STONE OF THE ABYSS (migration 97; src/abyss.ts) -----------------
  // The stone is an ordinary inventory row under its own tier; the portal
  // table is who has spoken the phrase. Nothing here touches silver.

  hasStone(userId: number): boolean {
    return this.ownsEmoji(userId, STONE_CODE);
  }

  /** The admin's lever (the box is the only real source). True the first time. */
  grantStone(userId: number): boolean {
    if (this.hasStone(userId)) return false;
    this.addEmoji(userId, STONE_CODE);
    return true;
  }

  /** Take a test stone back — and shut the portal it opened. Plain
   *  statements: clearPandoraOpening calls this inside its own transaction. */
  revokeStone(userId: number): boolean {
    const had = this.hasStone(userId);
    this.removeEmoji(userId, STONE_CODE);
    this.prep("DELETE FROM abyss_portal WHERE userId = ?").run(userId);
    return had;
  }

  abyssOpenedAt(userId: number): number | null {
    const r = this.prep("SELECT openedAt FROM abyss_portal WHERE userId = ?").get(userId) as { openedAt: number } | undefined;
    return r?.openedAt ?? null;
  }

  /** THE PHRASE, SPOKEN. Needs the stone in hand; opens the portal once.
   *  "opened" is true only the first time — that's the frame and the notice. */
  openAbyss(userId: number): { ok: true; opened: boolean; at: number } | { ok: false; error: "no_stone" } {
    return this.transaction(() => {
      if (!this.hasStone(userId)) return { ok: false as const, error: "no_stone" as const };
      const prior = this.abyssOpenedAt(userId);
      if (prior != null) return { ok: true as const, opened: false, at: prior };
      const at = Date.now();
      this.prep("INSERT INTO abyss_portal (userId, openedAt) VALUES (?, ?)").run(userId, at);
      return { ok: true as const, opened: true, at };
    });
  }

  // ---- THE PORTAL (migration 113; src/portal/) --------------------------------
  /** Everyone whose portal is open (the hall's possible readers). */
  portalOpenUserIds(): number[] {
    return (this.prep("SELECT userId FROM abyss_portal").all() as { userId: number }[]).map((r) => r.userId);
  }
  /** File a member the first time they come through: the next keystone after
   *  `firstKeystone` (the hall's own members hold the ones below). */
  portalFile(userId: number, firstKeystone: number): { keystone: number; filedAt: number; first: boolean } {
    return this.transaction(() => {
      const had = this.prep("SELECT keystone, filedAt FROM portal_members WHERE userId = ?").get(userId) as { keystone: number; filedAt: number } | undefined;
      const at = Date.now();
      if (had) { this.prep("UPDATE portal_members SET lastSeen = ? WHERE userId = ?").run(at, userId); return { ...had, first: false }; }
      const max = (this.prep("SELECT MAX(keystone) AS k FROM portal_members").get() as { k: number | null }).k;
      const keystone = Math.max(firstKeystone, (max ?? firstKeystone - 1) + 1);
      this.prep("INSERT INTO portal_members (userId, keystone, filedAt, lastSeen) VALUES (?, ?, ?, ?)").run(userId, keystone, at, at);
      return { keystone, filedAt: at, first: true };
    });
  }
  portalTouch(userId: number): void {
    this.prep("UPDATE portal_members SET lastSeen = ? WHERE userId = ?").run(Date.now(), userId);
  }
  portalMembers(): { userId: number; keystone: number; filedAt: number; lastSeen: number; username: string }[] {
    return this.prep(`SELECT m.userId, m.keystone, m.filedAt, m.lastSeen, u.username FROM portal_members m
      JOIN users u ON u.id = m.userId WHERE u.deletedAt IS NULL ORDER BY m.keystone`).all() as never;
  }
  portalGlyphs(): { glyph: number; userId: number | null; source: string; at: number }[] {
    return this.prep("SELECT glyph, userId, source, at FROM portal_glyphs ORDER BY at").all() as never;
  }
  /** Crack a glyph for everyone. False if it was already cracked. */
  portalUnlockGlyph(glyph: number, userId: number | null, source: string): boolean {
    return this.prep("INSERT OR IGNORE INTO portal_glyphs (glyph, userId, source, at) VALUES (?, ?, ?, ?)").run(glyph, userId, source, Date.now()).changes > 0;
  }
  portalWords(userId: number): Set<string> {
    return new Set((this.prep("SELECT word FROM portal_words WHERE userId = ?").all(userId) as { word: string }[]).map((r) => r.word));
  }
  portalLearn(userId: number, word: string): boolean {
    return this.prep("INSERT OR IGNORE INTO portal_words (userId, word, at) VALUES (?, ?, ?)").run(userId, word, Date.now()).changes > 0;
  }
  portalWrongGuesses(userId: number, kind: string, day: string): number {
    const r = this.prep("SELECT wrong FROM portal_guesses WHERE userId = ? AND day = ? AND kind = ?").get(userId, day, kind) as { wrong: number } | undefined;
    return r?.wrong ?? 0;
  }
  portalGuessedWrong(userId: number, kind: string, day: string): void {
    this.prep(`INSERT INTO portal_guesses (userId, day, kind, wrong) VALUES (?, ?, ?, 1)
      ON CONFLICT (userId, day, kind) DO UPDATE SET wrong = wrong + 1`).run(userId, day, kind);
  }
  portalAddPost(room: string, userId: number, text: string): { id: number; at: number } {
    const at = Date.now();
    const r = this.prep("INSERT INTO portal_posts (room, userId, text, at) VALUES (?, ?, ?, ?)").run(room, userId, text, at);
    return { id: Number(r.lastInsertRowid), at };
  }
  portalPosts(room: string, limit = 200): { id: number; room: string; userId: number; text: string; at: number }[] {
    return (this.prep("SELECT id, room, userId, text, at FROM portal_posts WHERE room = ? ORDER BY id DESC LIMIT ?").all(room, limit) as never[]).reverse() as never;
  }
  portalLastPostAt(room: string): number | null {
    const r = this.prep("SELECT MAX(at) AS at FROM portal_posts WHERE room = ?").get(room) as { at: number | null };
    return r.at;
  }
  /** Toggle a reaction; true if it is now on. */
  portalReact(target: string, userId: number, sign: string): boolean {
    const del = this.prep("DELETE FROM portal_reactions WHERE target = ? AND userId = ? AND sign = ?").run(target, userId, sign);
    if (del.changes > 0) return false;
    this.prep("INSERT INTO portal_reactions (target, userId, sign, at) VALUES (?, ?, ?, ?)").run(target, userId, sign, Date.now());
    return true;
  }
  /** The galaxies this reader has charted on the survey. */
  portalCharted(userId: number): Set<string> {
    return new Set((this.prep("SELECT galaxy FROM portal_survey WHERE userId = ?").all(userId) as { galaxy: string }[]).map((r) => r.galaxy));
  }
  portalChart(userId: number, galaxy: string): boolean {
    return this.prep("INSERT OR IGNORE INTO portal_survey (userId, galaxy, at) VALUES (?, ?, ?)").run(userId, galaxy, Date.now()).changes > 0;
  }
  // ---- migration 115: notation, what a reader finished, ring games, repairs ----
  portalNotation(): { mark: number; userId: number | null; source: string; at: number }[] {
    return this.prep("SELECT mark, userId, source, at FROM portal_notation ORDER BY at").all() as never;
  }
  portalUnlockNotation(mark: number, userId: number | null, source: string): boolean {
    return this.prep("INSERT OR IGNORE INTO portal_notation (mark, userId, source, at) VALUES (?, ?, ?, ?)").run(mark, userId, source, Date.now()).changes > 0;
  }
  portalDone(userId: number): Map<string, { data: string | null; at: number }> {
    const rows = this.prep("SELECT what, data, at FROM portal_done WHERE userId = ?").all(userId) as { what: string; data: string | null; at: number }[];
    return new Map(rows.map((r) => [r.what, { data: r.data, at: r.at }]));
  }
  /** Mark something finished; false if it already was (so a reward lands once). */
  portalFinish(userId: number, what: string, data: string | null = null): boolean {
    return this.prep("INSERT OR IGNORE INTO portal_done (userId, what, data, at) VALUES (?, ?, ?, ?)").run(userId, what, data, Date.now()).changes > 0;
  }
  portalDoneAll(what: string): { userId: number; data: string | null; at: number }[] {
    return this.prep("SELECT userId, data, at FROM portal_done WHERE what = ? ORDER BY at").all(what) as never;
  }
  portalIshaalGames(): { id: number; evenId: number; oddId: number | null; moves: string; status: string; winner: string | null; createdAt: number; updatedAt: number }[] {
    return this.prep("SELECT * FROM portal_ishaal WHERE status != 'done' OR updatedAt > ? ORDER BY id").all(Date.now() - 7 * 86400_000) as never;
  }
  portalIshaalGame(id: number): { id: number; evenId: number; oddId: number | null; moves: string; status: string; winner: string | null; createdAt: number; updatedAt: number } | null {
    return (this.prep("SELECT * FROM portal_ishaal WHERE id = ?").get(id) as never) ?? null;
  }
  portalIshaalOpen(userId: number): number {
    const now = Date.now();
    return Number(this.prep("INSERT INTO portal_ishaal (evenId, status, createdAt, updatedAt) VALUES (?, 'open', ?, ?)").run(userId, now, now).lastInsertRowid);
  }
  /** Take the odd seat of an open game; false if somebody got there first. */
  portalIshaalJoin(id: number, userId: number): boolean {
    return this.prep("UPDATE portal_ishaal SET oddId = ?, status = 'live', updatedAt = ? WHERE id = ? AND status = 'open' AND evenId != ?").run(userId, Date.now(), id, userId).changes > 0;
  }
  /** Record a move, guarded on the move count it was made against. */
  portalIshaalMove(id: number, ply: number, moves: string, status: string, winner: string | null): boolean {
    return this.prep("UPDATE portal_ishaal SET moves = ?, status = ?, winner = ?, updatedAt = ? WHERE id = ? AND status = 'live' AND json_array_length(moves) = ?")
      .run(moves, status, winner, Date.now(), id, ply).changes > 0;
  }
  portalIshaalEnd(id: number, status: string, winner: string | null): boolean {
    return this.prep("UPDATE portal_ishaal SET status = ?, winner = ?, updatedAt = ? WHERE id = ? AND status != 'done'").run(status, winner, Date.now(), id).changes > 0;
  }
  portalRepair(kind: string, subject: string, at: number = Date.now()): void {
    this.prep("INSERT INTO portal_repairs (at, kind, subject) VALUES (?, ?, ?)").run(at, kind, subject);
  }
  portalRepairs(): { id: number; at: number; kind: string; subject: string }[] {
    return this.prep("SELECT id, at, kind, subject FROM portal_repairs ORDER BY at DESC LIMIT 400").all() as never;
  }
  portalReactions(): { target: string; userId: number; sign: string }[] {
    return this.prep("SELECT target, userId, sign FROM portal_reactions ORDER BY at").all() as never;
  }

  /** Is a world choice in force? (The regime flags the game reads.) */
  pandoraFlag(choice: string): { userId: number; at: number } | null {
    const raw = this.kvGet(`pandora:${choice}`);
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as { userId: number; at: number };
      return Number.isInteger(v?.userId) ? v : null;
    } catch {
      return null;
    }
  }

  // ---- THE PAPERWORK (migration 86) -----------------------------------------
  // Terms acceptance is EVIDENCE: the column on users is the fast "has this
  // account accepted the current version" read, the ledger is the record
  // (every acceptance, with the address it came from). Same shape for the
  // Satellite Host Agreement, stamped on the key at acceptance and on the
  // satellite row at registration.

  acceptTerms(userId: number, version: number, ip: string | null, ua: string | null): void {
    const now = Date.now();
    this.transaction(() => {
      this.prep("UPDATE users SET termsVersion = ?, termsAcceptedAt = ? WHERE id = ?").run(version, now, userId);
      this.prep("INSERT INTO terms_acceptances (userId, version, at, ip, ua) VALUES (?, ?, ?, ?, ?)")
        .run(userId, version, now, ip, ua ? ua.slice(0, 300) : null);
    });
  }

  termsAcceptances(userId: number): { version: number; at: number; ip: string | null }[] {
    return this.prep("SELECT version, at, ip FROM terms_acceptances WHERE userId = ? ORDER BY at DESC").all(userId) as
      { version: number; at: number; ip: string | null }[];
  }

  /** Record the Host Agreement acceptance against a still-redeemable key —
   *  the Ubuntu wizard does this BEFORE the daemon registers, so the
   *  acceptance stands whichever daemon version makes the register call.
   *  false = no such live key (never a burn; the key stays redeemable). */
  acceptHostingForKey(code: string, version: number, ip: string | null): boolean {
    return this.prep(
      "UPDATE satellite_keys SET hostingVersion = ?, hostingAcceptedAt = ?, hostingIp = ? " +
      "WHERE codeHash = ? AND usedAt IS NULL AND revoked = 0 AND expiresAt > ?",
    ).run(version, Date.now(), ip, this.hashSatKey(code), Date.now()).changes > 0;
  }

  /** The Host Agreement version accepted on this key, or null. */
  keyHostingAccepted(code: string): number | null {
    const r = this.prep("SELECT hostingVersion FROM satellite_keys WHERE codeHash = ?").get(this.hashSatKey(code)) as
      { hostingVersion: number | null } | undefined;
    return r?.hostingVersion ?? null;
  }

  stampSatelliteHosting(satelliteId: number, version: number, ip: string | null): void {
    this.prep("UPDATE satellites SET hostingVersion = ?, hostingAcceptedAt = ?, hostingIp = ? WHERE id = ?")
      .run(version, Date.now(), ip, satelliteId);
  }

  /** Open reports that point INTO a satellite: its page (kind "page") or
   *  any message in its id range (kind "message", global ids). The admin's
   *  registry shows this beside the delist switch. */
  openReportsForSatellite(satelliteId: number, pageId: number | null): number {
    const lo = satelliteId * 1_000_000_000;
    const r = this.prep(
      "SELECT COUNT(*) AS n FROM reports WHERE status = 'open' AND (" +
      "(kind = 'page' AND refId = ?) OR (kind = 'message' AND refId >= ? AND refId < ?))",
    ).get(pageId ?? -1, lo, lo + 1_000_000_000) as { n: number };
    return r.n;
  }

  /** Set (or clear, with null) a user's uploaded avatar filename. */
  /** Swap the avatar and return what it REPLACED, atomically. The route
   *  used to remember the previous name from before its `await` on the body,
   *  so fifty parallel uploads deleted one old file and orphaned forty-nine. */
  setAvatar(userId: number, avatar: string | null): string | null {
    return this.transaction(() => {
      const prev = (this.prep("SELECT avatar FROM users WHERE id = ?").get(userId) as { avatar: string | null } | undefined)?.avatar ?? null;
      this.prep("UPDATE users SET avatar = ? WHERE id = ?").run(avatar, userId);
      return prev;
    });
  }

  /** Set (or clear) the uploaded profile-banner filename (migration 46);
   *  returns the previous name (see setAvatar). */
  setBanner(userId: number, banner: string | null): string | null {
    return this.transaction(() => {
      const prev = (this.prep("SELECT banner FROM users WHERE id = ?").get(userId) as { banner: string | null } | undefined)?.banner ?? null;
      this.prep("UPDATE users SET banner = ? WHERE id = ?").run(banner, userId);
      return prev;
    });
  }

  // ---- THE REROLL, once per grave (migration 87) ---------------------------

  rerolledAt(userId: number): number | null {
    const r = this.prep("SELECT rerolledAt FROM users WHERE id = ?").get(userId) as { rerolledAt: number | null } | undefined;
    return r?.rerolledAt ?? null;
  }

  /** Claim the one reroll a shut-out account gets. Guarded: true only for the
   *  first claimant, so two racing register calls can't both walk out. */
  markRerolled(userId: number, graveStart = 0): boolean {
    return this.prep("UPDATE users SET rerolledAt = ? WHERE id = ? AND (rerolledAt IS NULL OR rerolledAt < ?)").run(Date.now(), userId, graveStart).changes === 1;
  }

  // ---- Custom sounds (migration 46; board slots moved out in 73) -----------
  // One file per slot: enter | leave. The refs are mirrored into
  // users.cosmetics (public, broadcast on user.update) so every client can
  // play them without new wire plumbing. Soundboard pads live in the shared
  // board_sounds library below.

  userSounds(userId: number): { slot: string; file: string; name: string; bytes: number }[] {
    return this.prep("SELECT slot, file, name, bytes FROM user_sounds WHERE userId = ? ORDER BY slot")
      .all(userId) as { slot: string; file: string; name: string; bytes: number }[];
  }

  /** Rebuild the cosmetics mirror from the user_sounds table. */
  private syncSoundCosmetics(userId: number): void {
    const rows = this.userSounds(userId);
    const u = this.getUserById(userId);
    if (!u) return;
    const cs: Record<string, unknown> = { ...u.cosmetics };
    const enter = rows.find((r) => r.slot === "enter");
    const leave = rows.find((r) => r.slot === "leave");
    if (enter) cs.enterSound = enter.file;
    else delete cs.enterSound;
    if (leave) cs.leaveSound = leave.file;
    else delete cs.leaveSound;
    delete cs.board; // pads are library rows now (migration 73), not a cosmetic
    this.prep("UPDATE users SET cosmetics = ? WHERE id = ?").run(JSON.stringify(cs), userId);
  }

  /** Upsert a slot's sound. Returns the replaced file (caller unlinks it). */
  setUserSound(userId: number, slot: string, file: string, name: string, bytes: number): string | null {
    return this.transaction(() => {
      const old = this.prep("SELECT file FROM user_sounds WHERE userId = ? AND slot = ?")
        .get(userId, slot) as { file: string } | undefined;
      this.prep(
          `INSERT INTO user_sounds (userId, slot, file, name, bytes, createdAt) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(userId, slot) DO UPDATE SET file = excluded.file, name = excluded.name,
             bytes = excluded.bytes, createdAt = excluded.createdAt`,
        )
        .run(userId, slot, file, name, bytes, Date.now());
      this.syncSoundCosmetics(userId);
      return old?.file ?? null;
    });
  }

  /** Remove a slot's sound. Returns the removed file (caller unlinks it). */
  deleteUserSound(userId: number, slot: string): string | null {
    return this.transaction(() => {
      const old = this.prep("SELECT file FROM user_sounds WHERE userId = ? AND slot = ?")
        .get(userId, slot) as { file: string } | undefined;
      if (!old) return null;
      this.prep("DELETE FROM user_sounds WHERE userId = ? AND slot = ?").run(userId, slot);
      this.syncSoundCosmetics(userId);
      return old.file;
    });
  }

  // ---- The house soundboard (migration 73) ---------------------------------
  // One shared library. Any member's upload is playable by everyone in a
  // voice room; the per-user cap and delete authority live in the route.

  boardLibrary(): BoardSoundRow[] {
    return this.prep(
        `SELECT b.id, b.ownerId, u.displayName AS owner, b.file, b.name, b.emoji, b.bytes
         FROM board_sounds b JOIN users u ON u.id = b.ownerId
         ORDER BY LOWER(b.name), b.id`,
      )
      .all() as unknown as BoardSoundRow[];
  }

  boardSound(id: number): BoardSoundRow | null {
    return (
      (this.prep(
          `SELECT b.id, b.ownerId, u.displayName AS owner, b.file, b.name, b.emoji, b.bytes
           FROM board_sounds b JOIN users u ON u.id = b.ownerId WHERE b.id = ?`,
        )
        .get(id) as unknown as BoardSoundRow | undefined) ?? null
    );
  }

  boardCountFor(userId: number): number {
    const r = this.prep("SELECT COUNT(*) AS n FROM board_sounds WHERE ownerId = ?").get(userId) as { n: number };
    return r.n;
  }

  /** Add a library sound under the per-user cap, checked INSIDE the write —
   *  the route's pre-check ran before it awaited the body, so parallel
   *  uploads all passed it. False = full, nothing written. */
  addBoardSound(ownerId: number, file: string, name: string, emoji: string | null, bytes: number, max: number): boolean {
    return this.transaction(() => {
      if (this.boardCountFor(ownerId) >= max) return false;
      this.prep("INSERT INTO board_sounds (ownerId, file, name, emoji, bytes, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
        .run(ownerId, file, name, emoji, bytes, Date.now());
      return true;
    });
  }

  /** Delete a library sound. Returns the removed row (caller authorized + unlinks). */
  deleteBoardSound(id: number): BoardSoundRow | null {
    const row = this.boardSound(id);
    if (!row) return null;
    this.prep("DELETE FROM board_sounds WHERE id = ?").run(id);
    return row;
  }

  // ---- Web Push (migration 74) ---------------------------------------------

  kvGet(key: string): string | null {
    const r = this.prep("SELECT value FROM app_kv WHERE key = ?").get(key) as { value: string } | undefined;
    return r?.value ?? null;
  }

  kvSet(key: string, value: string): void {
    this.prep("INSERT INTO app_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  }

  kvDel(key: string): void {
    this.prep("DELETE FROM app_kv WHERE key = ?").run(key);
  }

  // ---- SOLACE SURVIVORZ: the character list (migration 116) ----------------------------------------
  survivorzListAll(): { id: string; data: string; regardIn: string; updatedAt: number; updatedBy: number | null }[] {
    return this.prep("SELECT id, data, regardIn, updatedAt, updatedBy FROM survivorz_characters ORDER BY updatedAt").all() as never;
  }

  survivorzListSave(id: string, data: string, regardIn: string, by: number | null): void {
    this.prep(
      "INSERT INTO survivorz_characters (id, data, regardIn, updatedAt, updatedBy) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET data = excluded.data, regardIn = excluded.regardIn, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy",
    ).run(id, data, regardIn, Date.now(), by);
  }

  survivorzListDelete(id: string): boolean {
    return Number(this.prep("DELETE FROM survivorz_characters WHERE id = ?").run(id).changes) > 0;
  }

  // ---- SOLACE SURVIVORZ: bodies dropped into the character creator (migration 118) ---------------
  survivorzBodies(): SurvivorzBodyRow[] {
    return this.prep("SELECT * FROM survivorz_bodies ORDER BY createdAt DESC").all() as never;
  }

  survivorzBody(id: string): SurvivorzBodyRow | null {
    return (this.prep("SELECT * FROM survivorz_bodies WHERE id = ?").get(id) as SurvivorzBodyRow | undefined) ?? null;
  }

  survivorzBodyAdd(b: { id: string; sourceName: string; sourceFile: string; sourceBytes: number; heightM: number | null; licence: string | null; credit: string | null; by: number | null }): void {
    const now = Date.now();
    this.prep(
      "INSERT INTO survivorz_bodies (id, status, sourceName, sourceFile, sourceBytes, heightM, licence, credit, createdAt, createdBy, updatedAt, queueOrder) VALUES (?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(b.id, b.sourceName, b.sourceFile, b.sourceBytes, b.heightM, b.licence, b.credit, now, b.by, now, this.survivorzQueueEnd());
  }

  /** Change what the worker or the admin reports; only the fields given are touched. */
  /** the creator bodies ticked as sealed suits (migration 122) */
  survivorzSuitedBodies(): string[] {
    return (this.prep("SELECT id FROM survivorz_bodies WHERE suited = 1").all() as { id: string }[]).map((r) => r.id);
  }

  survivorzBodySet(id: string, f: Partial<Pick<SurvivorzBodyRow, "status" | "steps" | "report" | "error" | "worker" | "claimedAt" | "heightM" | "licence" | "credit" | "paused" | "resumeFrom" | "queueOrder" | "suited">>): boolean {
    const keys = Object.keys(f) as (keyof typeof f)[];
    if (!keys.length) return false;
    const sets = keys.map((k) => `${k} = ?`).join(", ");
    return Number(this.prep(`UPDATE survivorz_bodies SET ${sets}, updatedAt = ? WHERE id = ?`).run(...keys.map((k) => f[k] ?? null), Date.now(), id).changes) > 0;
  }

  /** The worker takes the oldest queued body; a guarded UPDATE, so two workers can never take the same one. */
  survivorzBodyClaim(worker: string): SurvivorzBodyRow | null {
    const next = this.prep("SELECT id FROM survivorz_bodies WHERE status = 'queued' ORDER BY queueOrder IS NULL, queueOrder, createdAt LIMIT 1").get() as { id: string } | undefined;
    if (!next) return null;
    const now = Date.now();
    const took = Number(this.prep("UPDATE survivorz_bodies SET status = 'baking', worker = ?, claimedAt = ?, error = NULL, paused = NULL, updatedAt = ? WHERE id = ? AND status = 'queued'").run(worker, now, now, next.id).changes);
    return took ? this.survivorzBody(next.id) : null;
  }

  /** A place at the back of the bake queue. */
  survivorzQueueEnd(): number {
    const r = this.prep("SELECT MAX(queueOrder) AS m FROM survivorz_bodies").get() as { m: number | null };
    return (r.m ?? -1) + 1;
  }

  /** The queue in this order; every body not listed keeps its relative place after these. */
  survivorzQueueSet(ids: string[]): void {
    this.transaction(() => {
      const set = this.prep("UPDATE survivorz_bodies SET queueOrder = ?, updatedAt = ? WHERE id = ?");
      const now = Date.now();
      ids.forEach((id, i) => set.run(i, now, id));
      const rest = this.prep("SELECT id FROM survivorz_bodies WHERE id NOT IN (SELECT value FROM json_each(?)) ORDER BY queueOrder IS NULL, queueOrder, createdAt").all(JSON.stringify(ids)) as { id: string }[];
      rest.forEach((r, i) => set.run(ids.length + i, now, r.id));
    });
  }

  survivorzBodyDelete(id: string): boolean {
    return Number(this.prep("DELETE FROM survivorz_bodies WHERE id = ?").run(id).changes) > 0;
  }

  // ---- THE HOUSE'S BRAINS: memory (migration 106, src/npc/memory.ts) ------

  /** What one of the three keeps about one person (private DM notes). */
  npcMemory(userId: number, npc: string): { notes: string; coveredId: number; updatedAt: number } | null {
    return (this.prep("SELECT notes, coveredId, updatedAt FROM npc_memory WHERE userId = ? AND npc = ?").get(userId, npc) as
      | { notes: string; coveredId: number; updatedAt: number }
      | undefined) ?? null;
  }

  npcMemoryAll(userId: number): { npc: string; notes: string; updatedAt: number }[] {
    return this.prep("SELECT npc, notes, updatedAt FROM npc_memory WHERE userId = ? AND notes != '' ORDER BY npc")
      .all(userId) as { npc: string; notes: string; updatedAt: number }[];
  }

  npcMemorySave(userId: number, npc: string, notes: string, coveredId: number): void {
    this.prep(
      `INSERT INTO npc_memory (userId, npc, notes, coveredId, updatedAt) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(userId, npc) DO UPDATE SET notes = excluded.notes, coveredId = excluded.coveredId, updatedAt = excluded.updatedAt`,
    ).run(userId, npc, notes, coveredId, Date.now());
  }

  /** The newest message between two people (0 when they've never talked) —
   *  WITHOUT creating a conversation, unlike getOrCreateConversation. A
   *  forget marks it covered, so the old conversation is never read back
   *  into fresh notes. */
  dmLatestIdBetween(a: number, b: number): number {
    const r = this.prep(
      `SELECT MAX(m.id) AS id FROM dm_messages m JOIN dm_conversations c ON c.id = m.conversationId
        WHERE c.userA = ? AND c.userB = ?`,
    ).get(Math.min(a, b), Math.max(a, b)) as { id: number | null };
    return r.id ?? 0;
  }

  /** PUBLIC RECALL — "anything posted in public chats is free game" (Josh,
   *  Oct 2026), and nothing else. Public means a channel EVERYONE can read:
   *  an open page (never invite/request-only), not a satellite's page (its
   *  bodies live on the host), and no view role on the channel. ANY of the
   *  words matches (the search box ANDs them, which suits a person typing a
   *  query and not a character trying to recall), best match first. The
   *  bots' own posts are left out so the three don't quote themselves back. */
  npcRecallPublic(words: string[], opts: { limit: number; since: number }): { body: string; author: string; channel: string; createdAt: number }[] {
    const clean = [...new Set(words.map((w) => w.replace(/[^\p{L}\p{N}_]/gu, "")).filter((w) => w.length >= 3))].slice(0, 10);
    if (!clean.length) return [];
    const fts = clean.map((w) => `"${w}"`).join(" OR ");
    return this.prep(
        `SELECT m.body AS body, COALESCE(NULLIF(u.displayName, ''), u.username) AS author, c.name AS channel, m.createdAt AS createdAt
           FROM messages_fts f
           JOIN messages m ON m.id = f.rowid
           JOIN channels c ON c.id = m.channelId
           JOIN pages p ON p.id = c.pageId
           JOIN users u ON u.id = m.userId
          WHERE messages_fts MATCH ?
            AND m.deletedAt IS NULL AND m.createdAt >= ?
            AND p.joinPolicy = 'open' AND p.satelliteId IS NULL
            AND NOT EXISTS (SELECT 1 FROM channel_roles cr WHERE cr.channelId = c.id AND cr.kind = 'view')
            AND NOT EXISTS (SELECT 1 FROM channel_roles cr2 WHERE cr2.channelId = c.parentId AND cr2.kind = 'view')
            AND u.isBot = 0 AND u.deletedAt IS NULL
          ORDER BY bm25(messages_fts) LIMIT ?`,
      )
      .all(fts, opts.since, opts.limit) as { body: string; author: string; channel: string; createdAt: number }[];
  }

  /** Upsert by endpoint — a device re-subscribing replaces its own row rather
   *  than stacking. Sep 2026 review: an endpoint already held by ANOTHER
   *  account is refused ("taken") — re-registering someone else's endpoint
   *  used to reassign it and deliver their DM excerpts to the newcomer; a
   *  device that changes hands unsubscribes at logout first. And the count
   *  is capped per user inside the write, so one account can't turn every
   *  DM into thousands of outbound POSTs. */
  addPushSub(userId: number, endpoint: string, p256dh: string, auth: string, ua: string | null, max: number): "ok" | "taken" | "full" {
    return this.transaction(() => {
      const owner = (this.prep("SELECT userId FROM push_subscriptions WHERE endpoint = ?").get(endpoint) as { userId: number } | undefined)?.userId;
      if (owner != null && owner !== userId) return "taken";
      if (owner == null) {
        const n = (this.prep("SELECT COUNT(*) AS n FROM push_subscriptions WHERE userId = ?").get(userId) as { n: number }).n;
        if (n >= max) return "full";
      }
      this.prep(
          `INSERT INTO push_subscriptions (endpoint, userId, p256dh, auth, ua, createdAt) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua`,
        )
        .run(endpoint, userId, p256dh, auth, ua, Date.now());
      return "ok";
    });
  }

  /** Remove one of MY subscriptions (scoped — no cross-account deletes). */
  deletePushSub(userId: number, endpoint: string): void {
    this.prep("DELETE FROM push_subscriptions WHERE userId = ? AND endpoint = ?").run(userId, endpoint);
  }

  /** Remove a dead endpoint wherever it lives (the push service said 404/410). */
  prunePushSub(endpoint: string): void {
    this.prep("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  }

  pushSubsFor(userId: number): { endpoint: string; p256dh: string; auth: string }[] {
    return this.prep("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE userId = ?")
      .all(userId) as { endpoint: string; p256dh: string; auth: string }[];
  }

  /** Who said yes to an event — the reminder push's audience. */
  eventGoing(eventId: number): number[] {
    return (
      this.prep("SELECT userId FROM event_rsvps WHERE eventId = ? AND going = 1").all(eventId) as {
        userId: number;
      }[]
    ).map((r) => r.userId);
  }

  /** Replace a user's private client prefs (theme/font). Caller validates. */
  setPrefs(userId: number, prefs: UserPrefs): User | undefined {
    this.prep("UPDATE users SET prefs = ? WHERE id = ?").run(JSON.stringify(prefs), userId);
    return this.getUserById(userId);
  }

  /** Replace a user's password hash (change-password; caller verifies first). */
  setPassword(userId: number, passwordHash: string): void {
    this.prep("UPDATE users SET passwordHash = ? WHERE id = ?").run(passwordHash, userId);
  }

  /** Kill every session for a user except the given token — used after a
   *  password change so a stolen session elsewhere doesn't survive it. */
  deleteOtherSessions(userId: number, keepToken: string): void {
    this.prep("DELETE FROM sessions WHERE userId = ? AND token <> ?").run(userId, keepToken);
  }

  /** Update a user's editable profile fields (display name, bio). */
  updateProfile(userId: number, fields: { displayName?: string; bio?: string | null }): User | undefined {
    if (fields.displayName !== undefined) {
      this.prep("UPDATE users SET displayName = ? WHERE id = ?").run(fields.displayName, userId);
    }
    if (fields.bio !== undefined) {
      this.prep("UPDATE users SET bio = ? WHERE id = ?").run(fields.bio, userId);
    }
    return this.getUserById(userId);
  }

  createUser(input: {
    username: string;
    displayName: string;
    passwordHash: string;
    isAdmin?: boolean;
  }): User {
    const createdAt = Date.now();
    const info = this.prep(
        "INSERT INTO users (username, displayName, passwordHash, isAdmin, createdAt) VALUES (?, ?, ?, ?, ?)",
      )
      .run(input.username, input.displayName.slice(0, MAX_DISPLAY_NAME), input.passwordHash, input.isAdmin ? 1 : 0, createdAt);
    const id = Number(info.lastInsertRowid);
    this.backfillChannelReads(id);
    this.addPageMember(GENERAL_PAGE_ID, id); // everyone starts in the main hall
    return this.getUserById(id)!;
  }

  getUserById(id: number): User | undefined {
    const row = this.prep("SELECT * FROM users WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToUser(row) : undefined;
  }

  getUserByUsername(username: string): User | undefined {
    const row = this.prep("SELECT * FROM users WHERE username = ?").get(username) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToUser(row) : undefined;
  }

  countUsers(): number {
    const row = this.prep("SELECT COUNT(*) AS n FROM users").get() as { n: number };
    return row.n;
  }

  /** The members roster — everyone who still EXISTS. A scrubbed account is
   *  kept as a row so old messages resolve to a name, but it is not a member
   *  any more and has no business in a picker (Josh: "when i delete accounts
   *  they should be removed from the list").  is for the places
   *  that legitimately need the tombstones too. */
  listUsers(): User[] {
    // A season purse is an account in name only (SEASONS.md) — never a member.
    const rows = this.prep("SELECT * FROM users WHERE deletedAt IS NULL AND purseOf IS NULL ORDER BY displayName COLLATE NOCASE")
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToUser(r));
  }

  /** …including scrubbed accounts. The security ledger uses this: a sign-in
   *  by an account that was later deleted still happened, and "unknown" in
   *  that table would be worse than a tombstone. */
  listAllUsers(): User[] {
    const rows = this.prep("SELECT * FROM users ORDER BY displayName COLLATE NOCASE")
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToUser(r));
  }

  // ---- Invites -----------------------------------------------------------

  private rowToInvite(r: Record<string, unknown>): Invite {
    return {
      code: r.code as string,
      createdBy: r.createdBy as number,
      createdAt: r.createdAt as number,
      maxUses: r.maxUses as number,
      uses: r.uses as number,
      expiresAt: (r.expiresAt as number | null) ?? null,
      revoked: !!r.revoked,
      note: (r.note as string | null) ?? null,
    };
  }

  private inviteStatus(inv: Invite, now: number): InviteDTO["status"] {
    if (inv.revoked) return "revoked";
    if (inv.expiresAt !== null && inv.expiresAt <= now) return "expired";
    if (inv.uses >= inv.maxUses) return "used";
    return "active";
  }

  /** Mint a new invite. `code` should come from `newInviteCode()`. */
  createInvite(input: {
    code: string;
    createdBy: number;
    maxUses: number;
    expiresAt: number | null;
    note: string | null;
  }): Invite {
    this.prep(
        "INSERT INTO invites (code, createdBy, createdAt, maxUses, uses, expiresAt, revoked, note) VALUES (?, ?, ?, ?, 0, ?, 0, ?)",
      )
      .run(input.code, input.createdBy, Date.now(), input.maxUses, input.expiresAt, input.note);
    return this.getInvite(input.code)!;
  }

  getInvite(code: string): Invite | undefined {
    const row = this.prep("SELECT * FROM invites WHERE code = ?").get(code) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToInvite(row) : undefined;
  }

  /** All invites, newest first, hydrated with creator + a derived status (admin view). */
  listInvites(now = Date.now()): InviteDTO[] {
    const rows = this.prep("SELECT * FROM invites ORDER BY createdAt DESC")
      .all() as Record<string, unknown>[];
    return rows.map((r) => {
      const inv = this.rowToInvite(r);
      const creator = this.getUserById(inv.createdBy);
      return { ...inv, creator: creator ? toPublicUser(creator) : null, status: this.inviteStatus(inv, now) };
    });
  }

  /** Revoke an invite so it can no longer be redeemed. False if it doesn't exist. */
  revokeInvite(code: string): boolean {
    const info = this.prep("UPDATE invites SET revoked = 1 WHERE code = ?").run(code);
    return info.changes > 0;
  }

  /**
   * Create a user by redeeming an invite, atomically. A guarded UPDATE claims one
   * use only if the code is currently redeemable (not revoked, not expired, uses
   * remaining); if it changes 0 rows the code is unusable and no user is created.
   * The whole thing is one transaction, so if the username was taken in a race the
   * INSERT throws and the redemption rolls back — a rejected sign-up never burns a use.
   */
  createUserViaInvite(input: {
    username: string;
    displayName: string;
    passwordHash: string;
    code: string;
  }): { user: User } | { error: "invite_invalid" } {
    return this.transaction(() => {
      const now = Date.now();
      const claim = this.prep(
          "UPDATE invites SET uses = uses + 1 WHERE code = ? AND revoked = 0 AND uses < maxUses AND (expiresAt IS NULL OR expiresAt > ?)",
        )
        .run(input.code, now);
      if (claim.changes === 0) return { error: "invite_invalid" as const };
      const info = this.prep(
          "INSERT INTO users (username, displayName, passwordHash, isAdmin, createdAt, invitedVia) VALUES (?, ?, ?, 0, ?, ?)",
        )
        .run(input.username, input.displayName.slice(0, MAX_DISPLAY_NAME), input.passwordHash, now, input.code);
      const id = Number(info.lastInsertRowid);
      this.backfillChannelReads(id);
      this.addPageMember(GENERAL_PAGE_ID, id); // invited accounts join it too
      return { user: this.getUserById(id)! };
    });
  }

  // ---- Sessions ----------------------------------------------------------

  createSession(userId: number, token: string, meta: SessionMeta = {}): Session {
    const createdAt = Date.now();
    this.prep(
        `INSERT INTO sessions (token, userId, createdAt, lastSeenAt, ip, ua, network)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(token, userId, createdAt, createdAt, meta.ip ?? null, meta.ua ?? null, meta.network ?? null);
    return { token, userId, createdAt, lastSeenAt: createdAt, ...meta };
  }

  getSession(token: string): Session | undefined {
    const row = this.prep("SELECT * FROM sessions WHERE token = ?").get(token) as
      | Record<string, unknown>
      | undefined;
    if (!row) return undefined;
    return {
      token: row.token as string,
      userId: row.userId as number,
      createdAt: row.createdAt as number,
      lastSeenAt: (row.lastSeenAt as number) || (row.createdAt as number),
      ip: (row.ip as string | null) ?? null,
      ua: (row.ua as string | null) ?? null,
      network: (row.network as string | null) ?? null,
    };
  }

  deleteSession(token: string): void {
    this.prep("DELETE FROM sessions WHERE token = ?").run(token);
  }

  /** Sliding renewal: stamp the session's last authenticated use. `createdAt`
   *  is deliberately NOT touched — it's the provenance of the token. */
  touchSession(token: string): void {
    this.prep("UPDATE sessions SET lastSeenAt = ? WHERE token = ?").run(Date.now(), token);
  }

  /** Every live session, newest use first. Admin-only — the raw token never
   *  leaves the server (routes hand out a derived handle instead). */
  listSessions(): Session[] {
    const rows = this.prep("SELECT * FROM sessions ORDER BY lastSeenAt DESC")
      .all() as Record<string, unknown>[];
    return rows.map((row) => ({
      token: row.token as string,
      userId: row.userId as number,
      createdAt: row.createdAt as number,
      lastSeenAt: (row.lastSeenAt as number) || (row.createdAt as number),
      ip: (row.ip as string | null) ?? null,
      ua: (row.ua as string | null) ?? null,
      network: (row.network as string | null) ?? null,
    }));
  }

  sessionsForUser(userId: number): Session[] {
    return this.listSessions().filter((s) => s.userId === userId);
  }

  // ---- Account security (see routes/auth.ts) -----------------------------

  /** Set (or replace) a user's recovery-secret hash. */
  setSecret(userId: number, secretHash: string): void {
    this.prep("UPDATE users SET secretHash = ? WHERE id = ?").run(secretHash, userId);
  }

  /** Record a network as trusted for this user (idempotent; bumps lastSeenAt). */
  rememberNetwork(userId: number, network: string): void {
    const now = Date.now();
    this.prep(
        `INSERT INTO login_networks (userId, network, createdAt, lastSeenAt) VALUES (?, ?, ?, ?)
         ON CONFLICT(userId, network) DO UPDATE SET lastSeenAt = excluded.lastSeenAt`,
      )
      .run(userId, network, now, now);
  }

  isKnownNetwork(userId: number, network: string): boolean {
    return !!this.prep("SELECT 1 FROM login_networks WHERE userId = ? AND network = ?")
      .get(userId, network);
  }

  /** Brute-force lockout: the epoch-ms the account is locked until (0 = open). */
  loginLockedUntil(userId: number): number {
    const row = this.prep("SELECT lockedUntil FROM users WHERE id = ?").get(userId) as
      | { lockedUntil: number }
      | undefined;
    return row?.lockedUntil ?? 0;
  }

  /**
   * Record a failed login/verify. After LOCK_THRESHOLD consecutive failures the
   * account locks with an escalating backoff (capped). Returns the new
   * lockedUntil (0 if not yet locked). Cleared by clearLoginFailures on success.
   */
  recordLoginFailure(userId: number): number {
    const LOCK_THRESHOLD = 5;
    const BASE_MS = 15_000;
    const CAP_MS = 15 * 60_000;
    // FAILURES FADE (Oct 2026): a lock that ran out over an hour ago is
    // history, so the next failure starts the count afresh instead of going
    // straight back to the fifteen-minute cap.
    const QUIET_MS = 60 * 60_000;
    return this.transaction(() => {
      const row = this.prep("SELECT failedLogins, lockedUntil FROM users WHERE id = ?").get(userId) as
        | { failedLogins: number; lockedUntil: number }
        | undefined;
      const faded = !!row && row.lockedUntil > 0 && Date.now() - row.lockedUntil > QUIET_MS;
      const failed = (faded ? 0 : row?.failedLogins ?? 0) + 1;
      let lockedUntil = 0;
      if (failed >= LOCK_THRESHOLD) {
        const backoff = Math.min(CAP_MS, BASE_MS * 2 ** (failed - LOCK_THRESHOLD));
        lockedUntil = Date.now() + backoff;
      }
      this.prep("UPDATE users SET failedLogins = ?, lockedUntil = ? WHERE id = ?")
        .run(failed, lockedUntil, userId);
      // Log the moment an account first locks — a self-hosted operator watching
      // journalctl can then notice a brute-force attempt in progress.
      if (failed === LOCK_THRESHOLD) {
        const uname = (this.prep("SELECT username FROM users WHERE id = ?").get(userId) as
          | { username: string }
          | undefined)?.username ?? `#${userId}`;
        console.warn(`[security] account "${uname}" locked after ${failed} failed auth attempts`);
      }
      return lockedUntil;
    });
  }

  clearLoginFailures(userId: number): void {
    this.prep("UPDATE users SET failedLogins = 0, lockedUntil = 0 WHERE id = ?").run(userId);
  }

  // ---- The sign-in ledger (migration 65) ---------------------------------
  //
  // Every read below is an ADMIN view and carries raw IPs. None of it is ever
  // attached to a PublicUser or broadcast; the security routes are the only
  // consumers, and `/api/me/sessions` returns a user their own rows only.

  /** Append one sign-in attempt. Must never throw — bookkeeping cannot be
   *  allowed to break a login, least of all a failing one. */
  recordLoginEvent(e: {
    userId: number | null;
    username: string;
    outcome: LoginOutcome;
    ip: string;
    network: string;
    ua?: string | null;
  }): void {
    try {
      this.prep(
          `INSERT INTO login_events (at, userId, username, outcome, ip, network, ua)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          Date.now(),
          e.userId,
          // One line, always (Oct 2026 review): an anonymous login's typed
          // name went verbatim into the weekly report Josh pastes whole.
          String(e.username).replace(/[\x00-\x1f\x7f]+/g, " ").slice(0, 64),
          e.outcome,
          String(e.ip).slice(0, 64),
          String(e.network).slice(0, 64),
          e.ua ? String(e.ua).slice(0, 200) : null,
        );
    } catch {
      /* the ledger must never break the door */
    }
  }

  loginEventsPrune(before: number): number {
    const info = this.prep("DELETE FROM login_events WHERE at < ?").run(before);
    return Number(info.changes ?? 0);
  }

  /** Recent attempts, newest first, optionally narrowed to one account or one
   *  outcome class. */
  listLoginEvents(opts: { limit?: number; userId?: number; outcome?: string; since?: number } = {}): LoginEvent[] {
    const where: string[] = [];
    const args: (number | string)[] = [];
    if (opts.since !== undefined) { where.push("at >= ?"); args.push(opts.since); }
    if (opts.userId !== undefined) { where.push("userId = ?"); args.push(opts.userId); }
    if (opts.outcome) { where.push("outcome = ?"); args.push(opts.outcome); }
    args.push(Math.min(500, Math.max(1, opts.limit ?? 100)));
    return this.prep(
        `SELECT id, at, userId, username, outcome, ip, network, ua FROM login_events
         ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY id DESC LIMIT ?`,
      )
      .all(...args) as unknown as LoginEvent[];
  }

  /** Attempt counts by outcome over a window — the headline row of the panel. */
  loginOutcomeCounts(since: number): { outcome: string; n: number }[] {
    return this.prep(
        `SELECT outcome, count(*) AS n FROM login_events WHERE at >= ?
         GROUP BY outcome ORDER BY n DESC`,
      )
      .all(since) as { outcome: string; n: number }[];
  }

  /** Accounts taking the most failed attempts in the window. */
  failedByAccount(since: number, limit = 10): {
    userId: number | null; username: string; fails: number; ips: number; lastAt: number;
  }[] {
    return this.prep(
        `SELECT userId, username, count(*) AS fails, count(DISTINCT ip) AS ips, max(at) AS lastAt
         FROM login_events
         WHERE at >= ? AND outcome IN ('bad_password','bad_secret','unknown_user','locked','reset_failed')
         GROUP BY username ORDER BY fails DESC LIMIT ?`,
      )
      .all(since, limit) as ReturnType<Store["failedByAccount"]>;
  }

  /**
   * CREDENTIAL STUFFING, which is what an outside attempt on this server would
   * actually look like: one address walking a list of usernames. A human who
   * forgot their password produces many failures against ONE name; a stuffing
   * run produces failures against many. `users` is the column that separates
   * them, so the panel sorts on it, not on raw volume.
   */
  failedByIp(since: number, limit = 10): {
    ip: string; network: string; fails: number; users: number; names: string; lastAt: number;
  }[] {
    return this.prep(
        `SELECT ip, network, count(*) AS fails, count(DISTINCT username) AS users,
                group_concat(DISTINCT username) AS names, max(at) AS lastAt
         FROM login_events
         WHERE at >= ? AND outcome IN ('bad_password','bad_secret','unknown_user','locked','rate_limited','reset_failed')
         GROUP BY ip ORDER BY users DESC, fails DESC LIMIT ?`,
      )
      .all(since, limit) as ReturnType<Store["failedByIp"]>;
  }

  /**
   * Successful sign-ins from more than one network inside `windowMs` — the
   * no-geo-IP version of impossible travel. The /24 is already stored for the
   * new-network challenge, so this costs nothing extra and needs no third
   * party to see your friends' addresses.
   */
  multiNetworkLogins(since: number, windowMs: number): {
    userId: number; username: string; networks: string; at: number;
  }[] {
    return this.prep(
        `SELECT a.userId AS userId, a.username AS username,
                group_concat(DISTINCT a.network) AS networks, max(a.at) AS at
         FROM login_events a
         JOIN login_events b
           ON b.userId = a.userId AND b.network <> a.network
          AND b.outcome IN ('ok','challenge_passed','register')
          AND abs(b.at - a.at) <= ?
         WHERE a.at >= ? AND a.outcome IN ('ok','challenge_passed','register') AND a.userId IS NOT NULL
         GROUP BY a.userId ORDER BY at DESC LIMIT 20`,
      )
      .all(windowMs, since) as ReturnType<Store["multiNetworkLogins"]>;
  }

  /** Accounts under a live brute-force lockout right now. */
  lockedOutAccounts(): { id: number; username: string; failedLogins: number; lockedUntil: number }[] {
    return this.prep(
        `SELECT id, username, failedLogins, lockedUntil FROM users
         WHERE lockedUntil > ? ORDER BY lockedUntil DESC`,
      )
      .all(Date.now()) as ReturnType<Store["lockedOutAccounts"]>;
  }

  /** Live accounts with no recovery secret — they can't be network-challenged,
   *  which makes a stolen password sufficient on its own. */
  accountsWithoutSecret(): { id: number; username: string }[] {
    return this.prep(
        `SELECT id, username FROM users
         WHERE secretHash IS NULL AND disabled = 0 AND locked = 0 AND isBot = 0
         ORDER BY username`,
      )
      .all() as ReturnType<Store["accountsWithoutSecret"]>;
  }

  /** When an account last actually got in (any successful path), or null. */
  lastLoginAt(userId: number): number | null {
    const row = this.prep(
        `SELECT max(at) AS at FROM login_events
         WHERE userId = ? AND outcome IN ('ok','challenge_passed','register')`,
      )
      .get(userId) as { at: number | null } | undefined;
    return row?.at ?? null;
  }

  /**
   * Staff accounts (admin or moderator) — the ones worth watching closely.
   * `locked = 0` matters as much as `disabled`: a scrubbed or banned account
   * is sealed and cannot sign in, so listing it as live privilege overstates
   * the staff surface (and pads the count the posture check reports).
   */
  staffAccounts(): { id: number; username: string; isAdmin: number; role: string }[] {
    return this.prep(
        `SELECT id, username, isAdmin, role FROM users
         WHERE (isAdmin = 1 OR role = 'moderator') AND isBot = 0 AND disabled = 0 AND locked = 0
         ORDER BY isAdmin DESC, username`,
      )
      .all() as ReturnType<Store["staffAccounts"]>;
  }

  // ---- Feedback (bug reports + suggestions) ------------------------------

  createFeedback(userId: number, kind: "bug" | "idea", body: string): FeedbackItem {
    const info = this.prep("INSERT INTO feedback (userId, kind, body, createdAt) VALUES (?, ?, ?, ?)")
      .run(userId, kind, body, Date.now());
    return this.feedbackById(Number(info.lastInsertRowid))!;
  }

  private rowToFeedback(r: Record<string, unknown>): FeedbackItem {
    const author = this.getUserById(r.userId as number);
    return {
      id: r.id as number,
      user: author ? toPublicUser(author) : null,
      kind: r.kind as "bug" | "idea",
      body: r.body as string,
      status: r.status as "open" | "done",
      createdAt: r.createdAt as number,
      resolvedAt: (r.resolvedAt as number | null) ?? null,
    };
  }

  feedbackById(id: number): FeedbackItem | undefined {
    const row = this.prep("SELECT * FROM feedback WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToFeedback(row) : undefined;
  }

  /** Admin view: everything, open first, newest first within each group. */
  listFeedback(): FeedbackItem[] {
    const rows = this.prep("SELECT * FROM feedback ORDER BY (status = 'open') DESC, id DESC")
      .all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToFeedback(r));
  }

  /** A user's own submissions (so they can see what they've filed). */
  listMyFeedback(userId: number): FeedbackItem[] {
    const rows = this.prep("SELECT * FROM feedback WHERE userId = ? ORDER BY id DESC")
      .all(userId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToFeedback(r));
  }

  setFeedbackStatus(id: number, done: boolean): FeedbackItem | undefined {
    this.prep("UPDATE feedback SET status = ?, resolvedAt = ? WHERE id = ?")
      .run(done ? "done" : "open", done ? Date.now() : null, id);
    return this.feedbackById(id);
  }

  // ---- Attachments -------------------------------------------------------
  // Two-phase: POST /api/uploads creates an UNATTACHED row; sending a message
  // claims it (inside the message's transaction). Files are deleted by the
  // retention sweep / message deletion, but claimed rows never are — history
  // keeps its shape and shows an "expired" tile.

  private rowToAttachment(r: Record<string, unknown>): AttachmentDTO {
    return {
      id: r.id as number,
      file: r.file as string,
      name: r.name as string,
      kind: r.kind as AttachmentDTO["kind"],
      mime: r.mime as string,
      bytes: r.bytes as number,
      width: (r.width as number | null) ?? null,
      height: (r.height as number | null) ?? null,
      purged: r.purgedAt != null,
    };
  }

  createAttachment(input: {
    ownerId: number;
    file: string;
    name: string;
    kind: AttachmentDTO["kind"];
    mime: string;
    bytes: number;
    width: number | null;
    height: number | null;
  }): AttachmentDTO {
    const info = this.prep(
        `INSERT INTO attachments (ownerId, file, name, kind, mime, bytes, width, height, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.ownerId, input.file, input.name, input.kind, input.mime,
        input.bytes, input.width, input.height, Date.now(),
      );
    const row = this.prep("SELECT * FROM attachments WHERE id = ?")
      .get(Number(info.lastInsertRowid)) as Record<string, unknown>;
    return this.rowToAttachment(row);
  }

  /** Claim uploads for a just-created message — call INSIDE the message's
   *  transaction. Every id must exist, belong to the sender, and still be
   *  unattached + unpurged; returns false otherwise (caller throws → the
   *  whole message rolls back). The guarded UPDATE means the same upload can
   *  never be attached to two messages. */
  claimAttachments(ids: number[], ownerId: number, scope: "channel" | "dm", messageId: number): boolean {
    for (const id of ids) {
      const info = this.prep(
          `UPDATE attachments SET scope = ?, messageId = ?
           WHERE id = ? AND ownerId = ? AND scope IS NULL AND purgedAt IS NULL`,
        )
        .run(scope, messageId, id, ownerId);
      if (info.changes !== 1) return false;
    }
    return true;
  }

  /** Batch-hydrate attachments for a page of messages (one query). */
  /** The kinds of a set of not-yet-claimed uploads (the page policy check
   *  runs BEFORE the claim). Unknown ids are simply absent. */
  attachmentKinds(ids: number[]): string[] {
    if (!ids.length) return [];
    const marks = ids.map(() => "?").join(",");
    const rows = this.prep(`SELECT kind FROM attachments WHERE id IN (${marks})`).all(...ids) as { kind: string }[];
    return rows.map((r) => r.kind);
  }

  attachmentsFor(scope: "channel" | "dm", messageIds: number[]): Map<number, AttachmentDTO[]> {
    const map = new Map<number, AttachmentDTO[]>();
    if (!messageIds.length) return map;
    const marks = messageIds.map(() => "?").join(",");
    const rows = this.prep(`SELECT * FROM attachments WHERE scope = ? AND messageId IN (${marks}) ORDER BY id`)
      .all(scope, ...messageIds) as Record<string, unknown>[];
    for (const r of rows) {
      const mid = r.messageId as number;
      const list = map.get(mid) ?? [];
      list.push(this.rowToAttachment(r));
      map.set(mid, list);
    }
    return map;
  }

  /** A deleted message's files die with it (a deleted embarrassing image must
   *  stop being served). Stamps purgedAt; returns file refs to dispose —
   *  satelliteId set (F3) means the file lives on that host, not our disk,
   *  and disposal is an RPC rather than an unlink. */
  purgeAttachmentsForMessage(scope: "channel" | "dm", messageId: number): AttachmentFileRef[] {
    const rows = this.prep(
      "SELECT id, file, satelliteId FROM attachments WHERE scope = ? AND messageId = ? AND purgedAt IS NULL",
    ).all(scope, messageId) as { id: number; file: string; satelliteId: number | null }[];
    const now = Date.now();
    for (const r of rows) {
      this.prep("UPDATE attachments SET purgedAt = ? WHERE id = ?").run(now, r.id);
    }
    return rows.map((r) => ({ file: r.file, satelliteId: r.satelliteId ?? null }));
  }

  /** A deleted CHANNEL's (or page's) message files die with it, exactly as a
   *  deleted message's do — without this, deleting a room left every image
   *  in it publicly served for up to 90 days until the age sweep (Aug 2026
   *  review; "a deleted embarrassing image stops being served" must hold
   *  when the whole room goes). Call BEFORE the message rows cascade; rows
   *  keep purgedAt like every other purge. Returns file names to unlink. */
  purgeAttachmentsForChannels(channelIds: number[]): AttachmentFileRef[] {
    if (!channelIds.length) return [];
    const q = channelIds.map(() => "?").join(",");
    // Two joins because a REMOTE channel's messages live in remote_messages,
    // not messages (F3) — without the second arm, deleting a satellite page
    // left its images served until the age sweep.
    const rows = this.prep(
        `SELECT a.id, a.file, a.satelliteId FROM attachments a
         JOIN messages m ON m.id = a.messageId
         WHERE a.scope = 'channel' AND a.purgedAt IS NULL AND m.channelId IN (${q})
         UNION
         SELECT a.id, a.file, a.satelliteId FROM attachments a
         JOIN remote_messages rm ON rm.id = a.messageId
         WHERE a.scope = 'channel' AND a.purgedAt IS NULL AND rm.channelId IN (${q})`,
      )
      .all(...channelIds, ...channelIds) as { id: number; file: string; satelliteId: number | null }[];
    const now = Date.now();
    for (const r of rows) {
      this.prep("UPDATE attachments SET purgedAt = ? WHERE id = ?").run(now, r.id);
    }
    return rows.map((r) => ({ file: r.file, satelliteId: r.satelliteId ?? null }));
  }

  /** Retention: expire attached files past their tier's window (kind 'gif' =
   *  the animated tier). Rows stay (purgedAt stamped); returns files to unlink. */
  sweepExpiredAttachments(now: number, animatedDays: number, staticDays: number): AttachmentFileRef[] {
    // PER-PAGE CLOCKS (migration 89): a channel attachment ages on its
    // page's own dials when set, the server default otherwise; DMs and
    // remote (satellite-indexed) messages age on the default — a remote
    // row's page can't be joined through `messages`, and its host runs its
    // own retention anyway.
    const rows = this.prep(
        `SELECT a.id, a.file, a.satelliteId FROM attachments a
         LEFT JOIN messages m ON a.scope = 'channel' AND m.id = a.messageId
         LEFT JOIN channels c ON c.id = m.channelId
         LEFT JOIN pages p ON p.id = c.pageId
         WHERE a.purgedAt IS NULL AND a.messageId IS NOT NULL
           AND ((a.kind = 'gif' AND a.createdAt < ? - COALESCE(p.animatedDays, ?) * 86400000)
             OR (a.kind != 'gif' AND a.createdAt < ? - COALESCE(p.staticDays, ?) * 86400000))`,
      )
      .all(now, animatedDays, now, staticDays) as { id: number; file: string; satelliteId: number | null }[];
    for (const r of rows) {
      this.prep("UPDATE attachments SET purgedAt = ? WHERE id = ?").run(now, r.id);
    }
    return rows.map((r) => ({ file: r.file, satelliteId: r.satelliteId ?? null }));
  }

  /** Orphans (uploaded, never sent) get deleted outright — row and all. */
  sweepOrphanAttachments(now: number, maxAgeMs: number): string[] {
    const rows = this.prep("SELECT id, file FROM attachments WHERE scope IS NULL AND createdAt < ?")
      .all(now - maxAgeMs) as { id: number; file: string }[];
    for (const r of rows) {
      this.prep("DELETE FROM attachments WHERE id = ?").run(r.id);
    }
    return rows.map((r) => r.file);
  }

  /** MESSAGE RETENTION (migration 89): pages with `messageDays` set lose
   *  messages older than that — rows deleted outright (reactions first, the
   *  migration-82 rule), their attachment FILES purged. Returns the files to
   *  unlink and the count removed. Remote (satellite) content is the host's
   *  to keep or age — its index rows are left alone. */
  purgeOldMessages(now: number): { files: AttachmentFileRef[]; removed: number } {
    const pages = this.prep("SELECT id, messageDays FROM pages WHERE messageDays IS NOT NULL AND satelliteId IS NULL")
      .all() as { id: number; messageDays: number }[];
    const files: AttachmentFileRef[] = [];
    let removed = 0;
    for (const p of pages) {
      const cutoff = now - p.messageDays * 86_400_000;
      this.transaction(() => {
        const ids = this.prep(
            `SELECT m.id FROM messages m JOIN channels c ON c.id = m.channelId
             WHERE c.pageId = ? AND m.createdAt < ? LIMIT 2000`,
          )
          .all(p.id, cutoff) as { id: number }[];
        if (!ids.length) return;
        const marks = ids.map(() => "?").join(",");
        const args = ids.map((r) => r.id);
        const rows = this.prep(
            `SELECT id, file, satelliteId FROM attachments WHERE scope = 'channel' AND purgedAt IS NULL AND messageId IN (${marks})`,
          )
          .all(...args) as { id: number; file: string; satelliteId: number | null }[];
        for (const r of rows) files.push({ file: r.file, satelliteId: r.satelliteId ?? null });
        this.prep(`UPDATE attachments SET purgedAt = ? WHERE scope = 'channel' AND messageId IN (${marks})`).run(now, ...args);
        this.prep(`DELETE FROM message_reactions WHERE messageId IN (${marks})`).run(...args);
        this.prep(`DELETE FROM messages WHERE id IN (${marks})`).run(...args);
        removed += ids.length;
      });
    }
    return { files, removed };
  }

  /** The composer's ✕ on a not-yet-sent upload (owner only, unattached only).
   *  Returns the file to unlink, or null if it isn't theirs / already sent. */
  deleteOrphanAttachment(id: number, ownerId: number): string | null {
    const row = this.prep("SELECT file FROM attachments WHERE id = ? AND ownerId = ? AND scope IS NULL")
      .get(id, ownerId) as { file: string } | undefined;
    if (!row) return null;
    this.prep("DELETE FROM attachments WHERE id = ?").run(id);
    return row.file;
  }

  // ---- Remote attachment files (FEDERATION F3) ---------------------------

  /** Look a served file up by its uuid name — the serve route's fallback when
   *  the file isn't on the hub's disk (shipped to a satellite, or purged). */
  attachmentByFile(file: string): { id: number; satelliteId: number | null; mime: string; purged: boolean } | null {
    const r = this.prep("SELECT id, satelliteId, mime, purgedAt FROM attachments WHERE file = ?")
      .get(file) as { id: number; satelliteId: number | null; mime: string; purgedAt: number | null } | undefined;
    if (!r) return null;
    return { id: r.id, satelliteId: r.satelliteId ?? null, mime: r.mime, purged: r.purgedAt != null };
  }

  /** Stamp a completed transfer: the file now lives on the satellite and the
   *  hub copy may be unlinked. Guarded on purgedAt — a file purged mid-flight
   *  (message deleted while shipping) must not come back as "remote". */
  markAttachmentRemote(id: number, satelliteId: number): boolean {
    return this.prep("UPDATE attachments SET satelliteId = ? WHERE id = ? AND purgedAt IS NULL")
      .run(satelliteId, id).changes === 1;
  }

  /** Claimed-to-a-remote-message rows whose file still sits on the hub's disk
   *  (a transfer that hasn't happened or didn't finish — the satellite was
   *  offline). The messageId IS the global id, so the target satellite is
   *  pure arithmetic; the sweep retries these whenever the link is up. */
  pendingRemoteAttachments(): { id: number; file: string; kind: AttachmentDTO["kind"]; messageId: number }[] {
    return this.prep(
      `SELECT id, file, kind, messageId FROM attachments
       WHERE scope = 'channel' AND messageId >= 1000000000 AND satelliteId IS NULL AND purgedAt IS NULL`,
    ).all() as never;
  }

  /** Cheap pre-flight for a remote post: every id exists, is the sender's,
   *  and is still unattached — checked BEFORE the RPC creates the remote
   *  message, so the common failure never strands a bodyless message on the
   *  host. claimAttachments stays the atomic authority afterwards. */
  attachmentsClaimable(ids: number[], ownerId: number): boolean {
    for (const id of ids) {
      const r = this.prep(
        "SELECT 1 FROM attachments WHERE id = ? AND ownerId = ? AND scope IS NULL AND purgedAt IS NULL",
      ).get(id, ownerId);
      if (!r) return false;
    }
    return true;
  }

  // ---- Channels ----------------------------------------------------------

  // ---- PAGES (migration 63) --------------------------------------------------
  // A page owns channels; membership decides who may see it at all. The
  // GENERAL page is special-cased in exactly two ways and nowhere else: it
  // cannot be deleted, and everyone is enrolled in it automatically.

  private rowToPage(r: Record<string, unknown>): Page {
    const policy = r.joinPolicy === "request" || r.joinPolicy === "invite" ? r.joinPolicy : "open";
    return {
      id: r.id as number,
      name: r.name as string,
      description: (r.description as string | null) ?? null,
      icon: (r.icon as string | null) ?? null,
      isPublic: !!r.isPublic,
      discoverable: !!r.discoverable,
      joinPolicy: policy,
      createdBy: r.createdBy as number,
      createdAt: r.createdAt as number,
      position: (r.position as number | null) ?? 0,
      defaultChannelId: (r.defaultChannelId as number | null) ?? null,
      botChannelId: (r.botChannelId as number | null) ?? null,
      satelliteId: (r.satelliteId as number | null) ?? null,
      allowImages: r.allowImages === undefined ? true : !!r.allowImages,
      allowGifs: r.allowGifs === undefined ? true : !!r.allowGifs,
      staticDays: (r.staticDays as number | null) ?? null,
      animatedDays: (r.animatedDays as number | null) ?? null,
      messageDays: (r.messageDays as number | null) ?? null,
    };
  }

  listPages(): Page[] {
    const rows = this.prep("SELECT * FROM pages ORDER BY position, id").all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToPage(r));
  }

  /** Text channels in a page — the per-page floor for the delete guard. */
  countPageTextChannels(pageId: number): number {
    return (
      this.prep("SELECT COUNT(*) AS n FROM channels WHERE pageId = ? AND kind <> ?")
        .get(pageId, "voice") as { n: number }
    ).n;
  }

  getPage(id: number): Page | undefined {
    const row = this.prep("SELECT * FROM pages WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToPage(row) : undefined;
  }

  createPage(input: {
    name: string;
    description?: string | null;
    joinPolicy: PageJoinPolicy;
    discoverable: boolean;
    createdBy: number;
    /** FEDERATION: bind this page's content to a satellite (F2). */
    satelliteId?: number | null;
  }): Page {
    return this.transaction(() => {
      const now = Date.now();
      const pos = (this.prep("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM pages").get() as { p: number }).p;
      // isPublic (the content-privacy flag) is DERIVED: open = public
      // content, anything else is members-only on the wire. An open page is
      // always discoverable — nobody can walk into a door they can't see.
      const discoverable = input.joinPolicy === "open" ? true : input.discoverable;
      const info = this.prep(
          "INSERT INTO pages (name, description, icon, isPublic, discoverable, joinPolicy, createdBy, createdAt, position, satelliteId)" +
            " VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          input.name, input.description ?? null,
          input.joinPolicy === "open" ? 1 : 0, discoverable ? 1 : 0, input.joinPolicy,
          input.createdBy, now, pos, input.satelliteId ?? null,
        );
      const id = Number(info.lastInsertRowid);
      // Its creator manages it from the start — otherwise a moderator could
      // make a page they have no authority inside.
      this.prep("INSERT OR REPLACE INTO page_members (pageId, userId, role, addedAt) VALUES (?, ?, 'manager', ?)")
        .run(id, input.createdBy, now);
      this.ensureEveryoneRole(Number(info.lastInsertRowid));
      return this.getPage(id)!;
    });
  }

  updatePage(
    id: number,
    fields: {
      name?: string;
      description?: string | null;
      joinPolicy?: PageJoinPolicy;
      discoverable?: boolean;
      icon?: string | null;
      defaultChannelId?: number | null;
      botChannelId?: number | null;
      allowImages?: boolean;
      allowGifs?: boolean;
      staticDays?: number | null;
      animatedDays?: number | null;
      messageDays?: number | null;
    },
  ): Page | undefined {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (fields.name !== undefined) { sets.push("name = ?"); values.push(fields.name); }
    if (fields.allowImages !== undefined) { sets.push("allowImages = ?"); values.push(fields.allowImages ? 1 : 0); }
    if (fields.allowGifs !== undefined) { sets.push("allowGifs = ?"); values.push(fields.allowGifs ? 1 : 0); }
    if (fields.staticDays !== undefined) { sets.push("staticDays = ?"); values.push(fields.staticDays); }
    if (fields.animatedDays !== undefined) { sets.push("animatedDays = ?"); values.push(fields.animatedDays); }
    if (fields.messageDays !== undefined) { sets.push("messageDays = ?"); values.push(fields.messageDays); }
    if (fields.description !== undefined) { sets.push("description = ?"); values.push(fields.description); }
    if (fields.joinPolicy !== undefined) {
      // isPublic follows the policy, always (the invariant every wire check
      // rides on); switching TO open forces discoverable. Any policy that
      // ISN'T "request" clears the pending knocks — open means the door is
      // simply open now, and invite means they can never be answered (they
      // used to survive a request→invite flip as invisible, unanswerable
      // rows that resurrected if the policy ever flipped back — Sep 2026
      // review). The route tells the requesters via pushPage's alsoTell.
      sets.push("joinPolicy = ?", "isPublic = ?");
      values.push(fields.joinPolicy, fields.joinPolicy === "open" ? 1 : 0);
      if (fields.joinPolicy === "open") { sets.push("discoverable = 1"); }
      if (fields.joinPolicy !== "request") this.prep("DELETE FROM page_join_requests WHERE pageId = ?").run(id);
    }
    if (fields.discoverable !== undefined && fields.joinPolicy !== "open") {
      sets.push("discoverable = ?");
      values.push(fields.discoverable ? 1 : 0);
    }
    if (fields.icon !== undefined) { sets.push("icon = ?"); values.push(fields.icon); }
    if (fields.defaultChannelId !== undefined) { sets.push("defaultChannelId = ?"); values.push(fields.defaultChannelId); }
    if (fields.botChannelId !== undefined) { sets.push("botChannelId = ?"); values.push(fields.botChannelId); }
    if (!sets.length) return this.getPage(id);
    values.push(id);
    this.prep(`UPDATE pages SET ${sets.join(", ")} WHERE id = ?`).run(...(values as never[]));
    // An open page can never be hidden, whatever order the fields arrived in.
    this.prep("UPDATE pages SET discoverable = 1 WHERE id = ? AND joinPolicy = 'open'").run(id);
    return this.getPage(id);
  }

  // ---- Join requests (migration 77): the knock on a request-policy door ----

  /** File a knock. Idempotent — returns whether this call actually filed one,
   *  so the route can skip the page.change fan-out on a repeat knock (a
   *  knock-spammer used to re-light every manager's badge for free). */
  addPageRequest(pageId: number, userId: number): boolean {
    return (
      this.prep("INSERT OR IGNORE INTO page_join_requests (pageId, userId, at) VALUES (?, ?, ?)")
        .run(pageId, userId, Date.now()).changes > 0
    );
  }

  removePageRequest(pageId: number, userId: number): boolean {
    return this.prep("DELETE FROM page_join_requests WHERE pageId = ? AND userId = ?").run(pageId, userId).changes > 0;
  }

  pageRequestExists(pageId: number, userId: number): boolean {
    return !!this.prep("SELECT 1 FROM page_join_requests WHERE pageId = ? AND userId = ?").get(pageId, userId);
  }

  pageRequests(pageId: number): { userId: number; at: number }[] {
    return this.prep("SELECT userId, at FROM page_join_requests WHERE pageId = ? ORDER BY at")
      .all(pageId) as { userId: number; at: number }[];
  }

  pageRequestCount(pageId: number): number {
    return (this.prep("SELECT COUNT(*) AS n FROM page_join_requests WHERE pageId = ?").get(pageId) as { n: number }).n;
  }

  // ---- Batched picker reads (Sep 2026 perf pass) ---------------------------
  // GET /api/pages used to run three queries PER page (members, request
  // count, own-knock probe) — O(pages) round trips for one picker load.
  // These three feed the whole list in three queries flat.

  /** Every membership row on the server, grouped by page. Bounded by
   *  members × pages (friend-group scale: a few thousand rows at worst). */
  allPageMemberships(): Map<number, { userId: number; role: PageRole }[]> {
    const rows = this.prep("SELECT pageId, userId, role FROM page_members").all() as {
      pageId: number; userId: number; role: PageRole;
    }[];
    const out = new Map<number, { userId: number; role: PageRole }[]>();
    for (const r of rows) {
      const list = out.get(r.pageId) ?? [];
      list.push({ userId: r.userId, role: r.role });
      out.set(r.pageId, list);
    }
    return out;
  }

  /** Pending-knock counts for every page in one query. */
  pageRequestCounts(): Map<number, number> {
    const rows = this.prep("SELECT pageId, COUNT(*) AS n FROM page_join_requests GROUP BY pageId").all() as {
      pageId: number; n: number;
    }[];
    return new Map(rows.map((r) => [r.pageId, r.n]));
  }

  /** Every page this user has a knock pending on. */
  pageRequestIdsFor(userId: number): Set<number> {
    const rows = this.prep("SELECT pageId FROM page_join_requests WHERE userId = ?").all(userId) as {
      pageId: number;
    }[];
    return new Set(rows.map((r) => r.pageId));
  }

  // ---- FEDERATION F1 (migration 79): the satellite registry ----------------
  // FEDERATION.md is the design authority. Provisioning keys are the invite
  // shape: hashed at rest, single-use via a guarded UPDATE, expiring,
  // revocable. The satellite's credential is its Ed25519 PUBLIC key.

  private static SAT_KEY_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no 0/O/1/I/L/U

  private hashSatKey(code: string): string {
    return createHash("sha256").update(code).digest("hex");
  }

  /** Mint a provisioning key (ADMIN action; the route enforces it). The
   *  cleartext code is returned exactly once — only its hash is stored. */
  mintSatelliteKey(input: {
    ownerUserId: number; note: string | null; createdBy: number; ttlMs: number;
    /** F3: set = a ROTATION key — redeeming replaces that satellite's pubkey
     *  instead of registering a new row (the lost/compromised-box flow). */
    rotatesSatelliteId?: number | null;
  }): {
    id: number; code: string; expiresAt: number;
  } {
    let code = "";
    for (let i = 0; i < 20; i++) code += Store.SAT_KEY_ALPHABET[randomInt(Store.SAT_KEY_ALPHABET.length)];
    const now = Date.now();
    const expiresAt = now + input.ttlMs;
    const info = this.prep(
      "INSERT INTO satellite_keys (codeHash, ownerUserId, note, createdBy, createdAt, expiresAt, rotatesSatelliteId) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(this.hashSatKey(code), input.ownerUserId, input.note, input.createdBy, now, expiresAt, input.rotatesSatelliteId ?? null);
    return { id: Number(info.lastInsertRowid), code, expiresAt };
  }

  listSatelliteKeys(): {
    id: number; ownerUserId: number; note: string | null; createdBy: number;
    createdAt: number; expiresAt: number; usedAt: number | null;
    usedBySatelliteId: number | null; revoked: boolean; rotatesSatelliteId: number | null;
  }[] {
    return (this.prep("SELECT * FROM satellite_keys ORDER BY createdAt DESC").all() as Record<string, unknown>[])
      .map((r) => ({
        id: r.id as number,
        ownerUserId: r.ownerUserId as number,
        note: (r.note as string | null) ?? null,
        createdBy: r.createdBy as number,
        createdAt: r.createdAt as number,
        expiresAt: r.expiresAt as number,
        usedAt: (r.usedAt as number | null) ?? null,
        usedBySatelliteId: (r.usedBySatelliteId as number | null) ?? null,
        revoked: !!r.revoked,
        rotatesSatelliteId: (r.rotatesSatelliteId as number | null) ?? null,
      }));
  }

  revokeSatelliteKey(id: number): boolean {
    return this.prep("UPDATE satellite_keys SET revoked = 1 WHERE id = ? AND usedAt IS NULL").run(id).changes > 0;
  }

  /** Is this provisioning key currently redeemable? A read, never a burn —
   *  the Linux CLI bundle download presents the key as its invitation
   *  (a server has no browser session), and downloading must not spend the
   *  single use that registration spends. Same checks as redemption. */
  peekSatelliteKey(code: string): boolean {
    return !!this.prep(
      "SELECT 1 FROM satellite_keys WHERE codeHash = ? AND usedAt IS NULL AND revoked = 0 AND expiresAt > ?",
    ).get(this.hashSatKey(code), Date.now());
  }

  /** Redeem a provisioning key and register the satellite, atomically. The
   *  guarded UPDATE is the race lock — two racers can never both win, and a
   *  refused redemption touches nothing. Returns the new satellite id, or
   *  null (bad/used/revoked/expired key). */
  redeemSatelliteKey(input: {
    code: string; name: string; pubkey: string; version: string; network: string | null;
    /** F8: the Linux wizard's privacy answer, honoured when the page
     *  auto-creates on first connect. null = defaults (open+discoverable).
     *  Ignored on rotation — the page already exists. */
    pageJoinPolicy?: string | null; pageDiscoverable?: boolean | null;
  }):
    { satelliteId: number; ownerUserId: number; rotated: boolean } | null {
    return this.transaction(() => {
      const now = Date.now();
      const hash = this.hashSatKey(input.code);
      const claimed = this.prep(
        "UPDATE satellite_keys SET usedAt = ? WHERE codeHash = ? AND revoked = 0 AND usedAt IS NULL AND expiresAt > ?",
      ).run(now, hash, now);
      if (claimed.changes === 0) return null;
      const key = this.prep("SELECT id, ownerUserId, rotatesSatelliteId FROM satellite_keys WHERE codeHash = ?").get(hash) as {
        id: number; ownerUserId: number; rotatesSatelliteId: number | null;
      };
      // F3 ROTATION: the key replaces an existing satellite's identity — the
      // old pubkey dies HERE, atomically with the redemption, so a stolen old
      // private key can't handshake the moment the host redeems the new one.
      // The row (and with it the page binding, name and history index) stays.
      if (key.rotatesSatelliteId != null) {
        const upd = this.prep(
          "UPDATE satellites SET pubkey = ?, version = ?, network = ? WHERE id = ? AND status = 'active'",
        ).run(input.pubkey, input.version, input.network, key.rotatesSatelliteId);
        if (upd.changes === 0) return null; // delisted or gone — the key dies unspent-but-used
        this.prep("UPDATE satellite_keys SET usedBySatelliteId = ? WHERE id = ?")
          .run(key.rotatesSatelliteId, key.id);
        // NB the id-space problem a rotation onto a FRESH box would create
        // (its content.db minting ids from 1 again, colliding into the old
        // index rows) is solved by ID-FLOOR SEEDING, not by wiping: every
        // welcome frame carries the hub's max indexed id and the daemon
        // bumps its counter above it. A wipe here was considered and
        // rejected — the documented rotation flow is "restore your backup
        // first", and wiping would destroy exactly that restored history.
        return { satelliteId: key.rotatesSatelliteId, ownerUserId: key.ownerUserId, rotated: true };
      }
      const info = this.prep(
        "INSERT INTO satellites (name, ownerUserId, pubkey, version, status, network, createdAt, pageJoinPolicy, pageDiscoverable) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)",
      ).run(input.name, key.ownerUserId, input.pubkey, input.version, input.network, now,
        input.pageJoinPolicy ?? null, input.pageDiscoverable == null ? null : input.pageDiscoverable ? 1 : 0);
      const satelliteId = Number(info.lastInsertRowid);
      this.prep("UPDATE satellite_keys SET usedBySatelliteId = ? WHERE id = ?").run(satelliteId, key.id);
      return { satelliteId, ownerUserId: key.ownerUserId, rotated: false };
    });
  }

  getSatellite(id: number): {
    id: number; name: string; ownerUserId: number; pubkey: string; version: string;
    status: string; network: string | null; lastSeenAt: number | null; createdAt: number;
    pageJoinPolicy: string | null; pageDiscoverable: boolean | null;
    /** THE HOST AGREEMENT version accepted at registration (null = none on
     *  file — a pre-Sep-2026 satellite). */
    hostingVersion: number | null; hostingAcceptedAt: number | null;
  } | undefined {
    const r = this.prep("SELECT * FROM satellites WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!r) return undefined;
    return {
      id: r.id as number, name: r.name as string, ownerUserId: r.ownerUserId as number,
      pubkey: r.pubkey as string, version: r.version as string, status: r.status as string,
      network: (r.network as string | null) ?? null, lastSeenAt: (r.lastSeenAt as number | null) ?? null,
      createdAt: r.createdAt as number,
      pageJoinPolicy: (r.pageJoinPolicy as string | null) ?? null,
      pageDiscoverable: r.pageDiscoverable == null ? null : !!r.pageDiscoverable,
      hostingVersion: (r.hostingVersion as number | null) ?? null,
      hostingAcceptedAt: (r.hostingAcceptedAt as number | null) ?? null,
    };
  }

  listSatellites(): ReturnType<Store["getSatellite"]>[] {
    return (this.prep("SELECT id FROM satellites ORDER BY createdAt").all() as { id: number }[])
      .map((r) => this.getSatellite(r.id));
  }

  setSatelliteStatus(id: number, status: "active" | "revoked"): void {
    this.prep("UPDATE satellites SET status = ? WHERE id = ?").run(status, id);
  }

  /** Stamp a successful connect. Returns the PREVIOUS network so the link
   *  can raise the new-network finding. */
  touchSatellite(id: number, network: string | null, version: string): string | null {
    const prev = (this.prep("SELECT network FROM satellites WHERE id = ?").get(id) as { network: string | null } | undefined)
      ?.network ?? null;
    this.prep("UPDATE satellites SET lastSeenAt = ?, network = ?, version = ? WHERE id = ?")
      .run(Date.now(), network, version, id);
    return prev;
  }

  recordSatelliteEvent(kind: string, satelliteId: number | null, ip: string | null, detail: string | null): void {
    try {
      // Clamped at the LAST door: parts of the detail string originate in
      // unauthenticated hello frames, and an unclamped write here was
      // permanent DB growth an attacker could feed by the megabyte.
      this.prep("INSERT INTO satellite_events (at, satelliteId, kind, ip, detail) VALUES (?, ?, ?, ?, ?)")
        .run(Date.now(), satelliteId, String(kind).slice(0, 40), ip ? String(ip).slice(0, 64) : null,
          detail != null ? String(detail).slice(0, 300) : null);
    } catch {
      /* the ledger must never take the link down */
    }
  }

  satelliteEvents(limit = 100): { id: number; at: number; satelliteId: number | null; kind: string; ip: string | null; detail: string | null }[] {
    return this.prep("SELECT * FROM satellite_events ORDER BY at DESC, id DESC LIMIT ?").all(limit) as never;
  }

  /** Satellite-backed pages (F3: the search fan-out's routing table). */
  satellitePages(): { pageId: number; satelliteId: number }[] {
    return this.prep("SELECT id AS pageId, satelliteId FROM pages WHERE satelliteId IS NOT NULL")
      .all() as never;
  }

  /** A page's channel ids + names (F3 search hydrates channelName hub-side). */
  channelNamesOfPage(pageId: number): Map<number, string> {
    const rows = this.prep("SELECT id, name FROM channels WHERE pageId = ?").all(pageId) as
      { id: number; name: string }[];
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  // ---- Satellite error ledger (F6) ---------------------------------------

  /** Fold one drained error in: same signature bumps count + lastSeen; a
   *  signature marked FIXED that recurs AFTER the fix reopens (regression).
   *  Capped at 500 distinct signatures per satellite — a hostile or broken
   *  host can't grow the ledger without bound. */
  upsertSatelliteError(satelliteId: number, kind: string, message: string, at: number): void {
    const hash = createHash("sha256").update(`${kind}|${message}`).digest("hex").slice(0, 16);
    const existing = this.prep("SELECT id, status, fixedAt FROM satellite_errors WHERE satelliteId = ? AND hash = ?")
      .get(satelliteId, hash) as { id: number; status: string; fixedAt: number | null } | undefined;
    if (existing) {
      const reopen = existing.status === "fixed" && existing.fixedAt != null && at > existing.fixedAt;
      this.prep(
        `UPDATE satellite_errors SET count = count + 1, lastSeenAt = MAX(lastSeenAt, ?)${reopen ? ", status = 'new'" : ""} WHERE id = ?`,
      ).run(at, existing.id);
      return;
    }
    const n = (this.prep("SELECT COUNT(*) AS n FROM satellite_errors WHERE satelliteId = ?")
      .get(satelliteId) as { n: number }).n;
    if (n >= 500) return;
    this.prep(
      "INSERT INTO satellite_errors (satelliteId, hash, kind, message, firstSeenAt, lastSeenAt) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(satelliteId, hash, kind.slice(0, 40), message.slice(0, 500), at, at);
  }

  satelliteErrorsUnfixed(): {
    id: number; satelliteId: number; kind: string; message: string;
    firstSeenAt: number; lastSeenAt: number; count: number; fixedAt: number | null;
  }[] {
    return this.prep(
      "SELECT id, satelliteId, kind, message, firstSeenAt, lastSeenAt, count, fixedAt FROM satellite_errors WHERE status = 'new' ORDER BY satelliteId, lastSeenAt DESC",
    ).all() as never;
  }

  /** The weekly workflow's second half: everything currently exported has
   *  been processed — remember the signatures as fixed. */
  markSatelliteErrorsFixed(): number {
    // Only what the last export showed: a signature first seen (or seen
    // again) after the download was never processed, so it stays open.
    const upTo = Number(this.kvGet("sat_err_exported_at") ?? 0) || 0;
    return Number(this.prep("UPDATE satellite_errors SET status = 'fixed', fixedAt = ? WHERE status = 'new' AND lastSeenAt <= ?")
      .run(Date.now(), upTo).changes);
  }

  /** A year of memory, then the ledger lets go (fixed and unfixed alike).
   *  The EVENT ledger prunes on the same clock — it had no retention at all,
   *  which combined with unauthenticated hello writes made it the one table
   *  an outsider could grow forever. */
  pruneSatelliteErrors(now = Date.now()): number {
    const cutoff = now - 365 * 24 * 60 * 60 * 1000;
    this.prep("DELETE FROM satellite_events WHERE at < ?").run(cutoff);
    return Number(this.prep("DELETE FROM satellite_errors WHERE lastSeenAt < ?").run(cutoff).changes);
  }

  /** The page bound to a satellite (v1: one community per satellite). */
  pageForSatellite(satelliteId: number): Page | undefined {
    const row = this.prep("SELECT * FROM pages WHERE satelliteId = ?").get(satelliteId) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToPage(row) : undefined;
  }

  // ---- The remote-message INDEX (F2, migration 80) -------------------------
  // id/author/timestamp only, never a body: enough for unread counts and for
  // edit/delete authority to stay hub-side. Ids are GLOBAL (satelliteId ×
  // 1e9 + the satellite's own id).

  /** False = the global id was ALREADY indexed — a satellite reusing an id
   *  (hostile, or a stale counter). The caller must treat that create as
   *  failed: the ignored insert keeps the OLD row's author, so accepting it
   *  would hang the new poster's attachments on someone else's message. */
  recordRemoteMessage(channelId: number, id: number, userId: number, at: number): boolean {
    // The key is (channelId, id), so INSERT OR IGNORE alone only refused a
    // reused id in the SAME channel — a host answering a create for channel B
    // with an id already indexed in channel A gave one global id two rows,
    // and every lookup by id (authority, reactions, attachments) then read an
    // arbitrary one of them (Sep 2026 review). A global id is claimed once.
    if (this.remoteMessageInfo(id)) return false;
    return this.prep("INSERT OR IGNORE INTO remote_messages (channelId, id, userId, at) VALUES (?, ?, ?, ?)")
      .run(channelId, id, userId, at).changes > 0;
  }

  remoteMessageInfo(id: number): { channelId: number; id: number; userId: number; at: number; deletedAt: number | null } | undefined {
    return this.prep("SELECT * FROM remote_messages WHERE id = ?").get(id) as never;
  }

  /** The highest REMOTE-space message id ever indexed for a satellite (0 if
   *  none) — the welcome frame's floorId, which the daemon seeds its own id
   *  counter above so a rotated-onto-a-fresh-box community can't collide. */
  maxRemoteIdFor(satelliteId: number): number {
    const lo = satelliteId * 1_000_000_000;
    const r = this.prep("SELECT MAX(id) AS m FROM remote_messages WHERE id >= ? AND id < ?")
      .get(lo, lo + 1_000_000_000) as { m: number | null };
    const live = r.m != null ? Number(r.m) - lo : 0;
    // A HIGH-WATER MARK THAT NEVER FALLS (Oct 2026 review): deleting a room
    // deletes its index rows, which lowered the floor sent in the welcome, so
    // a host rotated onto a fresh box minted those ids again — and the new
    // posts inherited the deleted room's attachment rows.
    const kept = Number(this.kvGet(`sat_floor:${satelliteId}`) ?? 0) || 0;
    return Math.max(live, kept);
  }

  /** Delete a channel's remote index rows, first keeping each satellite's
   *  highest id as its floor (see maxRemoteIdFor). */
  private dropRemoteIndex(channelId: number): void {
    const rows = this.prep(
      "SELECT CAST(id / 1000000000 AS INTEGER) AS sat, MAX(id) AS m FROM remote_messages WHERE channelId = ? GROUP BY sat",
    ).all(channelId) as { sat: number; m: number }[];
    for (const r of rows) {
      const local = Number(r.m) - Number(r.sat) * 1_000_000_000;
      const key = `sat_floor:${r.sat}`;
      if (local > (Number(this.kvGet(key) ?? 0) || 0)) this.kvSet(key, String(local));
    }
    this.prep("DELETE FROM remote_messages WHERE channelId = ?").run(channelId);
  }

  /** Batch form (F4): the index rows for a page of global ids — the AUTHORITY
   *  a satellite's answers are vetted against (author, channel, timestamps,
   *  hub-sanctioned deletions). One query per history read, not one per row. */
  remoteMessageInfos(ids: number[]): Map<number, { channelId: number; userId: number; at: number; deletedAt: number | null }> {
    const map = new Map<number, { channelId: number; userId: number; at: number; deletedAt: number | null }>();
    if (!ids.length) return map;
    const marks = ids.map(() => "?").join(",");
    const rows = this.prep(`SELECT id, channelId, userId, at, deletedAt FROM remote_messages WHERE id IN (${marks})`)
      .all(...ids) as { id: number; channelId: number; userId: number; at: number; deletedAt: number | null }[];
    for (const r of rows) map.set(r.id, { channelId: r.channelId, userId: r.userId, at: r.at, deletedAt: r.deletedAt ?? null });
    return map;
  }

  markRemoteMessageDeleted(id: number): void {
    this.prep("UPDATE remote_messages SET deletedAt = ? WHERE id = ?").run(Date.now(), id);
  }

  /** Failed handshakes against one satellite id in the window — the probing
   *  signal (someone holding a stolen identity but not the private key). */
  recentHandshakeFails(satelliteId: number, windowMs: number): number {
    return (this.prep(
      "SELECT COUNT(*) AS n FROM satellite_events WHERE satelliteId = ? AND kind = 'handshake_failed' AND at > ?",
    ).get(satelliteId, Date.now() - windowMs) as { n: number }).n;
  }

  /** Reorder the whole page rail (staff action — the channel-reorder shape).
   *  `ids` must be a complete permutation of every page id. */
  reorderPages(ids: number[]): boolean {
    return this.transaction(() => {
      const all = (this.prep("SELECT id FROM pages").all() as { id: number }[]).map((r) => r.id);
      if (ids.length !== all.length || new Set(ids).size !== ids.length) return false;
      const known = new Set(all);
      if (!ids.every((id) => known.has(id))) return false;
      ids.forEach((id, i) => this.prep("UPDATE pages SET position = ? WHERE id = ?").run(i + 1, id));
      return true;
    });
  }

  /** Delete a page and everything under it. The GENERAL page is refused —
   *  it is where every account lives, so losing it would strand everyone. */
  deletePage(id: number): { ok: boolean; channels: number } {
    if (id === GENERAL_PAGE_ID) return { ok: false, channels: 0 };
    return this.transaction(() => {
      const chans = this.prep("SELECT id FROM channels WHERE pageId = ?").all(id) as { id: number }[];
      // Plain statements, NOT deleteChannel(): transaction() does not nest in
      // this store, and the page delete is already inside one. (Same rule
      // killUser lives by.) The page's channels all go together anyway, so
      // the parent/child walk deleteChannel does is redundant here.
      // Reactions FIRST (migration 82: no FK cascades them anymore, local or
      // remote) — the subqueries need the message rows still standing, and
      // the channels delete below cascades the local ones away.
      for (const c of chans) {
        this.prep(
          "DELETE FROM message_reactions WHERE messageId IN (SELECT id FROM remote_messages WHERE channelId = ?)",
        ).run(c.id);
        this.prep(
          "DELETE FROM message_reactions WHERE messageId IN (SELECT id FROM messages WHERE channelId = ?)",
        ).run(c.id);
        // FEDERATION (F2): a satellite page's message INDEX dies with its
        // channels (the bodies stay on the host's own disk — theirs to keep).
        this.dropRemoteIndex(c.id);
      }
      this.prep("DELETE FROM channels WHERE pageId = ?").run(id);
      for (const c of chans) this.prep("DELETE FROM channel_roles WHERE channelId = ?").run(c.id);
      this.prep("DELETE FROM page_member_roles WHERE pageId = ?").run(id);
      this.prep("DELETE FROM page_roles WHERE pageId = ?").run(id);
      this.prep("DELETE FROM page_members WHERE pageId = ?").run(id);
      this.prep("DELETE FROM page_join_requests WHERE pageId = ?").run(id);
      this.prep("DELETE FROM pages WHERE id = ?").run(id);
      return { ok: true, channels: chans.length };
    });
  }

  pageMembers(pageId: number): { userId: number; role: PageRole; addedAt: number }[] {
    return this.prep("SELECT userId, role, addedAt FROM page_members WHERE pageId = ? ORDER BY addedAt")
      .all(pageId) as { userId: number; role: PageRole; addedAt: number }[];
  }

  /** ADMINS — the accounts canSeePage/canEnterPage always admit. Realtime
   *  unions these into a private page's audience so their live traffic
   *  matches their HTTP access. Moderators were removed Sep 2026 (Josh:
   *  "moderators only have power in the pages they are assigned to") — a
   *  mod hears a hidden page only as its member. Bots excluded. */
  adminIds(): number[] {
    return (
      this.prep("SELECT id FROM users WHERE isAdmin = 1 AND isBot = 0 AND deletedAt IS NULL")
        .all() as { id: number }[]
    ).map((r) => r.id);
  }

  pageMemberCount(pageId: number): number {
    return (this.prep("SELECT COUNT(*) AS n FROM page_members WHERE pageId = ?").get(pageId) as { n: number }).n;
  }

  /** The caller's standing in a page, or null if they aren't a member. */
  pageRole(pageId: number, userId: number): PageRole | null {
    const row = this.prep("SELECT role FROM page_members WHERE pageId = ? AND userId = ?")
      .get(pageId, userId) as { role: PageRole } | undefined;
    return row?.role ?? null;
  }

  /** Every page id this user belongs to (one query, for list building). */
  pageRolesFor(userId: number): Map<number, PageRole> {
    const rows = this.prep("SELECT pageId, role FROM page_members WHERE userId = ?")
      .all(userId) as { pageId: number; role: PageRole }[];
    return new Map(rows.map((r) => [r.pageId, r.role]));
  }

  addPageMember(pageId: number, userId: number, role: PageRole = "member"): void {
    this.prep("INSERT OR IGNORE INTO page_members (pageId, userId, role, addedAt) VALUES (?, ?, ?, ?)")
      .run(pageId, userId, role, Date.now());
  }

  setPageRole(pageId: number, userId: number, role: PageRole): void {
    this.prep("UPDATE page_members SET role = ? WHERE pageId = ? AND userId = ?").run(role, pageId, userId);
  }

  removePageMember(pageId: number, userId: number): void {
    if (pageId === GENERAL_PAGE_ID) return; // nobody leaves the main hall
    this.prep("DELETE FROM page_members WHERE pageId = ? AND userId = ?").run(pageId, userId);
    this.prep("DELETE FROM page_member_roles WHERE pageId = ? AND userId = ?").run(pageId, userId);
  }

  // ---- PAGE ROLES (migration 90) -------------------------------------------

  private rowToRole(r: Record<string, unknown>): PageRoleDef {
    let perms: Perm[] = [];
    try {
      const raw = JSON.parse(String(r.perms ?? "[]"));
      if (Array.isArray(raw)) perms = raw.filter(isPerm);
    } catch { /* a corrupt row grants nothing */ }
    return {
      id: r.id as number,
      pageId: r.pageId as number,
      name: r.name as string,
      color: (r.color as string | null) ?? null,
      position: (r.position as number) ?? 0,
      perms,
      isEveryone: !!r.isEveryone,
    };
  }

  /** A page's roles, most senior first, @everyone last. */
  pageRoles(pageId: number): PageRoleDef[] {
    const rows = this.prep("SELECT * FROM page_roles WHERE pageId = ? ORDER BY isEveryone, position DESC, id")
      .all(pageId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToRole(r));
  }

  getRole(id: number): PageRoleDef | undefined {
    const row = this.prep("SELECT * FROM page_roles WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToRole(row) : undefined;
  }

  /** Every page has exactly one @everyone; a page created before migration
   *  90 or by any path that forgot gets it here. */
  ensureEveryoneRole(pageId: number): PageRoleDef {
    const row = this.prep("SELECT * FROM page_roles WHERE pageId = ? AND isEveryone = 1").get(pageId) as
      | Record<string, unknown>
      | undefined;
    if (row) return this.rowToRole(row);
    const info = this.prep(
      "INSERT INTO page_roles (pageId, name, color, position, perms, isEveryone, createdAt) VALUES (?, ?, NULL, 0, ?, 1, ?)",
    ).run(pageId, EVERYONE_NAME, JSON.stringify(DEFAULT_EVERYONE_PERMS), Date.now());
    return this.getRole(Number(info.lastInsertRowid))!;
  }

  createRole(pageId: number, input: { name: string; color: string | null; perms: Perm[] }): PageRoleDef {
    const pos = (this.prep("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM page_roles WHERE pageId = ? AND isEveryone = 0")
      .get(pageId) as { p: number }).p;
    const info = this.prep(
      "INSERT INTO page_roles (pageId, name, color, position, perms, isEveryone, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?)",
    ).run(pageId, input.name, input.color, pos, JSON.stringify(input.perms), Date.now());
    return this.getRole(Number(info.lastInsertRowid))!;
  }

  updateRole(id: number, fields: { name?: string; color?: string | null; perms?: Perm[] }): PageRoleDef | undefined {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (fields.name !== undefined) { sets.push("name = ?"); values.push(fields.name); }
    if (fields.color !== undefined) { sets.push("color = ?"); values.push(fields.color); }
    if (fields.perms !== undefined) { sets.push("perms = ?"); values.push(JSON.stringify(fields.perms)); }
    if (sets.length) this.prep(`UPDATE page_roles SET ${sets.join(", ")} WHERE id = ?`).run(...(values as (string | number | null)[]), id);
    return this.getRole(id);
  }

  /** Never @everyone (the routes refuse; this guards the store too). */
  deleteRole(id: number): boolean {
    const info = this.prep("DELETE FROM page_roles WHERE id = ? AND isEveryone = 0").run(id);
    // FK cascades clear page_member_roles + channel_roles.
    return info.changes > 0;
  }

  /** `ids` top-first: the first gets the highest position. */
  reorderRoles(pageId: number, ids: number[]): void {
    this.transaction(() => {
      const upd = this.prep("UPDATE page_roles SET position = ? WHERE id = ? AND pageId = ? AND isEveryone = 0");
      ids.forEach((id, i) => upd.run(ids.length - i, id, pageId));
    });
  }

  memberRoleIds(pageId: number, userId: number): number[] {
    return (this.prep("SELECT roleId FROM page_member_roles WHERE pageId = ? AND userId = ?").all(pageId, userId) as { roleId: number }[])
      .map((r) => r.roleId);
  }

  /** The roles a member holds INCLUDING @everyone — the effective set. */
  memberRoles(pageId: number, userId: number): PageRoleDef[] {
    const rows = this.prep(
        `SELECT r.* FROM page_roles r
         WHERE r.pageId = ? AND (r.isEveryone = 1 OR r.id IN (SELECT roleId FROM page_member_roles WHERE pageId = ? AND userId = ?))
         ORDER BY r.position DESC`,
      )
      .all(pageId, pageId, userId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToRole(r));
  }

  /** userId → held role ids, for the whole page (the editor's view). */
  pageRoleAssignments(pageId: number): Record<number, number[]> {
    const rows = this.prep("SELECT userId, roleId FROM page_member_roles WHERE pageId = ?").all(pageId) as { userId: number; roleId: number }[];
    const out: Record<number, number[]> = {};
    for (const r of rows) (out[r.userId] ??= []).push(r.roleId);
    return out;
  }

  setMemberRoles(pageId: number, userId: number, roleIds: number[]): void {
    this.transaction(() => {
      this.prep("DELETE FROM page_member_roles WHERE pageId = ? AND userId = ?").run(pageId, userId);
      const ins = this.prep("INSERT OR IGNORE INTO page_member_roles (pageId, userId, roleId) VALUES (?, ?, ?)");
      for (const id of roleIds) ins.run(pageId, userId, id);
    });
  }

  holdsAnyRole(pageId: number, userId: number, roleIds: number[]): boolean {
    if (!roleIds.length) return false;
    const marks = roleIds.map(() => "?").join(",");
    return !!this.prep(`SELECT 1 FROM page_member_roles WHERE pageId = ? AND userId = ? AND roleId IN (${marks}) LIMIT 1`)
      .get(pageId, userId, ...roleIds);
  }

  channelRoleIds(channelId: number, kind: "view" | "post"): number[] {
    return (this.prep("SELECT roleId FROM channel_roles WHERE channelId = ? AND kind = ? ORDER BY roleId").all(channelId, kind) as { roleId: number }[])
      .map((r) => r.roleId);
  }

  setChannelRoles(channelId: number, kind: "view" | "post", roleIds: number[]): void {
    this.transaction(() => {
      this.prep("DELETE FROM channel_roles WHERE channelId = ? AND kind = ?").run(channelId, kind);
      const ins = this.prep("INSERT OR IGNORE INTO channel_roles (channelId, roleId, kind) VALUES (?, ?, ?)");
      for (const id of roleIds) ins.run(channelId, id, kind);
    });
  }

  /** Channel ids in a page that carry a VIEW gate — the listing filters
   *  only these per member; everything else is visible to the whole page. */
  /** Channels with a VIEW gate — their own, or their parent's (Oct 2026
   *  review: a sub-channel of a gated channel streamed to the whole page). */
  restrictedChannelIds(): Set<number> {
    const rows = this.prep(
        "SELECT DISTINCT channelId AS id FROM channel_roles WHERE kind = 'view' " +
          "UNION SELECT c.id FROM channels c JOIN channel_roles r ON r.channelId = c.parentId AND r.kind = 'view'",
      )
      .all() as { id: number }[];
    return new Set(rows.map((r) => r.id));
  }

  private rowToChannel(r: Record<string, unknown>): Channel {
    return {
      id: r.id as number,
      name: r.name as string,
      topic: (r.topic as string | null) ?? null,
      createdBy: r.createdBy as number,
      createdAt: r.createdAt as number,
      parentId: (r.parentId as number | null) ?? null,
      position: (r.position as number | null) ?? 0,
      locked: !!r.locked,
      kind: (r.kind as string | null) ?? "text",
      pageId: (r.pageId as number | null) ?? GENERAL_PAGE_ID,
    };
  }

  /** The next free sort position within a sibling group (top-level = null parent). */
  private nextPosition(parentId: number | null): number {
    const row = this.prep("SELECT COALESCE(MAX(position), -1) + 1 AS n FROM channels WHERE parentId IS ?")
      .get(parentId) as { n: number };
    return row.n;
  }

  /** How many channels a page holds (review round 2: the per-page ceiling). */
  countChannelsInPage(pageId: number): number {
    return Number((this.prep("SELECT COUNT(*) AS n FROM channels WHERE pageId = ?").get(pageId) as { n: number }).n);
  }

  createChannel(input: {
    name: string;
    topic?: string | null;
    createdBy: number;
    parentId?: number | null;
    kind?: string;
    pageId?: number;
  }): Channel {
    const createdAt = Date.now();
    const parentId = input.parentId ?? null;
    const position = this.nextPosition(parentId);
    const info = this.prep(
        "INSERT INTO channels (name, topic, createdBy, createdAt, parentId, position, locked, kind, pageId)" +
          " VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
      )
      .run(
        input.name, input.topic ?? null, input.createdBy, createdAt, parentId, position,
        input.kind ?? "text", input.pageId ?? GENERAL_PAGE_ID,
      );
    return this.getChannel(Number(info.lastInsertRowid))!;
  }

  /** All channels, ordered by sort position then id (client builds the tree).
   *  With `pageId`, only that page's channels. */
  listChannels(pageId?: number): Channel[] {
    const rows = (
      pageId === undefined
        ? this.prep("SELECT * FROM channels ORDER BY position, id").all()
        : this.prep("SELECT * FROM channels WHERE pageId = ? ORDER BY position, id").all(pageId)
    ) as Record<string, unknown>[];
    return rows.map((r) => this.rowToChannel(r));
  }

  getChannel(id: number): Channel | undefined {
    const row = this.prep("SELECT * FROM channels WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToChannel(row) : undefined;
  }

  updateChannel(
    id: number,
    fields: { name?: string; topic?: string | null; locked?: boolean },
  ): Channel | undefined {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (fields.name !== undefined) {
      sets.push("name = ?");
      values.push(fields.name);
    }
    if (fields.topic !== undefined) {
      sets.push("topic = ?");
      values.push(fields.topic);
    }
    if (fields.locked !== undefined) {
      sets.push("locked = ?");
      values.push(fields.locked ? 1 : 0);
    }
    if (sets.length > 0) {
      values.push(id);
      this.prep(`UPDATE channels SET ${sets.join(", ")} WHERE id = ?`).run(...(values as any[]));
    }
    return this.getChannel(id);
  }

  /** Direct sub-channel ids of a channel (one level; no self). */
  childChannelIds(parentId: number): number[] {
    const rows = this.prep("SELECT id FROM channels WHERE parentId = ?")
      .all(parentId) as { id: number }[];
    return rows.map((r) => r.id);
  }

  /** Delete a channel and any sub-channels; messages cascade via their FK.
   *  A remote channel's message INDEX goes too (FEDERATION F2). */
  deleteChannel(id: number): void {
    this.transaction(() => {
      const kids = this.childChannelIds(id);
      for (const child of [...kids, id]) {
        // Reactions no longer FK-cascade off message rows (migration 82 —
        // remote messages key them by GLOBAL id, which no FK can hold), so
        // BOTH kinds clear explicitly BEFORE the rows they key off go.
        this.prep(
          "DELETE FROM message_reactions WHERE messageId IN (SELECT id FROM remote_messages WHERE channelId = ?)",
        ).run(child);
        this.prep(
          "DELETE FROM message_reactions WHERE messageId IN (SELECT id FROM messages WHERE channelId = ?)",
        ).run(child);
      }
      for (const child of [...kids, id]) this.prep("DELETE FROM channel_roles WHERE channelId = ?").run(child);
      for (const child of kids) {
        this.prep("DELETE FROM channels WHERE id = ?").run(child);
        this.dropRemoteIndex(child);
      }
      this.dropRemoteIndex(id);
      this.prep("DELETE FROM channels WHERE id = ?").run(id);
      // A page pointing at a channel that no longer exists would strand
      // everyone who walks in; fall back to "first text channel".
      // The same for the bots' room (migration 102): a dangling id would
      // silence the whole house rather than fall back to #general.
      for (const gone of [id, ...kids]) {
        this.prep("UPDATE pages SET defaultChannelId = NULL WHERE defaultChannelId = ?").run(gone);
        this.prep("UPDATE pages SET botChannelId = NULL WHERE botChannelId = ?").run(gone);
      }
    });
  }

  /** Apply a new sibling order: position = index for each id, atomically. */
  reorderChannels(ids: number[]): void {
    const upd = this.prep("UPDATE channels SET position = ? WHERE id = ?");
    this.transaction(() => {
      ids.forEach((id, i) => upd.run(i, id));
    });
  }

  countChannels(): number {
    const row = this.prep("SELECT COUNT(*) AS n FROM channels").get() as { n: number };
    return row.n;
  }

  // ---- Channel post allow-list (who may post in a locked channel) --------

  postAllowList(channelId: number): number[] {
    const rows = this.prep("SELECT userId FROM channel_post_allow WHERE channelId = ? ORDER BY userId")
      .all(channelId) as { userId: number }[];
    return rows.map((r) => r.userId);
  }

  isPostAllowed(channelId: number, userId: number): boolean {
    return !!this.prep("SELECT 1 FROM channel_post_allow WHERE channelId = ? AND userId = ?")
      .get(channelId, userId);
  }

  /** Per-channel unread counts for one user: live messages from *others* newer
   *  than their read cursor. Channels with zero unread are omitted. One count
   *  per channel, each an index range-seek on idx_messages_channel — the
   *  LEFT-JOIN formulation degraded to a full messages scan as history grew,
   *  which mattered with a room full of clients calling this on reconnect. */
  /** Unread per channel. `pageIds`, when given, limits it to the pages the
   *  caller may see — otherwise a private page hands out message COUNTS (and
   *  paints badges on channels the user can't open) to non-members. */
  static readonly UNREAD_CAP = 100;
  channelUnreads(userId: number, pageIds?: number[]): Record<number, number> {
    const cursors = new Map(
      (
        this.prep("SELECT channelId, lastReadId FROM channel_reads WHERE userId = ?")
          .all(userId) as { channelId: number; lastReadId: number }[]
      ).map((r) => [r.channelId, r.lastReadId]),
    );
    // Capped at UNREAD_CAP per channel: the badge says "99+" past that, and
    // every client re-runs this on boot and on every reconnect (a deploy
    // restart = the whole room at once), so a dormant channel with a year of
    // history must not cost a whole-channel count each time.
    const count = this.prep(
      `SELECT COUNT(*) AS n FROM (SELECT 1 FROM messages WHERE channelId = ? AND id > ? AND userId <> ? AND deletedAt IS NULL LIMIT ${Store.UNREAD_CAP})`,
    );
    // FEDERATION (F2): a remote channel's messages live in the index table
    // instead — one of the two counts is always zero, so summing is safe.
    const remoteCount = this.prep(
      `SELECT COUNT(*) AS n FROM (SELECT 1 FROM remote_messages WHERE channelId = ? AND id > ? AND userId <> ? AND deletedAt IS NULL LIMIT ${Store.UNREAD_CAP})`,
    );
    const out: Record<number, number> = {};
    const channels = (
      pageIds === undefined
        ? this.prep("SELECT id FROM channels").all()
        : pageIds.length
          ? this.prep(`SELECT id FROM channels WHERE pageId IN (${pageIds.map(() => "?").join(",")})`)
              .all(...pageIds)
          : []
    ) as { id: number }[];
    for (const c of channels) {
      const cursor = cursors.get(c.id) ?? 0;
      const { n } = count.get(c.id, cursor, userId) as { n: number };
      const { n: rn } = remoteCount.get(c.id, cursor, userId) as { n: number };
      if (n + rn > 0) out[c.id] = n + rn;
    }
    return out;
  }

  /** Start a brand-new account "caught up" in every existing channel, so a
   *  fresh member doesn't face years of history as a wall of 99+ badges.
   *  Channels created after they join start unread as normal. */
  private backfillChannelReads(userId: number): void {
    // MAX over both stores: a remote channel's newest id lives in the index
    // (FEDERATION F2) — without it, a new account faced a satellite page's
    // whole history as unread.
    this.prep(
        `INSERT INTO channel_reads (channelId, userId, lastReadId)
         SELECT c.id, ?, MAX(
           COALESCE((SELECT MAX(m.id) FROM messages m WHERE m.channelId = c.id), 0),
           COALESCE((SELECT MAX(r.id) FROM remote_messages r WHERE r.channelId = c.id), 0)
         )
         FROM channels c
         WHERE true
         ON CONFLICT(channelId, userId) DO NOTHING`,
      )
      .run(userId);
  }

  /** Move a user's read cursor to the channel's newest message (hub or
   *  remote — whichever store this channel's content lives in). */
  /** The caller's read cursor in a channel (0 if none). */
  channelReadCursor(channelId: number, userId: number): number {
    const row = this.prep("SELECT lastReadId FROM channel_reads WHERE channelId = ? AND userId = ?")
      .get(channelId, userId) as { lastReadId: number } | undefined;
    return row?.lastReadId ?? 0;
  }

  markChannelRead(channelId: number, userId: number): number {
    this.prep(
        `INSERT INTO channel_reads (channelId, userId, lastReadId)
         VALUES (?, ?, MAX(
           COALESCE((SELECT MAX(id) FROM messages WHERE channelId = ?), 0),
           COALESCE((SELECT MAX(id) FROM remote_messages WHERE channelId = ?), 0)
         ))
         ON CONFLICT(channelId, userId) DO UPDATE SET lastReadId = MAX(lastReadId, excluded.lastReadId)`,
      )
      .run(channelId, userId, channelId, channelId);
    const row = this.prep("SELECT lastReadId FROM channel_reads WHERE channelId = ? AND userId = ?")
      .get(channelId, userId) as { lastReadId: number } | undefined;
    return row?.lastReadId ?? 0;
  }

  /** READ RECEIPTS: every member's cursor in a channel (only those who have
   *  read anything, and only accounts that SEND receipts — the WhatsApp rule
   *  is symmetric, so an opted-out reader is invisible here too). Bots and
   *  deleted accounts never appear. */
  channelReaders(channelId: number): { userId: number; lastReadId: number }[] {
    const rows = this.prep(
        `SELECT r.userId, r.lastReadId, u.prefs FROM channel_reads r
         JOIN users u ON u.id = r.userId
         WHERE r.channelId = ? AND r.lastReadId > 0 AND u.isBot = 0 AND u.deletedAt IS NULL AND u.disabled = 0`,
      )
      .all(channelId) as { userId: number; lastReadId: number; prefs: unknown }[];
    return rows
      .filter((r) => parsePrefs(r.prefs).readReceipts !== false)
      .map((r) => ({ userId: r.userId, lastReadId: r.lastReadId }));
  }

  /** The other side's DM cursor, or 0 (null if they don't send receipts). */
  dmLastRead(convId: number, userId: number): number | null {
    const u = this.getUserById(userId);
    if (!u || u.prefs.readReceipts === false) return null;
    const row = this.prep("SELECT lastReadId FROM dm_reads WHERE conversationId = ? AND userId = ?")
      .get(convId, userId) as { lastReadId: number } | undefined;
    return row?.lastReadId ?? 0;
  }

  /** Replace a channel's post allow-list with exactly `userIds`. */
  setPostAllow(channelId: number, userIds: number[]): void {
    const ins = this.prep(
      "INSERT OR IGNORE INTO channel_post_allow (channelId, userId) VALUES (?, ?)",
    );
    this.transaction(() => {
      this.prep("DELETE FROM channel_post_allow WHERE channelId = ?").run(channelId);
      for (const uid of userIds) ins.run(channelId, uid);
    });
  }

  // ---- Direct messages (1:1) ---------------------------------------------

  private rowToDm(r: Record<string, unknown>): DmMessage {
    return {
      id: r.id as number,
      conversationId: r.conversationId as number,
      senderId: r.senderId as number,
      body: r.body as string,
      createdAt: r.createdAt as number,
      editedAt: (r.editedAt as number | null) ?? null,
      deletedAt: (r.deletedAt as number | null) ?? null,
      replyToId: (r.replyToId as number | null) ?? null,
    };
  }

  /** Find (or create) the 1:1 conversation between two distinct users. */
  getOrCreateConversation(a: number, b: number): { id: number; userA: number; userB: number } {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const find = this.prep(
      "SELECT id, userA, userB FROM dm_conversations WHERE userA = ? AND userB = ?",
    );
    let row = find.get(lo, hi) as { id: number; userA: number; userB: number } | undefined;
    if (!row) {
      this.prep("INSERT INTO dm_conversations (userA, userB, createdAt) VALUES (?, ?, ?)")
        .run(lo, hi, Date.now());
      row = find.get(lo, hi) as { id: number; userA: number; userB: number };
    }
    return row;
  }

  /** The other side of a DM, or null if the caller is not in it. */
  dmOtherParticipant(convId: number, userId: number): number | null {
    const c = this.getConversation(convId);
    if (!c) return null;
    return c.userA === userId ? c.userB : c.userB === userId ? c.userA : null;
  }

  getConversation(id: number): { id: number; userA: number; userB: number } | undefined {
    return this.prep("SELECT id, userA, userB FROM dm_conversations WHERE id = ?").get(id) as
      | { id: number; userA: number; userB: number }
      | undefined;
  }

  /** The two participant ids of a conversation, if it exists. */
  conversationParticipants(id: number): [number, number] | undefined {
    const c = this.getConversation(id);
    return c ? [c.userA, c.userB] : undefined;
  }

  isParticipant(convId: number, userId: number): boolean {
    const c = this.getConversation(convId);
    return !!c && (c.userA === userId || c.userB === userId);
  }

  createDmMessage(convId: number, senderId: number, body: string, replyToId?: number | null): DmMessage {
    const info = this.prep("INSERT INTO dm_messages (conversationId, senderId, body, createdAt, replyToId) VALUES (?, ?, ?, ?, ?)")
      .run(convId, senderId, body, Date.now(), replyToId ?? null);
    return this.getDmMessage(Number(info.lastInsertRowid))!;
  }

  getDmMessage(id: number): DmMessage | undefined {
    const row = this.prep("SELECT * FROM dm_messages WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToDm(row) : undefined;
  }

  /** A page of a conversation's messages, oldest→newest (tombstones included). */
  listDmMessages(convId: number, opts: { before?: number; limit?: number } = {}): DmMessage[] {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const rows = (
      opts.before
        ? this.prep("SELECT * FROM dm_messages WHERE conversationId = ? AND id < ? ORDER BY id DESC LIMIT ?")
            .all(convId, opts.before, limit)
        : this.prep("SELECT * FROM dm_messages WHERE conversationId = ? ORDER BY id DESC LIMIT ?")
            .all(convId, limit)
    ) as Record<string, unknown>[];
    return rows.map((r) => this.rowToDm(r)).reverse();
  }

  editDmMessage(id: number, body: string): DmMessage | undefined {
    this.prep("UPDATE dm_messages SET body = ?, editedAt = ? WHERE id = ?").run(body, Date.now(), id);
    return this.getDmMessage(id);
  }

  deleteDmMessage(id: number): DmMessage | undefined {
    this.prep("UPDATE dm_messages SET deletedAt = ?, body = '' WHERE id = ?").run(Date.now(), id);
    return this.getDmMessage(id);
  }

  private lastDmId(convId: number): number {
    const row = this.prep("SELECT COALESCE(MAX(id), 0) AS n FROM dm_messages WHERE conversationId = ?")
      .get(convId) as { n: number };
    return row.n;
  }

  /** Mark a conversation read for a user, up to its most recent message. */
  markDmRead(convId: number, userId: number): number {
    const upTo = this.lastDmId(convId);
    this.prep(
        `INSERT INTO dm_reads (conversationId, userId, lastReadId) VALUES (?, ?, ?)
         ON CONFLICT(conversationId, userId) DO UPDATE SET lastReadId = MAX(lastReadId, excluded.lastReadId)`,
      )
      .run(convId, userId, upTo);
    const row = this.prep("SELECT lastReadId FROM dm_reads WHERE conversationId = ? AND userId = ?")
      .get(convId, userId) as { lastReadId: number } | undefined;
    return row?.lastReadId ?? upTo;
  }

  /** How many messages *from the other person* this user hasn't read. */
  dmUnreadCount(convId: number, userId: number): number {
    const row = this.prep(
        `SELECT COUNT(*) AS n FROM dm_messages
         WHERE conversationId = ? AND senderId != ? AND deletedAt IS NULL
           AND id > COALESCE((SELECT lastReadId FROM dm_reads WHERE conversationId = ? AND userId = ?), 0)`,
      )
      .get(convId, userId, convId, userId) as { n: number };
    return row.n;
  }

  /** All conversations a user is in, resolved for display (other user, preview, unread). */
  listConversationsFor(userId: number): DmConversation[] {
    const rows = this.prep("SELECT id, userA, userB FROM dm_conversations WHERE userA = ? OR userB = ?")
      .all(userId, userId) as { id: number; userA: number; userB: number }[];
    const out: DmConversation[] = [];
    for (const c of rows) {
      const otherId = c.userA === userId ? c.userB : c.userA;
      const other = this.getUserById(otherId);
      if (!other) continue;
      const lastRow = this.prep("SELECT * FROM dm_messages WHERE conversationId = ? ORDER BY id DESC LIMIT 1")
        .get(c.id) as Record<string, unknown> | undefined;
      out.push({
        id: c.id,
        otherUser: toPublicUser(other),
        lastMessage: lastRow ? this.rowToDm(lastRow) : null,
        unread: this.dmUnreadCount(c.id, userId),
      });
    }
    // Most-recent activity first; empty conversations sink to the bottom.
    out.sort((a, b) => (b.lastMessage?.createdAt ?? 0) - (a.lastMessage?.createdAt ?? 0));
    return out;
  }

  // ---- Direct trades (escrow-free barter, validated at settlement) -------

  private rawTrade(id: number):
    | { id: number; fromUser: number; toUser: number; status: TradeStatus; note: string | null; createdAt: number; resolvedAt: number | null }
    | undefined {
    return this.prep("SELECT * FROM trades WHERE id = ?").get(id) as any;
  }

  private tradeItemCodes(tradeId: number): { offer: string[]; request: string[] } {
    const rows = this.prep("SELECT side, code FROM trade_items WHERE tradeId = ?")
      .all(tradeId) as { side: string; code: string }[];
    return {
      offer: rows.filter((r) => r.side === "offer").map((r) => r.code),
      request: rows.filter((r) => r.side === "request").map((r) => r.code),
    };
  }

  /** Parties + status of a trade, for route-level authorization. `requests`
   *  counts what the RECIPIENT would give up — the FROZEN gate on accept
   *  cares whether accepting moves value out of their hands (a pure inbound
   *  gift doesn't, and a frozen debtor may still be helped). */
  tradeParties(
    id: number,
  ): { fromUser: number; toUser: number; status: TradeStatus; requests: number } | undefined {
    const t = this.rawTrade(id);
    if (!t) return undefined;
    const r = this.prep("SELECT COUNT(*) AS n FROM trade_items WHERE tradeId = ? AND side = 'request'")
      .get(id) as { n: number };
    return { fromUser: t.fromUser, toUser: t.toUser, status: t.status, requests: r.n };
  }

  /** Resolve a trade into a client DTO (both users + emoji details). */
  buildTradeDTO(id: number): TradeDTO | undefined {
    const t = this.rawTrade(id);
    if (!t) return undefined;
    const from = this.getUserById(t.fromUser);
    const to = this.getUserById(t.toUser);
    if (!from || !to) return undefined;
    const { offer, request } = this.tradeItemCodes(id);
    const resolve = (codes: string[]): Emoji[] =>
      codes.map((c) => this.getEmoji(c)).filter((e): e is Emoji => !!e);
    return {
      id: t.id,
      fromUser: toPublicUser(from),
      toUser: toPublicUser(to),
      offered: resolve(offer),
      requested: resolve(request),
      status: t.status,
      note: t.note ?? null,
      createdAt: t.createdAt,
      resolvedAt: t.resolvedAt ?? null,
    };
  }

  createTrade(
    fromUser: number,
    toUser: number,
    offered: string[],
    requested: string[],
    note: string | null,
  ): number {
    return this.transaction(() => {
      const info = this.prep("INSERT INTO trades (fromUser, toUser, status, note, createdAt) VALUES (?, ?, 'pending', ?, ?)")
        .run(fromUser, toUser, note, Date.now());
      const id = Number(info.lastInsertRowid);
      const ins = this.prep("INSERT OR IGNORE INTO trade_items (tradeId, side, code) VALUES (?, ?, ?)");
      for (const c of offered) ins.run(id, "offer", c);
      for (const c of requested) ins.run(id, "request", c);
      return id;
    });
  }

  /** A user's pending trades, split into offers they received and offers they sent. */
  listTradesFor(userId: number): { incoming: TradeDTO[]; outgoing: TradeDTO[] } {
    const inc = this.prep("SELECT id FROM trades WHERE toUser = ? AND status = 'pending' ORDER BY id DESC")
      .all(userId) as { id: number }[];
    const out = this.prep("SELECT id FROM trades WHERE fromUser = ? AND status = 'pending' ORDER BY id DESC")
      .all(userId) as { id: number }[];
    const dto = (r: { id: number }) => this.buildTradeDTO(r.id);
    return {
      incoming: inc.map(dto).filter((t): t is TradeDTO => !!t),
      outgoing: out.map(dto).filter((t): t is TradeDTO => !!t),
    };
  }

  /** Open offers this user has SENT (review round 2: the sender's cap). */
  countOutgoingTrades(userId: number): number {
    const row = this.prep("SELECT COUNT(*) AS n FROM trades WHERE fromUser = ? AND status = 'pending'")
      .get(userId) as { n: number };
    return row.n;
  }

  /** Is there already a pending offer from A to B? One at a time per pair. */
  hasPendingTradeBetween(fromUser: number, toUser: number): boolean {
    return !!this.prep("SELECT 1 FROM trades WHERE fromUser = ? AND toUser = ? AND status = 'pending' LIMIT 1")
      .get(fromUser, toUser);
  }

  countIncomingTrades(userId: number): number {
    const row = this.prep("SELECT COUNT(*) AS n FROM trades WHERE toUser = ? AND status = 'pending'")
      .get(userId) as { n: number };
    return row.n;
  }

  /** Mark a pending trade declined/cancelled. Returns false if it wasn't pending. */
  resolveTrade(id: number, status: "declined" | "cancelled"): boolean {
    const info = this.prep("UPDATE trades SET status = ?, resolvedAt = ? WHERE id = ? AND status = 'pending'")
      .run(status, Date.now(), id);
    return info.changes > 0;
  }

  /**
   * Settle a pending trade atomically. Re-validates ownership at settlement (no
   * escrow): the giver must still own everything they give, and the receiver
   * must NOT already own it (so nothing is destroyed or duplicated). If the
   * trade is no longer fulfillable it is voided (cancelled) rather than settled.
   */
  acceptTrade(tradeId: number): { ok: boolean; error?: string } {
    return this.transaction(() => {
      const t = this.rawTrade(tradeId);
      if (!t || t.status !== "pending") return { ok: false, error: "not_pending" };
      const { offer, request } = this.tradeItemCodes(tradeId);

      // BOTH PARTIES MUST STILL BE ABLE TO TRADE (Oct 2026 review). An offer
      // filed while the giver was in good standing used to stay acceptable
      // after they died, were jailed, banned, deleted or FROZEN — a pre-filed
      // gift emptied an estate before the Inheritance, or a debtor before the
      // goblins' seizure. A frozen party may still RECEIVE (inbound gifts land).
      const able = (uid: number, gives: boolean): boolean => {
        const u = this.getUserById(uid);
        if (!u || u.disabled || u.locked || u.deletedAt) return false;
        return !gives || canMoveValue(this.loanStage(uid));
      };
      if (!able(t.fromUser, offer.length > 0) || !able(t.toUser, request.length > 0)) {
        this.prep("UPDATE trades SET status = 'cancelled', resolvedAt = ? WHERE id = ?").run(Date.now(), tradeId);
        return { ok: false, error: "trade_invalid" };
      }

      const ownsAll = (uid: number, codes: string[]) => codes.every((c) => this.ownsEmoji(uid, c));
      const ownsNone = (uid: number, codes: string[]) => codes.every((c) => !this.ownsEmoji(uid, c));
      const fulfillable =
        ownsAll(t.fromUser, offer) && // giver still owns what they give
        ownsAll(t.toUser, request) && // receiver still owns what they give
        ownsNone(t.toUser, offer) && // receiver doesn't already own the offer (no destructive dup)
        ownsNone(t.fromUser, request); // giver doesn't already own the request
      if (!fulfillable) {
        this.prep("UPDATE trades SET status = 'cancelled', resolvedAt = ? WHERE id = ?").run(Date.now(), tradeId);
        return { ok: false, error: "trade_invalid" };
      }

      // Atomic swap: each code leaves the giver and joins the receiver.
      for (const c of offer) {
        this.removeEmoji(t.fromUser, c);
        this.addEmoji(t.toUser, c);
        if (c === TALISMAN_CODE) this.talismanParted(t.fromUser);
      }
      for (const c of request) {
        this.removeEmoji(t.toUser, c);
        this.addEmoji(t.fromUser, c);
        if (c === TALISMAN_CODE) this.talismanParted(t.toUser);
      }
      this.prep("UPDATE trades SET status = 'accepted', resolvedAt = ? WHERE id = ?").run(Date.now(), tradeId);
      return { ok: true };
    });
  }

  // ---- Auction house (full escrow, settled at close) ---------------------
  //
  // The listed emoji is escrowed out of the seller's inventory the moment they
  // list; the current high bid's silver is escrowed out of the bidder (refunded
  // to the previous high bidder on each new bid). Settlement moves already-held
  // assets — emoji → winner, 95% of the bid → seller, 5% burned — so nothing is
  // ever minted or duplicated, even across the timed, multi-party lifecycle.

  private rawAuction(id: number):
    | { id: number; sellerId: number; code: string; relicSlug: string | null; startPrice: number;
        currentBid: number | null; highBidder: number | null; status: AuctionStatus; createdAt: number;
        endsAt: number; settledAt: number | null }
    | undefined {
    return this.prep("SELECT * FROM auctions WHERE id = ?").get(id) as any;
  }

  private auctionBids(auctionId: number, limit: number): AuctionBidDTO[] {
    const rows = this.prep("SELECT bidderId, amount, at FROM auction_bids WHERE auctionId = ? ORDER BY id DESC LIMIT ?")
      .all(auctionId, limit) as { bidderId: number; amount: number; at: number }[];
    const out: AuctionBidDTO[] = [];
    for (const r of rows) {
      const u = this.getUserById(r.bidderId);
      if (u) out.push({ bidder: toPublicUser(u), amount: r.amount, at: r.at });
    }
    return out;
  }

  /** Resolve an auction into a client DTO (seller + lot + high bidder + history).
   *  The LOT is either an emoji or a backrooms relic (migration 58); the client
   *  resolves a relic's name and art from its own catalog, so the wire carries
   *  just the slug. */
  buildAuctionDTO(id: number): AuctionDTO | undefined {
    const a = this.rawAuction(id);
    if (!a) return undefined;
    const seller = this.getUserById(a.sellerId);
    const relicSlug = a.relicSlug ?? null;
    const emoji = relicSlug ? null : this.getEmoji(a.code);
    if (!seller || (!emoji && !relicSlug)) return undefined;
    const high = a.highBidder != null ? this.getUserById(a.highBidder) : null;
    const bidCount = (
      this.prep("SELECT COUNT(*) AS n FROM auction_bids WHERE auctionId = ?").get(id) as { n: number }
    ).n;
    return {
      id: a.id,
      seller: toPublicUser(seller),
      emoji: emoji ?? null,
      relicSlug,
      startPrice: a.startPrice,
      currentBid: a.currentBid ?? null,
      highBidder: high ? toPublicUser(high) : null,
      minNextBid: minNextBid(a.startPrice, a.currentBid ?? null),
      bidCount,
      status: a.status,
      createdAt: a.createdAt,
      endsAt: a.endsAt,
      settledAt: a.settledAt ?? null,
      bids: this.auctionBids(id, BID_HISTORY),
    };
  }

  /** Open auctions (soonest-ending first) + a short tail of recently closed ones. */
  listAuctions(): { open: AuctionDTO[]; recent: AuctionDTO[] } {
    const open = this.prep("SELECT id FROM auctions WHERE status = 'open' ORDER BY endsAt ASC")
      .all() as { id: number }[];
    const recent = this.prep("SELECT id FROM auctions WHERE status IN ('settled','expired','cancelled') ORDER BY settledAt DESC LIMIT 12")
      .all() as { id: number }[];
    const dto = (r: { id: number }) => this.buildAuctionDTO(r.id);
    return {
      open: open.map(dto).filter((a): a is AuctionDTO => !!a),
      recent: recent.map(dto).filter((a): a is AuctionDTO => !!a),
    };
  }

  /** Ids of open auctions whose timer has elapsed (used by the sweep). */
  dueAuctionIds(now: number): number[] {
    const rows = this.prep("SELECT id FROM auctions WHERE status = 'open' AND endsAt <= ?")
      .all(now) as { id: number }[];
    return rows.map((r) => r.id);
  }

  /** List an owned emoji for auction, escrowing it out of the seller's inventory. */
  createAuction(
    sellerId: number,
    code: string,
    startPrice: number,
    endsAt: number,
  ): { ok: boolean; error?: string; id?: number } {
    return this.transaction(() => {
      const e = this.getEmoji(code);
      if (!e) return { ok: false, error: "unknown_emoji" };
      if (isBound(e.tier)) return { ok: false, error: "bound" }; // the Stone never escrows
      if (!this.ownsEmoji(sellerId, code)) return { ok: false, error: "not_owned" };
      this.removeEmoji(sellerId, code); // escrow
      if (code === TALISMAN_CODE) this.talismanParted(sellerId);
      const info = this.prep("INSERT INTO auctions (sellerId, code, startPrice, status, createdAt, endsAt) VALUES (?, ?, ?, 'open', ?, ?)")
        .run(sellerId, code, startPrice, Date.now(), endsAt);
      return { ok: true, id: Number(info.lastInsertRowid) };
    });
  }

  /** List a DUPLICATE RELIC for auction (migration 58) — the sanctioned
   *  relic→silver path. The locker row is the escrow: it's deleted here and
   *  re-minted at settlement (to the winner) or cancellation (to the seller),
   *  so exactly one copy exists at every instant. */
  createRelicAuction(
    sellerId: number,
    itemId: number,
    startPrice: number,
    endsAt: number,
  ): { ok: boolean; error?: string; id?: number; relicSlug?: string } {
    return this.transaction(() => {
      const row = this.prep("SELECT kind, color FROM backrooms_locker WHERE id = ? AND userId = ?")
        .get(itemId, sellerId) as { kind: string; color: string | null } | undefined;
      if (!row) return { ok: false, error: "not_owned" };
      if (row.kind !== "relic" || !row.color) return { ok: false, error: "not_a_relic" };
      const del = this.prep("DELETE FROM backrooms_locker WHERE id = ? AND userId = ?")
        .run(itemId, sellerId);
      if (del.changes === 0) return { ok: false, error: "not_owned" }; // lost a race
      const info = this.prep(
          "INSERT INTO auctions (sellerId, code, relicSlug, startPrice, status, createdAt, endsAt) VALUES (?, '', ?, ?, 'open', ?, ?)",
        )
        .run(sellerId, row.color, startPrice, Date.now(), endsAt);
      return { ok: true, id: Number(info.lastInsertRowid), relicSlug: row.color };
    });
  }

  /**
   * Place a bid, atomically. Validates first (open, live, not the seller, not
   * already-owned, clears the min next bid), then escrows the bid: the previous
   * high bidder is refunded and the new bidder debited. A self-raise only escrows
   * the increment. A late bid nudges the end out (anti-snipe).
   */
  placeBid(
    auctionId: number,
    bidderId: number,
    amount: number,
  ): { ok: boolean; error?: string; endsAt?: number } {
    return this.transaction(() => {
      const a = this.rawAuction(auctionId);
      if (!a) return { ok: false, error: "no_auction" };
      if (a.status !== "open") return { ok: false, error: "not_open" };
      const now = Date.now();
      if (now >= a.endsAt) return { ok: false, error: "ended" };
      if (bidderId === a.sellerId) return { ok: false, error: "self_bid" };
      // Emoji ownership is BINARY, so bidding on one you already own is a
      // guaranteed burn — refused. Relics are not: a spare is worth 250 RC at
      // Voss's counter, so a collector may legitimately want a second one.
      if (!a.relicSlug && this.ownsEmoji(bidderId, a.code)) return { ok: false, error: "already_owned" };
      if (!Number.isInteger(amount)) return { ok: false, error: "bad_amount" };
      if (amount < minNextBid(a.startPrice, a.currentBid)) return { ok: false, error: "too_low" };

      // Escrow the bid. Each branch fully succeeds or returns before any mutation
      // (spendCoins is atomic and no-ops when it can't cover the amount).
      if (a.highBidder === bidderId) {
        const extra = amount - (a.currentBid ?? 0); // self-raise: only the increment
        if (this.spendCoins(bidderId, extra) === null) return { ok: false, error: "insufficient" };
      } else {
        if (this.spendCoins(bidderId, amount) === null) return { ok: false, error: "insufficient" };
        if (a.highBidder != null && a.currentBid != null) this.addCoins(a.highBidder, a.currentBid); // refund
      }

      let endsAt = a.endsAt;
      if (a.endsAt - now < ANTI_SNIPE_MS) endsAt = now + ANTI_SNIPE_MS;

      this.prep("INSERT INTO auction_bids (auctionId, bidderId, amount, at) VALUES (?, ?, ?, ?)")
        .run(auctionId, bidderId, amount, now);
      this.prep("UPDATE auctions SET currentBid = ?, highBidder = ?, endsAt = ? WHERE id = ?")
        .run(amount, bidderId, endsAt, auctionId);
      return { ok: true, endsAt };
    });
  }

  /**
   * Settle a closed-out auction (called by the sweep once its timer elapses).
   * Idempotent: only an 'open' auction is acted on. Winner gets the emoji, the
   * seller gets 95% of the winning bid, 5% is burned; with no bids the escrowed
   * emoji returns to the seller.
   */
  closeAuction(auctionId: number): { ok: boolean; sold?: boolean; error?: string } {
    return this.transaction(() => {
      const a = this.rawAuction(auctionId);
      if (!a) return { ok: false, error: "no_auction" };
      if (a.status !== "open") return { ok: false, error: "not_open" };
      const now = Date.now();
      if (a.highBidder != null && a.currentBid != null) {
        // Sterling's Rake-Free Night: the seller keeps the full hammer price.
        const { toSeller, burned } =
          this.sterlingActiveSpecial()?.kind === "rakefree"
            ? { toSeller: a.currentBid, burned: 0 }
            : splitBid(a.currentBid);
        this.addCoins(a.sellerId, toSeller);
        if (burned > 0) this.lotteryBoost(lotteryDay(), burned); // the 5% cut seeds tonight's lottery
        if (a.relicSlug) {
          // A relic the winner has never recovered UNLOCKS for them (the
          // collection entry — you can buy your way to a trophy); otherwise it
          // lands as another duplicate row. Either way exactly one copy of the
          // escrowed relic comes out.
          const fresh = this.brUnlockRelic(a.highBidder, a.relicSlug);
          if (!fresh) this.brForceAddItem(a.highBidder, "relic", a.relicSlug);
        } else {
          // Escrowed emoji → winner. If the high bidder acquired this same code
          // between bid and close (wheel/trade/chess), addEmoji no-ops and the
          // escrowed copy BURNS — binary ownership never stacks (the same rule
          // as chess spoils and graveyard dupes); the buyer still pays.
          this.addEmoji(a.highBidder, a.code);
        }
        this.prep("UPDATE auctions SET status = 'settled', settledAt = ? WHERE id = ?").run(now, auctionId);
        this.bumpStat(a.highBidder, "auctions_won"); // Ledger/achievement telemetry
        return { ok: true, sold: true };
      }
      // No bids — hand the lot back. A relic returns as a locker row (its
      // collection entry never left the seller).
      if (a.relicSlug) this.brForceAddItem(a.sellerId, "relic", a.relicSlug);
      else this.addEmoji(a.sellerId, a.code);
      this.prep("UPDATE auctions SET status = 'expired', settledAt = ? WHERE id = ?").run(now, auctionId);
      return { ok: true, sold: false };
    });
  }

  /** Seller pulls their own listing — only while it's open and bid-free. */
  cancelAuction(auctionId: number, sellerId: number): { ok: boolean; error?: string } {
    return this.transaction(() => {
      const a = this.rawAuction(auctionId);
      if (!a) return { ok: false, error: "no_auction" };
      if (a.sellerId !== sellerId) return { ok: false, error: "forbidden" };
      if (a.status !== "open") return { ok: false, error: "not_open" };
      if (a.highBidder != null) return { ok: false, error: "has_bids" };
      // Un-escrow (a relic returns to the locker it was pulled from).
      if (a.relicSlug) this.brForceAddItem(a.sellerId, "relic", a.relicSlug);
      else this.addEmoji(a.sellerId, a.code);
      this.prep("UPDATE auctions SET status = 'cancelled', settledAt = ? WHERE id = ?").run(Date.now(), auctionId);
      return { ok: true };
    });
  }


  // ---- Messages ----------------------------------------------------------

  private rowToMessage(r: Record<string, unknown>): Message {
    return {
      id: r.id as number,
      channelId: r.channelId as number,
      userId: r.userId as number,
      body: r.body as string,
      createdAt: r.createdAt as number,
      editedAt: (r.editedAt as number | null) ?? null,
      deletedAt: (r.deletedAt as number | null) ?? null,
      replyToId: (r.replyToId as number | null) ?? null,
      everyone: !!r.everyone,
    };
  }

  createMessage(input: {
    channelId: number;
    userId: number;
    body: string;
    replyToId?: number | null;
    /** PAGE ROLES: an @everyone the author was allowed to send. */
    everyone?: boolean;
  }): Message {
    const createdAt = Date.now();
    const info = this.prep("INSERT INTO messages (channelId, userId, body, createdAt, replyToId, everyone) VALUES (?, ?, ?, ?, ?, ?)")
      .run(input.channelId, input.userId, input.body, createdAt, input.replyToId ?? null, input.everyone ? 1 : 0);
    this.achievementPoke?.(input.userId); // chat badges are derived counts
    return this.getMessage(Number(info.lastInsertRowid))!;
  }

  getMessage(id: number): Message | undefined {
    const row = this.prep("SELECT * FROM messages WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToMessage(row) : undefined;
  }

  /**
   * A page of a channel's messages, oldest→newest. Pass `before` (a message id)
   * to page backwards through history. Deleted messages are included as
   * tombstones so the conversation flow stays intact.
   */
  listMessages(channelId: number, opts: { before?: number; limit?: number } = {}): Message[] {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const rows = (
      opts.before
        ? this.prep(
              "SELECT * FROM messages WHERE channelId = ? AND id < ? ORDER BY id DESC LIMIT ?",
            )
            .all(channelId, opts.before, limit)
        : this.prep("SELECT * FROM messages WHERE channelId = ? ORDER BY id DESC LIMIT ?")
            .all(channelId, limit)
    ) as Record<string, unknown>[];
    return rows.map((r) => this.rowToMessage(r)).reverse();
  }

  editMessage(id: number, body: string): Message | undefined {
    this.prep("UPDATE messages SET body = ?, editedAt = ? WHERE id = ?")
      .run(body, Date.now(), id);
    return this.getMessage(id);
  }

  /** Tombstone a message: mark it deleted, clear its body, and drop its reactions. */
  deleteMessage(id: number): Message | undefined {
    this.prep("UPDATE messages SET deletedAt = ?, body = '' WHERE id = ?").run(Date.now(), id);
    this.clearReactions(id);
    return this.getMessage(id);
  }

  // ---- Side bets (spectator pari-mutuel, migration 37) ---------------------

  /** Escrow a spectator bet (caller has already validated the game window). */
  placeSideBet(kind: "chess" | "pit", gameId: string, bettorId: number, onUserId: number, amount: number): boolean {
    return this.transaction(() => {
      if (!Number.isInteger(amount) || amount <= 0) return false;
      if (this.spendCoins(bettorId, amount) === null) return false;
      this.prep("INSERT INTO side_bets (kind, gameId, bettorId, onUserId, amount, at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(kind, gameId, bettorId, onUserId, amount, Date.now());
      return true;
    });
  }

  /** Pool totals per predicted winner (for the odds display). */
  sideBetPools(kind: string, gameId: string): Record<number, number> {
    const rows = this.prep("SELECT onUserId, SUM(amount) AS total FROM side_bets WHERE kind = ? AND gameId = ? GROUP BY onUserId")
      .all(kind, gameId) as { onUserId: number; total: number }[];
    const out: Record<number, number> = {};
    for (const r of rows) out[r.onUserId] = r.total;
    return out;
  }

  mySideBets(kind: string, gameId: string, userId: number): { onUserId: number; amount: number }[] {
    return this.prep("SELECT onUserId, SUM(amount) AS amount FROM side_bets WHERE kind = ? AND gameId = ? AND bettorId = ? GROUP BY onUserId")
      .all(kind, gameId, userId) as { onUserId: number; amount: number }[];
  }

  /** Refund bets whose target isn't in the final field (e.g. a Pit player
   *  who left before the cups rolled) — and bets placed by somebody who then
   *  SAT DOWN in it (Oct 2026 review: bet on a player as a spectator, join the
   *  table, and throw the game their way). Spectators only. Called at start. */
  refundSideBetsNotOn(kind: string, gameId: string, validTargets: number[]): void {
    this.transaction(() => {
      const rows = this.prep("SELECT id, bettorId, amount, onUserId FROM side_bets WHERE kind = ? AND gameId = ?")
        .all(kind, gameId) as { id: number; bettorId: number; amount: number; onUserId: number }[];
      for (const r of rows) {
        if (!validTargets.includes(r.onUserId) || validTargets.includes(r.bettorId)) {
          this.addCoins(r.bettorId, r.amount);
          this.prep("DELETE FROM side_bets WHERE id = ?").run(r.id);
        }
      }
    });
  }

  /**
   * Settle a game's side-bet pool. winnerId null (draw/fold) OR no winning
   * tickets → everyone refunded. Otherwise a 5% rake (plus floor-division
   * dust) seeds tonight's lottery pot and the winners split the rest
   * pro-rata. Rows delete either way — duplicate settles are no-ops.
   */
  settleSideBets(
    kind: "chess" | "pit",
    gameId: string,
    winnerId: number | null,
  ): { refunded: boolean; pool: number; rake: number; payouts: { userId: number; payout: number }[] } | null {
    return this.transaction(() => {
      const rows = this.prep("SELECT id, bettorId, onUserId, amount FROM side_bets WHERE kind = ? AND gameId = ?")
        .all(kind, gameId) as { id: number; bettorId: number; onUserId: number; amount: number }[];
      if (!rows.length) return null;
      const pool = rows.reduce((n, r) => n + r.amount, 0);
      const winners = winnerId === null ? [] : rows.filter((r) => r.onUserId === winnerId);
      this.prep("DELETE FROM side_bets WHERE kind = ? AND gameId = ?").run(kind, gameId);

      if (winnerId === null || winners.length === 0) {
        for (const r of rows) this.addCoins(r.bettorId, r.amount);
        return { refunded: true, pool, rake: 0, payouts: [] };
      }
      // Sterling's Rake-Free Night waives the house cut — winners keep it.
      const rake = this.sterlingActiveSpecial()?.kind === "rakefree" ? 0 : Math.floor(pool * 0.05);
      const distributable = pool - rake;
      const winnersTotal = winners.reduce((n, r) => n + r.amount, 0);
      // Merge multiple bets by the same bettor before paying.
      const byUser = new Map<number, number>();
      for (const w of winners) byUser.set(w.bettorId, (byUser.get(w.bettorId) ?? 0) + w.amount);
      const payouts: { userId: number; payout: number }[] = [];
      let paidTotal = 0;
      for (const [userId, stake] of byUser) {
        const payout = Math.floor((distributable * stake) / winnersTotal);
        if (payout > 0) this.addCoins(userId, payout);
        paidTotal += payout;
        payouts.push({ userId, payout });
      }
      this.lotteryBoost(lotteryDay(), pool - paidTotal); // rake + dust → tonight's pot
      return { refunded: false, pool, rake, payouts };
    });
  }

  /** Boot-time crash recovery for the side-bet escrow. */
  sideBetRefundOpen(): number {
    return this.transaction(() => {
      const rows = this.prep("SELECT id, bettorId, amount FROM side_bets")
        .all() as { id: number; bettorId: number; amount: number }[];
      for (const r of rows) {
        this.addCoins(r.bettorId, r.amount);
        this.prep("DELETE FROM side_bets WHERE id = ?").run(r.id);
      }
      return rows.length;
    });
  }

  // ---- Roulette (migration 38) ---------------------------------------------

  /** Escrow a roulette bet: debit + insert in one txn. Null = insufficient. */
  rouletteBet(
    userId: number,
    kind: string,
    target: number | null,
    amount: number,
  ): { id: number; coins: number } | null {
    return this.transaction(() => {
      // The money seam guards itself regardless of caller validation — a
      // non-positive amount would ride spendCoins' <=0 no-op into a poisoned
      // escrow row for free.
      if (!Number.isInteger(amount) || amount <= 0) return null;
      const split = this.spendCoinsChipsFirst(userId, amount);
      if (split === null) return null;
      const info = this.prep("INSERT INTO roulette_bets (userId, kind, target, amount, at, chips) VALUES (?, ?, ?, ?, ?, ?)")
        .run(userId, kind, target, amount, Date.now(), split.chips);
      return { id: Number(info.lastInsertRowid), coins: split.coins };
    });
  }

  /** Settle a round's bets atomically. Each row only credits if its DELETE
   *  actually removed it (the blackjack guard — duplicate settles can't mint).
   *  payout 0 = the stake burns into the house. */
  rouletteSettle(rows: { id: number; userId: number; payout: number }[]): Set<number> {
    // Returns the ids that actually settled (Oct 2026 review): a row the death
    // sweep already refunded is a ghost, and must not count in the house's net.
    const settled = new Set<number>();
    this.transaction(() => {
      for (const r of rows) {
        const info = this.prep("DELETE FROM roulette_bets WHERE id = ? AND userId = ?").run(r.id, r.userId);
        if (info.changes > 0) {
          settled.add(r.id);
          if (r.payout > 0) this.addCoins(r.userId, r.payout);
        }
      }
    });
    return settled;
  }

  /** Take bets back in full, the CHIPS part as chips (the converter rule —
   *  Oct 2026 review: the take-back credited all of it as silver, so chips
   *  became silver one for one). The shape of bjRefundBet. */
  rouletteRefund(ids: number[], userId: number): void {
    this.transaction(() => {
      for (const id of ids) {
        const row = this.prep("SELECT amount, chips FROM roulette_bets WHERE id = ? AND userId = ?")
          .get(id, userId) as { amount: number; chips: number | null } | undefined;
        if (!row) continue;
        const info = this.prep("DELETE FROM roulette_bets WHERE id = ? AND userId = ?").run(id, userId);
        if (info.changes > 0) {
          const chips = row.chips ?? 0;
          if (chips > 0) this.addChips(userId, chips);
          if (row.amount - chips > 0) this.addCoins(userId, row.amount - chips);
        }
      }
    });
  }

  // ---- Craps (migration 47) ------------------------------------------------

  /** Escrow a craps bet: debit + insert in one txn. Null = can't afford it. */
  crapsBet(
    userId: number,
    kind: string,
    num: number | null,
    amount: number,
  ): { id: number; coins: number } | null {
    return this.transaction(() => {
      if (!Number.isInteger(amount) || amount <= 0) return null; // seam guard
      const left = this.spendCoins(userId, amount);
      if (left === null) return null;
      const info = this.prep("INSERT INTO craps_bets (userId, kind, num, amount, at) VALUES (?, ?, ?, ?, ?)")
        .run(userId, kind, num, amount, Date.now());
      return { id: Number(info.lastInsertRowid), coins: left };
    });
  }

  /** Settle craps bets atomically. Two shapes, both real-casino:
   *  - resolved bets (keep=false): guarded credit+DELETE — payout 0 burns the
   *    stake, payout>0 returns stake+winnings; duplicate settles can't mint.
   *  - stay-up wins (keep=true): place/hardway bets pay their WINNINGS and
   *    the bet stays working — implemented as guarded DELETE + fresh INSERT,
   *    so the settle-once doctrine holds here too (a replayed settle finds
   *    no row and credits nothing). Returns oldId→newId for the reinserted
   *    rows; the engine re-keys its live bets from it. */
  /** Which of these craps escrow ids still exist. */
  crapsBetsExisting(ids: number[]): Set<number> {
    const out = new Set<number>();
    for (const id of ids) if (this.prep("SELECT 1 FROM craps_bets WHERE id = ?").get(id)) out.add(id);
    return out;
  }

  crapsSettle(rows: { id: number; userId: number; payout: number; keep?: boolean }[]): Map<number, number> {
    return this.transaction(() => {
      const rekeyed = new Map<number, number>();
      for (const r of rows) {
        if (r.keep) {
          const row = this.prep("SELECT userId, kind, num, amount, at FROM craps_bets WHERE id = ? AND userId = ?")
            .get(r.id, r.userId) as { userId: number; kind: string; num: number | null; amount: number; at: number } | undefined;
          if (!row) continue;
          this.prep("DELETE FROM craps_bets WHERE id = ?").run(r.id);
          if (r.payout > 0) this.addCoins(r.userId, r.payout);
          const info = this.prep("INSERT INTO craps_bets (userId, kind, num, amount, at) VALUES (?, ?, ?, ?, ?)")
            .run(row.userId, row.kind, row.num, row.amount, row.at);
          rekeyed.set(r.id, Number(info.lastInsertRowid));
        } else {
          const info = this.prep("DELETE FROM craps_bets WHERE id = ? AND userId = ?").run(r.id, r.userId);
          if (info.changes > 0 && r.payout > 0) this.addCoins(r.userId, r.payout);
        }
      }
      return rekeyed;
    });
  }

  // ---- Hold'em (migration 49) ----------------------------------------------

  /** Buy in: debit the wallet, escrow the whole stack as a seat row. */
  holdemSit(tableId: number, userId: number, buyIn: number): { coins: number } | null {
    return this.transaction(() => {
      if (!Number.isInteger(buyIn) || buyIn <= 0) return null; // seam guard
      const existing = this.prep("SELECT stack FROM holdem_stacks WHERE tableId = ? AND userId = ?")
        .get(tableId, userId);
      if (existing) return null;
      const left = this.spendCoins(userId, buyIn);
      if (left === null) return null;
      this.prep("INSERT INTO holdem_stacks (tableId, userId, stack, at) VALUES (?, ?, ?, ?)")
        .run(tableId, userId, buyIn, Date.now());
      return { coins: left };
    });
  }

  /** Hand settlement: each seat's row moves by (winnings − contribution) in
   *  one txn; the rake seeds the nightly lottery pot (the standing rule).
   *  NOTE: unlike every other settle, this one has no store-level idempotence
   *  guard — seat rows persist across hands, so credit+delete can't apply and
   *  a duplicate call WOULD double-apply deltas. Single-settle is enforced by
   *  the engine (one settle() per handId; see holdem.ts + its harness). Keep
   *  it that way — never call this twice for one hand. */
  holdemSettle(tableId: number, deltas: { userId: number; delta: number }[], rake: number, day: string): void {
    this.transaction(() => {
      for (const d of deltas) {
        if (d.delta === 0) continue;
        this.prep("UPDATE holdem_stacks SET stack = stack + ? WHERE tableId = ? AND userId = ?")
          .run(d.delta, tableId, d.userId);
      }
      if (rake > 0) this.lotteryBoost(day, rake);
    });
  }

  /** Stand up: credit chips-behind to the wallet, delete the seat row. Any
   *  difference (chips committed to a live pot) stays in play in-memory. */
  holdemLeave(tableId: number, userId: number, credit: number): boolean {
    return this.transaction(() => {
      const info = this.prep("DELETE FROM holdem_stacks WHERE tableId = ? AND userId = ?")
        .run(tableId, userId);
      if (info.changes === 0) return false;
      if (credit > 0) this.addCoins(userId, credit);
      return true;
    });
  }

  /** Boot-time crash recovery: refund every seat's full row (abandoned hands
   *  return committed chips — money can never mint, only this narrow leaver
   *  edge can burn). */
  holdemRefundAll(): number {
    return this.transaction(() => {
      const rows = this.prep("SELECT tableId, userId, stack FROM holdem_stacks")
        .all() as { tableId: number; userId: number; stack: number }[];
      for (const r of rows) {
        if (r.stack > 0) this.addCoins(r.userId, r.stack);
        this.prep("DELETE FROM holdem_stacks WHERE tableId = ? AND userId = ?").run(r.tableId, r.userId);
      }
      return rows.length;
    });
  }

  // ---- Observability (migration 51) ----------------------------------------

  /** A real write probe for the health screen (created+cleared in place). */
  dbWriteProbe(): boolean {
    try {
      this.db.exec("CREATE TABLE IF NOT EXISTS _health (k INTEGER); INSERT INTO _health VALUES (1); DELETE FROM _health;");
      return true;
    } catch {
      return false;
    }
  }

  /** Record (dedup by kind+message+route) an error. Never throws — the error
   *  path must not create errors. */
  recordError(kind: "server" | "client", message: string, stack?: string | null, route?: string | null, userId?: number | null): void {
    // Only the SERVER's own failures feed the surge alert (Oct 2026 review):
    // any member could post five fake browser crashes, ring "HOUSE ALERT"
    // to every admin, and park the alert's 6h cooldown over a real surge.
    if (kind === "server") this.errorHits.push(Date.now());
    if (this.errorHits.length > 20_000) this.errorHits.splice(0, 10_000);
    try {
      // The message is one line; the stack keeps its own (Oct 2026 review).
      const msg = String(message).replace(/[\x00-\x1f\x7f]+/g, " ").slice(0, 500);
      const hash = `${kind}:${route ?? ""}:${msg.slice(0, 200)}`;
      const now = Date.now();
      this.prep(
          `INSERT INTO errors (kind, hash, message, stack, route, userId, count, firstAt, lastAt)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT(hash) DO UPDATE SET count = count + 1, lastAt = excluded.lastAt,
             stack = COALESCE(excluded.stack, stack), userId = COALESCE(excluded.userId, userId)`,
        )
        .run(kind, hash, msg, stack ? String(stack).slice(0, 4000) : null, route ?? null, userId ?? null, now, now);
    } catch {
      /* the error log must never crash anything */
    }
  }

  listErrors(limit = 100): {
    id: number; kind: string; message: string; stack: string | null; route: string | null;
    userId: number | null; count: number; firstAt: number; lastAt: number;
  }[] {
    return this.prep("SELECT id, kind, message, stack, route, userId, count, firstAt, lastAt FROM errors ORDER BY lastAt DESC LIMIT ?")
      .all(limit) as ReturnType<Store["listErrors"]>;
  }

  /** New-error volume since `since` — Sterling's alert trigger. */
  /** Error HITS in a window, not distinct signatures: one route failing for
   *  everyone is one row in `errors` (dedup-by-hash) but hundreds of hits,
   *  and the surge alert used to count rows, so it never tripped. Kept in
   *  memory for the last hour — the alert's window is ten minutes. */
  private errorHits: number[] = [];
  errorSurge(since: number): number {
    const floor = Date.now() - 3_600_000;
    if (this.errorHits.length && this.errorHits[0] < floor) this.errorHits = this.errorHits.filter((t) => t >= floor);
    let n = 0;
    for (let i = this.errorHits.length - 1; i >= 0 && this.errorHits[i] > since; i--) n++;
    return n;
  }

  /** Time-based housekeeping the obs sweep runs: sessions past the sliding
   *  TTL (userForToken refuses them but never deleted them — the table only
   *  shrank on logout) and audit rows past a year. Returns what went. */
  pruneByAge(sessionTtlMs: number, auditKeepMs: number): { sessions: number; audit: number } {
    const now = Date.now();
    const sessions = sessionTtlMs > 0
      ? Number(this.prep("DELETE FROM sessions WHERE COALESCE(lastSeenAt, createdAt) < ?").run(now - sessionTtlMs).changes)
      : 0;
    const audit = Number(this.prep("DELETE FROM audit WHERE at < ?").run(now - auditKeepMs).changes);
    // The errors table had no age limit at all — only the admin's manual
    // clear — and each distinct client message is its own row (Oct 2026).
    this.prep("DELETE FROM errors WHERE lastAt < ?").run(now - 90 * 86_400_000);
    return { sessions, audit };
  }

  clearErrors(): number {
    return Number(this.prep("DELETE FROM errors").run().changes);
  }

  /** The audit trail: who did what, when. actorId NULL = the house. */
  audit(actorId: number | null, action: string, detail?: string): void {
    try {
      this.prep("INSERT INTO audit (at, actorId, action, detail) VALUES (?, ?, ?, ?)")
        .run(Date.now(), actorId, action, detail?.slice(0, 500) ?? null);
    } catch {
      /* never let bookkeeping break the action */
    }
  }

  listAudit(limit = 200): { id: number; at: number; actorId: number | null; action: string; detail: string | null }[] {
    return this.prep("SELECT id, at, actorId, action, detail FROM audit ORDER BY id DESC LIMIT ?")
      .all(limit) as ReturnType<Store["listAudit"]>;
  }

  /** The whole economy in one read: wallets, every escrow surface, undrawn
   *  lottery value. The Admin Panel's audit screen + the daily snapshot. */
  economyTotals(): {
    totalCoins: number;
    escrows: { name: string; total: number }[];
    escrow: number;
    potPending: number;
    vault: number;
    grant: number;
    houseMints: number;
    totalChips: number;
    totalFreePulls: number;
  } {
    const v = (sql: string): number =>
      ((this.prep(sql).get() as { v: number | null }).v ?? 0);
    const escrows = [
      ["blackjack", "SELECT COALESCE(SUM(amount),0) v FROM blackjack_bets"],
      ["roulette", "SELECT COALESCE(SUM(amount),0) v FROM roulette_bets"],
      ["craps", "SELECT COALESCE(SUM(amount),0) v FROM craps_bets"],
      ["holdem", "SELECT COALESCE(SUM(stack),0) v FROM holdem_stacks"],
      ["derby", "SELECT COALESCE(SUM(amount),0) v FROM derby_bets"],
      ["bonepit", "SELECT COALESCE(SUM(amount),0) v FROM bonepit_stakes"],
      ["side bets", "SELECT COALESCE(SUM(amount),0) v FROM side_bets"],
      ["chess silver", "SELECT COALESCE(SUM(amount),0) v FROM chess_silver_stakes"],
      ["auction bids", "SELECT COALESCE(SUM(currentBid),0) v FROM auctions WHERE status = 'open' AND currentBid IS NOT NULL"],
      // The TENTH escrow (migration 85): silver chipped toward somebody's bail.
      ["bail pot", "SELECT COALESCE(SUM(amount),0) v FROM bail_pot"],
    ].map(([name, sql]) => ({ name: name as string, total: v(sql as string) }));
    const potPending =
      v(`SELECT COALESCE(SUM(count),0) * ${TICKET_PRICE} v FROM lottery_tickets WHERE day NOT IN (SELECT day FROM lottery_draws)`) +
      v("SELECT COALESCE(SUM(amount),0) v FROM lottery_boosts");
    return {
      totalCoins: v("SELECT COALESCE(SUM(coins),0) v FROM users"),
      escrows,
      escrow: escrows.reduce((n, e) => n + e.total, 0),
      potPending,
      // The goblins' capital (migration 72). Lending moves silver vault →
      // wallet and repayment moves it back, so the conserved constant is
      // wallets + escrow + pot + VAULT — without this term every loan draw
      // reads as a mint in the drift check.
      vault: v("SELECT COALESCE(SUM(silver),0) v FROM goblin_vault"),
      // ASYNC'S RESEARCH BUDGET (migration 99). Turn-ins move silver grant ->
      // wallet and purchases move it back, so the conserved constant is
      // wallets + escrow + pot + vault + GRANT. Without this term every relic
      // Voss buys reads as a mint in the drift check and every flashlight as
      // a burn - the migration-75 vault lesson. See src/backrooms/grant.ts.
      grant: v("SELECT COALESCE(SUM(silver),0) v FROM async_grant"),
      // THE HOUSE'S MINT (migration 93): silver the house paid the goblins on
      // a Tier-4 member's behalf. Cumulative and ledgered, so the drift check
      // can subtract it — the total may only ever move by real mint/burn.
      houseMints: v("SELECT COALESCE(SUM(amount),0) v FROM vip_consolidations") +
        // …and every coin minted into a regular's SEASON PURSE (migration
        // 111). Folded into the same term so the snapshot, the weekly report
        // and the Admin Panel's drift check subtract it with no change of
        // their own; what a purse loses is then an ordinary burn.
        v("SELECT COALESCE(SUM(amount),0) v FROM season_mints"),
      // The escape room's two restricted balances (migration 70) — counted
      // from day one so a drifting chest mint shows in the daily snapshot,
      // not in a shrugging audit two months later. Chips convert through
      // house-edge games; freePulls are 8.71-EV slots credits.
      totalChips: v("SELECT COALESCE(SUM(chips),0) v FROM users"),
      totalFreePulls: v("SELECT COALESCE(SUM(freePulls),0) v FROM users"),
    };
  }

  // ---- THE ASYNC GRANT (migration 99) — Foundry's money, Async's budget ---
  // Silver replaced Research Credit in Sep 2026; the rules and the reasoning
  // live in src/backrooms/grant.ts. The invariant this section exists to hold:
  //
  //   wallets + escrows + goblin vault + ASYNC GRANT = constant
  //
  // Every payout DRAWS from the grant and every purchase RETURNS to it, so the
  // backrooms can pay real silver without being a second faucet. Nothing here
  // mints. `backrooms_players.rc` is dead (zeroed by migration 99) — never
  // read it, never write it.

  asyncGrant(): { silver: number; paid: number; recovered: number } {
    return this.prep("SELECT silver, paid, recovered FROM async_grant WHERE id = 1").get() as {
      silver: number;
      paid: number;
      recovered: number;
    };
  }

  /** Grant → wallet. Guarded: the budget never goes negative and an
   *  unaffordable turn-in moves nothing at all (grantCovers is the caller's
   *  check; this is the one that actually holds). Returns the new wallet
   *  balance, or null with everything untouched. */
  grantPay(userId: number, amount: number): number | null {
    if (amount <= 0) return this.getCoins(userId);
    const info = this.prep("UPDATE async_grant SET silver = silver - ?, paid = paid + ? WHERE id = 1 AND silver >= ?")
      .run(amount, amount, amount);
    if (info.changes === 0) return null;
    this.addCoins(userId, amount);
    return this.getCoins(userId);
  }

  /** Wallet → grant. The counter's takings go back into the budget they came
   *  from, which is what makes Threshold-4 recirculate rather than drain. */
  grantCollect(amount: number): void {
    if (amount <= 0) return;
    this.prep("UPDATE async_grant SET silver = silver + ?, recovered = recovered + ? WHERE id = 1")
      .run(amount, amount);
  }

  /** FOUNDRY'S DISBURSEMENT — the admin lever, both directions.
   *
   *  This is NOT grantCollect. The admin route used to call that for a
   *  claw-back too, and grantCollect refuses anything <= 0, so a negative
   *  adjustment answered 200 and moved NOTHING — the one direction of the
   *  lever that had a guard written for it was the one that never worked. The
   *  harness covered the REFUSED claw-back (below zero) and never a legal one,
   *  which is how a happy path hides behind a tested guard.
   *
   *  It also deliberately leaves `paid`/`recovered` alone: those two are the
   *  lifetime flow through Voss's COUNTER, and a disbursement from upstairs is
   *  not something a surveyor turned in. Returns the new balance, or null if
   *  the withdrawal would overdraw (nothing moves). */
  grantAdjust(amount: number): number | null {
    if (!Number.isFinite(amount) || amount === 0) return this.asyncGrant().silver;
    const info = amount > 0
      ? this.prep("UPDATE async_grant SET silver = silver + ? WHERE id = 1").run(amount)
      : this.prep("UPDATE async_grant SET silver = silver - ? WHERE id = 1 AND silver >= ?")
          .run(-amount, -amount);
    if (info.changes === 0) return null;
    return this.asyncGrant().silver;
  }

  /** WHERE THE HOUSE'S WINNINGS GO — the one place the split is written.
   *
   *  A house-edge game (slots, blackjack, roulette, craps) that wins `net`
   *  silver off the floor divides it three ways: HOUSE_TITHE (10%) seeds the
   *  nightly lottery, GRANT_TITHE (25%) funds Async's field programme, and
   *  the remaining 65% BURNS. Both shares are redistributions — silver that
   *  would otherwise have left the world stays in it, moved somewhere a
   *  player can win it back — so the games are still hard sinks and the Wheel
   *  is still the only faucet.
   *
   *  It lives here rather than at the four settle sites because four copies
   *  of a split is four chances for one of them to drift, and the drift would
   *  be invisible: every term still conserves, the proportions just quietly
   *  stop matching the documentation. */
  houseEdgeTake(day: string, net: number, game = "house"): void {
    // THE SPLIT IS OF WHAT THE HOUSE HAS ACTUALLY WON (Oct 2026 review). It
    // used to take 35% of every LOSING round and give nothing back on a
    // winning one, so the tithe ran far past the edge: one even-money roulette
    // bettor lost 2.7% of the stake on average while 18% of it went into the
    // pot and the grant — the games were MINTING into them. Now each game
    // keeps a running balance: a loss adds to it, a win takes from it, and
    // only a balance above zero is split, then the balance starts again. Over
    // time that is the shares of the house's real net, as the doctrine says.
    if (!Number.isFinite(net) || net === 0) return;
    const key = `house_net:${game}`;
    const bal = (Number(this.kvGet(key)) || 0) + net;
    if (bal <= 0) {
      this.kvSet(key, String(bal));
      return;
    }
    this.lotteryBoost(day, Math.floor(bal * HOUSE_TITHE));
    this.grantCollect(Math.floor(bal * GRANT_TITHE));
    this.kvSet(key, "0");
  }

  // ---- Backrooms locker + relics (migration 53) ---------------------------
  // All money-path ops follow the house discipline: one transaction,
  // validate before any mutation, guarded no-negative balances.

  /** Read (and lazily create) a player's backrooms row. */
  brPlayer(userId: number): { lockerSlots: number } {
    this.prep("INSERT OR IGNORE INTO backrooms_players (userId) VALUES (?)").run(userId);
    return this.prep("SELECT lockerSlots FROM backrooms_players WHERE userId = ?")
      .get(userId) as { lockerSlots: number };
  }

  brLockerItems(userId: number): { id: number; kind: string; level: number; color: string | null }[] {
    return this.prep("SELECT id, kind, level, color FROM backrooms_locker WHERE userId = ? ORDER BY id")
      .all(userId) as { id: number; kind: string; level: number; color: string | null }[];
  }

  brLockerCount(userId: number): number {
    const r = this.prep("SELECT COUNT(*) AS n FROM backrooms_locker WHERE userId = ?")
      .get(userId) as { n: number };
    return r.n;
  }

  brRelics(userId: number): { relicId: string; unlockedAt: number }[] {
    return this.prep("SELECT relicId, unlockedAt FROM backrooms_relics WHERE userId = ? ORDER BY unlockedAt")
      .all(userId) as { relicId: string; unlockedAt: number }[];
  }

  /** How many DISTINCT relics anybody has ever recovered — the shelf Voss
   *  keeps quoting. Not per-user: this is the community's total. */
  brRelicsFound(): number {
    return (this.prep("SELECT COUNT(DISTINCT relicId) AS n FROM backrooms_relics").get() as { n: number }).n;
  }

  /** Recorded fatalities below, all levels, all time. */
  brDeathCount(): number {
    return (this.prep("SELECT COUNT(*) AS n FROM backrooms_deaths").get() as { n: number }).n;
  }

  /** THE CARRIED-RELIC MIRROR (migration 112). Replaces the whole table with
   *  what the live runs are carrying, in one transaction. */
  brCarriedReplace(rows: { userId: number; slug: string; level: number }[]): void {
    this.transaction(() => {
      this.prep("DELETE FROM backrooms_carried").run();
      const now = Date.now();
      const per = new Map<number, number>();
      for (const r of rows) {
        const n = per.get(r.userId) ?? 0;
        per.set(r.userId, n + 1);
        this.prep("INSERT INTO backrooms_carried (userId, slug, n, level, at) VALUES (?, ?, ?, ?, ?)")
          .run(r.userId, r.slug, n, r.level, now);
      }
    });
  }

  /** A run ended (out, dead, forfeit): its carried relics are accounted for. */
  brCarriedClear(userId: number): void {
    this.prep("DELETE FROM backrooms_carried WHERE userId = ?").run(userId);
  }

  /** At boot: bank every relic a run was carrying when the server stopped —
   *  first-of-a-kind unlocks, a duplicate goes to the locker (the exit's own
   *  rule) — and empty the mirror. Returns how many were banked. */
  brCarriedBankAll(): number {
    const rows = this.prep("SELECT userId, slug FROM backrooms_carried").all() as { userId: number; slug: string }[];
    let n = 0;
    this.transaction(() => {
      for (const r of rows) {
        const u = this.getUserById(r.userId);
        if (u?.deletedAt) continue;
        if (!this.brUnlockRelic(r.userId, r.slug)) this.brForceAddItem(r.userId, "relic", r.slug);
        n++;
      }
      this.prep("DELETE FROM backrooms_carried").run();
    });
    return n;
  }

  /** Unlock a relic (idempotent). Returns true if it was NEW. */
  brUnlockRelic(userId: number, relicId: string): boolean {
    const info = this.prep("INSERT OR IGNORE INTO backrooms_relics (userId, relicId, unlockedAt) VALUES (?, ?, ?)")
      .run(userId, relicId, Date.now());
    if (info.changes > 0) this.achievementPoke?.(userId);
    if (info.changes > 0) this.affinityHook?.(userId, "voss", "relic");
    return info.changes > 0;
  }

  /** Buy a piece of gear from Voss: capacity check → SILVER debit → the
   *  silver into Async's budget → locker insert, one transaction. */
  brBuyGear(
    userId: number,
    kind: string,
    price: number,
    color: string | null,
  ): { ok: boolean; error?: string; coins: number; itemId?: number } {
    return this.transaction(() => {
      const p = this.brPlayer(userId);
      if (this.brLockerCount(userId) >= p.lockerSlots)
        return { ok: false, error: "locker_full", coins: this.getCoins(userId) };
      const left = this.spendCoins(userId, price);
      if (left === null) return { ok: false, error: "insufficient", coins: this.getCoins(userId) };
      this.grantCollect(price);
      const info = this.prep("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, ?, 0, ?, ?)")
        .run(userId, kind, color, Date.now());
      return { ok: true, coins: left, itemId: Number(info.lastInsertRowid) };
    });
  }

  /** Upgrade a locker item one level (cost by TARGET level, capped). */
  brUpgradeGear(
    userId: number,
    itemId: number,
    maxLevel: number,
    costOfTarget: (level: number) => number,
  ): { ok: boolean; error?: string; coins: number; level?: number } {
    return this.transaction(() => {
      const row = this.prep("SELECT level FROM backrooms_locker WHERE id = ? AND userId = ?")
        .get(itemId, userId) as { level: number } | undefined;
      if (!row) return { ok: false, error: "not_owned", coins: this.getCoins(userId) };
      if (row.level >= maxLevel) return { ok: false, error: "max_level", coins: this.getCoins(userId) };
      const target = row.level + 1;
      const cost = costOfTarget(target);
      const left = this.spendCoins(userId, cost);
      if (left === null) return { ok: false, error: "insufficient", coins: this.getCoins(userId) };
      this.grantCollect(cost);
      this.prep("UPDATE backrooms_locker SET level = ? WHERE id = ?").run(target, itemId);
      return { ok: true, coins: left, level: target };
    });
  }

  /** Recolor an owned spray can (each color purchase recolors the can). */
  brSprayColor(
    userId: number,
    itemId: number,
    color: string,
    cost: number,
  ): { ok: boolean; error?: string; coins: number } {
    return this.transaction(() => {
      const row = this.prep("SELECT kind FROM backrooms_locker WHERE id = ? AND userId = ?")
        .get(itemId, userId) as { kind: string } | undefined;
      if (!row || row.kind !== "spraycan")
        return { ok: false, error: "not_owned", coins: this.getCoins(userId) };
      const left = this.spendCoins(userId, cost);
      if (left === null) return { ok: false, error: "insufficient", coins: this.getCoins(userId) };
      this.grantCollect(cost);
      this.prep("UPDATE backrooms_locker SET color = ? WHERE id = ?").run(color, itemId);
      return { ok: true, coins: left };
    });
  }

  /** Locker expansion 20 → 40, once. */
  brLockerUpgrade(
    userId: number,
    cost: number,
    max: number,
  ): { ok: boolean; error?: string; coins: number; lockerSlots: number } {
    return this.transaction(() => {
      const p = this.brPlayer(userId);
      if (p.lockerSlots >= max)
        return { ok: false, error: "already_upgraded", coins: this.getCoins(userId), lockerSlots: p.lockerSlots };
      const left = this.spendCoins(userId, cost);
      if (left === null)
        return { ok: false, error: "insufficient", coins: this.getCoins(userId), lockerSlots: p.lockerSlots };
      this.grantCollect(cost);
      this.prep("UPDATE backrooms_players SET lockerSlots = ? WHERE userId = ?").run(max, userId);
      return { ok: true, coins: left, lockerSlots: max };
    });
  }

  /** Force an item into the locker regardless of capacity (relic dupes and
   *  looted corpse gear are never destroyed by a full locker). */
  brForceAddItem(userId: number, kind: string, color: string | null, level = 0): number {
    const info = this.prep("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, ?, ?, ?, ?)")
      .run(userId, kind, level, color, Date.now());
    return Number(info.lastInsertRowid);
  }

  /** TURN RESEARCH IN — a duplicate relic or an entity tape, paid for out of
   *  Async's budget. One transaction: draw the silver FIRST (so a grant that
   *  can't cover it leaves the item in the locker) and only then delete.
   *
   *  VOSS DOES NOT BUY EQUIPMENT (Sep 2026, the silver switch). She used to
   *  buy any gear back at half the catalog price, which was harmless while
   *  Research Credit was a closed currency and an outright faucet the moment
   *  it became silver: the Standard Kit cost ONE RARE EMOJI and handed over
   *  500 of gear, repeatably, so a rare worth 200 at Sterling's counter
   *  converted to 250 of house money, forever, limited only by locker slots
   *  you could free by selling. The fix is the one that is also in character
   *  — she is a field researcher, not a pawnbroker. She buys findings. Gear
   *  you no longer want is DISCARDED (brDiscardItem), for nothing. */
  brTurnIn(userId: number, itemId: number, price: number): { ok: boolean; error?: string; coins: number } {
    return this.transaction(() => {
      const row = this.prep("SELECT kind FROM backrooms_locker WHERE id = ? AND userId = ?")
        .get(itemId, userId) as { kind: string } | undefined;
      if (!row) return { ok: false, error: "not_owned", coins: this.getCoins(userId) };
      if (row.kind !== "relic" && row.kind !== "tape")
        return { ok: false, error: "unsellable", coins: this.getCoins(userId) };
      const paid = this.grantPay(userId, price);
      if (paid === null) return { ok: false, error: "grant_dry", coins: this.getCoins(userId) };
      this.prep("DELETE FROM backrooms_locker WHERE id = ? AND userId = ?").run(itemId, userId);
      return { ok: true, coins: paid };
    });
  }

  /** Throw a locker item away. Free, irreversible, moves no money — the way
   *  out of a full locker now that gear has no resale. */
  brDiscardItem(userId: number, itemId: number): boolean {
    const info = this.prep("DELETE FROM backrooms_locker WHERE id = ? AND userId = ?").run(itemId, userId);
    return info.changes > 0;
  }

  /** The Standard Kit: burn ONE owned RARE emoji → yellow suit + spray can
   *  + flashlight. The emoji→gear bridge, and a real emoji SINK.
   *
   *  STARTER KIT MEANS STARTER (Sep 2026): refused if you already own a suit.
   *  Josh's reason for the kit was "nobody's first run should be dark", and
   *  somebody on their fourth suit is not having a first run. It was
   *  repeatable up to locker space, which was the other half of the
   *  buy-back exploit above. */
  brBuyStandardKit(userId: number, code: string): { ok: boolean; error?: string; coins: number } {
    return this.transaction(() => {
      const p = this.brPlayer(userId);
      const coins = this.getCoins(userId);
      const e = this.getEmoji(code);
      if (!e || e.tier !== "rare") return { ok: false, error: "not_rare", coins };
      if (!this.ownsEmoji(userId, code)) return { ok: false, error: "not_owned", coins };
      if (this.brLockerItems(userId).some((i) => i.kind === "suit"))
        return { ok: false, error: "have_suit", coins };
      if (this.brLockerCount(userId) + 3 > p.lockerSlots)
        return { ok: false, error: "locker_full", coins };
      this.removeEmoji(userId, code);
      const now = Date.now();
      this.prep("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, 'suit', 0, 'yellow', ?)")
        .run(userId, now);
      this.prep("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, 'spraycan', 0, NULL, ?)")
        .run(userId, now);
      // A flashlight rides the kit too (Josh, Aug 2026) — nobody's first
      // run should be dark.
      this.prep("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, 'flashlight', 0, NULL, ?)")
        .run(userId, now);
      return { ok: true, coins };
    });
  }

  // ---- Backrooms corpses (migration 56) -------------------------------------

  brAddCorpse(userId: number, name: string, x: number, y: number, items: unknown[], sector = "A3"): number {
    const info = this.prep("INSERT INTO backrooms_corpses (userId, name, x, y, at, items, sector) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(userId, name, x, y, Date.now(), JSON.stringify(items), sector);
    return Number(info.lastInsertRowid);
  }

  brAllCorpses(): { id: number; userId: number; name: string; x: number; y: number; at: number; items: string; sector: string }[] {
    return this.prep("SELECT * FROM backrooms_corpses").all() as {
      id: number; userId: number; name: string; x: number; y: number; at: number; items: string; sector: string;
    }[];
  }

  brSetCorpseItems(id: number, items: unknown[]): void {
    this.prep("UPDATE backrooms_corpses SET items = ? WHERE id = ?").run(JSON.stringify(items), id);
  }

  /** Do these rows still exist? A test play's stash outlives the rot sweep
   *  (Oct 2026 review). */
  brCorpseExists(id: number): boolean {
    return !!this.prep("SELECT 1 FROM backrooms_corpses WHERE id = ?").get(id);
  }
  brDropExists(id: number): boolean {
    return !!this.prep("SELECT 1 FROM backrooms_drops WHERE id = ?").get(id);
  }

  brDeleteCorpse(id: number): void {
    this.prep("DELETE FROM backrooms_corpses WHERE id = ?").run(id);
  }

  /** Bodies rot: everything older than the cutoff goes (Josh's persistence
   *  rule — only spray paint is permanent). Returns the ids removed so the
   *  service can drop them from memory too. */
  brExpireCorpses(cutoff: number): number[] {
    const rows = this.prep("SELECT id FROM backrooms_corpses WHERE at < ?").all(cutoff) as { id: number }[];
    if (rows.length) this.prep("DELETE FROM backrooms_corpses WHERE at < ?").run(cutoff);
    return rows.map((r) => r.id);
  }

  // ---- Backrooms dropped items (migration 57) -------------------------------

  brAddDrop(
    sector: string,
    d: { x: number; y: number; kind: string; level: number; color: string | null; charge: number | null },
  ): number {
    const info = this.prep("INSERT INTO backrooms_drops (sector, x, y, kind, level, color, charge, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(sector, d.x, d.y, d.kind, d.level, d.color, d.charge, Date.now());
    return Number(info.lastInsertRowid);
  }

  brAllDrops(sector: string): {
    id: number; x: number; y: number; kind: string; level: number; color: string | null; charge: number | null; at: number;
  }[] {
    return this.prep("SELECT id, x, y, kind, level, color, charge, at FROM backrooms_drops WHERE sector = ?")
      .all(sector) as {
      id: number; x: number; y: number; kind: string; level: number; color: string | null; charge: number | null; at: number;
    }[];
  }

  /** True only when a row really went (Oct 2026 review): a drop that rotted
   *  in the DB while its copy sat in memory must not be picked up. */
  brDeleteDrop(id: number): boolean {
    return Number(this.prep("DELETE FROM backrooms_drops WHERE id = ?").run(id).changes) > 0;
  }

  /** Same one-hour rot as bodies. */
  brExpireDrops(cutoff: number): number[] {
    const rows = this.prep("SELECT id FROM backrooms_drops WHERE at < ?").all(cutoff) as { id: number }[];
    if (rows.length) this.prep("DELETE FROM backrooms_drops WHERE at < ?").run(cutoff);
    return rows.map((r) => r.id);
  }

  /** ADMIN: wipe a sector's world history — exploration fog, every spray
   *  mark, every body and dropped item, and the death ledger. Player
   *  lockers, RC and unlocked relics are NOT touched (that's their
   *  property, not the map's). One transaction: a half-wiped world would
   *  leave paint floating over unexplored fog. */
  /** ADMIN: wipe the sector's world history. `deep` ALSO erases community
   *  PROGRESS — every relic anyone has unlocked, the whole lore archive, and
   *  THE DOOR itself — so a tester can play the discovery loop again from
   *  nothing (Josh, July 2026). That is deliberately a separate flag: the
   *  ordinary reset exists to clear a playtest's scribbles off a map, and
   *  quietly deleting everyone's collections along with it would be a very
   *  expensive surprise. Nothing here touches gear, RC or lockers. */
  // ---- the map editor (migration 103) -----------------------------------
  // Libraries are stored as the JSON array of room definitions; this layer
  // neither reads nor checks them (worldgen-pipes / pipes-tiles do).

  mapDraft(level: number): { tiles: string; seed: number; savedAt: number; savedBy: number | null } | null {
    return (this.prep("SELECT tiles, seed, savedAt, savedBy FROM map_drafts WHERE level = ?").get(level) as never) ?? null;
  }

  saveMapDraft(level: number, tiles: string, seed: number, by: number | null): number {
    const at = Date.now();
    this.prep(
      "INSERT INTO map_drafts (level, tiles, seed, savedAt, savedBy) VALUES (?, ?, ?, ?, ?) ON CONFLICT(level) DO UPDATE SET tiles = excluded.tiles, seed = excluded.seed, savedAt = excluded.savedAt, savedBy = excluded.savedBy",
    ).run(level, tiles, seed, at, by);
    return at;
  }

  clearMapDraft(level: number): boolean {
    return Number(this.prep("DELETE FROM map_drafts WHERE level = ?").run(level).changes) > 0;
  }

  /** The live (newest) published version of a level, library included. */
  mapPublished(level: number): { version: number; sectorId: string; seed: number; tiles: string; fingerprint: string; note: string | null; publishedAt: number; publishedBy: number | null } | null {
    return (
      (this.prep(
        "SELECT version, sectorId, seed, tiles, fingerprint, note, publishedAt, publishedBy FROM map_versions WHERE level = ? ORDER BY version DESC LIMIT 1",
      ).get(level) as never) ?? null
    );
  }

  /** Every published version, newest first, without the libraries. */
  mapVersions(level: number): { version: number; sectorId: string; seed: number; fingerprint: string; note: string | null; publishedAt: number; publishedBy: number | null; rooms: number }[] {
    return this.prep(
      "SELECT version, sectorId, seed, fingerprint, note, publishedAt, publishedBy, json_array_length(tiles) AS rooms FROM map_versions WHERE level = ? ORDER BY version DESC",
    ).all(level) as never;
  }

  /** Where people died on one map (the map editor's heatmap). */
  brDeathsOn(sector: string, limit = 2000): { x: number; y: number; cause: string; at: number }[] {
    return this.prep("SELECT x, y, cause, at FROM backrooms_deaths WHERE sector = ? ORDER BY at DESC LIMIT ?").all(sector, limit) as never;
  }

  /** Every texture uploaded in the map editor, oldest first. */
  mapSurfaces(): { id: number; kind: string; name: string; file: string; sizeM: number; level: number; createdAt: number }[] {
    return this.prep("SELECT id, kind, name, file, sizeM, level, createdAt FROM map_surfaces ORDER BY id").all() as never;
  }
  addMapSurface(kind: string, name: string, file: string, sizeM: number, level: boolean, by: number): number {
    return Number(this.prep("INSERT INTO map_surfaces (kind, name, file, sizeM, level, createdAt, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?)").run(kind, name, file, sizeM, level ? 1 : 0, Date.now(), by).lastInsertRowid);
  }
  renameMapSurface(id: number, name: string, sizeM: number): boolean {
    return Number(this.prep("UPDATE map_surfaces SET name = ?, sizeM = ? WHERE id = ?").run(name, sizeM, id).changes) > 0;
  }

  /** One published version's library (for rolling back or reading it out). */
  mapVersion(level: number, version: number): { version: number; sectorId: string; seed: number; tiles: string } | null {
    return (this.prep("SELECT version, sectorId, seed, tiles FROM map_versions WHERE level = ? AND version = ?").get(level, version) as never) ?? null;
  }

  /** Record a publish. The version number is the next one for the level;
   *  the caller has already built the map and knows its fingerprint. The
   *  draft is cleared in the same transaction — what was drafted IS live. */
  insertMapVersion(level: number, v: { sectorIdOf: (version: number) => string; seed: number; tiles: string; fingerprint: string; note: string | null; by: number | null }): { version: number; sectorId: string } {
    return this.transaction(() => {
      const last = Number((this.prep("SELECT COALESCE(MAX(version), 0) AS n FROM map_versions WHERE level = ?").get(level) as { n: number }).n);
      const version = last + 1;
      const sectorId = v.sectorIdOf(version);
      this.prep(
        "INSERT INTO map_versions (level, version, sectorId, seed, tiles, fingerprint, note, publishedAt, publishedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(level, version, sectorId, v.seed, v.tiles, v.fingerprint, v.note, Date.now(), v.by);
      this.prep("DELETE FROM map_drafts WHERE level = ?").run(level);
      return { version, sectorId };
    });
  }

  brResetWorld(
    sector: string,
    deep = false,
  ): { fog: number; marks: number; corpses: number; drops: number; deaths: number; relics: number; drives: number; flags: number } {
    return this.transaction(() => {
      const count = (sql: string, ...args: unknown[]): number =>
        Number((this.prep(sql).get(...(args as never[])) as { n: number }).n);
      const out = {
        fog: count("SELECT COUNT(*) AS n FROM backrooms_fog WHERE sector = ?", sector),
        marks: count("SELECT COUNT(*) AS n FROM backrooms_marks WHERE sector = ?", sector),
        corpses: count("SELECT COUNT(*) AS n FROM backrooms_corpses"),
        drops: count("SELECT COUNT(*) AS n FROM backrooms_drops WHERE sector = ?", sector),
        deaths: count("SELECT COUNT(*) AS n FROM backrooms_deaths"),
        relics: deep ? count("SELECT COUNT(*) AS n FROM backrooms_relics") : 0,
        drives: deep ? count("SELECT COUNT(*) AS n FROM backrooms_drives") : 0,
        flags: deep ? count("SELECT COUNT(*) AS n FROM backrooms_flags") : 0,
      };
      this.prep("DELETE FROM backrooms_fog WHERE sector = ?").run(sector);
      this.prep("DELETE FROM backrooms_marks WHERE sector = ?").run(sector);
      this.prep("DELETE FROM backrooms_drops WHERE sector = ?").run(sector);
      this.prep("DELETE FROM backrooms_corpses").run();
      this.prep("DELETE FROM backrooms_deaths").run();
      if (deep) {
        this.prep("DELETE FROM backrooms_relics").run();
        this.prep("DELETE FROM backrooms_drives").run();
        this.prep("DELETE FROM backrooms_flags").run();
      }
      return out;
    });
  }

  // ---- The Research archive (migration 60) ---------------------------------

  /** Claim a lore drive for the whole platform. The INSERT is the claim: two
   *  players grabbing the same drive in the same instant, or a replayed
   *  message, can only ever produce one finder (`fresh` false the second
   *  time). Nothing is ever deleted here — the archive only grows. */
  brUnlockDrive(driveId: string, userId: number, name: string): { fresh: boolean; finder: string; at: number } {
    const r = this.brUnlockDriveTx(driveId, userId, name);
    if (r.fresh) this.affinityHook?.(userId, "voss", "drive");
    return r;
  }

  private brUnlockDriveTx(driveId: string, userId: number, name: string): { fresh: boolean; finder: string; at: number } {
    return this.transaction(() => {
      const existing = this.prep("SELECT name, at FROM backrooms_drives WHERE driveId = ?")
        .get(driveId) as { name: string; at: number } | undefined;
      if (existing) return { fresh: false, finder: existing.name, at: existing.at };
      const at = Date.now();
      this.prep("INSERT INTO backrooms_drives (driveId, userId, name, at) VALUES (?, ?, ?, ?)")
        .run(driveId, userId, name, at);
      return { fresh: true, finder: name, at };
    });
  }

  brUnlockedDrives(): { driveId: string; userId: number; name: string; at: number }[] {
    return this.prep("SELECT driveId, userId, name, at FROM backrooms_drives ORDER BY driveId").all() as {
      driveId: string; userId: number; name: string; at: number;
    }[];
  }

  brDriveIsUnlocked(driveId: string): boolean {
    return !!this.prep("SELECT 1 FROM backrooms_drives WHERE driveId = ?").get(driveId);
  }

  /** Clear a flag. Only for a SWITCH (the station's open-to-members switch) —
   *  never for world history: a door opened or a breaker thrown stays so. */
  brClearFlag(flag: string): void {
    this.prep("DELETE FROM backrooms_flags WHERE flag = ?").run(flag);
  }

  /** One-time world events (the door to Level 1). The row IS the event, so a
   *  second attempt returns fresh=false and changes nothing. */
  brSetFlag(flag: string, userId: number | null, name: string | null): { fresh: boolean; name: string | null; at: number } {
    return this.transaction(() => {
      const existing = this.prep("SELECT name, at FROM backrooms_flags WHERE flag = ?")
        .get(flag) as { name: string | null; at: number } | undefined;
      if (existing) return { fresh: false, name: existing.name, at: existing.at };
      const at = Date.now();
      this.prep("INSERT INTO backrooms_flags (flag, userId, name, at) VALUES (?, ?, ?, ?)")
        .run(flag, userId, name, at);
      return { fresh: true, name, at };
    });
  }

  brGetFlag(flag: string): { name: string | null; at: number } | null {
    return (
      (this.prep("SELECT name, at FROM backrooms_flags WHERE flag = ?").get(flag) as
        | { name: string | null; at: number }
        | undefined) ?? null
    );
  }

  // ---- Backrooms deaths (migration 55) --------------------------------------

  brAddDeath(userId: number, name: string, x: number, y: number, cause: string, level: number | null = null, sector: string | null = null): void {
    this.prep("INSERT INTO backrooms_deaths (userId, name, x, y, cause, at, level, sector) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(userId, name, x, y, cause, Date.now(), level, sector);
    this.achievementPoke?.(userId); // death badges are derived counts
  }

  brRecentDeaths(limit = 8): { name: string; cause: string; at: number }[] {
    return this.prep("SELECT name, cause, at FROM backrooms_deaths ORDER BY at DESC LIMIT ?")
      .all(limit) as { name: string; cause: string; at: number }[];
  }

  /** Death tax: the carried loadout dies with you (corpse recovery later). */
  /** Returns the ids whose rows really went (Oct 2026 review): a carried
   *  item sold over HTTP mid-run has no row left, and a drop or a body that
   *  re-minted it was an endless draw on the Async grant. */
  brDeleteItems(userId: number, ids: number[]): number[] {
    const del = this.prep("DELETE FROM backrooms_locker WHERE id = ? AND userId = ?");
    const gone: number[] = [];
    for (const id of ids) if (Number(del.run(id, userId).changes) > 0) gone.push(id);
    return gone;
  }

  // ---- Backrooms spray marks (migration 54) --------------------------------

  /** A wall face is a canvas of at most this many dots — the newest win
   *  (review round 2: a can held on one wall wrote ~108k rows an hour into
   *  one chunk, and every chunk read then shipped all of them). */
  static readonly MARKS_PER_FACE = 400;
  /** And one chunk read ships at most this many, newest first. */
  static readonly MARKS_PER_CHUNK = 4000;

  brAddMark(sector: string, m: { cellX: number; cellY: number; face: string; u: number; v: number; color: string; userId: number }): void {
    this.prep(
        "INSERT INTO backrooms_marks (sector, cellX, cellY, face, u, v, color, userId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(sector, m.cellX, m.cellY, m.face, m.u, m.v, m.color, m.userId, Date.now());
    this.prep(
        `DELETE FROM backrooms_marks WHERE id IN (
           SELECT id FROM backrooms_marks WHERE sector = ? AND cellX = ? AND cellY = ? AND face = ?
           ORDER BY id DESC LIMIT -1 OFFSET ?)`,
      )
      .run(sector, m.cellX, m.cellY, m.face, Store.MARKS_PER_FACE);
  }

  brMarksInRect(
    sector: string,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): { cellX: number; cellY: number; face: string; u: number; v: number; color: string }[] {
    return this.prep(
        "SELECT cellX, cellY, face, u, v, color FROM backrooms_marks WHERE sector = ? AND cellX >= ? AND cellX < ? AND cellY >= ? AND cellY < ? ORDER BY id DESC LIMIT ?",
      )
      // Bound in the SQL's own order (x-range, then y-range). The old call
      // bound x0, y0, x1, y1 against cellX>=, cellX<, cellY>=, cellY<, so a
      // chunk's read asked for cellX in [x0, y0) — empty on every square
      // chunk. Persisted spray never came back on a return visit.
      .all(sector, x0, x1, y0, y1, Store.MARKS_PER_CHUNK) as { cellX: number; cellY: number; face: string; u: number; v: number; color: string }[];
  }

  // ---- Backrooms fog (migration 52) ----------------------------------------

  /** Packed exploration fog for a sector. `expectBytes` guards a world that
   *  CHANGED SIZE (Level 0 v2 went 256² → 362²): a buffer packed for the old
   *  geometry would be read past its end and paint nonsense across the new
   *  map, so a mismatch is treated as "no fog yet" rather than trusted. */
  getBackroomsFog(sector: string, expectBytes?: number): Buffer | null {
    const row = this.prep("SELECT explored FROM backrooms_fog WHERE sector = ?").get(sector) as
      | { explored: Uint8Array }
      | undefined;
    if (!row) return null;
    const buf = Buffer.from(row.explored);
    if (expectBytes !== undefined && buf.length !== expectBytes) {
      console.warn(
        `[backrooms] stored fog for sector ${sector} is ${buf.length}B, this world needs ${expectBytes}B — ignoring it (the map changed shape; run the admin map reset to clear the rest).`,
      );
      return null;
    }
    return buf;
  }

  /** Forget a sector's charted cells (a test run starts uncharted). */
  clearBackroomsFog(sector: string): void {
    this.prep("DELETE FROM backrooms_fog WHERE sector = ?").run(sector);
  }

  saveBackroomsFog(sector: string, explored: Buffer): void {
    this.prep(
        "INSERT INTO backrooms_fog (sector, explored, updated) VALUES (?, ?, ?) " +
          "ON CONFLICT(sector) DO UPDATE SET explored = excluded.explored, updated = excluded.updated",
      )
      .run(sector, explored, Date.now());
  }

  /** Once a day (any sweep may call it): snapshot the economy for drift. */
  snapshotEconomy(day: string): void {
    const exists = this.prep("SELECT 1 FROM economy_snapshots WHERE day = ?").get(day);
    if (exists) return;
    const t = this.economyTotals();
    // EVERY column gets its own value (Oct 2026 review): one value short, and
    // node:sqlite binds the missing trailing one as NULL without a word.
    this.prep('INSERT INTO economy_snapshots (day, at, totalCoins, escrow, potPending, vault, "grant", houseMints, exchangeFloat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(day, Date.now(), t.totalCoins, t.escrow, t.potPending, t.vault, t.grant, t.houseMints, 0);
  }

  listEconomySnapshots(limit = 30): { day: string; at: number; totalCoins: number; escrow: number; potPending: number; vault: number | null; grant: number | null; houseMints: number | null; exchangeFloat: number | null }[] {
    // `vault` is NULL on pre-migration-75 rows — "not measured", never zero.
    // `houseMints` is NULL on pre-95 rows — no consolidation predates 93, so 0.
    // `exchangeFloat` is NULL on rows written before the Oct 2026 fix.
    return this.prep('SELECT day, at, totalCoins, escrow, potPending, vault, "grant", houseMints, exchangeFloat FROM economy_snapshots ORDER BY day DESC LIMIT ?')
      .all(limit) as ReturnType<Store["listEconomySnapshots"]>;
  }

  // ---- Sterling: the specials calendar (migration 50) ----------------------
  // A tiny cached read sits on hot paths (bumpStat, settles), so the active
  // special is looked up at most once per SPECIAL_CACHE_MS.

  private specialCache: { at: number; row: { id: number; kind: string; data: string; startsAt: number; endsAt: number } | null } = { at: 0, row: null };
  private static SPECIAL_CACHE_MS = 15_000;

  sterlingActiveSpecial(): { id: number; kind: string; data: Record<string, unknown>; startsAt: number; endsAt: number } | null {
    const now = Date.now();
    if (now - this.specialCache.at > Store.SPECIAL_CACHE_MS) {
      this.specialCache = {
        at: now,
        row: (this.prep("SELECT id, kind, data, startsAt, endsAt FROM specials WHERE startsAt <= ? AND endsAt > ? ORDER BY id DESC LIMIT 1")
          .get(now, now) ?? null) as typeof this.specialCache.row,
      };
    }
    const r = this.specialCache.row;
    if (!r) return null;
    if (r.endsAt <= now) return null; // the cache can outlive the special by up to 15s
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(r.data); } catch { /* corrupt = empty */ }
    return { id: r.id, kind: r.kind, data, startsAt: r.startsAt, endsAt: r.endsAt };
  }

  sterlingCreateSpecial(kind: string, data: Record<string, unknown>, startsAt: number, endsAt: number): number {
    const info = this.prep("INSERT INTO specials (kind, data, startsAt, endsAt, announcedAt) VALUES (?, ?, ?, ?, ?)")
      .run(kind, JSON.stringify(data), startsAt, endsAt, Date.now());
    this.specialCache.at = 0; // bust the cache — the special starts NOW
    return Number(info.lastInsertRowid);
  }

  /** Specials past their end that haven't had their closing announcement. */
  sterlingSpecialsToClose(): { id: number; kind: string; data: string }[] {
    return this.prep("SELECT id, kind, data FROM specials WHERE endsAt <= ? AND closedAt IS NULL")
      .all(Date.now()) as { id: number; kind: string; data: string }[];
  }

  sterlingMarkClosed(id: number): void {
    this.prep("UPDATE specials SET closedAt = ? WHERE id = ?").run(Date.now(), id);
    this.specialCache.at = 0;
  }

  /** When did the last special end (0 = never)? Gates the random scheduler. */
  sterlingLastSpecialEnd(): number {
    const r = this.prep("SELECT MAX(endsAt) AS m FROM specials").get() as { m: number | null };
    return r.m ?? 0;
  }

  /** Stamp a seeded account as the house bot (Sterling). */
  /** Out of every roster for good, the row kept so old messages keep a name
   *  (the casino regulars' bots since migration 119). */
  hideAccount(userId: number): void {
    this.prep("UPDATE users SET deletedAt = ? WHERE id = ? AND deletedAt IS NULL").run(Date.now(), userId);
  }

  setBotFlag(username: string): void {
    this.prep("UPDATE users SET isBot = 1 WHERE username = ?").run(username);
  }

  /** Spin Drop: +n bonus wheel spins for every living human. Returns count. */
  addBonusSpinsAll(n: number): number {
    const info = this.prep("UPDATE users SET bonusSpins = bonusSpins + ? WHERE disabled = 0 AND isBot = 0")
      .run(n);
    return Number(info.changes);
  }

  /** How many collectors hold this emoji right now? */
  emojiOwnerCount(code: string): number {
    const r = this.prep("SELECT COUNT(*) AS n FROM user_emoji WHERE code = ?").get(code) as { n: number };
    return r.n;
  }

  /** Tonight's lottery pot so far: sold tickets + every floor rake boost. */
  lotteryPotInfo(day: string): { tickets: number; boost: number } {
    const t = this.prep("SELECT COALESCE(SUM(count),0) AS n FROM lottery_tickets WHERE day = ?")
      .get(day) as { n: number };
    const b = this.prep("SELECT COALESCE(SUM(amount),0) AS n FROM lottery_boosts WHERE day = ?")
      .get(day) as { n: number };
    return { tickets: t.n, boost: b.n };
  }

  /** Has this ISO week's Bone Pit crown been claimed, and by whom? */
  pitCrownFor(weekId: string): { winner: PublicUser | null; at: number } | null {
    const r = this.prep("SELECT winnerId, at FROM bonepit_weeks WHERE weekId = ?")
      .get(weekId) as { winnerId: number; at: number } | undefined;
    if (!r) return null;
    const u = this.getUserById(r.winnerId);
    return { winner: u ? toPublicUser(u) : null, at: r.at };
  }

  /** Boot-time crash recovery: refund every escrowed craps bet in full. */
  crapsRefundOpenBets(): number {
    return this.transaction(() => {
      const rows = this.prep("SELECT id, userId, amount FROM craps_bets")
        .all() as { id: number; userId: number; amount: number }[];
      for (const r of rows) {
        this.addCoins(r.userId, r.amount);
        this.prep("DELETE FROM craps_bets WHERE id = ?").run(r.id);
      }
      return rows.length;
    });
  }

  /** Boot-time crash recovery: refund every escrowed roulette bet in full. */
  rouletteRefundOpenBets(): number {
    return this.transaction(() => {
      const rows = this.prep("SELECT id, userId, amount, chips FROM roulette_bets")
        .all() as { id: number; userId: number; amount: number; chips: number }[];
      for (const r of rows) {
        // The chips portion goes back AS CHIPS (E3b's converter rule).
        this.addChips(r.userId, r.chips);
        this.addCoins(r.userId, r.amount - r.chips);
        this.prep("DELETE FROM roulette_bets WHERE id = ?").run(r.id);
      }
      return rows.length;
    });
  }

  // ---- Admin account controls (migration 36) -------------------------------

  /** Lock (or unlock) an account. Locking kills every session immediately. */
  setLocked(userId: number, locked: boolean): User | undefined {
    this.prep("UPDATE users SET locked = ? WHERE id = ?").run(locked ? 1 : 0, userId);
    if (locked) this.prep("DELETE FROM sessions WHERE userId = ?").run(userId);
    return this.getUserById(userId);
  }

  /** Assign a role (migration 45). Admin-only power. */
  setRole(userId: number, role: "user" | "moderator"): User | undefined {
    this.prep("UPDATE users SET role = ? WHERE id = ?").run(role, userId);
    return this.getUserById(userId);
  }

  /** Timed suspension: refused login until `until` (null lifts it early).
   *  Sessions die with it, like a lock. */
  setSuspension(userId: number, until: number | null): User | undefined {
    this.prep("UPDATE users SET suspendedUntil = ? WHERE id = ?").run(until, userId);
    if (until && until > Date.now()) this.prep("DELETE FROM sessions WHERE userId = ?").run(userId);
    return this.getUserById(userId);
  }

  /** Admin "delete": scrub personal data + permanently lock. The row stays
   *  (message/trade/grave history references it) but nothing personal
   *  remains: identity anonymized, avatar/banner/bio/epitaph/cosmetics/prefs
   *  wiped, emoji + coins burned, uploaded sounds dropped, sessions killed,
   *  and the password made unusable and the role reset — an unban used to
   *  bring a scrubbed account back with its old password (Oct 2026 review).
   *  Returns every upload file for the caller to unlink — a scrub that left
   *  a served banner or soundboard file behind wouldn't be a scrub. */
  scrubUser(userId: number): { ok: boolean; avatar: string | null; banner: string | null; sounds: string[] } {
    return this.transaction(() => {
      const u = this.getUserById(userId);
      if (!u) return { ok: false, avatar: null, banner: null, sounds: [] };
      const oldAvatar = u.avatar;
      const oldBanner = u.banner;
      const oldSounds = [
        ...this.userSounds(userId).map((s) => s.file),
        // The scrub burns everything — their library sounds go too.
        ...(this.prep("SELECT file FROM board_sounds WHERE ownerId = ?").all(userId) as { file: string }[]).map(
          (r) => r.file,
        ),
      ];
      // Pull open game escrow back first, then the coins=0 below burns it —
      // and nothing can settle onto the scrubbed account later (the engines'
      // guarded settles no-op against the deleted rows).
      this.sweepEscrowIntoWallet(userId);
      // …and if this was a PRISONER, the friends' chips toward their bail go
      // home rather than burning with the purse (migration 85).
      this.refundBailPot(userId);
      // A DELETED ACCOUNT STOPS BEING A GOBLIN CUSTOMER (Sep 2026 review). The
      // scrub used to leave the loan row and the jail marks behind: the
      // nightly visit walked a "deleted user" up the ladder into a ghost cell
      // that friends could chip silver into, and a scrubbed prisoner haunted
      // the kiosk forever. Creditors off the top (the estate rule — cash to
      // the vault, then the row is written off), and the cell marks cleared.
      this.settleGoblinDebt(userId);
      this.prep(
          `UPDATE users SET
             username = ?, displayName = ?, avatar = NULL, banner = NULL, bio = NULL,
             epitaph = NULL, willBeneficiaryId = NULL, cosmetics = '{}',
             prefs = '{}', coins = 0, locked = 1, secretHash = NULL,
             jailedAt = NULL, jailSealsAt = NULL, cellPlea = NULL,
             passwordHash = '!deleted', role = 'user', graveSealsAt = NULL
           WHERE id = ?`,
        )
        // Entropy suffix: "deleted-7" is a registrable username, and a
        // collision here would throw UNIQUE and roll back the whole scrub.
        .run(`deleted-${userId}-${Date.now().toString(36)}`, "deleted user", userId);
      // …and MARK it, so every roster and picker can drop it (migration 66).
      this.prep("UPDATE users SET deletedAt = ? WHERE id = ?").run(Date.now(), userId);
      this.prep("DELETE FROM sessions WHERE userId = ?").run(userId);
      // …and its tickets for a draw that hasn't happened (Oct 2026 review): a
      // deleted account counted toward the two-player minimum and could be
      // drawn, sending the pot to a burned row. The stake was spent; it burns.
      this.prep("DELETE FROM lottery_tickets WHERE userId = ? AND day NOT IN (SELECT day FROM lottery_draws)").run(userId);
      this.prep("DELETE FROM user_emoji WHERE userId = ?").run(userId);
      // PANDORA + THE ABYSS (Sep 2026 review): the scrub burns the collection,
      // which includes the Stone — so the portal it opened and the keys it
      // held must go with it, or the row set says "portal open, no stone",
      // the exact state revokeStone exists to prevent. The OPENING row stays:
      // it is the monument, and the world choice it spent is still spent.
      this.prep("DELETE FROM pandora_keys WHERE userId = ?").run(userId);
      this.prep("DELETE FROM abyss_portal WHERE userId = ?").run(userId);
      // The Portal: their own dictionary and guesses go; the row on the roster
      // drops out (portalMembers skips the deleted). A glyph they cracked
      // stays cracked — it was cracked for everyone — and what they posted
      // stays in the hall, like everything else the hall was ever told.
      this.prep("DELETE FROM portal_words WHERE userId = ?").run(userId);
      this.prep("DELETE FROM portal_survey WHERE userId = ?").run(userId);
      this.prep("DELETE FROM portal_done WHERE userId = ?").run(userId);
      this.prep("UPDATE portal_ishaal SET status = 'done', winner = NULL WHERE status != 'done' AND (evenId = ? OR oddId = ?)").run(userId, userId);
      this.prep("DELETE FROM portal_guesses WHERE userId = ?").run(userId);
      // A deleted account leaves every page — without these two, the scrub
      // haunted Page Settings' Members list as "deleted user" (migration 78
      // swept the historical rows). Solace General included: the row exists
      // only to resolve old messages, and those resolve by userId, not
      // membership.
      this.prep("DELETE FROM page_members WHERE userId = ?").run(userId);
      this.prep("DELETE FROM page_member_roles WHERE userId = ?").run(userId);
      this.prep("DELETE FROM page_join_requests WHERE userId = ?").run(userId);
      this.prep("DELETE FROM user_sounds WHERE userId = ?").run(userId);
      this.prep("DELETE FROM board_sounds WHERE ownerId = ?").run(userId);
      // What the house's three remember about this person (migration 106) —
      // notes derived from PRIVATE conversations, so they go with the account.
      this.prep("DELETE FROM npc_memory WHERE userId = ?").run(userId);
      this.prep("DELETE FROM npc_affinity WHERE userId = ?").run(userId);
      this.prep("DELETE FROM npc_affinity_day WHERE userId = ?").run(userId);
      // The migration-70 balances burn like the coins do, and the escape
      // pass + bag end with the account — "the scrub burns everything" was
      // untrue for chips/freePulls, which sat in economyTotals as
      // permanently-dead counted supply (Aug 2026 review). Plain statements:
      // we are inside this transaction.
      this.prep("UPDATE users SET chips = 0, freePulls = 0 WHERE id = ?").run(userId);
      this.prep("DELETE FROM er_inventory WHERE userId = ?").run(userId);
      this.prep("DELETE FROM er_locker WHERE userId = ?").run(userId);
      this.prep("UPDATE er_passes SET endedAt = ?, endReason = 'scrub' WHERE userId = ? AND endedAt IS NULL")
        .run(Date.now(), userId);
      return { ok: true, avatar: oldAvatar, banner: oldBanner, sounds: oldSounds };
    });
  }

  // ---- The Emoji Derby (migration 41) --------------------------------------

  /** Escrow a derby stake (adds to any existing bet on the same racer). */
  derbyBet(raceId: string, userId: number, racer: string, amount: number): number | null {
    return this.transaction(() => {
      // Seam guard: a negative row here wouldn't just poison escrow — mixed
      // signs could zero a pool tier and blow up derbySettle's pro-rata math.
      if (!Number.isInteger(amount) || amount <= 0) return null;
      const left = this.spendCoins(userId, amount);
      if (left === null) return null;
      this.prep("INSERT INTO derby_bets (raceId, userId, racer, amount, at) VALUES (?, ?, ?, ?, ?)")
        .run(raceId, userId, racer, amount, Date.now());
      return left;
    });
  }

  /** Pool totals per racer (drives the live odds board). */
  derbyPools(raceId: string): Record<string, number> {
    const rows = this.prep("SELECT racer, SUM(amount) AS total FROM derby_bets WHERE raceId = ? GROUP BY racer")
      .all(raceId) as { racer: string; total: number }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.racer] = r.total;
    return out;
  }

  derbyMyBets(raceId: string, userId: number): Record<string, number> {
    const rows = this.prep("SELECT racer, SUM(amount) AS total FROM derby_bets WHERE raceId = ? AND userId = ? GROUP BY racer")
      .all(raceId, userId) as { racer: string; total: number }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.racer] = r.total;
    return out;
  }

  /** Settle a race pari-mutuel across the PODIUM: after a 5% rake (which,
   *  with the flooring dust, seeds tonight's lottery pot), the pool splits
   *  70/20/10 across 1st/2nd/3rd — renormalized over the places that have
   *  backers, so nothing is stranded. A race where NOBODY backed any podium
   *  finisher refunds everyone in full (the side-bet rule). */
  derbySettle(
    raceId: string,
    placings: string[],
  ): { refunded: boolean; pool: number; rake: number; payouts: { userId: number; payout: number; place: number }[] } | null {
    const SHARES = [0.7, 0.2, 0.1];
    return this.transaction(() => {
      const rows = this.prep("SELECT id, userId, racer, amount FROM derby_bets WHERE raceId = ?")
        .all(raceId) as { id: number; userId: number; racer: string; amount: number }[];
      if (!rows.length) return null;
      const pool = rows.reduce((n, r) => n + r.amount, 0);
      this.prep("DELETE FROM derby_bets WHERE raceId = ?").run(raceId);

      const podium = placings.slice(0, 3);
      const tierRows = podium.map((key) => rows.filter((r) => r.racer === key));
      const backed = tierRows.map((t, i) => ({ i, t })).filter(({ t }) => t.length > 0);
      // Sterling's Rake-Free Night waives the house cut — winners keep it.
      const rake = this.sterlingActiveSpecial()?.kind === "rakefree" ? 0 : Math.floor(pool * 0.05);
      if (backed.length === 0) {
        // Nobody backed the podium: the tickets come back LESS THE RAKE (Derby
        // v2). A full refund here paid a lone bettor 100% for losing and 95%
        // for winning — losing was the better bet. The rake is the price of
        // running the race either way; it and the dust go to the lottery.
        let back = 0;
        for (const r of rows) {
          const refund = Math.floor((r.amount * (pool - rake)) / pool);
          if (refund > 0) this.addCoins(r.userId, refund);
          back += refund;
        }
        this.lotteryBoost(lotteryDay(), pool - back);
        return { refunded: true, pool, rake, payouts: [] };
      }
      const distributable = pool - rake;
      const weightSum = backed.reduce((n, { i }) => n + SHARES[i], 0);
      const payouts: { userId: number; payout: number; place: number }[] = [];
      let paidTotal = 0;
      for (const { i, t } of backed) {
        const tierAmt = Math.floor((distributable * SHARES[i]) / weightSum);
        const tierTotal = t.reduce((n, r) => n + r.amount, 0);
        const byUser = new Map<number, number>();
        for (const w of t) byUser.set(w.userId, (byUser.get(w.userId) ?? 0) + w.amount);
        for (const [userId, stake] of byUser) {
          const payout = Math.floor((tierAmt * stake) / tierTotal);
          if (payout > 0) this.addCoins(userId, payout);
          paidTotal += payout;
          payouts.push({ userId, payout, place: i + 1 });
        }
      }
      this.lotteryBoost(lotteryDay(), pool - paidTotal); // rake + dust → tonight's pot
      return { refunded: false, pool, rake, payouts };
    });
  }

  /** Cancel a user's ticket(s) for a race: full refund, rows deleted.
   *  Returns the refunded amount (0 = they had no ticket). */
  derbyCancelBet(raceId: string, userId: number): number {
    return this.transaction(() => {
      const rows = this.prep("SELECT id, amount FROM derby_bets WHERE raceId = ? AND userId = ?")
        .all(raceId, userId) as { id: number; amount: number }[];
      let refunded = 0;
      for (const r of rows) {
        this.addCoins(userId, r.amount);
        this.prep("DELETE FROM derby_bets WHERE id = ?").run(r.id);
        refunded += r.amount;
      }
      // A cancelled ticket was never gambled — keep the Wall of Fame honest
      // (review finding: bet/cancel cycles were free leaderboard credit).
      if (refunded > 0) this.bumpStat(userId, "gambled", -refunded);
      return refunded;
    });
  }

  /** Boot-time crash recovery: refund every escrowed derby stake. */
  derbyRefundOpen(): number {
    return this.transaction(() => {
      const rows = this.prep("SELECT id, userId, amount FROM derby_bets")
        .all() as { id: number; userId: number; amount: number }[];
      for (const r of rows) {
        this.addCoins(r.userId, r.amount);
        this.prep("DELETE FROM derby_bets WHERE id = ?").run(r.id);
      }
      return rows.length;
    });
  }

  // ---- Server performance history (migration 44) ---------------------------

  perfInsert(s: {
    at: number; cpu: number; load1: number; rssMb: number; heapMb: number;
    memUsedMb: number; memTotalMb: number; diskUsedGb: number; diskFreeGb: number;
    netRxKbps: number | null; netTxKbps: number | null; wsClients: number; httpReqs: number;
  }): void {
    this.prep(
        `INSERT OR REPLACE INTO perf_samples
         (at, cpu, load1, rssMb, heapMb, memUsedMb, memTotalMb, diskUsedGb, diskFreeGb, netRxKbps, netTxKbps, wsClients, httpReqs)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        s.at, s.cpu, s.load1, s.rssMb, s.heapMb, s.memUsedMb, s.memTotalMb,
        s.diskUsedGb, s.diskFreeGb, s.netRxKbps, s.netTxKbps, s.wsClients, s.httpReqs,
      );
  }

  perfRecent(limit = 180): unknown[] {
    return this.prep("SELECT * FROM perf_samples ORDER BY at DESC LIMIT ?")
      .all(limit)
      .reverse();
  }

  perfAll(): unknown[] {
    return this.prep("SELECT * FROM perf_samples ORDER BY at ASC").all();
  }

  /** One-line rollup of the perf history since `sinceMs` — the weekly report. */
  perfAggregates(sinceMs: number): {
    samples: number; avgCpu: number | null; maxCpu: number | null; maxLoad: number | null;
    maxRssMb: number | null; minDiskFreeGb: number | null; maxWs: number | null; maxHttpPerMin: number | null;
  } {
    return this.prep(
        `SELECT count(*) AS samples, round(avg(cpu),1) AS avgCpu, round(max(cpu),1) AS maxCpu,
                round(max(load1),2) AS maxLoad, round(max(rssMb)) AS maxRssMb,
                round(min(diskFreeGb),1) AS minDiskFreeGb, max(wsClients) AS maxWs,
                max(httpReqs) AS maxHttpPerMin
         FROM perf_samples WHERE at > ?`,
      )
      .get(sinceMs) as ReturnType<Store["perfAggregates"]>;
  }

  perfPrune(before: number): void {
    this.prep("DELETE FROM perf_samples WHERE at < ?").run(before);
  }

  /** Per-user storage report for the Admin Panel: live attachment bytes,
   *  message counts, avatar file name (the route stats the actual file).
   *  `q` filters by username/display name; capped so it stays snappy. */
  storageByUser(q: string): {
    id: number; username: string; displayName: string; avatar: string | null; banner: string | null;
    attachBytes: number; attachCount: number; soundBytes: number; messages: number; dms: number;
  }[] {
    const like = `%${q}%`;
    return this.prep(
        `SELECT u.id, u.username, u.displayName, u.avatar, u.banner,
           COALESCE((SELECT SUM(a.bytes) FROM attachments a WHERE a.ownerId = u.id AND a.purgedAt IS NULL), 0) AS attachBytes,
           (SELECT COUNT(*) FROM attachments a WHERE a.ownerId = u.id AND a.purgedAt IS NULL) AS attachCount,
           COALESCE((SELECT SUM(s.bytes) FROM user_sounds s WHERE s.userId = u.id), 0) AS soundBytes,
           (SELECT COUNT(*) FROM messages m WHERE m.userId = u.id) AS messages,
           (SELECT COUNT(*) FROM dm_messages d WHERE d.senderId = u.id) AS dms
         FROM users u
         WHERE u.username LIKE ? OR u.displayName LIKE ?
         ORDER BY attachBytes DESC
         LIMIT 200`,
      )
      .all(like, like) as {
      id: number; username: string; displayName: string; avatar: string | null; banner: string | null;
      attachBytes: number; attachCount: number; soundBytes: number; messages: number; dms: number;
    }[];
  }

  /** One more career win for a cast member (migration 42). */
  derbyRecordWin(racer: string): void {
    this.prep(
        `INSERT INTO derby_wins (racer, wins) VALUES (?, 1)
         ON CONFLICT(racer) DO UPDATE SET wins = wins + 1`,
      )
      .run(racer);
  }

  derbyCareerWins(): Record<string, number> {
    const rows = this.prep("SELECT racer, wins FROM derby_wins").all() as {
      racer: string;
      wins: number;
    }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.racer] = r.wins;
    return out;
  }

  // ---- The Nightly Lottery (migration 41) ----------------------------------

  /** Buy tickets for a day. Silver is SPENT into the pot (no escrow row). */
  lotteryBuy(
    userId: number,
    day: string,
    count: number,
    price: number,
    maxPerDay: number,
  ): { ok: boolean; error?: string; coins?: number; mine?: number } {
    return this.transaction(() => {
      const mine =
        (this.prep("SELECT count FROM lottery_tickets WHERE day = ? AND userId = ?").get(day, userId) as
          | { count: number }
          | undefined)?.count ?? 0;
      if (mine + count > maxPerDay) return { ok: false, error: "ticket_cap" };
      const left = this.spendCoins(userId, count * price);
      if (left === null) return { ok: false, error: "insufficient", coins: this.getCoins(userId) };
      this.prep(
          `INSERT INTO lottery_tickets (day, userId, count) VALUES (?, ?, ?)
           ON CONFLICT(day, userId) DO UPDATE SET count = count + excluded.count`,
        )
        .run(day, userId, count);
      return { ok: true, coins: left, mine: mine + count };
    });
  }

  /** Casino rakes seed a day's lottery pot (migration 43). Plain statement —
   *  safe to call inside a settle transaction. */
  lotteryBoost(day: string, amount: number): void {
    if (amount <= 0) return;
    this.prep(
        `INSERT INTO lottery_boosts (day, amount) VALUES (?, ?)
         ON CONFLICT(day) DO UPDATE SET amount = amount + excluded.amount`,
      )
      .run(day, amount);
  }

  lotteryBoostFor(day: string): number {
    return (
      (this.prep("SELECT amount FROM lottery_boosts WHERE day = ?").get(day) as
        | { amount: number }
        | undefined)?.amount ?? 0
    );
  }

  /** Boost silver from past days that sold NO tickets rolls forward into
   *  today's pot (an unwinnable pot must never evaporate). Returns the
   *  amount moved. Days WITH tickets keep their boost for their own draw. */
  lotteryRollStaleBoosts(today: string): number {
    return this.transaction(() => {
      const rows = this.prep(
          `SELECT b.day, b.amount FROM lottery_boosts b
           WHERE b.day < ? AND NOT EXISTS (SELECT 1 FROM lottery_tickets t WHERE t.day = b.day)`,
        )
        .all(today) as { day: string; amount: number }[];
      let moved = 0;
      for (const r of rows) {
        this.prep("DELETE FROM lottery_boosts WHERE day = ?").run(r.day);
        moved += r.amount;
      }
      this.lotteryBoost(today, moved);
      return moved;
    });
  }

  lotteryDayState(day: string, price: number): { pot: number; tickets: number; players: number; boost: number } {
    const r = this.prep("SELECT COALESCE(SUM(count),0) AS t, COUNT(*) AS p FROM lottery_tickets WHERE day = ?")
      .get(day) as { t: number; p: number };
    const boost = this.lotteryBoostFor(day);
    return { pot: r.t * price + boost, tickets: r.t, players: r.p, boost };
  }

  lotteryMyTickets(day: string, userId: number): number {
    return (
      (this.prep("SELECT count FROM lottery_tickets WHERE day = ? AND userId = ?").get(day, userId) as
        | { count: number }
        | undefined)?.count ?? 0
    );
  }

  /** Draw a past day (once): ticket-weighted winner takes 90% of the pot
   *  (tickets + casino-rake boost), the rest burns. Idempotent — the
   *  PRIMARY KEY insert is the claim; the boost row is consumed with it. */
  lotteryDraw(
    day: string,
    price: number,
    minPlayers = 1,
    rollTo?: string,
  ): { winnerId: number; pot: number; paid: number } | null {
    return this.transaction(() => {
      const drawn = this.prep("SELECT day FROM lottery_draws WHERE day = ?").get(day);
      if (drawn) return null;
      const rows = this.prep("SELECT userId, count FROM lottery_tickets WHERE day = ?")
        .all(day) as { userId: number; count: number }[];
      if (!rows.length) return null;
      // A VOID NIGHT (Josh, Aug 2026: "only start the lottery if 2 or more
      // people buy a ticket"). One buyer is not a draw, it is a 10% fee for
      // handing yourself your own silver — so nobody is charged for it: the
      // stake goes back, the rake boost rolls to the next night, and the day
      // is CLAIMED with a winner-less row so a second sweep cannot refund it
      // twice. That claim is the same idempotency the real draw relies on.
      if (rows.length < minPlayers) {
        let returned = 0;
        for (const r of rows) {
          this.addCoins(r.userId, r.count * price);
          returned += r.count * price;
        }
        const carry = this.lotteryBoostFor(day);
        this.prep("DELETE FROM lottery_boosts WHERE day = ?").run(day);
        if (rollTo && rollTo !== day && carry > 0) this.lotteryBoost(rollTo, carry);
        this.prep("INSERT INTO lottery_draws (day, winnerId, pot, paid, at) VALUES (?, NULL, ?, 0, ?)")
          .run(day, returned + carry, Date.now());
        return null;
      }
      const total = rows.reduce((n, r) => n + r.count, 0);
      // Crypto draw — real silver rides this roll (review finding: it was
      // the one money draw still on Math.random).
      let roll = randomInt(total);
      let winnerId = rows[0].userId;
      for (const r of rows) {
        if ((roll -= r.count) < 0) {
          winnerId = r.userId;
          break;
        }
      }
      const pot = total * price + this.lotteryBoostFor(day);
      this.prep("DELETE FROM lottery_boosts WHERE day = ?").run(day);
      const paid = Math.floor(pot * 0.9);
      this.prep("INSERT INTO lottery_draws (day, winnerId, pot, paid, at) VALUES (?, ?, ?, ?, ?)")
        .run(day, winnerId, pot, paid, Date.now());
      this.addCoins(winnerId, paid);
      return { winnerId, pot, paid };
    });
  }

  lotteryLastDraw(): { day: string; winnerId: number | null; pot: number; paid: number; at: number } | null {
    return (
      (this.prep("SELECT day, winnerId, pot, paid, at FROM lottery_draws ORDER BY at DESC LIMIT 1")
        .get() as { day: string; winnerId: number | null; pot: number; paid: number; at: number } | undefined) ?? null
    );
  }

  /** Days with tickets that were never drawn (server was down at midnight). */
  lotteryUndrawnDays(before: string): string[] {
    return (
      this.prep(
          `SELECT DISTINCT t.day FROM lottery_tickets t
           LEFT JOIN lottery_draws d ON d.day = t.day
           WHERE d.day IS NULL AND t.day < ?`,
        )
        .all(before) as { day: string }[]
    ).map((r) => r.day);
  }

  // ---- THE REAPER'S PATIENCE (migration 98; src/wheel.ts) ------------------

  /** Spins taken since this account last held a talisman. Deliberately NOT a
   *  `user_stats` row: those are lifetime counters the Ledger ranks and
   *  Sterling's Double-Stats Day doubles, and this is a live gauge that goes
   *  back to zero every time a shield turns up. `spin()` is its only writer. */
  bareSpins(userId: number): number {
    const r = this.prep("SELECT bareSpins AS n FROM users WHERE id = ?").get(userId) as
      | { n: number }
      | undefined;
    return Math.max(0, r?.n ?? 0);
  }

  /** GIVING THE SHIELD AWAY COSTS THE GRACE (Josh, Oct 2026). Listing,
   *  trading or staking a talisman puts its owner straight past the reaper's
   *  grace: the gauge goes red at once. Without it a player could park the
   *  shield in a no-bid auction (or ferry it to a friend), spin bare inside
   *  the grace, take it back, hold it one spin to refill the grace, and
   *  repeat — never in danger and never spending a shield. Only the wedge
   *  burning it, or a death, starts a fresh grace. */
  talismanParted(userId: number): void {
    this.prep("UPDATE users SET bareSpins = MAX(bareSpins, ?) WHERE id = ?").run(REAPER_GRACE, userId);
  }

  setBareSpins(userId: number, n: number): void {
    this.prep("UPDATE users SET bareSpins = ? WHERE id = ?").run(Math.max(0, Math.floor(n)), userId);
  }

  // ---- User activity stats (migration 40, Ledger leaderboards) -------------

  /** Add n to a user's counter (spins taken, pulls, silver gambled…). */
  bumpStat(userId: number, key: string, n = 1): void {
    // Sterling's Double-Stats Day doubles BOTH directions — a bet placed and
    // taken back inside the special must net exactly zero, or the "gambled"
    // board becomes free to farm (review finding). The only residue left is
    // the rare bet that straddles the special's boundary. Stats only.
    if (this.sterlingActiveSpecial()?.kind === "doublestats") n *= 2;
    this.prep(
        `INSERT INTO user_stats (userId, key, value) VALUES (?, ?, ?)
         ON CONFLICT(userId, key) DO UPDATE SET value = value + excluded.value`,
      )
      .run(userId, key, n);
    this.achievementPoke?.(userId);
  }

  /** Admin: wipe the Wall of Fame (user_stats only — Pit crowns and trivia
   *  history live in their own tables and stay). Returns rows cleared. */
  resetStats(): number {
    const info = this.prep("DELETE FROM user_stats").run();
    return Number(info.changes);
  }

  /** A STREAK: extend it by one, or break it back to zero. Not doubled by
   *  Double-Stats Day and no achievement poke — a run of blanks is the
   *  goblins' business (their letters), not the Wall of Fame's. */
  streakStat(userId: number, key: string, extend: boolean): number {
    if (!extend) {
      this.prep("INSERT INTO user_stats (userId, key, value) VALUES (?, ?, 0) ON CONFLICT(userId, key) DO UPDATE SET value = 0")
        .run(userId, key);
      return 0;
    }
    this.prep("INSERT INTO user_stats (userId, key, value) VALUES (?, ?, 1) ON CONFLICT(userId, key) DO UPDATE SET value = value + 1")
      .run(userId, key);
    return (this.prep("SELECT value FROM user_stats WHERE userId = ? AND key = ?").get(userId, key) as { value: number }).value;
  }

  /** Record a personal best (biggest single win) — keeps the max. */
  maxStat(userId: number, key: string, value: number): void {
    this.prep(
        `INSERT INTO user_stats (userId, key, value) VALUES (?, ?, ?)
         ON CONFLICT(userId, key) DO UPDATE SET value = MAX(value, excluded.value)`,
      )
      .run(userId, key, value);
    this.achievementPoke?.(userId);
    // WINNING BIG (affinity.ts BIG_WIN): every table settles its best payout
    // through here, so one line hears them all.
    if (key.endsWith("_best") && value >= 5_000) this.affinityHook?.(userId, "sterling", "bigwin");
  }

  // ---- Achievements (migration 62) -------------------------------------------
  // The engine (src/achievements.ts) registers a listener; every store write
  // that can move a badge's needle pokes it (debounced there). Late-bound
  // like the game-exit hook — the store never imports the engine.

  private achievementPoke: ((userId: number) => void) | null = null;
  /** THE AFFINITY METER's one door (src/npc/affinity.ts AffinityKeeper,
   *  wired at boot). Anything holding the store can award a source; the
   *  keeper applies the caps and the rules. Null in a bare store. */
  affinityHook: ((userId: number, npc: "sterling" | "goblins" | "voss", source: string) => void) | null = null;

  npcAffinityRow(userId: number, npc: string): { points: number; lastGainAt: number } | null {
    return (this.prep("SELECT points, lastGainAt FROM npc_affinity WHERE userId = ? AND npc = ?").get(userId, npc) as
      | { points: number; lastGainAt: number }
      | undefined) ?? null;
  }

  npcAffinityWrite(userId: number, npc: string, points: number, lastGainAt: number): void {
    this.prep(
      `INSERT INTO npc_affinity (userId, npc, points, lastGainAt, updatedAt) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(userId, npc) DO UPDATE SET points = excluded.points, lastGainAt = excluded.lastGainAt, updatedAt = excluded.updatedAt`,
    ).run(userId, npc, points, lastGainAt, Date.now());
  }

  /** Claim up to `points` from a source's daily allowance; returns what was
   *  granted (0 once the day's cap is spent). */
  npcAffinityDayClaim(userId: number, npc: string, source: string, day: string, points: number, cap: number): number {
    return this.transaction(() => {
      const used = (this.prep("SELECT points FROM npc_affinity_day WHERE userId = ? AND npc = ? AND source = ? AND day = ?")
        .get(userId, npc, source, day) as { points: number } | undefined)?.points ?? 0;
      const grant = Math.max(0, Math.min(points, cap - used));
      if (grant > 0) {
        this.prep(
          `INSERT INTO npc_affinity_day (userId, npc, source, day, points) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(userId, npc, source, day) DO UPDATE SET points = points + excluded.points`,
        ).run(userId, npc, source, day, grant);
      }
      return grant;
    });
  }

  /** Yesterday's caps are history; keep the table small. */
  npcAffinityPruneDays(beforeDay: string): void {
    this.prep("DELETE FROM npc_affinity_day WHERE day < ?").run(beforeDay);
  }

  onAchievementPoke(cb: (userId: number) => void): void {
    this.achievementPoke = cb;
  }

  /** One user_stats value (0 when unset). */
  statValue(userId: number, key: string): number {
    const r = this.prep("SELECT value FROM user_stats WHERE userId = ? AND key = ?").get(userId, key) as { value: number } | undefined;
    return r?.value ?? 0;
  }

  /** How many emoji of one tier somebody owns. */
  ownedInTier(userId: number, tier: string): number {
    const r = this.prep("SELECT COUNT(*) AS n FROM user_emoji ue JOIN emoji e ON e.code = ue.code WHERE ue.userId = ? AND e.tier = ?").get(userId, tier) as { n: number };
    return r.n;
  }

  /** The people somebody really talks to in DMs: everyone they've exchanged
   *  at least `min` messages with since `since`, most-talked-to first (bots,
   *  the dead and the deleted left out). Sterling's private noticing reads it
   *  when a friend dies — DM COUNTS only, never a word of what was said. */
  dmFriendsOf(userId: number, since: number, min: number, limit: number): number[] {
    const rows = this.prep(
      `SELECT CASE WHEN c.userA = ? THEN c.userB ELSE c.userA END AS other, COUNT(*) AS n
         FROM dm_messages m JOIN dm_conversations c ON c.id = m.conversationId
        WHERE (c.userA = ? OR c.userB = ?) AND m.createdAt >= ? AND m.deletedAt IS NULL
        GROUP BY other HAVING n >= ? ORDER BY n DESC LIMIT ?`,
    ).all(userId, userId, userId, since, min, limit * 3) as { other: number; n: number }[];
    const out: number[] = [];
    for (const r of rows) {
      const u = this.getUserById(r.other);
      if (!u || u.isBot || u.disabled || u.deletedAt) continue;
      out.push(u.id);
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Every user_stats value for one user (the stat-badge inputs). */
  statsOf(userId: number): Record<string, number> {
    const rows = this.prep("SELECT key, value FROM user_stats WHERE userId = ?").all(userId) as {
      key: string;
      value: number;
    }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  earnedAchievements(userId: number): { achId: string; earnedAt: number }[] {
    return this.prep("SELECT achId, earnedAt FROM user_achievements WHERE userId = ? ORDER BY earnedAt")
      .all(userId) as { achId: string; earnedAt: number }[];
  }

  /** Idempotent award. True only the FIRST time — that's the toast. */
  grantAchievement(userId: number, achId: string): boolean {
    const info = this.prep("INSERT OR IGNORE INTO user_achievements (userId, achId, earnedAt) VALUES (?, ?, ?)")
      .run(userId, achId, Date.now());
    return Number(info.changes) > 0;
  }

  /** The house doesn't compete: wipe any badges admins/bots ever earned
   *  (boot hygiene — the exclusion is enforced at grant time too). */
  purgeHouseAchievements(): number {
    const info = this.prep("DELETE FROM user_achievements WHERE userId IN (SELECT id FROM users WHERE isAdmin = 1 OR isBot = 1)")
      .run();
    return Number(info.changes);
  }

  /** Grant an Emporium item outside the shop (achievement rewards). */
  grantItemFree(userId: number, itemId: string): void {
    this.prep("INSERT OR IGNORE INTO user_items (userId, itemId, at) VALUES (?, ?, ?)")
      .run(userId, itemId, Date.now());
  }

  /** The derived counters stat badges read — one cheap bundle per check. */
  achievementFacts(userId: number): {
    ownedEmoji: number;
    legendaries: number;
    mythics: number;
    messages: number;
    relics: number;
    crowns: number;
    brDeaths: number;
    drowned: number;
    openedDoor: number;
    gatorDeaths: number;
    shyguyDeaths: number;
    itemsOwned: number;
    generation: number;
  } {
    const n = (sql: string, ...args: (number | string)[]): number =>
      Number((this.prep(sql).get(...args) as { n: number }).n);
    return {
      ownedEmoji: n("SELECT COUNT(*) AS n FROM user_emoji WHERE userId = ?", userId),
      legendaries: n(
        "SELECT COUNT(*) AS n FROM user_emoji ue JOIN emoji e ON e.code = ue.code WHERE ue.userId = ? AND e.tier = 'legendary'",
        userId,
      ),
      mythics: n(
        "SELECT COUNT(*) AS n FROM user_emoji ue JOIN emoji e ON e.code = ue.code WHERE ue.userId = ? AND e.tier = 'mythic'",
        userId,
      ),
      messages: n("SELECT COUNT(*) AS n FROM messages WHERE userId = ? AND deletedAt IS NULL", userId),
      relics: n("SELECT COUNT(*) AS n FROM backrooms_relics WHERE userId = ?", userId),
      crowns: n("SELECT COUNT(*) AS n FROM bonepit_weeks WHERE winnerId = ?", userId),
      brDeaths: n("SELECT COUNT(*) AS n FROM backrooms_deaths WHERE userId = ?", userId),
      drowned: n("SELECT COUNT(*) AS n FROM backrooms_deaths WHERE userId = ? AND cause = 'the deep'", userId),
      openedDoor: n("SELECT COUNT(*) AS n FROM backrooms_flags WHERE userId = ? AND flag = 'level1_unlocked'", userId),
      gatorDeaths: n("SELECT COUNT(*) AS n FROM backrooms_deaths WHERE userId = ? AND cause = 'an alligator'", userId),
      shyguyDeaths: n("SELECT COUNT(*) AS n FROM backrooms_deaths WHERE userId = ? AND cause = 'the shy guy'", userId),
      itemsOwned: n("SELECT COUNT(*) AS n FROM user_items WHERE userId = ?", userId),
      generation: Number((this.prep("SELECT generation FROM users WHERE id = ?").get(userId) as { generation: number } | undefined)?.generation ?? 1),
    };
  }

  /** One user's standing on one stat key among the rankable (living,
   *  non-house) — the Leaderboards' "you" line. null = nothing on the board.
   *  Rank is 1-based, ties share the better rank (two at 100 are both #1). */
  statRank(userId: number, key: string): { value: number; rank: number } | null {
    const mine = this.prep("SELECT value FROM user_stats WHERE userId = ? AND key = ?").get(userId, key) as
      | { value: number }
      | undefined;
    if (!mine || mine.value <= 0) return null;
    const ahead = Number(
      (this.prep(
        `SELECT COUNT(*) AS n FROM user_stats s
         JOIN users u ON u.id = s.userId
         WHERE s.key = ? AND s.value > ? AND u.disabled = 0 AND u.isAdmin = 0 AND u.isBot = 0 AND u.deletedAt IS NULL`,
      ).get(key, mine.value) as { n: number }).n,
    );
    return { value: mine.value, rank: ahead + 1 };
  }

  /** Top-N living users for one stat key, hydrated for the wire. */
  topStats(key: string, limit = 5): { user: PublicUser; value: number }[] {
    const rows = this.prep(
        `SELECT s.userId, s.value FROM user_stats s
         JOIN users u ON u.id = s.userId
         WHERE s.key = ? AND u.disabled = 0 AND u.isAdmin = 0 AND u.isBot = 0 AND u.deletedAt IS NULL AND s.value > 0
         ORDER BY s.value DESC LIMIT ?`,
      )
      .all(key, limit) as { userId: number; value: number }[];
    return rows
      .map((r) => {
        const u = this.getUserById(r.userId);
        return u ? { user: toPublicUser(u), value: r.value } : null;
      })
      .filter((r): r is { user: PublicUser; value: number } => r !== null);
  }

  /** Top-N by row count from a wins table (bonepit_weeks — the Pit crowns). */
  topWinCounts(table: "bonepit_weeks", limit = 5): { user: PublicUser; value: number }[] {
    const col = table === "bonepit_weeks" ? "winnerId" : "userId";
    const rows = this.prep(
        `SELECT t.${col} AS userId, COUNT(*) AS value FROM ${table} t
         JOIN users u ON u.id = t.${col}
         WHERE u.disabled = 0 AND u.isAdmin = 0 AND u.isBot = 0 AND u.deletedAt IS NULL
         GROUP BY t.${col} ORDER BY value DESC LIMIT ?`,
      )
      .all(limit) as { userId: number; value: number }[];
    return rows
      .map((r) => {
        const u = this.getUserById(r.userId);
        return u ? { user: toPublicUser(u), value: r.value } : null;
      })
      .filter((r): r is { user: PublicUser; value: number } => r !== null);
  }

  // ---- Blocks + reports (migration 39) -------------------------------------

  blockUser(userId: number, blockedId: number): void {
    this.prep("INSERT OR IGNORE INTO user_blocks (userId, blockedId, at) VALUES (?, ?, ?)")
      .run(userId, blockedId, Date.now());
  }

  unblockUser(userId: number, blockedId: number): void {
    this.prep("DELETE FROM user_blocks WHERE userId = ? AND blockedId = ?").run(userId, blockedId);
  }

  listBlocks(userId: number): number[] {
    return (
      this.prep("SELECT blockedId FROM user_blocks WHERE userId = ?").all(userId) as {
        blockedId: number;
      }[]
    ).map((r) => r.blockedId);
  }

  /** Blocked in EITHER direction — the rule for refusing DMs and trades. */
  isBlockedEither(a: number, b: number): boolean {
    return !!this.prep(
        "SELECT 1 FROM user_blocks WHERE (userId = ? AND blockedId = ?) OR (userId = ? AND blockedId = ?)",
      )
      .get(a, b, b, a);
  }

  createReport(reporterId: number, kind: string, refId: number, reason: string): number {
    const info = this.prep("INSERT INTO reports (reporterId, kind, refId, reason, status, at) VALUES (?, ?, ?, ?, 'open', ?)")
      .run(reporterId, kind, refId, reason, Date.now());
    return Number(info.lastInsertRowid);
  }

  listReports(): {
    id: number; reporterId: number; kind: string; refId: number;
    reason: string; status: string; at: number;
  }[] {
    return this.prep("SELECT * FROM reports ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, at DESC")
      .all() as ReturnType<Store["listReports"]>;
  }

  setReportStatus(id: number, status: "open" | "resolved"): boolean {
    return this.prep("UPDATE reports SET status = ? WHERE id = ?").run(status, id).changes > 0;
  }

  // ---- Game nights (events + RSVPs, migration 35) --------------------------

  createEvent(createdBy: number, title: string, note: string | null, at: number): number {
    const info = this.prep("INSERT INTO events (title, note, at, createdBy, createdAt) VALUES (?, ?, ?, ?, ?)")
      .run(title, note, at, createdBy, Date.now());
    return Number(info.lastInsertRowid);
  }

  deleteEvent(id: number): void {
    this.prep("DELETE FROM events WHERE id = ?").run(id);
  }

  getEvent(id: number): Record<string, unknown> | undefined {
    return this.prep("SELECT * FROM events WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
  }

  /** Upcoming + the last day's worth of just-passed events, with RSVP lists. */
  listEvents(): { id: number; title: string; note: string | null; at: number; createdBy: number; going: number[]; declined: number[] }[] {
    const rows = this.prep("SELECT * FROM events WHERE at > ? ORDER BY at ASC LIMIT 30")
      .all(Date.now() - 24 * 60 * 60 * 1000) as Record<string, unknown>[];
    return rows.map((r) => {
      const rsvps = this.prep("SELECT userId, going FROM event_rsvps WHERE eventId = ?")
        .all(r.id as number) as { userId: number; going: number }[];
      return {
        id: r.id as number,
        title: r.title as string,
        note: (r.note as string | null) ?? null,
        at: r.at as number,
        createdBy: r.createdBy as number,
        going: rsvps.filter((x) => x.going === 1).map((x) => x.userId),
        declined: rsvps.filter((x) => x.going === 0).map((x) => x.userId),
      };
    });
  }

  setRsvp(eventId: number, userId: number, going: boolean): void {
    this.prep(
        `INSERT INTO event_rsvps (eventId, userId, going) VALUES (?, ?, ?)
         ON CONFLICT(eventId, userId) DO UPDATE SET going = excluded.going`,
      )
      .run(eventId, userId, going ? 1 : 0);
  }

  /** Events starting within `windowMs` that haven't fired their reminder yet;
   *  stamps them so the reminder broadcasts exactly once. */
  dueEventReminders(windowMs: number): { id: number; title: string; at: number }[] {
    const now = Date.now();
    const rows = this.prep("SELECT id, title, at FROM events WHERE remindedAt IS NULL AND at > ? AND at <= ?")
      .all(now, now + windowMs) as { id: number; title: string; at: number }[];
    for (const r of rows) {
      this.prep("UPDATE events SET remindedAt = ? WHERE id = ?").run(now, r.id);
    }
    return rows;
  }

  // ---- The House Ledger (public aggregate stats — never per-user wallets) --

  ledgerStats(): Record<string, number> {
    const v = (sql: string): number =>
      Number((this.prep(sql).get() as Record<string, unknown>).v ?? 0);
    const circulating = v("SELECT COALESCE(SUM(coins),0) v FROM users");
    // ALL ELEVEN coin escrows — the same list economyTotals() audits (keep
    // them in sync). A hold'em buy-in, an open craps bet or margin posted
    // against a position is escrowed, not destroyed; counting only some
    // surfaces made the public supply figure dip whenever someone sat at a
    // table.
    const escrowed = [
      "SELECT COALESCE(SUM(amount),0) v FROM blackjack_bets",
      "SELECT COALESCE(SUM(amount),0) v FROM roulette_bets",
      "SELECT COALESCE(SUM(amount),0) v FROM craps_bets",
      "SELECT COALESCE(SUM(stack),0) v FROM holdem_stacks",
      "SELECT COALESCE(SUM(amount),0) v FROM derby_bets",
      "SELECT COALESCE(SUM(amount),0) v FROM bonepit_stakes",
      "SELECT COALESCE(SUM(amount),0) v FROM side_bets",
      "SELECT COALESCE(SUM(amount),0) v FROM chess_silver_stakes",
      "SELECT COALESCE(SUM(currentBid),0) v FROM auctions WHERE status = 'open' AND highBidder IS NOT NULL",
      "SELECT COALESCE(SUM(amount),0) v FROM bail_pot", // the tenth (migration 85)
    ].reduce((n, sql) => n + v(sql), 0);
    return {
      circulating,
      escrowed,
      supply: circulating + escrowed,
      members: v("SELECT COUNT(*) v FROM users WHERE disabled = 0"),
      deaths: v("SELECT COUNT(*) v FROM users WHERE disabled = 1 AND diedAt IS NOT NULL AND deletedAt IS NULL"),
      emojiOwned: v("SELECT COUNT(*) v FROM user_emoji"),
      talismansHeld: v(
        "SELECT COUNT(*) v FROM user_emoji ue JOIN emoji e ON e.code = ue.code WHERE e.tier = 'talisman'",
      ),
      mythicsInTheWild: v(
        "SELECT COUNT(*) v FROM user_emoji ue JOIN emoji e ON e.code = ue.code WHERE e.tier = 'mythic'",
      ),
      crownsClaimed: v("SELECT COUNT(*) v FROM bonepit_weeks"),
      tradesSettled: v("SELECT COUNT(*) v FROM trades WHERE status = 'accepted'"),
      auctionsSettled: v("SELECT COUNT(*) v FROM auctions WHERE status = 'settled'"),
      auctionVolume: v(
        "SELECT COALESCE(SUM(currentBid),0) v FROM auctions WHERE status = 'settled' AND currentBid IS NOT NULL",
      ),
      messagesSent: v("SELECT COUNT(*) v FROM messages WHERE deletedAt IS NULL"),
      attachmentBytes: v("SELECT COALESCE(SUM(bytes),0) v FROM attachments WHERE purgedAt IS NULL"),
    };
  }

  // ---- Message search (FTS5, migration 34) --------------------------------

  /** Turn raw user input into a safe FTS5 query: quoted tokens, last one a
   *  prefix. Returns null when nothing searchable remains. */
  static ftsQuery(raw: string): string | null {
    const tokens = raw
      .split(/\s+/)
      .map((t) => t.replace(/[^\p{L}\p{N}_]/gu, ""))
      .filter(Boolean)
      .slice(0, 8);
    if (!tokens.length) return null;
    const last = tokens.pop()!;
    return [...tokens.map((t) => `"${t}"`), `"${last}"*`].join(" ");
  }

  /** Channel-message hits, newest first — SCOPED TO THE PAGES the caller may
   *  see. This used to be unrestricted, which was correct when every channel
   *  was readable by everyone; with private pages (migration 63) an unscoped
   *  search hands out the message bodies the page exists to keep private. The
   *  filter is in SQL so it applies BEFORE the limit — filtering afterwards
   *  would let private hits silently eat a public search's results. */
  searchChannelMessages(q: string, pageIds: number[], limit = 25): (Message & { channelName: string })[] {
    const fts = Store.ftsQuery(q);
    if (!fts || !pageIds.length) return [];
    const holes = pageIds.map(() => "?").join(",");
    const rows = this.prep(
        `SELECT m.*, c.name AS channelName
         FROM messages_fts f
         JOIN messages m ON m.id = f.rowid
         JOIN channels c ON c.id = m.channelId
         WHERE messages_fts MATCH ? AND m.deletedAt IS NULL AND c.pageId IN (${holes})
         ORDER BY m.id DESC LIMIT ?`,
      )
      .all(fts, ...pageIds, limit) as Record<string, unknown>[];
    return rows.map((r) => ({ ...this.rowToMessage(r), channelName: r.channelName as string }));
  }

  /** DM hits, strictly limited to conversations the caller is in. */
  searchDmMessages(q: string, userId: number, limit = 25): (DmMessage & { otherUserId: number })[] {
    const fts = Store.ftsQuery(q);
    if (!fts) return [];
    const rows = this.prep(
        `SELECT m.*, (CASE WHEN c.userA = ? THEN c.userB ELSE c.userA END) AS otherUserId
         FROM dm_messages_fts f
         JOIN dm_messages m ON m.id = f.rowid
         JOIN dm_conversations c ON c.id = m.conversationId
         WHERE dm_messages_fts MATCH ? AND m.deletedAt IS NULL
           AND (c.userA = ? OR c.userB = ?)
         ORDER BY m.id DESC LIMIT ?`,
      )
      .all(userId, fts, userId, userId, limit) as Record<string, unknown>[];
    return rows.map((r) => ({ ...this.rowToDm(r), otherUserId: r.otherUserId as number }));
  }

  // ---- Reactions (collectible-emoji, non-destructive) --------------------

  /** Whether this user has this reaction on this message. */
  hasReaction(messageId: number, userId: number, code: string): boolean {
    return !!this.prep("SELECT 1 FROM message_reactions WHERE messageId = ? AND userId = ? AND code = ?").get(messageId, userId, code);
  }

  /** Toggle a user's reaction on a message. Returns true if added, false if removed. */
  toggleReaction(messageId: number, userId: number, code: string): boolean {
    const exists = this.prep("SELECT 1 FROM message_reactions WHERE messageId = ? AND userId = ? AND code = ?")
      .get(messageId, userId, code);
    if (exists) {
      this.prep("DELETE FROM message_reactions WHERE messageId = ? AND userId = ? AND code = ?")
        .run(messageId, userId, code);
      return false;
    }
    this.prep("INSERT INTO message_reactions (messageId, userId, code, createdAt) VALUES (?, ?, ?, ?)")
      .run(messageId, userId, code, Date.now());
    return true;
  }

  /** Aggregate reactions for a set of messages: messageId → [{ code, userIds }]. */
  reactionsFor(messageIds: number[]): Map<number, { code: string; userIds: number[] }[]> {
    const out = new Map<number, { code: string; userIds: number[] }[]>();
    if (!messageIds.length) return out;
    const ph = messageIds.map(() => "?").join(",");
    const rows = this.prep(
        `SELECT messageId, code, userId FROM message_reactions
         WHERE messageId IN (${ph}) ORDER BY createdAt`,
      )
      .all(...messageIds) as { messageId: number; code: string; userId: number }[];
    for (const r of rows) {
      let arr = out.get(r.messageId);
      if (!arr) {
        arr = [];
        out.set(r.messageId, arr);
      }
      let entry = arr.find((e) => e.code === r.code);
      if (!entry) {
        entry = { code: r.code, userIds: [] };
        arr.push(entry);
      }
      entry.userIds.push(r.userId);
    }
    return out;
  }

  clearReactions(messageId: number): void {
    this.prep("DELETE FROM message_reactions WHERE messageId = ?").run(messageId);
  }

  /** Run a set of writes atomically. Rolls back if the callback throws. */
  /** Nesting depth of transaction(): 0 outside any. */
  private txDepth = 0;

  /**
   * Run `fn` atomically. RE-ENTRANT (Oct 2026 review): a transaction() opened
   * inside another is a SAVEPOINT, so its own failure rolls back only its own
   * writes if the caller catches it, and the outer one still commits or rolls
   * back as a whole. It used to be a bare BEGIN, and the affinity meter's
   * daily-cap claim (its own transaction) fired from inside money operations
   * that already held one — "cannot start a transaction within a transaction"
   * rolled back a relic bank at boot (the server never listened), a relic
   * auction's settlement, and every Exchange close with a 5,000+ profit.
   */
  transaction<T>(fn: () => T): T {
    if (this.txDepth > 0) {
      const sp = `sp${this.txDepth}`;
      this.db.exec(`SAVEPOINT ${sp}`);
      this.txDepth++;
      try {
        const result = fn();
        this.db.exec(`RELEASE ${sp}`);
        return result;
      } catch (err) {
        this.db.exec(`ROLLBACK TO ${sp}`);
        this.db.exec(`RELEASE ${sp}`);
        throw err;
      } finally {
        this.txDepth--;
      }
    }
    this.db.exec("BEGIN");
    this.txDepth = 1;
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    } finally {
      this.txDepth = 0;
    }
  }

  // ---- Emoji catalog ------------------------------------------------------

  private rowToEmoji(r: Record<string, unknown>): Emoji {
    return {
      code: r.code as string,
      tier: r.tier as string,
      name: r.name as string,
      file: r.file as string,
      animated: !!r.animated,
    };
  }

  /** Seed the catalog once (no-op if it already has rows). */
  /** Seed the catalog, and TOP IT UP on later boots.
   *
   *  This used to bail the moment the table had a single row, which made the
   *  manifest write-once: a new pack added to it never reached a database
   *  that had already booted, i.e. every real one. Now a code that isn't in
   *  the table gets inserted whatever the table's size.
   *
   *  INSERT OR IGNORE, never UPDATE, and never DELETE. An existing emoji's
   *  tier is load-bearing — it sets the sell price, the wheel's award pool
   *  and the rarity-weighted leaderboard — so a manifest edit must not be
   *  able to re-grade something people already own, and a code dropped from
   *  the manifest must not vanish out from under an inventory. Adding is the
   *  only safe direction, so adding is the only thing this does. */
  seedEmoji(list: { code: string; tier: string; name: string; file: string; animated?: boolean }[]): void {
    const insert = this.prep(
      "INSERT OR IGNORE INTO emoji (code, tier, name, file, animated) VALUES (?, ?, ?, ?, ?)",
    );
    const before = (this.prep("SELECT COUNT(*) AS n FROM emoji").get() as { n: number }).n;
    this.transaction(() => {
      for (const e of list) insert.run(e.code, e.tier, e.name, e.file, e.animated ? 1 : 0);
    });
    const after = (this.prep("SELECT COUNT(*) AS n FROM emoji").get() as { n: number }).n;
    if (before > 0 && after > before) {
      console.log(`[seed] catalog topped up: ${after - before} new emoji (${before} → ${after})`);
    }
  }

  getEmoji(code: string): Emoji | undefined {
    const row = this.prep("SELECT * FROM emoji WHERE code = ?").get(code) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToEmoji(row) : undefined;
  }

  emojiTierCounts(): Record<string, number> {
    const rows = this.prep("SELECT tier, COUNT(*) AS n FROM emoji GROUP BY tier").all() as {
      tier: string;
      n: number;
    }[];
    return Object.fromEntries(rows.map((r) => [r.tier, r.n]));
  }

  // ---- Inventory (binary ownership) --------------------------------------

  ownsEmoji(userId: number, code: string): boolean {
    return !!this.prep("SELECT 1 FROM user_emoji WHERE userId = ? AND code = ?")
      .get(userId, code);
  }

  /** Grant an emoji. Returns false if the user already owned it (never stacks). */
  addEmoji(userId: number, code: string): boolean {
    const info = this.prep("INSERT OR IGNORE INTO user_emoji (userId, code, acquiredAt) VALUES (?, ?, ?)")
      .run(userId, code, Date.now());
    if (info.changes > 0) this.achievementPoke?.(userId);
    return info.changes > 0;
  }

  removeEmoji(userId: number, code: string): void {
    this.prep("DELETE FROM user_emoji WHERE userId = ? AND code = ?").run(userId, code);
  }

  getInventory(userId: number): Emoji[] {
    const rows = this.prep(
        `SELECT e.* FROM user_emoji ue JOIN emoji e ON e.code = ue.code
         WHERE ue.userId = ? ORDER BY ue.acquiredAt DESC`,
      )
      .all(userId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToEmoji(r));
  }

  inventoryCount(userId: number): number {
    const row = this.prep("SELECT COUNT(*) AS n FROM user_emoji WHERE userId = ?")
      .get(userId) as { n: number };
    return row.n;
  }

  /** The heart of "never win what you own": this user's not-yet-owned emoji in a tier. */
  unownedInTier(userId: number, tier: string): Emoji[] {
    const rows = this.prep(
        `SELECT * FROM emoji WHERE tier = ?
         AND code NOT IN (SELECT code FROM user_emoji WHERE userId = ?)`,
      )
      .all(tier, userId) as Record<string, unknown>[];
    return rows.map((r) => this.rowToEmoji(r));
  }

  /** Every emoji in a tier — the fallback pool for the wheel's face when a
   *  player already owns the whole tier (the wedge still has to show one). */
  emojiInTier(tier: string): Emoji[] {
    const rows = this.prep("SELECT * FROM emoji WHERE tier = ?").all(tier) as Record<string, unknown>[];
    return rows.map((r) => this.rowToEmoji(r));
  }

  /** A few random catalog codes (for slot-reel visuals), optionally within tiers. */
  randomEmojiCodes(n: number, tiers?: string[]): string[] {
    const where = tiers && tiers.length ? `WHERE tier IN (${tiers.map(() => "?").join(",")})` : "";
    const rows = this.prep(`SELECT code FROM emoji ${where} ORDER BY RANDOM() LIMIT ?`)
      .all(...(tiers ?? []), n) as { code: string }[];
    return rows.map((r) => r.code);
  }

  // ---- Spins (7/hour bucket + persistent bonus spins) --------------------

  private currentPeriod(): number {
    return Math.floor(Date.now() / SPIN_PERIOD_MS);
  }

  /** Refill the regular bucket to 7 when we cross into a new 2-hour window. */
  refreshSpins(userId: number): void {
    const row = this.prep("SELECT spinHour FROM users WHERE id = ?").get(userId) as
      | { spinHour: number }
      | undefined;
    if (!row) return;
    const period = this.currentPeriod();
    if (row.spinHour < period) {
      this.prep("UPDATE users SET spinBucket = 7, spinHour = ? WHERE id = ?").run(period, userId);
    }
  }

  /** Epoch-ms of the next spin refill (top of the next 2-hour UTC window). */
  nextSpinReset(): number {
    return (this.currentPeriod() + 1) * SPIN_PERIOD_MS;
  }

  spinState(userId: number): { bucket: number; bonus: number; total: number } {
    const row = this.prep("SELECT spinBucket, bonusSpins FROM users WHERE id = ?")
      .get(userId) as { spinBucket: number; bonusSpins: number };
    return { bucket: row.spinBucket, bonus: row.bonusSpins, total: row.spinBucket + row.bonusSpins };
  }

  /** Consume one spin: regular bucket first, then bonus. Returns the pool used, or null. */
  consumeSpin(userId: number): "bucket" | "bonus" | null {
    const s = this.spinState(userId);
    if (s.bucket > 0) {
      this.prep("UPDATE users SET spinBucket = spinBucket - 1 WHERE id = ?").run(userId);
      return "bucket";
    }
    if (s.bonus > 0) {
      this.prep("UPDATE users SET bonusSpins = bonusSpins - 1 WHERE id = ?").run(userId);
      return "bonus";
    }
    return null;
  }

  addBonusSpins(userId: number, n: number): void {
    this.prep("UPDATE users SET bonusSpins = bonusSpins + ? WHERE id = ?").run(n, userId);
  }

  // ---- Silver coins & the Trader (the money path) ------------------------
  //
  // Coins are the only currency and are minted *only* by selling emoji to the
  // Trader — which come only from Wheel spins. So the whole economy is bounded
  // by the free-spin rate and can't inflate. Every credit/debit here is atomic
  // and a debit can never take a balance below zero.

  getCoins(userId: number): number {
    const row = this.prep("SELECT coins FROM users WHERE id = ?").get(userId) as
      | { coins: number }
      | undefined;
    return row?.coins ?? 0;
  }

  /** THE WALLET (migration 110): one player sends another silver. The same
   *  plain wallet-to-wallet move plus the ledger row both of them read,
   *  in ONE transaction — a transfer with no row, or a row with no transfer,
   *  can't happen. Every guard about WHO may send to WHOM is the route's; this
   *  only refuses what would break the money (null = nothing moved). */
  sendSilver(fromId: number, toId: number, n: number, note: string | null, at = Date.now()): { coins: number; id: number } | null {
    if (!Number.isInteger(n) || n <= 0 || fromId === toId) return null;
    return this.transaction(() => {
      const left = this.spendCoins(fromId, n);
      if (left === null) return null;
      this.addCoins(toId, n);
      const r = this.prep("INSERT INTO wallet_transfers (fromId, toId, amount, note, at) VALUES (?, ?, ?, ?, ?)")
        .run(fromId, toId, n, note, at);
      return { coins: left, id: Number(r.lastInsertRowid) };
    });
  }

  /** What this person sent and got, newest first. Only rows they are on. */
  walletTransfers(userId: number, limit = 50): { id: number; fromId: number; toId: number; amount: number; note: string | null; at: number }[] {
    return this.prep(
      `SELECT id, fromId, toId, amount, note, at FROM wallet_transfers
        WHERE fromId = ? OR toId = ? ORDER BY id DESC LIMIT ?`,
    ).all(userId, userId, Math.max(1, Math.min(200, limit))) as { id: number; fromId: number; toId: number; amount: number; note: string | null; at: number }[];
  }

  addCoins(userId: number, n: number): void {
    if (n <= 0) return;
    this.prep("UPDATE users SET coins = coins + ? WHERE id = ?").run(n, userId);
  }

  /** Debit `n` coins iff the balance covers it (atomic guard). Returns the new
   *  balance, or null if there weren't enough — no partial spend. */
  spendCoins(userId: number, n: number): number | null {
    if (n <= 0) return this.getCoins(userId);
    const info = this.prep("UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?")
      .run(n, userId, n);
    if (info.changes === 0) return null;
    return this.getCoins(userId);
  }

  // ---- Blackjack escrow (see src/blackjack.ts) ----------------------------

  /** Debit a blackjack stake into escrow. One transaction: guarded debit +
   *  escrow row. Returns the escrow row id, or null if the balance is short. */
  bjPlaceBet(userId: number, amount: number, lobby: number): number | null {
    return this.transaction(() => {
      if (!Number.isInteger(amount) || amount <= 0) return null; // seam guard
      const split = this.spendCoinsChipsFirst(userId, amount);
      if (split === null) return null;
      const info = this.prep("INSERT INTO blackjack_bets (userId, amount, lobby, at, chips) VALUES (?, ?, ?, ?, ?)")
        .run(userId, amount, lobby, Date.now(), split.chips);
      return Number(info.lastInsertRowid);
    });
  }

  /** Double-down: debit `extra` more onto an existing escrow row, atomically.
   *  Returns the new escrow amount, or null (unchanged) if the row is missing
   *  or the balance is short — the row check comes FIRST so a bad id can
   *  never burn a debit. */
  bjRaiseBet(betId: number, userId: number, extra: number): number | null {
    return this.transaction(() => {
      if (!Number.isInteger(extra) || extra <= 0) return null; // seam guard
      const row = this.prep("SELECT amount FROM blackjack_bets WHERE id = ? AND userId = ?")
        .get(betId, userId) as { amount: number } | undefined;
      if (!row) return null;
      const split = this.spendCoinsChipsFirst(userId, extra);
      if (split === null) return null;
      this.prep("UPDATE blackjack_bets SET amount = amount + ?, chips = chips + ? WHERE id = ? AND userId = ?")
        .run(extra, split.chips, betId, userId);
      return row.amount + extra;
    });
  }

  /** Close an escrow row and credit `credit` coins — but ONLY if the row was
   *  actually deleted, so a duplicate/stale close can never mint coins. This
   *  guard lives in the money seam, not the game engine: the store must be
   *  safe regardless of caller bugs. */
  private bjCloseBet(betId: number, userId: number, credit: number): boolean {
    return this.transaction(() => {
      const info = this.prep("DELETE FROM blackjack_bets WHERE id = ? AND userId = ?")
        .run(betId, userId);
      if (info.changes > 0 && credit > 0) this.addCoins(userId, credit);
      return info.changes > 0;
    });
  }

  /** Settle a hand: clear the escrow row and credit any payout, atomically.
   *  A payout of 0 (a loss) burns the escrowed stake — the house edge. */
  /** True if the row was there to settle (Oct 2026 review: a death sweep
   *  refunds it first, and a ghost hand must not count as the house's win). */
  bjSettleBet(betId: number, userId: number, payout: number): boolean {
    return this.bjCloseBet(betId, userId, payout);
  }

  /** Refund a specific un-played bet (leaving the table before the deal).
   *  THE ROW is authoritative for the split (E3b): chips go back AS CHIPS —
   *  a silver refund of a chips-paid bet would be a free converter. The
   *  passed amount stays as a sanity cross-check only. */
  bjRefundBet(betId: number, userId: number, amount: number): void {
    this.transaction(() => {
      const row = this.prep("SELECT amount, chips FROM blackjack_bets WHERE id = ? AND userId = ?")
        .get(betId, userId) as { amount: number; chips: number } | undefined;
      if (!row) return;
      void amount;
      const info = this.prep("DELETE FROM blackjack_bets WHERE id = ? AND userId = ?").run(betId, userId);
      if (info.changes > 0) {
        this.addChips(userId, row.chips);
        this.addCoins(userId, row.amount - row.chips);
      }
    });
  }

  /** Boot-time crash recovery: refund every escrowed bet in full — the
   *  chips portion as chips (the converter rule holds even through a crash).
   *  Returns the number of rows refunded. */
  bjRefundOpenBets(): number {
    return this.transaction(() => {
      const rows = this.prep("SELECT id, userId, amount, chips FROM blackjack_bets")
        .all() as { id: number; userId: number; amount: number; chips: number }[];
      for (const r of rows) {
        this.addChips(r.userId, r.chips);
        this.addCoins(r.userId, r.amount - r.chips);
        this.prep("DELETE FROM blackjack_bets WHERE id = ?").run(r.id);
      }
      return rows.length;
    });
  }

  // ---- Casino Chess Duel (emoji stakes, see src/chessduel.ts) --------------

  /** Escrow a stake: the emoji leaves the owner's inventory and becomes a
   *  chess_stakes row, atomically. False if the emoji isn't owned. */
  chessStake(gameId: string, userId: number, code: string): boolean {
    return this.transaction(() => {
      if (isBound(this.getEmoji(code)?.tier)) return false; // the Stone never stakes
      if (!this.ownsEmoji(userId, code)) return false;
      this.removeEmoji(userId, code);
      if (code === TALISMAN_CODE) this.talismanParted(userId);
      this.prep("INSERT INTO chess_stakes (gameId, userId, code, at) VALUES (?, ?, ?, ?)")
        .run(gameId, userId, code, Date.now());
      return true;
    });
  }

  /**
   * Settle every stake of a game, atomically. winnerId null → a draw or a
   * cancelled challenge: each stake returns to its owner. Otherwise the
   * winner keeps their own stake back and takes the opponent's — unless they
   * already own that emoji, in which case the house burns it (binary
   * ownership is never violated; the burn is a sink, like graveyard dupes).
   * Rows are deleted either way, so a duplicate settle is a no-op.
   */
  chessSettleStakes(gameId: string, winnerId: number | null): void {
    this.transaction(() => {
      const rows = this.prep("SELECT id, userId, code FROM chess_stakes WHERE gameId = ?")
        .all(gameId) as { id: number; userId: number; code: string }[];
      for (const r of rows) {
        const to = winnerId ?? r.userId;
        // addEmoji never stacks — if `to` already owns it, the stake burns.
        this.addEmoji(to, r.code);
        this.prep("DELETE FROM chess_stakes WHERE id = ?").run(r.id);
      }
    });
  }

  /** Boot-time crash recovery: return every escrowed stake to its owner. */
  chessRefundOpenStakes(): number {
    return this.transaction(() => {
      const rows = this.prep("SELECT id, userId, code FROM chess_stakes")
        .all() as { id: number; userId: number; code: string }[];
      for (const r of rows) {
        this.addEmoji(r.userId, r.code);
        this.prep("DELETE FROM chess_stakes WHERE id = ?").run(r.id);
      }
      return rows.length;
    });
  }

  /** Does this player still have a stake escrowed under this chess game id?
   *  (Oct 2026 review: a death sweeps the escrow home but the in-memory
   *  challenge stayed open, so a raised challenger got a free roll.) */
  chessHasStake(gameId: string, userId: number): boolean {
    return !!this.prep("SELECT 1 FROM chess_silver_stakes WHERE gameId = ? AND userId = ?").get(gameId, userId) ||
      !!this.prep("SELECT 1 FROM chess_stakes WHERE gameId = ? AND userId = ?").get(gameId, userId);
  }

  /** Escrow a silver stake: debit the coins (atomic, no-negative) into a
   *  chess_silver_stakes row. False if the player can't cover it. */
  chessStakeSilver(gameId: string, userId: number, amount: number): boolean {
    return this.transaction(() => {
      if (!Number.isInteger(amount) || amount <= 0) return false;
      if (this.spendCoins(userId, amount) === null) return false;
      this.prep("INSERT INTO chess_silver_stakes (gameId, userId, amount, at) VALUES (?, ?, ?, ?)")
        .run(gameId, userId, amount, Date.now());
      return true;
    });
  }

  /**
   * Settle a game's silver stakes atomically. winnerId null → draw/cancel:
   * each stake returns to its owner. Otherwise the winner takes the whole pot
   * (their stake back + the opponent's). Rows are deleted either way, so a
   * duplicate settle is a no-op. Coin-neutral: nothing is minted (pot in = pot
   * out; a PvP transfer, not a house game).
   */
  chessSettleSilver(gameId: string, winnerId: number | null): void {
    this.transaction(() => {
      const rows = this.prep("SELECT id, userId, amount FROM chess_silver_stakes WHERE gameId = ?")
        .all(gameId) as { id: number; userId: number; amount: number }[];
      if (!rows.length) return;
      if (winnerId === null) {
        for (const r of rows) this.addCoins(r.userId, r.amount);
      } else {
        const pot = rows.reduce((n, r) => n + r.amount, 0);
        this.addCoins(winnerId, pot);
      }
      this.prep("DELETE FROM chess_silver_stakes WHERE gameId = ?").run(gameId);
    });
  }

  // ---- The Bone Pit (Liar's Dice) ----------------------------------------
  // Same escrow discipline as chess silver: stake rows are the money truth,
  // games are in-memory. Boot refunds orphans; settles delete rows so a
  // duplicate settle is a no-op.

  pitStake(gameId: string, userId: number, amount: number): boolean {
    return this.transaction(() => {
      if (!Number.isInteger(amount) || amount <= 0) return false;
      if (this.spendCoins(userId, amount) === null) return false;
      this.prep("INSERT INTO bonepit_stakes (gameId, userId, amount, at) VALUES (?, ?, ?, ?)")
        .run(gameId, userId, amount, Date.now());
      return true;
    });
  }

  /** Return ONE player's stake (leaving a still-gathering table). */
  pitRefundOne(gameId: string, userId: number): void {
    this.transaction(() => {
      const rows = this.prep("SELECT id, amount FROM bonepit_stakes WHERE gameId = ? AND userId = ?")
        .all(gameId, userId) as { id: number; amount: number }[];
      for (const r of rows) {
        this.addCoins(userId, r.amount);
        this.prep("DELETE FROM bonepit_stakes WHERE id = ?").run(r.id);
      }
    });
  }

  /** Settle: winner takes the whole pot (null → refund everyone). Rows are
   *  deleted either way, so duplicate settles can't mint. Coin-neutral. */
  pitSettle(gameId: string, winnerId: number | null): number {
    return this.transaction(() => {
      const rows = this.prep("SELECT userId, amount FROM bonepit_stakes WHERE gameId = ?")
        .all(gameId) as { userId: number; amount: number }[];
      if (!rows.length) return 0;
      const pot = rows.reduce((n, r) => n + r.amount, 0);
      if (winnerId === null) {
        for (const r of rows) this.addCoins(r.userId, r.amount);
      } else {
        this.addCoins(winnerId, pot);
      }
      this.prep("DELETE FROM bonepit_stakes WHERE gameId = ?").run(gameId);
      return pot;
    });
  }

  /** Boot-time crash recovery for the Pit. */
  pitRefundOpenStakes(): number {
    return this.transaction(() => {
      const rows = this.prep("SELECT id, userId, amount FROM bonepit_stakes")
        .all() as { id: number; userId: number; amount: number }[];
      for (const r of rows) {
        this.addCoins(r.userId, r.amount);
        this.prep("DELETE FROM bonepit_stakes WHERE id = ?").run(r.id);
      }
      return rows.length;
    });
  }

  /* THE WEEKLY MYTHIC CROWN IS RETIRED (Josh, Aug 2026: "since the mythic is
   * for sale in the casino remove the mythic win for the bone pit"). Its
   * claim op — the only code that ever minted a mythic into an inventory —
   * is DELETED rather than left dormant: a mint path nothing calls is one
   * refactor away from being called again, and Sterling's 500,000-silver
   * counter is now the tier's only source. `bonepit_weeks` and the reads
   * below stay, because those crowns were really won: they still rank on the
   * Wall of Fame and still count toward achievements, exactly as the Vault's
   * and Trivia's dead tables were left standing. The Pit is a pure silver PvP
   * game again — stakes in, pot out, no rake, nothing minted. */

  /** Has this week's crown been claimed already? (For the lobby banner.) */
  pitWeekClaimed(weekId: string): boolean {
    return this.prep("SELECT 1 FROM bonepit_weeks WHERE weekId = ?").get(weekId) !== undefined;
  }


  /** Boot-time crash recovery: return every escrowed silver stake to its owner. */
  chessRefundOpenSilver(): number {
    return this.transaction(() => {
      const rows = this.prep("SELECT id, userId, amount FROM chess_silver_stakes")
        .all() as { id: number; userId: number; amount: number }[];
      for (const r of rows) {
        this.addCoins(r.userId, r.amount);
        this.prep("DELETE FROM chess_silver_stakes WHERE id = ?").run(r.id);
      }
      return rows.length;
    });
  }

  // ---- Sterling's Emporium (see src/emporium.ts) ---------------------------

  /** Admin price overrides, itemId → price. Effective price = override ?? default. */
  itemPriceOverrides(): Record<string, number> {
    const rows = this.prep("SELECT itemId, price FROM item_prices").all() as {
      itemId: string;
      price: number;
    }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.itemId] = r.price;
    return out;
  }

  /** Admin: set an item's price, or null to restore the catalog default. */
  setItemPrice(itemId: string, price: number | null): void {
    if (price === null) {
      this.prep("DELETE FROM item_prices WHERE itemId = ?").run(itemId);
    } else {
      this.prep(
          "INSERT INTO item_prices (itemId, price) VALUES (?, ?) ON CONFLICT(itemId) DO UPDATE SET price = excluded.price",
        )
        .run(itemId, price);
    }
  }

  ownsItem(userId: number, itemId: string): boolean {
    return !!this.prep("SELECT 1 FROM user_items WHERE userId = ? AND itemId = ?").get(userId, itemId);
  }

  userItems(userId: number): string[] {
    return (
      this.prep("SELECT itemId FROM user_items WHERE userId = ? ORDER BY at ASC").all(userId) as {
        itemId: string;
      }[]
    ).map((r) => r.itemId);
  }

  /** Buy an item: burn the price (a pure sink), grant permanent ownership.
   *  One transaction; duplicate purchases are rejected before any debit. */
  buyItem(userId: number, itemId: string, price: number): { ok: boolean; error?: string; coins: number } {
    return this.transaction(() => {
      if (this.ownsItem(userId, itemId)) {
        return { ok: false, error: "already_owned", coins: this.getCoins(userId) };
      }
      const left = this.spendCoins(userId, price);
      if (left === null) return { ok: false, error: "insufficient", coins: this.getCoins(userId) };
      this.prep("INSERT INTO user_items (userId, itemId, at) VALUES (?, ?, ?)").run(userId, itemId, Date.now());
      return { ok: true, coins: left };
    });
  }

  /** Equip/unequip a cosmetic slot. Ownership is validated by the route. */
  setCosmetic(userId: number, slot: string, itemId: string | null): User | undefined {
    const u = this.getUserById(userId);
    if (!u) return undefined;
    const next: Cosmetics = { ...u.cosmetics };
    // The route whitelists `slot` against EQUIP_SLOTS, so this can never
    // touch the upload-mirror keys (enterSound/leaveSound/board).
    if (itemId === null) delete (next as Record<string, unknown>)[slot];
    else (next as Record<string, unknown>)[slot] = itemId;
    this.prep("UPDATE users SET cosmetics = ? WHERE id = ?").run(JSON.stringify(next), userId);
    return this.getUserById(userId);
  }

  /**
   * Sell emoji to the Trader for silver, atomically. Validates first (all codes
   * real, sellable — price > 0 — and owned), then removes each and credits the
   * summed price. Input is de-duped so the same emoji can't be double-sold.
   * Returns the coins gained and the new balance, or an error with no state change.
   */
  sellEmojiToTrader(
    userId: number,
    codes: string[],
    priceOf: (tier: string) => number,
  ): { ok: boolean; error?: string; gained: number; coins: number } {
    const uniq = [...new Set(codes)];
    return this.transaction(() => {
      let gained = 0;
      for (const code of uniq) {
        const e = this.getEmoji(code);
        if (!e) return { ok: false, error: "unknown_emoji", gained: 0, coins: this.getCoins(userId) };
        const price = priceOf(e.tier);
        if (price <= 0) return { ok: false, error: "unsellable", gained: 0, coins: this.getCoins(userId) };
        if (!this.ownsEmoji(userId, code))
          return { ok: false, error: "not_owned", gained: 0, coins: this.getCoins(userId) };
        gained += price;
      }
      for (const code of uniq) {
        // The emoji BURNS — Sterling's till is the void, and what he sells is
        // the daily spread in src/shelf.ts, never what he was sold (the
        // sell-back shelf of migration 89 fed the Forge's mythic step).
        this.removeEmoji(userId, code);
      }
      this.addCoins(userId, gained);
      return { ok: true, gained, coins: this.getCoins(userId) };
    });
  }

  /** What Sterling has on the shelf, newest first. */
  /** Codes this member has already bought off today's shelf. */
  shelfBought(userId: number, day: number): string[] {
    return (this.prep("SELECT code FROM sterling_purchases WHERE userId = ? AND day = ?").all(userId, day) as { code: string }[]).map((r) => r.code);
  }

  /** Buy off today's spread — all-or-nothing. `onShelf` is the day's
   *  spread as the route computed it (src/shelf.ts); this checks each code
   *  is on it, unowned and not yet bought today BEFORE the wallet is
   *  touched, then burns the silver, grants, and writes the ledger row. */
  buyFromSterlingShelf(
    userId: number,
    day: number,
    codes: string[],
    onShelf: Set<string>,
    priceOf: (tier: string) => number,
  ): { ok: boolean; error?: string; spent: number; coins: number; emoji: Emoji[] } {
    const uniq = [...new Set(codes)];
    return this.transaction(() => {
      const refuse = (error: string) => ({ ok: false, error, spent: 0, coins: this.getCoins(userId), emoji: [] as Emoji[] });
      let total = 0;
      const got: Emoji[] = [];
      const bought = new Set(this.shelfBought(userId, day));
      for (const code of uniq) {
        if (!onShelf.has(code)) return refuse("not_in_stock");
        const e = this.getEmoji(code);
        if (!e) return refuse("unknown_emoji");
        const price = priceOf(e.tier);
        if (price <= 0) return refuse("unsellable");
        if (this.ownsEmoji(userId, code)) return refuse("already_owned");
        if (bought.has(code)) return refuse("already_bought");
        total += price;
        got.push(e);
      }
      const left = this.spendCoins(userId, total);
      if (left === null) return refuse("insufficient");
      const now = Date.now();
      for (const e of got) {
        this.addEmoji(userId, e.code);
        this.prep("INSERT INTO sterling_purchases (userId, day, code, at) VALUES (?, ?, ?, ?)").run(userId, day, e.code, now);
      }
      return { ok: true, spent: total, coins: left, emoji: got };
    });
  }

  // ---- THE FORGE (migration 89) --------------------------------------------

  getEssence(userId: number): number {
    const row = this.prep("SELECT essence FROM users WHERE id = ?").get(userId) as { essence: number } | undefined;
    return row?.essence ?? 0;
  }

  /** Debit essence iff the balance covers it — the coin guard's shape. */
  spendEssence(userId: number, n: number): number | null {
    if (n <= 0) return this.getEssence(userId);
    const info = this.prep("UPDATE users SET essence = essence - ? WHERE id = ? AND essence >= ?").run(n, userId, n);
    if (info.changes === 0) return null;
    return this.getEssence(userId);
  }

  /**
   * MELT: destroy owned emoji for essence, atomically. Every code must be
   * owned and meltable (yield > 0 — mythics, the talisman and specials are
   * refused); one bad code voids the batch. Nothing but the essence
   * column moves — the emoji are gone.
   */
  meltEmoji(
    userId: number,
    codes: string[],
    yieldOf: (tier: string) => number,
  ): { ok: boolean; error?: string; gained: number; essence: number } {
    const uniq = [...new Set(codes)];
    return this.transaction(() => {
      let gained = 0;
      for (const code of uniq) {
        const e = this.getEmoji(code);
        if (!e) return { ok: false, error: "unknown_emoji", gained: 0, essence: this.getEssence(userId) };
        const y = yieldOf(e.tier);
        if (y <= 0) return { ok: false, error: "unmeltable", gained: 0, essence: this.getEssence(userId) };
        if (!this.ownsEmoji(userId, code)) return { ok: false, error: "not_owned", gained: 0, essence: this.getEssence(userId) };
        gained += y;
      }
      for (const code of uniq) this.removeEmoji(userId, code);
      this.prep("UPDATE users SET essence = essence + ? WHERE id = ?").run(gained, userId);
      return { ok: true, gained, essence: this.getEssence(userId) };
    });
  }

  /**
   * UPGRADE: consume one owned emoji plus `cost` essence, receive a random
   * UNOWNED emoji of `toTier` (the Wheel's award rule — never a duplicate).
   * Refused without charge if the tier is complete, the emoji isn't owned,
   * or the essence is short. Atomic.
   */
  /** One strike: the emoji + the essence (+ the silver TOLL on the mythic
   *  step, BURNED) → a random unowned emoji of the next tier. Every refusal
   *  happens before anything is spent; the toll and the essence are both
   *  guarded decrements inside the one transaction, so a short purse after
   *  a sufficient essence balance rolls the essence back too. */
  forgeUpgrade(
    userId: number,
    code: string,
    cost: number,
    toTier: string,
    toll = 0,
  ): { ok: boolean; error?: string; essence: number; coins: number; emoji?: Emoji; consumed?: Emoji } {
    return this.transaction(() => {
      const refuse = (error: string) => ({ ok: false, error, essence: this.getEssence(userId), coins: this.getCoins(userId) });
      const e = this.getEmoji(code);
      if (!e) return refuse("unknown_emoji");
      // Defence in depth: the route checks this too, but the Stone must not
      // depend on one caller remembering — sellEmojiToTrader and meltEmoji
      // already refuse it at the store. See src/abyss.ts.
      if (isBound(e.tier)) return refuse("bound");
      if (!this.ownsEmoji(userId, code)) return refuse("not_owned");
      const pool = this.unownedInTier(userId, toTier);
      if (!pool.length) return refuse("tier_complete");
      if (this.getEssence(userId) < cost) return refuse("insufficient_essence");
      if (this.getCoins(userId) < toll) return refuse("insufficient_silver");
      const left = this.spendEssence(userId, cost);
      if (left === null) return refuse("insufficient_essence");
      let coins = this.getCoins(userId);
      if (toll > 0) {
        const paid = this.spendCoins(userId, toll);
        if (paid === null) throw new Error("forge toll: purse changed mid-strike");
        coins = paid;
      }
      this.removeEmoji(userId, code);
      const pick = pool[randomInt(pool.length)];
      this.addEmoji(userId, pick.code);
      return { ok: true, essence: left, coins, emoji: pick, consumed: e };
    });
  }

  /**
   * Buy `count` extra Wheel spins at `unitPrice` each, atomically. Debits the
   * total (never below zero) and adds the spins to the persistent bonus pool.
   * Returns the new balance and total available spins, or an error unchanged.
   */
  buyWheelSpins(
    userId: number,
    count: number,
    unitPrice: number,
  ): { ok: boolean; error?: string; coins: number; spins: number } {
    return this.transaction(() => {
      const cost = count * unitPrice;
      const left = this.spendCoins(userId, cost);
      if (left === null)
        return { ok: false, error: "insufficient", coins: this.getCoins(userId), spins: this.spinState(userId).total };
      this.addBonusSpins(userId, count);
      return { ok: true, coins: left, spins: this.spinState(userId).total };
    });
  }

  /**
   * The Wheelwright's talisman trade: sacrifice one owned MYTHIC to the house
   * for the death-shield talisman. Atomic burn-then-grant — the mythic is
   * destroyed (a true sink, mirroring the graveyard dupe-burn rule), never
   * transferred. Fails without mutating if the code isn't an owned mythic or
   * the buyer is already shielded (talisman ownership is binary).
   */
  buyTalismanWithMythic(
    userId: number,
    code: string,
    talismanCode: string,
  ): { ok: boolean; error?: string } {
    return this.transaction(() => {
      const emoji = this.getEmoji(code);
      if (!emoji || emoji.tier !== "mythic") return { ok: false, error: "not_mythic" };
      if (!this.ownsEmoji(userId, code)) return { ok: false, error: "not_owned" };
      if (this.ownsEmoji(userId, talismanCode)) return { ok: false, error: "already_shielded" };
      this.removeEmoji(userId, code);
      this.addEmoji(userId, talismanCode);
      return { ok: true };
    });
  }

  /** The Wheelwright's OTHER counter (Josh, Aug 2026): buy the death-shield
   *  outright for silver. A pure sink — the coins are burned, not paid to
   *  anyone — and it mints no tradeable value, since the talisman is
   *  unsellable and only a spin can consume it. Guarded like every other money
   *  path: one transaction, debit-then-grant, refused if you're already
   *  shielded so nobody can spend twice for nothing. */
  buyTalismanWithSilver(
    userId: number,
    price: number,
    talismanCode: string,
  ): { ok: boolean; error?: string; coins?: number } {
    return this.transaction(() => {
      if (this.ownsEmoji(userId, talismanCode)) {
        return { ok: false, error: "already_shielded", coins: this.getCoins(userId) };
      }
      const after = this.spendCoins(userId, price);
      if (after === null) return { ok: false, error: "insufficient", coins: this.getCoins(userId) };
      this.addEmoji(userId, talismanCode);
      // A courtesy is SPENT by the purchase it paid for, inside the same
      // transaction as the debit — a discount that survived the sale would let
      // one red gauge buy cheap shields for the rest of its 48 hours, which is
      // a subscription again by another name. A house-wide sale is untouched:
      // it belongs to the floor, not to this person.
      this.clearShieldOffer(userId);
      return { ok: true, coins: after };
    });
  }

  /** Sterling's top shelf: burn silver for a random MYTHIC you don't own.
   *  One transaction, debit-then-grant, and the pool is checked first so a
   *  completionist can never pay for nothing. Mythics are unsellable, so this
   *  mints no tradeable value — it only gives a huge pile of silver somewhere
   *  to go. */
  buyRandomMythic(
    userId: number,
    price: number,
  ): { ok: boolean; error?: string; coins?: number; emoji?: Emoji } {
    return this.transaction(() => {
      const pool = this.unownedInTier(userId, "mythic");
      if (!pool.length) {
        return { ok: false, error: "owns_all_mythics", coins: this.getCoins(userId) };
      }
      const after = this.spendCoins(userId, price);
      if (after === null) return { ok: false, error: "insufficient", coins: this.getCoins(userId) };
      const pick = pool[randomInt(pool.length)];
      this.addEmoji(userId, pick.code);
      return { ok: true, coins: after, emoji: pick };
    });
  }

  // ---- Admin economy tools -----------------------------------------------

  /** Admin: refill a user's regular bucket to a full 7 for the current window. */
  resetSpins(userId: number): void {
    this.prep("UPDATE users SET spinBucket = 7, spinHour = ? WHERE id = ?")
      .run(this.currentPeriod(), userId);
  }

  /** Admin: force a specific slot on the user's next spin, or clear with null. */
  setRiggedSpin(userId: number, slot: string | null): void {
    this.prep("UPDATE users SET riggedNextSpin = ? WHERE id = ?").run(slot, userId);
  }

  /** Read and clear a user's rigged next-spin slot. Returns the slot, or null. */
  takeRiggedSpin(userId: number): string | null {
    const row = this.prep("SELECT riggedNextSpin FROM users WHERE id = ?")
      .get(userId) as { riggedNextSpin: string | null } | undefined;
    const slot = row?.riggedNextSpin ?? null;
    if (slot) this.prep("UPDATE users SET riggedNextSpin = NULL WHERE id = ?").run(userId);
    return slot;
  }

  // ---- Death (permadeath tombstone) --------------------------------------

  /**
   * Tombstone a user: disabled forever, recorded on the death board. Messages
   * remain. If they left a WILL naming a living, non-self beneficiary, the
   * estate transfers here: all silver, plus every emoji the heir doesn't
   * already own (ownership is binary — duplicates are buried with the dead,
   * which also keeps their graveyard collection from going bare).
   *
   * NOTE: runs inside the CALLER's transaction (the spin txn) — transaction()
   * doesn't nest, so this method must stay plain statements.
   */
  /** The dead player's OPEN simple escrows (game bets/stakes in flight) get
   *  pulled back into their wallet BEFORE the estate transfers — the will
   *  covers your whole purse, including the chips still on a table (review
   *  finding: escrow used to settle onto tombstoned accounts and strand).
   *  PLAIN statements only — killUser runs inside the spin's transaction and
   *  transaction() cannot nest. Auctions are deliberately excluded (escrowed
   *  emoji + multi-party settlement need their own lifecycle; a dead seller's
   *  auction still settles onto the tombstone — documented limitation).
   *  In-memory engines later settle against the deleted rows and hit the
   *  guarded no-op paths, so nothing double-pays. */
  private static DEAD_ESCROW_SWEEPS: [table: string, col: string, amountExpr: string][] = [
    ["roulette_bets", "userId", "amount"],
    ["craps_bets", "userId", "amount"],
    ["derby_bets", "userId", "amount"],
    ["bonepit_stakes", "userId", "amount"],
    ["side_bets", "bettorId", "amount"],
    ["blackjack_bets", "userId", "amount"],
    ["holdem_stacks", "userId", "stack"],
    ["chess_silver_stakes", "userId", "amount"],
    // A dead CONTRIBUTOR's chip toward somebody's bail comes home too
    // (migration 85). The prisoner's side is handled by refundBailPot when
    // the cell ends.
    ["bail_pot", "payerId", "amount"],
  ];

  private sweepEscrowIntoWallet(userId: number): void {
    for (const [table, col, amount] of Store.DEAD_ESCROW_SWEEPS) {
      const r = this.prep(`SELECT COALESCE(SUM(${amount}),0) AS s FROM ${table} WHERE ${col} = ?`)
        .get(userId) as { s: number };
      // The two escrows that can carry a CHIPS split (E3b) return it as
      // chips — even a corpse's refund must not be a converter.
      let chips = 0;
      if (table === "roulette_bets" || table === "blackjack_bets") {
        chips = (
          this.prep(`SELECT COALESCE(SUM(chips),0) AS c FROM ${table} WHERE ${col} = ?`).get(userId) as { c: number }
        ).c;
      }
      if (chips > 0) this.prep("UPDATE users SET chips = chips + ? WHERE id = ?").run(chips, userId);
      if (r.s - chips > 0) {
        this.prep("UPDATE users SET coins = coins + ? WHERE id = ?").run(r.s - chips, userId);
      }
      this.prep(`DELETE FROM ${table} WHERE ${col} = ?`).run(userId);
    }
    // A chess EMOJI stake comes home to the inventory too (Oct 2026 review):
    // it sat outside the collection, so a scrub didn't burn it and a death's
    // Inheritance never saw it — the open challenge could still be accepted.
    const staked = this.prep("SELECT id, code FROM chess_stakes WHERE userId = ?").all(userId) as { id: number; code: string }[];
    for (const r of staked) {
      this.prep("DELETE FROM chess_stakes WHERE id = ?").run(r.id);
      this.addEmoji(userId, r.code);
    }
  }

  killUser(userId: number, cause: string = "wheel"): void {
    this.sweepEscrowIntoWallet(userId); // in-flight bets come home to the estate
    // THE ESTATE NO LONGER MOVES HERE (migration 68). It used to: killUser
    // handed the will beneficiary the whole purse and every emoji they lacked,
    // on the spot. That cannot survive a revival window — raise somebody an
    // hour after they died and they would stand up stripped, with their estate
    // already in a friend's inventory and no way to unwind it that doesn't
    // either mint or confiscate. So death now only DIGS the grave, and
    // sealGrave() executes the will 48 hours later if nobody came.
    //
    // The escrow sweep stays here on purpose: chips sitting on a table should
    // come home the moment you fall, not two days later.
    const now = Date.now();
    this.prep("UPDATE users SET disabled = 1, diedAt = ?, graveSealsAt = ?, deathCause = ? WHERE id = ?")
      .run(now, now + GRAVE_FRESH_MS, cause, userId);
  }

  /** Graves whose window has run out. Drives the sweep; a restart mid-window
   *  loses nothing, since the deadline is a column and not a timer. */
  dueGraves(now = Date.now()): number[] {
    return (
      this.prep("SELECT id FROM users WHERE graveSealsAt IS NOT NULL AND graveSealsAt <= ?")
        .all(now) as { id: number }[]
    ).map((r) => r.id);
  }

  /** Is this grave still open to a revival? */
  graveFresh(userId: number, now = Date.now()): boolean {
    const r = this.prep("SELECT graveSealsAt FROM users WHERE id = ?").get(userId) as
      | { graveSealsAt: number | null }
      | undefined;
    return graveIsFresh(r?.graveSealsAt ?? null, now);
  }

  /** Bring somebody back, whatever paid for it. Callers hold the transaction
   *  and have already taken payment — this is the standing-up half, and the
   *  guarded UPDATE is what makes a double-revive impossible: the second one
   *  changes no rows, so a racing pair of payers can't both be charged for the
   *  same resurrection. Returns false if the grave was already gone. */
  private standUp(userId: number): boolean {
    const r = this.prep(
        "UPDATE users SET disabled = 0, diedAt = NULL, graveSealsAt = NULL, deathCause = NULL, riggedNextSpin = NULL " +
          "WHERE id = ? AND graveSealsAt IS NOT NULL AND diedAt IS NOT NULL",
      )
      .run(userId);
    if (Number(r.changes) === 0) return false;
    // The grave has resolved — whichever way — so everything scoped to it goes
    // with it: a second death starts with clean ground, not last year's
    // respects. At a SEALING the eulogies were already carved into the
    // monument before this runs (see sealGrave's ordering).
    this.clearGraveRows(userId);
    // THE DEAD DAYS DON'T COUNT (Oct 2026 review): the collectors skip a
    // corpse, so an open loan's lastDay froze at the day of death, and the
    // first visit after a raise or a self-revive (which empties the purse)
    // charged every dead day as a miss — straight to repossession or jail,
    // moments after paying to come back. The cell's release does the same.
    this.prep("UPDATE loans SET lastDay = ? WHERE userId = ?").run(dayKey(Date.now()), userId);
    return true;
  }

  /** Everything scoped to one grave: its respects, tributes and eulogies. */
  private clearGraveRows(userId: number): void {
    this.prep("DELETE FROM grave_respects WHERE deadUserId = ?").run(userId);
    this.prep("DELETE FROM grave_tributes WHERE deadUserId = ?").run(userId);
    this.prep("DELETE FROM grave_eulogies WHERE deadUserId = ?").run(userId);
  }

  /** SOMEBODY ELSE PAYS. Ten thousand silver, or one sacrificed mythic —
   *  both BURNED, never paid to the person coming back. A revival that
   *  enriched anybody would be a coin faucet wearing a costume. */
  raiseFromGrave(
    deadId: number,
    payerId: number,
    kind: "silver" | "mythic",
    code?: string,
  ): { ok: true } | { error: string } {
    return this.transaction(() => {
      if (deadId === payerId) return { error: "raise_yourself" };
      const payer = this.getUserById(payerId);
      if (!payer || payer.disabled || payer.locked) return { error: "payer_unavailable" };
      const dead = this.getUserById(deadId);
      if (!dead || !dead.diedAt || dead.deletedAt) return { error: "not_dead" };
      if (!this.graveFresh(deadId)) return { error: "grave_sealed" };

      let cost = 0;
      let mythic: string | null = null;
      if (kind === "silver") {
        if (this.spendCoins(payerId, RAISE_PRICE) === null) return { error: "insufficient" };
        cost = RAISE_PRICE;
      } else {
        if (!code) return { error: "no_mythic" };
        const e = this.getEmoji(code);
        if (!e || e.tier !== RAISE_MYTHIC_TIER) return { error: "not_mythic" };
        if (!this.ownsEmoji(payerId, code)) return { error: "not_owned" };
        this.removeEmoji(payerId, code); // burned, not transferred
        mythic = code;
      }
      // Payment is taken; if the grave vanished underneath us (a racing
      // revival) the whole transaction rolls back, refund included.
      if (!this.standUp(deadId)) return { error: "grave_sealed" };
      this.prep(
          "INSERT INTO revivals (userId, byUserId, kind, cost, mythicCode, burnedCodes, at) " +
            "VALUES (?, ?, ?, ?, ?, NULL, ?)",
        )
        .run(deadId, payerId, kind, cost, mythic, Date.now());
      return { ok: true as const };
    });
  }

  /** YOU PAY. Everything in your purse and a third of your collection, burned.
   *  Deliberately worse than being raised by a friend — the social route
   *  should always be the better one. */
  selfRevive(userId: number): { ok: true; coins: number; burned: string[] } | { error: string } {
    return this.transaction(() => {
      const me = this.getUserById(userId);
      if (!me || !me.diedAt) return { error: "not_dead" };
      if (!this.graveFresh(userId)) return { error: "grave_sealed" };

      const purse = this.getCoins(userId);
      const owned = this.getInventory(userId);
      // A PRICE OF NOTHING IS NOT A PRICE (see canSelfRevive). A broke account
      // with an empty collection used to quote zero and let itself straight
      // back out, which made permadeath free for exactly the accounts that
      // cost nothing to make.
      if (!canSelfRevive(purse, owned.length)) return { error: "nothing_to_pay" };
      const n = selfBurnCount(owned.length);
      // Which ones burn is a real roll, and outcome rolls in this codebase use
      // crypto, never Math.random. THE STONE OF THE ABYSS is never in the
      // pool (it was never a price of anything; src/abyss.ts).
      const pool = owned.filter((e) => !isBound(e.tier));
      const burned: string[] = [];
      for (let i = 0; i < n && pool.length; i++) {
        const [pick] = pool.splice(randomInt(pool.length), 1);
        burned.push(pick.code);
      }
      for (const c of burned) this.removeEmoji(userId, c);
      if (purse > 0) this.prep("UPDATE users SET coins = 0 WHERE id = ?").run(userId);
      // The escape room's chips and free pulls go with the purse (Josh, Oct
      // 2026): they used to survive every death untouched while silver kept
      // nothing. They aren't part of the price — burned, not counted.
      this.prep("UPDATE users SET chips = 0, freePulls = 0 WHERE id = ?").run(userId);

      if (!this.standUp(userId)) return { error: "grave_sealed" };
      this.prep(
          "INSERT INTO revivals (userId, byUserId, kind, cost, mythicCode, burnedCodes, at) " +
            "VALUES (?, NULL, 'self', ?, NULL, ?, ?)",
        )
        .run(userId, purse, JSON.stringify(burned), Date.now());
      return { ok: true as const, coins: purse, burned };
    });
  }

  /** NOBODY CAME. Carve the life into the graveyard, execute the will on what
   *  the next generation isn't carrying, and stand the same account up as the
   *  generation after.
   *
   *  Idempotent by the same guarded UPDATE the revivals use, so the sweep and
   *  a lazy read racing each other can only seal a grave once. */
  // ---- GOBLIN LENDERS (migration 72; rules in src/lender.ts) --------
  //
  // THE ONE INVARIANT: this lender cannot mint. Every coin it hands out comes
  // out of `goblin_vault.silver` and every coin it takes goes back in, so
  // `SUM(users.coins) + escrows + goblin_vault.silver` is constant across
  // every operation below. The vault was seeded ONCE by the migration (the
  // goblins are interstellar; they brought it with them) and nothing ever
  // adds to it from nowhere. The harness spends most of its asserts here.

  /** What the goblins are sitting on, and their lifetime books. */
  goblinVault(): { silver: number; lent: number; taken: number } {
    const r = this.prep("SELECT silver, lent, taken FROM goblin_vault WHERE id = 1").get() as
      | { silver: number; lent: number; taken: number }
      | undefined;
    return r ?? { silver: 0, lent: 0, taken: 0 };
  }

  /** Raw loan row, or null. */
  loanOf(userId: number): {
    userId: number; principal: number; rate: number; opened: number;
    borrowed: number; lastDay: string; missed: number; paid: number;
  } | null {
    return (
      (this.prep("SELECT * FROM loans WHERE userId = ?").get(userId) as never) ?? null
    );
  }

  /** How far down the ladder somebody is. No loan = stage 0, and the callers
   *  that gate trades/auctions read this rather than reaching for the row. */
  loanStage(userId: number): Stage {
    const l = this.loanOf(userId);
    return l ? this.stageOf(l.missed) : 0;
  }

  /** FOUNDRY LENDING (PANDORA.md, "Destroy the Goblins"): once that world
   *  choice is taken the same engine lends at the Foundry's rates and its
   *  ladder stops at REPOSSESSION — no freeze, no cells, no letters. Every
   *  rate and stage the lender reads goes through these three. */
  foundryLending(): boolean {
    return this.pandoraFlag("destroy-goblins") != null;
  }
  private lendRates(): Record<number, number> {
    return ratesFor(this.foundryLending());
  }
  private stageOf(missed: number): Stage {
    return stageFor(missed, this.foundryLending() ? FOUNDRY_TOP_STAGE : 5);
  }

  /** THE WASH (Josh: "every open debt is WASHED"). Runs inside the opening
   *  that destroys the goblins: every loan forgiven and its row gone, every
   *  prisoner out with their pot refunded, every introductory offer void.
   *  The vault keeps what it holds (it becomes Foundry Lending's capital),
   *  so nothing is minted: forgiven principal was silver already in a
   *  wallet. PLAIN statements — called inside openPandora's transaction.
   *  Returns who owed and who walked, for the announcement. */
  washGoblinDebts(): { debtors: number[]; freed: number[] } {
    const freed = (this.prep("SELECT id FROM users WHERE jailedAt IS NOT NULL AND deletedAt IS NULL").all() as { id: number }[])
      .map((r) => r.id);
    for (const id of freed) {
      this.refundBailPot(id);
      this.releasePrisoner(id);
    }
    const debtors = (this.prep("SELECT userId FROM loans").all() as { userId: number }[]).map((r) => r.userId);
    for (const id of debtors) {
      const l = this.loanOf(id);
      this.logLoan(id, "washed", l?.principal ?? 0, "the goblins are gone");
    }
    this.prep("DELETE FROM loans").run();
    this.prep("DELETE FROM app_kv WHERE key LIKE 'goblin_offer:%'").run();
    return { debtors, freed };
  }

  private logLoan(userId: number, kind: string, amount = 0, note?: string): void {
    this.prep("INSERT INTO loan_events (userId, at, kind, amount, note) VALUES (?, ?, ?, ?, ?)")
      .run(userId, Date.now(), kind, Math.round(amount), note ?? null);
  }

  /** YOUR FILE — the goblins' meticulous record of one customer, newest
   *  first. They keep it whether or not you ever look. */
  loanEvents(userId: number, limit = 40): { at: number; kind: string; amount: number; note: string | null }[] {
    return this.prep("SELECT at, kind, amount, note FROM loan_events WHERE userId = ? ORDER BY at DESC, id DESC LIMIT ?")
      .all(userId, limit) as { at: number; kind: string; amount: number; note: string | null }[];
  }

  /** What the collection would fetch at the TRADER's prices — the number the
   *  goblins size a credit limit against (they lend against what they could
   *  take, which is the whole reason a fresh alt can't reach the big windows). */
  collectionValue(userId: number): number {
    const r = this.prep(
        `SELECT COALESCE(SUM(CASE e.tier WHEN 'common' THEN ? WHEN 'rare' THEN ?
                                          WHEN 'legendary' THEN ? ELSE 0 END), 0) AS v
           FROM user_emoji ue JOIN emoji e ON e.code = ue.code
          WHERE ue.userId = ?`,
      )
      // The Trader's own table, bound — a retune reaches the goblins' credit
      // ladder the same day (Sep 2026: the numbers were copied here, and the
      // ×5–×25 retune would have left the ladder sizing against old prices).
      .get(SELL_PRICES.common ?? 0, SELL_PRICES.rare ?? 0, SELL_PRICES.legendary ?? 0, userId) as { v: number };
    return r.v;
  }

  /** Everything a kiosk screen needs about one person. */
  lenderState(userId: number): {
    /** Who runs the window: the goblins, or Foundry Lending once Pandora's
     *  box has destroyed them. */
    regime: "goblins" | "foundry";
    vault: number;
    purse: number;
    worth: number;
    tiers: { amount: number; rate: number; base: number; allowed: boolean; affordable: boolean }[];
    loan: LoanQuote | null;
    /** A standing introductory rate from one of their letters, if any. */
    offer: { off: number; until: number } | null;
    jailedAt: number | null;
    jailSealsAt: number | null;
  } {
    const purse = this.getCoins(userId);
    const worth = this.collectionValue(userId);
    const vault = this.goblinVault().silver;
    const l = this.loanOf(userId);
    const u = this.getUserById(userId);
    const foundry = this.foundryLending();
    const offer = foundry ? null : this.goblinOffer(userId);
    const rates = ratesFor(foundry);
    return {
      regime: foundry ? ("foundry" as const) : ("goblins" as const),
      vault,
      purse,
      worth,
      tiers: TIERS.map((amount) => ({
        amount,
        rate: offer ? teaserRate(rates[amount], offer.off) : rates[amount],
        base: rates[amount],
        allowed: tierAllowed(amount, purse, worth, minWorth(SELL_PRICES.common ?? 0)),
        affordable: vault >= amount,
      })),
      loan: l ? quote(l.principal, l.rate, l.missed, l.lastDay < dayKey(Date.now()), foundry ? FOUNDRY_TOP_STAGE : 5) : null,
      offer,
      jailedAt: u?.jailedAt ?? null,
      jailSealsAt: u?.jailSealsAt ?? null,
    };
  }

  // ---- THE LETTERS (Sep 2026) — the goblins' introductory offers ------------
  // Kept in app_kv (`goblin_offer:<id>`): a rate, not a coin, so no ledger
  // table is owed. Expired offers read as null and are dropped on the read.

  goblinOffer(userId: number, now = Date.now()): { off: number; until: number } | null {
    const raw = this.kvGet(`goblin_offer:${userId}`);
    if (!raw) return null;
    try {
      const o = JSON.parse(raw) as { off: number; until: number };
      if (!(o.off > 0) || !(o.until > now)) {
        this.kvDel(`goblin_offer:${userId}`);
        return null;
      }
      return { off: o.off, until: o.until };
    } catch {
      this.kvDel(`goblin_offer:${userId}`);
      return null;
    }
  }

  setGoblinOffer(userId: number, off: number, until: number): void {
    this.kvSet(`goblin_offer:${userId}`, JSON.stringify({ off, until }));
  }

  clearGoblinOffer(userId: number): void {
    this.kvDel(`goblin_offer:${userId}`);
  }

  // ---- STERLING'S COURTESY (Sep 2026) — the shield offer --------------------
  // The goblins' shape exactly, and deliberately so: a share off, a 48h window,
  // kept in app_kv (`sterling_shield:<id>`) because it is a DISCOUNT, not a
  // coin, so no ledger table is owed and an expired one can simply be dropped
  // on the read. The difference is who it is for — the goblins write to a
  // player in trouble to sell them debt; this writes to the same player to
  // sell them a way out. `sterling_shield_at:<id>` is the once-per-gap stamp.

  shieldOffer(userId: number, now = Date.now()): { off: number; until: number } | null {
    const raw = this.kvGet(`sterling_shield:${userId}`);
    if (!raw) return null;
    try {
      const o = JSON.parse(raw) as { off: number; until: number };
      if (!(o.off > 0) || !(o.until > now)) {
        this.kvDel(`sterling_shield:${userId}`);
        return null;
      }
      return { off: o.off, until: o.until };
    } catch {
      this.kvDel(`sterling_shield:${userId}`);
      return null;
    }
  }

  setShieldOffer(userId: number, off: number, until: number): void {
    this.kvSet(`sterling_shield:${userId}`, JSON.stringify({ off, until }));
  }

  clearShieldOffer(userId: number): void {
    this.kvDel(`sterling_shield:${userId}`);
  }

  /** The file's public pen — the goblins' voice logs its own letters. */
  logLoanEvent(userId: number, kind: string, amount = 0, note?: string): void {
    this.logLoan(userId, kind, amount, note);
  }

  /** When this account last touched the server (any session), or 0. */
  lastSeenAt(userId: number): number {
    const r = this.prep("SELECT MAX(lastSeenAt) AS at FROM sessions WHERE userId = ?").get(userId) as { at: number | null };
    return r?.at ?? 0;
  }

  /** Lifetime lottery tickets this person has bought. */
  lotteryTicketsBought(userId: number): number {
    const r = this.prep("SELECT COALESCE(SUM(count), 0) AS n FROM lottery_tickets WHERE userId = ?").get(userId) as { n: number };
    return r.n;
  }

  /**
   * Take a loan. One at a time, one of the four windows, and only a window
   * their worth opens — the credit ladder is what stops a fresh account
   * borrowing a fortune and walking away from it.
   *
   * The silver MOVES: out of the vault, into the purse. Nothing is created.
   */
  takeLoan(userId: number, amount: number): { ok: true; coins: number; loan: LoanQuote } | { ok: false; error: string } {
    return this.transaction(() => {
      const u = this.getUserById(userId);
      if (!u || u.disabled || u.isBot) return { ok: false as const, error: "not_eligible" };
      if (this.loanOf(userId)) return { ok: false as const, error: "loan_open" };
      const purse = this.getCoins(userId);
      const worth = this.collectionValue(userId);
      if (!tierAllowed(amount, purse, worth, minWorth(SELL_PRICES.common ?? 0))) return { ok: false as const, error: "over_limit" };
      const vault = this.goblinVault().silver;
      // A run on the bank is a legal state, not an error condition: they only
      // have what they have, and saying no is in character.
      if (vault < amount) return { ok: false as const, error: "vault_dry" };

      const now = Date.now();
      // THE LETTERS (Sep 2026): a standing introductory offer takes its
      // points off the posted rate — on this one loan — and is spent.
      const offer = this.foundryLending() ? null : this.goblinOffer(userId, now);
      const rates = this.lendRates();
      const rate = offer ? teaserRate(rates[amount], offer.off) : rates[amount];
      this.prep("UPDATE goblin_vault SET silver = silver - ?, lent = lent + ? WHERE id = 1")
        .run(amount, amount);
      this.prep("UPDATE users SET coins = coins + ? WHERE id = ?").run(amount, userId);
      this.prep(
          `INSERT INTO loans (userId, principal, rate, opened, borrowed, lastDay, missed, paid)
           VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
        )
        .run(userId, amount, rate, now, amount, dayKey(now));
      this.logLoan(userId, "borrow", amount, offer ? `introductory ${Math.round(offer.off * 100)} points off` : undefined);
      if (offer) this.clearGoblinOffer(userId);
      return { ok: true as const, coins: this.getCoins(userId), loan: quote(amount, rate, 0, false, this.foundryLending() ? FOUNDRY_TOP_STAGE : 5) };
    });
  }

  /**
   * Pay the goblins. Interest first, then principal — the classic order, and
   * the predatory one. Clearing at least today's interest resets the ladder:
   * you are current again, the mark comes off, and the daily visits stop
   * taking things.
   *
   * Overpaying past the payoff is refused rather than swallowed (they would
   * absolutely keep it; the store won't let them).
   */
  payLoan(userId: number, amount: number, opts: { service?: boolean } = {}): { ok: true; coins: number; loan: LoanQuote | null; cleared: boolean; took: number } | { ok: false; error: string } {
    return this.settleLoan(userId, userId, amount, opts);
  }

  /**
   * SETTLE FOR A FRIEND (Sep 2026). Before jail there was no way to help a
   * debtor — silver can't be gifted, and FROZEN shuts the trade doors — so a
   * friend may now pay another account's loan down directly. Same money path
   * (payer's wallet → vault, target's debt down), no fee, and the payer buys
   * nothing for themselves. REFUSED for a jailed target: bail is priced at
   * 1.5× the debt on purpose, and paying the debt to zero from outside would
   * make the cell open for 1.0× — the exact discount the bail fee exists to
   * prevent. The cell has its own prices.
   */
  payLoanFor(payerId: number, targetId: number, amount: number): ReturnType<Store["payLoan"]> {
    return this.settleLoan(payerId, targetId, amount);
  }

  private settleLoan(payerId: number, userId: number, amount: number, opts: { service?: boolean } = {}): ReturnType<Store["payLoan"]> {
    return this.transaction(() => {
      const l = this.loanOf(userId);
      if (!l) return { ok: false as const, error: "no_loan" };
      const pay = Math.floor(amount);
      if (!Number.isFinite(pay) || pay <= 0) return { ok: false as const, error: "bad_amount" };
      if (payerId !== userId) {
        const payer = this.getUserById(payerId);
        if (!payer || payer.disabled || payer.isBot) return { ok: false as const, error: "not_eligible" };
        if (this.loanOf(payerId)) return { ok: false as const, error: "owes_goblins" }; // the wallet's rule (Oct 2026 review)
        const target = this.getUserById(userId);
        if (!target || target.jailedAt) return { ok: false as const, error: "in_custody" };
      }
      // INTEREST IS DUE ONCE A DAY, NOT ONCE A PAYMENT. `lastDay` is stamped
      // by the borrow, by the goblins' daily visit, and by any payment that
      // settles the day — so if it already reads today, today is paid for and
      // every coin here goes to the principal. Without this, paying twice in
      // one afternoon was charged two days of interest, which is predatory
      // even by their standards.
      const today = dayKey(Date.now());
      // A CORPSE ACCRUES NOTHING (Oct 2026 review): the collectors skip the
      // dead and a revival restamps the day, so charging a day's interest on
      // every payment a friend made for them swallowed part payments whole.
      const dead = !!this.getUserById(userId)?.disabled;
      const dueInterest = !dead && l.lastDay < today ? interestFor(l.principal, l.rate) : 0;
      // THE SERVICE KEY PAYS TONIGHT'S INTEREST (Oct 2026 review). The visit
      // stamps every loan with the new day a minute after midnight, so the
      // branch above almost never fires — and the kiosk's SERVICE key, which
      // offers "tonight's" interest, put the payment on the principal, left
      // the mark on, and could leave the purse too thin for the visit (a miss
      // the debtor caused by paying). Asked for explicitly, it now pays it:
      // into the vault as interest, the loan stamped through tomorrow so
      // tonight's visit passes it by, and the ladder reset. An ordinary
      // payment stays pure principal, as it always was.
      const tonight = interestFor(l.principal, l.rate);
      const prepay = !!opts.service && dueInterest === 0 && l.lastDay === today && tonight > 0 && pay >= tonight;
      const owed = l.principal + dueInterest;
      const take = prepay ? tonight : Math.min(pay, owed);
      // Guarded debit — the wallet never goes negative, here or anywhere.
      // The PAYER's wallet: their own, or a friend's (settle-for-a-friend).
      const paid = this.prep("UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?")
        .run(take, payerId, take);
      if (paid.changes === 0) return { ok: false as const, error: "insufficient" };
      this.prep("UPDATE goblin_vault SET silver = silver + ?, taken = taken + ? WHERE id = 1")
        .run(take, take);

      const toInterest = prepay ? tonight : Math.min(take, dueInterest);
      const toPrincipal = take - toInterest;
      const principal = l.principal - toPrincipal;
      if (payerId === userId) this.logLoan(userId, "pay", take);
      else this.logLoan(userId, "gift", take, String(payerId));

      if (principal <= 0) {
        this.prep("DELETE FROM loans WHERE userId = ?").run(userId);
        this.logLoan(userId, "cleared", 0);
        return { ok: true as const, coins: this.getCoins(payerId), loan: null, cleared: true, took: take };
      }
      // Today's interest covered ⇒ current again: the ladder resets and the
      // mark comes off. Anything less leaves the missed count where it is.
      const missed = prepay || (dueInterest > 0 && toInterest >= dueInterest) ? 0 : l.missed;
      // …and only a payment that ACTUALLY settled today's interest stamps the
      // day. A part payment must not buy a free day.
      const stamp = prepay
        ? dayKey(Date.now() + 86_400_000)
        : dueInterest > 0 && toInterest >= dueInterest ? today : l.lastDay;
      this.prep("UPDATE loans SET principal = ?, missed = ?, paid = paid + ?, lastDay = ? WHERE userId = ?")
        .run(principal, missed, take, stamp, userId);
      return {
        ok: true as const,
        coins: this.getCoins(payerId),
        loan: quote(principal, l.rate, missed, false, this.foundryLending() ? FOUNDRY_TOP_STAGE : 5),
        cleared: false,
        took: take,
      };
    });
  }

  /**
   * THE DAILY VISIT — one debtor, one day. This is the single enforcement
   * point for the whole ladder, which is why it is one transaction and why
   * every punishment happens HERE rather than by intercepting income all over
   * the app: the goblins call round once a day and take what they are owed.
   *
   * Returns what happened, for the sweep to announce.
   */
  private collectFrom(userId: number, day: string): CollectResult {
    const l = this.loanOf(userId);
    const out: CollectResult = { charged: false, jailed: false, took: 0, seized: [], missedDays: 0, stage: 0 };
    if (!l) return out;
    const u = this.getUserById(userId);
    if (!u || u.disabled) return out; // dead or already inside: the debt waits

    const due = daysBetween(l.lastDay, day);
    if (due <= 0) return out;
    out.charged = true;

    let principal = l.principal;
    let rate = l.rate;
    let missed = l.missed;

    for (let d = 0; d < due; d++) {
      const interest = interestFor(principal, rate);
      // A day whose interest floors to nothing owes nothing: it used to read
      // as a MISS every visit, whatever the purse held (Oct 2026 review).
      if (interest <= 0) { missed = 0; continue; }
      // They take today's interest straight out of the purse if it's there.
      const purse = this.getCoins(userId);
      if (purse >= interest && interest > 0) {
        this.prep("UPDATE users SET coins = coins - ? WHERE id = ?").run(interest, userId);
        this.prep("UPDATE goblin_vault SET silver = silver + ?, taken = taken + ? WHERE id = 1")
          .run(interest, interest);
        out.took += interest;
        missed = 0; // serviced: you are current, and the ladder resets
        this.logLoan(userId, "interest", interest);
        continue;
      }
      // Not there. The interest capitalises, a late fee lands, the rate steps.
      const pen = missPenalty(principal, rate);
      principal = pen.principal;
      // AN INTRODUCTORY RATE DIES ON THE FIRST MISS (the letters, Sep 2026):
      // the step lands on the POSTED rate for this window, never on the
      // teaser. An ordinary loan's stepped rate is already at or above that.
      const foundry = this.foundryLending();
      rate = Math.min(rateCapFor(foundry), Math.max(pen.rate, (ratesFor(foundry)[l.borrowed] ?? rate) + RATE_STEP));
      missed += 1;
      out.missedDays += 1;
      this.logLoan(userId, "missed", pen.interest + pen.fee, `stage ${this.stageOf(missed)}`);

      const stage = this.stageOf(missed);
      // STAGE 2 — GARNISHED: a quarter of whatever is in the purse.
      if (stage >= 2) {
        const cut = Math.min(garnishOf(this.getCoins(userId)), principal);
        if (cut > 0) {
          this.prep("UPDATE users SET coins = coins - ? WHERE id = ?").run(cut, userId);
          this.prep("UPDATE goblin_vault SET silver = silver + ?, taken = taken + ? WHERE id = 1")
            .run(cut, cut);
          principal -= cut;
          out.took += cut;
          this.logLoan(userId, "garnish", cut);
        }
      }
      // STAGE 3 — REPOSSESSION: they start selling the collection, from the
      // bottom up, at half what Sterling pays. Capped per visit so it is a
      // slow humiliation rather than an instant gutting.
      if (stage >= 3 && principal > 0) {
        const owned = this.getInventory(userId).map((e) => ({
          code: e.code,
          tier: e.tier,
          price: SELL_PRICES[e.tier] ?? 0,
        }));
        let budget = principal;
        let taken = 0;
        for (const e of repoOrder(owned)) {
          if (budget <= 0 || taken >= 10) break;
          const worth = seizeValue(e.price);
          if (worth <= 0) continue;
          this.seizeToShelf(userId, e.code, e.price);
          budget -= worth;
          principal = Math.max(0, principal - worth);
          taken++;
          out.seized.push(e.code);
        }
        if (taken) this.logLoan(userId, "seize", taken, out.seized.join(","));
      }
      // STAGE 5 — JAIL. The debt goes with them; the cell has its own clock.
      if (stage >= 5 && principal > 0) { // a visit whose repossession just cleared the debt jails nobody (Oct 2026 review)
        const now = Date.now();
        this.prep("UPDATE users SET disabled = 1, jailedAt = ?, jailSealsAt = ?, cellPlea = NULL WHERE id = ?")
          .run(now, now + JAIL_FRESH_MS, userId);
        this.logLoan(userId, "jailed", principal);
        out.jailed = true;
        break;
      }
      if (principal <= 0) break;
    }

    if (principal <= 0) {
      this.prep("DELETE FROM loans WHERE userId = ?").run(userId);
      this.logLoan(userId, "cleared", 0);
      out.stage = 0;
    } else {
      this.prep("UPDATE loans SET principal = ?, rate = ?, missed = ?, lastDay = ? WHERE userId = ?")
        .run(principal, rate, missed, day, userId);
      out.stage = this.stageOf(missed);
    }
    return out;
  }

  /** The rounds. Every debtor who owes a day, charged in their own txn so one
   *  bad row can't take the others down with it. */
  collectDebts(now = Date.now()): (CollectResult & { userId: number })[] {
    const day = dayKey(now);
    const ids = (
      this.prep("SELECT userId FROM loans WHERE lastDay < ?").all(day) as { userId: number }[]
    ).map((r) => r.userId);
    const out: (CollectResult & { userId: number })[] = [];
    for (const userId of ids) {
      try {
        const r = this.transaction(() => this.collectFrom(userId, day));
        if (r.charged) out.push({ userId, ...r });
      } catch (e) {
        console.error("[lender] collect failed for", userId, e);
      }
    }
    return out;
  }

  // ---- THE REPO SHELF (migration 85) -----------------------------------------

  /** Take an emoji off somebody and put it on the shelf. Plain statements —
   *  called from inside the collectors' txn AND from settleGoblinDebt, which
   *  runs inside the sealing txn (transaction() does not nest). The shelf
   *  price is fixed HERE, at seizure, off the Trader's price that day. */
  /** What a seized emoji costs on the goblins' shelf TODAY: never less than
   *  five times what Sterling pays for it right now.
   *
   *  The price is stamped at seizure (deliberately — the goblins quote what
   *  they quoted). But a stamp taken before a Trader RAISE inverts the whole
   *  point: a legendary seized at the old prices carried 500, and Sterling now
   *  pays 2,500 for it, so buying your way through the shelf would MINT 2,000
   *  a row. The stamp may only ever raise the price, never discount it.
   *  (Sep 2026 review round; prod's shelf was empty when this landed.) */
  private shelfAsking(code: string, stamped: number): number {
    const tier = this.getEmoji(code)?.tier;
    const floor = shelfPrice(SELL_PRICES[tier ?? ""] ?? 0);
    return Math.max(stamped, floor);
  }

  private seizeToShelf(userId: number, code: string, traderPrice: number): void {
    this.prep("DELETE FROM user_emoji WHERE userId = ? AND code = ?").run(userId, code);
    this.prep("INSERT INTO goblin_stock (code, fromUserId, seizedAt, price) VALUES (?, ?, ?, ?)")
      .run(code, userId, Date.now(), shelfPrice(traderPrice));
  }

  /** What's on the shelf, newest seizure first. Public: the whole point is
   *  that everyone can see whose legendary it was. */
  goblinShelf(limit = 60): {
    id: number; code: string; name: string; tier: string; file: string;
    price: number; seizedAt: number; fromUserId: number;
  }[] {
    const rows = this.prep(
        `SELECT s.id, s.code, e.name, e.tier, e.file, s.price, s.seizedAt, s.fromUserId
           FROM goblin_stock s JOIN emoji e ON e.code = s.code
          ORDER BY s.seizedAt DESC, s.id DESC LIMIT ?`,
      )
      .all(limit) as { id: number; code: string; name: string; tier: string; file: string; price: number; seizedAt: number; fromUserId: number }[];
    // …at today's asking price, never below five times what Sterling pays now.
    return rows.map((r) => ({ ...r, price: this.shelfAsking(r.code, r.price) }));
  }

  /**
   * Buy off the shelf. The silver goes INTO THE VAULT (the goblins are
   * selling what they took; nothing is minted, nothing burned) and the emoji
   * moves onto the buyer — who must not already own that code, because
   * ownership is binary and a duplicate would be a paid-for nothing.
   */
  buyFromShelf(buyerId: number, stockId: number):
    | { ok: true; coins: number; code: string; price: number; wasYours: boolean }
    | { ok: false; error: string } {
    return this.transaction(() => {
      const u = this.getUserById(buyerId);
      if (!u || u.disabled || u.isBot) return { ok: false as const, error: "not_eligible" };
      const row = this.prep("SELECT id, code, fromUserId, price FROM goblin_stock WHERE id = ?").get(stockId) as
        | { id: number; code: string; fromUserId: number; price: number }
        | undefined;
      if (!row) return { ok: false as const, error: "not_on_shelf" };
      if (this.ownsEmoji(buyerId, row.code)) return { ok: false as const, error: "already_owned" };
      // The stamp can only ever RAISE the asking price (see shelfAsking): a
      // row seized before a Trader raise must never be resold below what
      // Sterling now pays for it, or the shelf mints the difference.
      const price = this.shelfAsking(row.code, row.price);
      const paid = this.prep("UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?")
        .run(price, buyerId, price);
      if (paid.changes === 0) return { ok: false as const, error: "insufficient" };
      this.prep("UPDATE goblin_vault SET silver = silver + ?, taken = taken + ? WHERE id = 1")
        .run(price, price);
      this.prep("DELETE FROM goblin_stock WHERE id = ?").run(row.id);
      this.addEmoji(buyerId, row.code);
      this.logLoan(buyerId, "bought", price, row.code);
      return {
        ok: true as const,
        coins: this.getCoins(buyerId),
        code: row.code,
        price,
        wasYours: row.fromUserId === buyerId,
      };
    });
  }

  // ---- THE BAIL POT (migration 85 — the tenth escrow) -------------------------

  bailPot(prisonerId: number): { total: number; contributors: { userId: number; amount: number }[] } {
    const contributors = this.prep(
        "SELECT payerId AS userId, SUM(amount) AS amount FROM bail_pot WHERE prisonerId = ? GROUP BY payerId ORDER BY amount DESC",
      )
      .all(prisonerId) as { userId: number; amount: number }[];
    return { total: contributors.reduce((n, c) => n + c.amount, 0), contributors };
  }

  /** Every chip goes home. PLAIN statements — called from inside bailOut's,
   *  sealCell's and scrubUser's transactions. */
  private refundBailPot(prisonerId: number): number {
    const rows = this.prep("SELECT payerId, amount FROM bail_pot WHERE prisonerId = ?")
      .all(prisonerId) as { payerId: number; amount: number }[];
    let back = 0;
    for (const r of rows) {
      this.prep("UPDATE users SET coins = coins + ? WHERE id = ?").run(r.amount, r.payerId);
      back += r.amount;
    }
    this.prep("DELETE FROM bail_pot WHERE prisonerId = ?").run(prisonerId);
    return back;
  }

  /** Out you come — the shape shared by a single payer's bail and a pot that
   *  cleared. The loan row is untouched (the debt is still theirs) but the
   *  ladder resets to MARKED so they aren't jailed again tonight. */
  private releasePrisoner(prisonerId: number): void {
    this.prep("UPDATE users SET disabled = 0, jailedAt = NULL, jailSealsAt = NULL, cellPlea = NULL WHERE id = ?")
      .run(prisonerId);
    if (this.loanOf(prisonerId)) {
      this.prep("UPDATE loans SET missed = 1, lastDay = ? WHERE userId = ?")
        .run(dayKey(Date.now()), prisonerId);
    }
  }

  /**
   * Chip in toward somebody's bail. The coins sit in escrow until the pot
   * reaches the price — then the WHOLE pot goes to the goblins in one move and
   * the door opens. A chip past the remainder is clamped, never swallowed.
   */
  chipIn(payerId: number, prisonerId: number, amount: number):
    | { ok: true; coins: number; pot: number; price: number; released: boolean; took: number; contributors: { userId: number; amount: number }[] }
    | { ok: false; error: string } {
    return this.transaction(() => {
      const p = this.getUserById(prisonerId);
      if (!p || !p.jailedAt) return { ok: false as const, error: "not_jailed" };
      if (!jailIsFresh(p.jailSealsAt, Date.now())) return { ok: false as const, error: "cell_sealed" };
      const payer = this.getUserById(payerId);
      if (!payer || payer.disabled || payer.isBot) return { ok: false as const, error: "not_eligible" };
      // NOBODY WHO OWES THE GOBLINS MOVES SILVER TO ANOTHER ACCOUNT — the
      // wallet's rule (Oct 2026 review): bail, a chip and a friend's debt were
      // all ways to launder a fresh loan to somebody else, then default.
      if (payerId !== prisonerId && this.loanOf(payerId)) return { ok: false as const, error: "owes_goblins" };
      const chip = Math.floor(amount);
      if (!Number.isFinite(chip) || chip <= 0) return { ok: false as const, error: "bad_amount" };
      const l = this.loanOf(prisonerId);
      const debt = l ? l.principal + interestFor(l.principal, l.rate) : 0;
      const price = bailPrice(debt);
      const pot = this.bailPot(prisonerId).total;
      const remaining = potRemaining(price, pot);
      if (remaining <= 0) return { ok: false as const, error: "pot_full" };
      const take = Math.min(chip, remaining);
      const paid = this.prep("UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?")
        .run(take, payerId, take);
      if (paid.changes === 0) return { ok: false as const, error: "insufficient" };
      this.prep("INSERT INTO bail_pot (prisonerId, payerId, amount, at) VALUES (?, ?, ?, ?)")
        .run(prisonerId, payerId, take, Date.now());
      const newPot = pot + take;
      if (newPot < price) {
        return { ok: true as const, coins: this.getCoins(payerId), pot: newPot, price, released: false, took: take, contributors: [] };
      }
      // THE POT CLEARS. Every chip → the vault, in one move; the rows go.
      const contributors = this.bailPot(prisonerId).contributors;
      this.prep("UPDATE goblin_vault SET silver = silver + ?, taken = taken + ? WHERE id = 1")
        .run(newPot, newPot);
      this.prep("DELETE FROM bail_pot WHERE prisonerId = ?").run(prisonerId);
      this.releasePrisoner(prisonerId);
      this.logLoan(prisonerId, "bailed", newPot, "pot:" + contributors.map((c) => c.userId).join(","));
      return { ok: true as const, coins: this.getCoins(payerId), pot: newPot, price, released: true, took: take, contributors };
    });
  }

  // ---- THE PLEA + THE PUBLIC STANDING ------------------------------------------

  setPlea(prisonerId: number, plea: string | null): void {
    this.prep("UPDATE users SET cellPlea = ? WHERE id = ?").run(plea, prisonerId);
  }

  pleaOf(userId: number): string | null {
    const r = this.prep("SELECT cellPlea FROM users WHERE id = ?").get(userId) as { cellPlea: string | null } | undefined;
    return r?.cellPlea ?? null;
  }

  /** Who is publicly in arrears, and how deep: every loan at stage 1+ plus
   *  everyone in a cell (stage 5). Stage 0 borrowers are NOT listed — the
   *  mark is the punishment for missing a day, not for borrowing. Realtime
   *  broadcasts this whole list on any change; the roster/profile/gutter
   *  render it as the debtor tag. */
  debtStandings(): { userId: number; stage: Stage }[] {
    const map = new Map<number, Stage>();
    for (const r of this.prep(
        "SELECT l.userId, l.missed FROM loans l JOIN users u ON u.id = l.userId WHERE l.missed >= 1 AND u.deletedAt IS NULL",
      ).all() as { userId: number; missed: number }[]) {
      map.set(r.userId, this.stageOf(r.missed));
    }
    for (const r of this.prep("SELECT id FROM users WHERE jailedAt IS NOT NULL AND deletedAt IS NULL").all() as { id: number }[]) {
      map.set(r.id, 5);
    }
    return [...map].map(([userId, stage]) => ({ userId, stage }));
  }

  /** The marked, for the kiosk's SETTLE FOR A FRIEND list: debtors at stage
   *  1-4 (not the jailed — the cell has its own prices) with what today costs
   *  them. Their debt size is public from the moment they miss a day: the mark
   *  is shame by design, and a friend needs the number to help. */
  markedDebtors(): { userId: number; stage: Stage; interest: number; payoff: number; settle: number }[] {
    const today = dayKey(Date.now());
    return (
      this.prep(
          `SELECT l.userId, l.missed, l.principal, l.rate, l.lastDay FROM loans l JOIN users u ON u.id = l.userId
            WHERE l.missed >= 1 AND u.jailedAt IS NULL AND u.disabled = 0 AND u.deletedAt IS NULL
            ORDER BY l.missed DESC, l.principal DESC`,
        )
        .all() as { userId: number; missed: number; principal: number; rate: number; lastDay: string }[]
    ).map((r) => ({
      userId: r.userId,
      stage: this.stageOf(r.missed),
      interest: interestFor(r.principal, r.rate),
      payoff: r.principal + interestFor(r.principal, r.rate),
      settle: r.principal + (r.lastDay < today ? interestFor(r.principal, r.rate) : 0),
    }));
  }

  /**
   * BAIL. Anybody living may pay; the money goes to the goblins, and it costs
   * MORE than the debt on purpose — if bail were cheaper, jail would be a
   * discount debt-settlement service (borrow a million, hand it to a friend,
   * get jailed deliberately, have them spring you for less than you took).
   *
   * And bail frees the BODY, NOT THE DEBT: they walk out still owing, still
   * marked, one missed payment from going straight back in.
   */
  bailOut(payerId: number, prisonerId: number): { ok: true; coins: number; price: number } | { ok: false; error: string } {
    return this.transaction(() => {
      const p = this.getUserById(prisonerId);
      if (!p || !p.jailedAt) return { ok: false as const, error: "not_jailed" };
      if (!jailIsFresh(p.jailSealsAt, Date.now())) return { ok: false as const, error: "cell_sealed" };
      const payer = this.getUserById(payerId);
      if (!payer || payer.disabled || payer.isBot) return { ok: false as const, error: "not_eligible" };
      // NOBODY WHO OWES THE GOBLINS MOVES SILVER TO ANOTHER ACCOUNT — the
      // wallet's rule (Oct 2026 review): bail, a chip and a friend's debt were
      // all ways to launder a fresh loan to somebody else, then default.
      if (payerId !== prisonerId && this.loanOf(payerId)) return { ok: false as const, error: "owes_goblins" };
      const l = this.loanOf(prisonerId);
      const debt = l ? l.principal + interestFor(l.principal, l.rate) : 0;
      const price = bailPrice(debt);
      const paid = this.prep("UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?")
        .run(price, payerId, price);
      if (paid.changes === 0) return { ok: false as const, error: "insufficient" };
      this.prep("UPDATE goblin_vault SET silver = silver + ?, taken = taken + ? WHERE id = 1")
        .run(price, price);
      // A pot that was gathering toward this bail goes home — one payer beat
      // it to the door, and the goblins are paid exactly once.
      this.refundBailPot(prisonerId);
      // Out you come. The loan row is untouched — the debt is still theirs —
      // but the ladder resets to MARKED so they aren't jailed again tonight.
      this.releasePrisoner(prisonerId);
      this.logLoan(prisonerId, "bailed", price, String(payerId));
      return { ok: true as const, coins: this.getCoins(payerId), price };
    });
  }

  /**
   * The cell door locks for good. The goblins take what they are owed off the
   * top — purse first, then the collection at their own half-price valuation
   * — and then the ORDINARY INHERITANCE runs: the life is carved into `lives`
   * and the same account stands up as the next generation with a quarter of
   * whatever is left and the rarest tenth of its collection.
   *
   * Jail seals exactly the way a grave does, deliberately. Permadeath was
   * softened for a reason (people play here for months); welching on goblins
   * shouldn't quietly undo that.
   */
  /**
   * THE GOBLINS ARE CREDITORS OF THE ESTATE — whichever way the life ended.
   *
   * This used to live inline in `sealCell`, which meant welching on a loan
   * settled the debt but DYING on the Wheel did not: an ordinary grave carved
   * its estate with the loan row untouched, and the same account row stood
   * back up as generation + 1 still owing — on a purse cut to 25% and a
   * collection cut to five emoji. The goblins' next visit then walked that
   * newborn straight up the ladder to a cell, for a debt its previous life
   * took on. The vault never saw the silver back either, so every death in
   * debt bled the goblins' capital toward a permanent `vault_dry`.
   *
   * One rule now, called from both endings: creditors are paid off the top,
   * then whatever is left is the estate. Returns the silver actually recovered.
   *
   * PLAIN STATEMENTS ONLY — both callers already hold a transaction, and
   * `transaction()` does not nest (the killUser rule). Idempotent by
   * construction: it deletes the loan row, so a second call finds nothing.
   */
  private settleGoblinDebt(userId: number): number {
    const l = this.loanOf(userId);
    if (!l) return 0;
    let debt = l.principal + interestFor(l.principal, l.rate);
    let got = 0;
    const purse = this.getCoins(userId);
    const cash = Math.min(purse, debt);
    if (cash > 0) {
      this.prep("UPDATE users SET coins = coins - ? WHERE id = ?").run(cash, userId);
      debt -= cash;
      got += cash;
    }
    // THE CASH is the only thing that moves into the vault. A SEIZED EMOJI
    // settles debt but mints NOTHING: the goblins took an asset, not coin, and
    // crediting themselves silver for it would conjure money backed by a
    // destroyed collectible — the exact leak this whole design exists to
    // avoid. (The daily repossession at stage 3 works the same way.)
    if (got > 0) {
      this.prep("UPDATE goblin_vault SET silver = silver + ?, taken = taken + ? WHERE id = 1")
        .run(got, got);
    }
    if (debt > 0) {
      // Valued at Sterling's own prices, halved — one table, so a retune at
      // the Trader's counter reaches the goblins' valuation too.
      const owned = this.getInventory(userId).map((e) => ({
        code: e.code,
        tier: e.tier,
        price: SELL_PRICES[e.tier] ?? 0,
      }));
      for (const e of repoOrder(owned)) {
        if (debt <= 0) break;
        const worth = seizeValue(e.price);
        if (worth <= 0) continue;
        this.seizeToShelf(userId, e.code, e.price); // onto the shelf, not into the void
        debt -= worth;
      }
    }
    // Whatever they couldn't recover is written off — a goblin's loss is
    // simply silver that never comes back to the vault. It is NOT forgiven
    // into somebody's wallet, so nothing is minted either way.
    this.prep("DELETE FROM loans WHERE userId = ?").run(userId);
    this.logLoan(userId, "sealed", got);
    return got;
  }

  sealCell(userId: number): { sealed: boolean; recovered: number } {
    // TWO TRANSACTIONS, DELIBERATELY. `transaction()` does not nest (the rule
    // killUser already lives under), and sealGrave opens its own — so the
    // goblins are paid in one, and the ordinary Inheritance runs in the next.
    // The gap is SELF-HEALING rather than dangerous: it leaves a corpse whose
    // grave is one second fresh, which the ordinary grave sweep closes on its
    // very next pass. A crash there costs a minute, not an estate.
    const recovered = this.transaction(() => {
      const u = this.getUserById(userId);
      if (!u || !u.jailedAt || u.jailSealsAt == null) return -1;

      // The prisoner's OPEN ESCROW comes home first, as killUser does (Oct
      // 2026 review): an Exchange position (or any other escrow) sat outside
      // both the goblins and the Inheritance, so a debtor could park a loan
      // in a 1x long, default, and the next generation closed it in full.
      this.sweepEscrowIntoWallet(userId);

      // Whatever friends had chipped toward a bail that never cleared goes
      // home BEFORE the estate is touched — the pot pays the goblins or
      // nobody, never the estate.
      this.refundBailPot(userId);
      const got = this.settleGoblinDebt(userId);

      // The cell becomes a grave, and the grave seals by the ordinary rules.
      const now = Date.now();
      this.prep(
          "UPDATE users SET diedAt = ?, graveSealsAt = ?, deathCause = 'goblins', jailedAt = NULL, jailSealsAt = NULL, cellPlea = NULL WHERE id = ?",
        )
        .run(u.jailedAt ?? now, now + 1000, userId);
      return got;
    });
    if (recovered < 0) return { sealed: false, recovered: 0 };
    const r = this.sealGrave(userId);
    return { sealed: r.sealed, recovered };
  }

  /** Cells whose window has run out. */
  cellsToSeal(now = Date.now()): number[] {
    return (
      this.prep("SELECT id FROM users WHERE jailedAt IS NOT NULL AND jailSealsAt IS NOT NULL AND jailSealsAt <= ?")
        .all(now) as { id: number }[]
    ).map((r) => r.id);
  }

  /** Everyone currently inside — the kiosk's most-wanted board, and what the
   *  roster reads to show who needs bailing. */
  prisoners(): {
    userId: number; jailedAt: number; jailSealsAt: number; debt: number; bail: number;
    plea: string | null; pot: number; contributors: { userId: number; amount: number }[];
  }[] {
    const rows = this.prep("SELECT id, jailedAt, jailSealsAt, cellPlea FROM users WHERE jailedAt IS NOT NULL AND deletedAt IS NULL")
      .all() as { id: number; jailedAt: number; jailSealsAt: number; cellPlea: string | null }[];
    return rows.map((r) => {
      const l = this.loanOf(r.id);
      const debt = l ? l.principal + interestFor(l.principal, l.rate) : 0;
      const pot = this.bailPot(r.id);
      return {
        userId: r.id, jailedAt: r.jailedAt, jailSealsAt: r.jailSealsAt, debt, bail: bailPrice(debt),
        plea: r.cellPlea ?? null, pot: pot.total, contributors: pot.contributors,
      };
    });
  }

  sealGrave(userId: number): { sealed: boolean } {
    return this.transaction(() => {
      const dead = this.getUserById(userId);
      if (!dead || !dead.diedAt) return { sealed: false };
      const row = this.prep("SELECT graveSealsAt FROM users WHERE id = ?").get(userId) as
        | { graveSealsAt: number | null }
        | undefined;
      if (row?.graveSealsAt == null) return { sealed: false }; // already sealed, or an old grave

      // CREDITORS FIRST, THEN THE ESTATE. The goblins are paid off the top of
      // whatever this life held, exactly as a sealing cell pays them — so the
      // next generation does not inherit a debt it cannot see (see
      // settleGoblinDebt). A cell has already settled by the time it gets
      // here, so this is a no-op on that path rather than a second charge.
      this.settleGoblinDebt(userId);

      const purse = this.getCoins(userId);
      const owned = this.getInventory(userId);
      const keptCodes = heirlooms(owned.map((e) => ({ code: e.code, tier: e.tier })));
      const keptSet = new Set(keptCodes);
      const keptCoins = inheritedCoins(purse);
      // The remainder, not another fraction — a second floor() here is exactly
      // where a coin would go missing.
      const estateCoins = purse - keptCoins;

      const heir = dead.willBeneficiaryId && dead.willBeneficiaryId !== userId
        ? this.getUserById(dead.willBeneficiaryId)
        : undefined;
      const heirOk = !!heir && !heir.disabled && !heir.isBot && !heir.locked;

      if (heirOk && estateCoins > 0) this.addCoins(heir!.id, estateCoins);
      // else: burned. Either way it leaves this wallet exactly once.
      this.prep("UPDATE users SET coins = ? WHERE id = ?").run(keptCoins, userId);

      // CHIPS AND FREE PULLS FOLLOW THE PURSE (Josh, Oct 2026): the same
      // quarter walks out of the grave and the rest goes to the will, or
      // burns. They used to come through every death whole. (The goblins
      // can't take them as payment — chips turned into vault silver would be
      // the converter the escape room forbids — so a debtor's chips simply
      // shrink here with everything else.)
      const bal = this.prep("SELECT chips, freePulls FROM users WHERE id = ?").get(userId) as { chips: number; freePulls: number };
      const keptChips = inheritedCoins(bal.chips), keptPulls = inheritedCoins(bal.freePulls);
      if (heirOk && (bal.chips > keptChips || bal.freePulls > keptPulls)) {
        this.prep("UPDATE users SET chips = chips + ?, freePulls = freePulls + ? WHERE id = ?")
          .run(bal.chips - keptChips, bal.freePulls - keptPulls, heir!.id);
      }
      this.prep("UPDATE users SET chips = ?, freePulls = ? WHERE id = ?").run(keptChips, keptPulls, userId);

      const placeholders = keptCodes.map(() => "?").join(",");
      const notKept = keptCodes.length ? ` AND code NOT IN (${placeholders})` : "";
      if (heirOk) {
        // Only what the heir lacks — binary ownership is never violated, and
        // the duplicates are buried with the dead exactly as they always were.
        this.prep(
            `UPDATE user_emoji SET userId = ?
             WHERE userId = ?${notKept}
               AND code NOT IN (SELECT code FROM user_emoji WHERE userId = ?)`,
          )
          .run(heir!.id, userId, ...keptCodes, heir!.id);
      }
      this.prep(`DELETE FROM user_emoji WHERE userId = ?${notKept}`)
        .run(userId, ...keptCodes);

      const bornAt = (
        this.prep("SELECT COALESCE(MAX(sealedAt), ?) AS t FROM lives WHERE userId = ?")
          .get(dead.createdAt, userId) as { t: number }
      ).t;
      // The cause was carved at death (migration 76; NULL on graves dug before
      // it), and the eulogies were said at THIS wake — both belong to the
      // monument. Read them now: standUp clears every grave-scoped row.
      const cause = (
        this.prep("SELECT deathCause AS c FROM users WHERE id = ?").get(userId) as { c: string | null }
      ).c;
      const eulogies = this.prep("SELECT byUserId, text, at FROM grave_eulogies WHERE deadUserId = ? ORDER BY at ASC")
        .all(userId) as { byUserId: number; text: string; at: number }[];
      this.prep(
          `INSERT OR IGNORE INTO lives
             (userId, generation, bornAt, diedAt, sealedAt, epitaph, coins, emojiCount, codes, keptCodes, keptCoins, deathCause, eulogies)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          userId,
          dead.generation ?? 1,
          bornAt,
          dead.diedAt,
          Date.now(),
          dead.epitaph ?? null,
          purse,
          owned.length,
          JSON.stringify(owned.map((e) => e.code)),
          JSON.stringify(keptCodes),
          keptCoins,
          cause,
          eulogies.length ? JSON.stringify(eulogies) : null,
        );

      if (!this.standUp(userId)) return { sealed: false };
      // The epitaph belongs to the life that just ended — it is carved on that
      // monument now. The will is a standing preference and stays.
      this.prep("UPDATE users SET generation = generation + 1, epitaph = NULL WHERE id = ?")
        .run(userId);
      // THE ESCAPE PASS DIES WITH THE LIFE (ESCAPE.md: an Inheritance does
      // NOT carry it — a new life re-stakes). A raise keeps it; the sealing
      // ends it, and the carried bag goes with the estate. Plain statements:
      // we are inside this transaction (Aug 2026 review — the pass used to
      // survive the generation bump).
      this.prep("DELETE FROM er_inventory WHERE userId = ?").run(userId);
      this.prep("UPDATE er_passes SET endedAt = ?, endReason = 'inheritance' WHERE userId = ? AND endedAt IS NULL")
        .run(Date.now(), userId);
      return { sealed: true };
    });
  }

  /** Every completed life, newest first — the graveyard's permanent monuments.
   *  A veteran on their third generation has two. */
  lives(): {
    userId: number;
    generation: number;
    bornAt: number;
    diedAt: number;
    sealedAt: number;
    epitaph: string | null;
    coins: number;
    emojiCount: number;
    keptCodes: string[];
    deathCause: string | null;
    eulogies: { byUserId: number; text: string; at: number }[];
  }[] {
    // Monuments of DELETED accounts stay buried with them — the scrub erased
    // the person, and the graveyard must not resurrect the name.
    const rows = this.prep(
        `SELECT l.userId AS userId, l.generation AS generation, l.bornAt AS bornAt, l.diedAt AS diedAt,
                l.sealedAt AS sealedAt, l.epitaph AS epitaph, l.coins AS coins, l.emojiCount AS emojiCount,
                l.keptCodes AS keptCodes, l.deathCause AS deathCause, l.eulogies AS eulogies
         FROM lives l JOIN users u ON u.id = l.userId
         WHERE u.deletedAt IS NULL
         ORDER BY l.sealedAt DESC`,
      )
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      userId: Number(r.userId),
      generation: Number(r.generation),
      bornAt: Number(r.bornAt),
      diedAt: Number(r.diedAt),
      sealedAt: Number(r.sealedAt),
      epitaph: (r.epitaph as string | null) ?? null,
      coins: Number(r.coins),
      emojiCount: Number(r.emojiCount),
      keptCodes: JSON.parse(String(r.keptCodes ?? "[]")) as string[],
      deathCause: (r.deathCause as string | null) ?? null,
      eulogies: JSON.parse(String(r.eulogies ?? "[]")) as { byUserId: number; text: string; at: number }[],
    }));
  }

  /** Set your epitaph (carved on the tombstone) and/or your will. Validation
   *  (length, beneficiary alive + not self) happens in the route. */
  setLegacy(userId: number, fields: { epitaph?: string | null; willBeneficiaryId?: number | null }): void {
    if (fields.epitaph !== undefined) {
      this.prep("UPDATE users SET epitaph = ? WHERE id = ?").run(fields.epitaph, userId);
    }
    if (fields.willBeneficiaryId !== undefined) {
      this.prep("UPDATE users SET willBeneficiaryId = ? WHERE id = ?")
        .run(fields.willBeneficiaryId, userId);
    }
  }

  /** The graveyard: every fallen member with epitaph + respects + standing
   *  tributes, newest first. Prunes decayed tributes first (the lazy half of
   *  the sweep, like the auction house). */
  graveyard(now = Date.now()): {
    user: PublicUser;
    diedAt: number;
    epitaph: string | null;
    deathCause: string | null;
    buriedWith: number;
    respects: { code: string; userIds: number[] }[];
    tributes: { kind: string; byUserId: number; at: number }[];
  }[] {
    this.pruneTributes(now);
    // A DELETED account has no grave (Josh, Aug 2026): scrubUser erased the
    // person, and a tombstone with a scrubbed name on it is just a hole in
    // the ground with a mystery attached.
    const rows = this.prep(
        "SELECT id, epitaph, diedAt, deathCause FROM users WHERE diedAt IS NOT NULL AND deletedAt IS NULL ORDER BY diedAt DESC",
      )
      .all() as { id: number; epitaph: string | null; diedAt: number; deathCause: string | null }[];
    return rows.flatMap((r) => {
      const u = this.getUserById(r.id);
      if (!u) return [];
      const rx = this.prep("SELECT code, userId FROM grave_respects WHERE deadUserId = ? ORDER BY createdAt ASC")
        .all(r.id) as { code: string; userId: number }[];
      const byCode = new Map<string, number[]>();
      for (const x of rx) (byCode.get(x.code) ?? byCode.set(x.code, []).get(x.code)!).push(x.userId);
      const tributes = this.prep("SELECT kind, byUserId, at FROM grave_tributes WHERE deadUserId = ? ORDER BY at ASC")
        .all(r.id) as { kind: string; byUserId: number; at: number }[];
      return [{
        user: toPublicUser(u),
        diedAt: r.diedAt,
        epitaph: r.epitaph,
        deathCause: r.deathCause,
        buriedWith: this.inventoryCount(r.id),
        respects: [...byCode.entries()].map(([code, userIds]) => ({ code, userIds })),
        tributes,
      }];
    });
  }

  /** Sweep tributes past their kind's lifespan out of the ground. */
  private pruneTributes(now = Date.now()): void {
    this.prep("DELETE FROM grave_tributes WHERE (kind = 'candle' AND at <= ?) OR (kind = 'flowers' AND at <= ?)")
      .run(now - tributeGoneMs("candle"), now - tributeGoneMs("flowers"));
  }

  /** LEAVE A TRIBUTE — a candle or flowers on a grave. The price BURNS (the
   *  Vault-buy-in shape: the Wheel stays the only faucet), and every refusal
   *  is checked before the wallet is touched (the jukebox rule). One standing
   *  tribute per (grave, mourner, kind) — you relight a candle after it
   *  gutters, not while it burns. */
  leaveTribute(
    deadUserId: number,
    byUserId: number,
    kind: TributeKind,
    price: number,
    now = Date.now(),
  ): { ok: true; coins: number } | { error: string } {
    return this.transaction(() => {
      const dead = this.getUserById(deadUserId);
      if (!dead || dead.diedAt === null || dead.deletedAt) return { error: "not_dead" };
      const existing = this.prep("SELECT at FROM grave_tributes WHERE deadUserId = ? AND byUserId = ? AND kind = ?")
        .all(deadUserId, byUserId, kind) as { at: number }[];
      if (existing.some((t) => tributeActive(kind, t.at, now))) return { error: "already_standing" };
      const left = this.spendCoins(byUserId, price);
      if (left === null) return { error: "insufficient" };
      this.prep("INSERT INTO grave_tributes (deadUserId, byUserId, kind, at) VALUES (?, ?, ?, ?)")
        .run(deadUserId, byUserId, kind, now);
      return { ok: true as const, coins: left };
    });
  }

  /** Write (or rewrite) your eulogy on a grave. One per mourner per grave —
   *  the UNIQUE key makes a rewrite replace, never stack. Free: words cost
   *  nothing. Validation (length, the grave being real) lives in the route. */
  setEulogy(deadUserId: number, byUserId: number, text: string): void {
    this.prep(
        `INSERT INTO grave_eulogies (deadUserId, byUserId, text, at) VALUES (?, ?, ?, ?)
         ON CONFLICT(deadUserId, byUserId) DO UPDATE SET text = excluded.text, at = excluded.at`,
      )
      .run(deadUserId, byUserId, text, Date.now());
  }

  /** Remove a eulogy — its author taking it back, or staff sweeping it. */
  deleteEulogy(deadUserId: number, byUserId: number): boolean {
    const r = this.prep("DELETE FROM grave_eulogies WHERE deadUserId = ? AND byUserId = ?")
      .run(deadUserId, byUserId);
    return Number(r.changes) > 0;
  }

  graveEulogies(deadUserId: number): { byUserId: number; text: string; at: number }[] {
    return this.prep("SELECT byUserId, text, at FROM grave_eulogies WHERE deadUserId = ? ORDER BY at ASC")
      .all(deadUserId) as { byUserId: number; text: string; at: number }[];
  }

  /** THE MEMORIAL: one account's whole story with death — every sealed life,
   *  every revival, and (if they lie dead right now) the open grave's cause.
   *  Everything here is already public knowledge (monuments carry their
   *  estates, raises broadcast loudly) EXCEPT a self-revival's burned purse,
   *  which would leak what a living player once held — so `cost` rides the
   *  wire only for the fixed-price kinds. */
  memorial(userId: number): {
    lives: ReturnType<Store["lives"]>;
    revivals: { byUserId: number | null; kind: string; cost: number | null; mythicCode: string | null; at: number }[];
  } | null {
    const u = this.getUserById(userId);
    // A deleted account has no memorial — the scrub erased the person.
    if (!u || u.deletedAt != null) return null;
    const lives = this.lives().filter((l) => l.userId === userId);
    const revivals = (
      this.prep("SELECT byUserId, kind, cost, mythicCode, at FROM revivals WHERE userId = ? ORDER BY at DESC")
        .all(userId) as { byUserId: number | null; kind: string; cost: number; mythicCode: string | null; at: number }[]
    ).map((r) => ({ ...r, cost: r.kind === "self" ? null : r.cost }));
    return { lives, revivals };
  }

  /** Every death that stands forever, for the sexton's calendar: sealed lives
   *  (monuments) and pre-migration-68 graves that never seal. A FRESH grave is
   *  excluded — its story isn't over, and its owner may yet walk out of it. */
  fallenForRemembrance(): { userId: number; name: string; diedAt: number }[] {
    return this.prep(
        `SELECT l.userId AS userId, u.displayName AS name, l.diedAt AS diedAt
           FROM lives l JOIN users u ON u.id = l.userId WHERE u.deletedAt IS NULL
         UNION ALL
         SELECT id, displayName, diedAt FROM users
          WHERE diedAt IS NOT NULL AND graveSealsAt IS NULL AND deletedAt IS NULL`,
      )
      .all() as { userId: number; name: string; diedAt: number }[];
  }

  /** THE NECROLOGY — the morbid ledger at the gate. Aggregates only, never a
   *  living wallet. Cause counts are FORWARD-looking (pre-76 stones read
   *  "unwitnessed"); talisman saves + reaper blinks count from the same
   *  migration via user_stats. */
  necrology(now = Date.now()): Record<string, number> {
    const v = (sql: string, ...a: unknown[]): number =>
      Number((this.prep(sql).get(...(a as [])) as Record<string, unknown>).v ?? 0);
    // Deleted accounts are absent here too — the necrology counts the graves
    // the graveyard actually shows.
    const live = "JOIN users u ON u.id = lives.userId WHERE u.deletedAt IS NULL";
    const lastDeath = v(
      "SELECT MAX(t) AS v FROM (" +
        `SELECT MAX(lives.diedAt) AS t FROM lives ${live} ` +
        "UNION ALL SELECT MAX(diedAt) FROM users WHERE deletedAt IS NULL)",
    );
    return {
      deaths:
        v(`SELECT COUNT(*) AS v FROM lives ${live}`) +
        v("SELECT COUNT(*) AS v FROM users WHERE diedAt IS NOT NULL AND deletedAt IS NULL"),
      byWheel:
        v(`SELECT COUNT(*) AS v FROM lives ${live} AND lives.deathCause = 'wheel'`) +
        v("SELECT COUNT(*) AS v FROM users WHERE diedAt IS NOT NULL AND deathCause = 'wheel' AND deletedAt IS NULL"),
      byGoblins:
        v(`SELECT COUNT(*) AS v FROM lives ${live} AND lives.deathCause = 'goblins'`) +
        v("SELECT COUNT(*) AS v FROM users WHERE diedAt IS NOT NULL AND deathCause = 'goblins' AND deletedAt IS NULL"),
      raises: v("SELECT COUNT(*) AS v FROM revivals WHERE kind = 'silver' OR kind = 'mythic'"),
      selfRevivals: v("SELECT COUNT(*) AS v FROM revivals WHERE kind = 'self'"),
      silverBurnedRaising: v("SELECT COALESCE(SUM(cost),0) AS v FROM revivals WHERE kind = 'silver'"),
      mythicsBurnedRaising: v("SELECT COUNT(*) AS v FROM revivals WHERE kind = 'mythic'"),
      generationsWalking: v("SELECT COALESCE(MAX(generation),1) AS v FROM users WHERE isBot = 0 AND deletedAt IS NULL"),
      talismanSaves: v("SELECT COALESCE(SUM(value),0) AS v FROM user_stats WHERE key = 'talisman_saves'"),
      reaperBlinks: v("SELECT COALESCE(SUM(value),0) AS v FROM user_stats WHERE key = 'reaper_blinks'"),
      daysSinceLastDeath: lastDeath > 0 ? Math.floor((now - lastDeath) / 86_400_000) : -1,
    };
  }

  /** Toggle an owned-emoji respect on a grave. Returns the resulting state. */
  toggleGraveRespect(deadUserId: number, userId: number, code: string): boolean {
    const existing = this.prep("SELECT 1 FROM grave_respects WHERE deadUserId = ? AND userId = ? AND code = ?")
      .get(deadUserId, userId, code);
    if (existing) {
      this.prep("DELETE FROM grave_respects WHERE deadUserId = ? AND userId = ? AND code = ?")
        .run(deadUserId, userId, code);
      return false;
    }
    this.prep("INSERT INTO grave_respects (deadUserId, userId, code, createdAt) VALUES (?, ?, ?, ?)")
      .run(deadUserId, userId, code, Date.now());
    return true;
  }

  /** Admin: bring a tombstoned account back — clears disabled, death, and any pending rig. */
  reviveUser(userId: number): void {
    // The whole grave resolves, as a raise's does (Oct 2026 review): leaving
    // graveSealsAt set had the grave sweep re-select a living account every
    // minute, and the old grave's rows resurfaced on the account's next death.
    this.transaction(() => {
      this.prep(
          "UPDATE users SET disabled = 0, diedAt = NULL, graveSealsAt = NULL, deathCause = NULL, riggedNextSpin = NULL WHERE id = ?",
        )
        .run(userId);
      this.clearGraveRows(userId);
      this.prep("UPDATE loans SET lastDay = ? WHERE userId = ?").run(dayKey(Date.now()), userId);
    });
  }

  // ---- Boards ------------------------------------------------------------

  /** Collectors ranked by a rarity-weighted score. Dead users still appear. */
  leaderboard(limit = 25): {
    id: number; username: string; displayName: string;
    count: number; score: number; legendary: number; mythic: number; diedAt: number | null;
  }[] {
    return this.prep(
        `SELECT u.id, u.username, u.displayName, u.diedAt,
                COUNT(*) AS count,
                SUM(CASE e.tier WHEN 'common' THEN 1 WHEN 'rare' THEN 3
                                WHEN 'legendary' THEN 10 WHEN 'mythic' THEN 25
                                WHEN 'talisman' THEN 15 ELSE 1 END) AS score,
                SUM(CASE WHEN e.tier = 'legendary' THEN 1 ELSE 0 END) AS legendary,
                SUM(CASE WHEN e.tier = 'mythic'    THEN 1 ELSE 0 END) AS mythic
         FROM users u
         JOIN user_emoji ue ON ue.userId = u.id
         JOIN emoji e ON e.code = ue.code
         WHERE u.isAdmin = 0 AND u.isBot = 0 AND u.deletedAt IS NULL
         GROUP BY u.id
         ORDER BY score DESC, count DESC
         LIMIT ?`,
      )
      .all(limit) as any[];
  }

  /** The fallen, most recent first. */
  deaths(limit = 50): { id: number; username: string; displayName: string; diedAt: number }[] {
    return this.prep(
        `SELECT id, username, displayName, diedAt FROM users
         WHERE diedAt IS NOT NULL AND deletedAt IS NULL ORDER BY diedAt DESC LIMIT ?`,
      )
      .all(limit) as any[];
  }

  /** Top collectors of a single tier (who owns the most of it). */
  leaderboardByTier(tier: string, limit = 5): {
    id: number; displayName: string; count: number; diedAt: number | null;
  }[] {
    return this.prep(
        `SELECT u.id, u.displayName, u.diedAt, COUNT(*) AS count
         FROM users u JOIN user_emoji ue ON ue.userId = u.id JOIN emoji e ON e.code = ue.code
         WHERE e.tier = ? AND u.isAdmin = 0 AND u.isBot = 0 AND u.deletedAt IS NULL
         GROUP BY u.id ORDER BY count DESC, u.id LIMIT ?`,
      )
      .all(tier, limit) as any[];
  }

  /** The whole catalog grouped by tier (for the unlockables gallery + wheel prizes). */
  catalogByTier(): Record<string, { code: string; name: string; file: string; animated: boolean }[]> {
    const rows = this.prep("SELECT code, tier, name, file, animated FROM emoji ORDER BY tier, code")
      .all() as any[];
    const out: Record<string, any[]> = {};
    for (const r of rows) {
      (out[r.tier] ??= []).push({ code: r.code, name: r.name, file: r.file, animated: !!r.animated });
    }
    return out;
  }

  // ---- THE JUKEBOX's record library (migration 67) ---------------------------
  // The catalogue only. What is PLAYING lives in memory in casino/jukebox.ts —
  // a restart should drop the room back to shuffle, not resume a song nobody
  // is still standing there for.

  jukeboxSongs(): JukeboxSong[] {
    return this.prep(
        `SELECT id, title, artist, file, durationMs, addedBy, addedAt, plays
           FROM jukebox_songs ORDER BY artist COLLATE NOCASE, title COLLATE NOCASE`,
      )
      .all() as unknown as JukeboxSong[];
  }

  jukeboxSong(id: number): JukeboxSong | null {
    const row = this.prep(
        `SELECT id, title, artist, file, durationMs, addedBy, addedAt, plays
           FROM jukebox_songs WHERE id = ?`,
      )
      .get(id) as unknown as JukeboxSong | undefined;
    return row ?? null;
  }

  /** Insert a record. `file` is UUID-named, so the UNIQUE index is the guard
   *  against a double-add of the same upload. */
  addJukeboxSong(s: {
    title: string;
    artist: string;
    file: string;
    durationMs: number;
    addedBy: number | null;
  }): JukeboxSong {
    const info = this.prep(
        `INSERT INTO jukebox_songs (title, artist, file, durationMs, addedBy, addedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(s.title, s.artist, s.file, Math.max(1000, Math.round(s.durationMs)), s.addedBy, Date.now());
    return this.jukeboxSong(Number(info.lastInsertRowid))!;
  }

  /** Retitle a record (the admin screen's rename). Never touches the file. */
  renameJukeboxSong(id: number, title: string, artist: string): JukeboxSong | null {
    this.prep("UPDATE jukebox_songs SET title = ?, artist = ? WHERE id = ?").run(title, artist, id);
    return this.jukeboxSong(id);
  }

  /** Pull a record from the library. Returns its filename so the caller can
   *  unlink the MP3 — the row and the file go together. */
  removeJukeboxSong(id: number): string | null {
    const row = this.prep("SELECT file FROM jukebox_songs WHERE id = ?").get(id) as
      | { file: string }
      | undefined;
    if (!row) return null;
    this.prep("DELETE FROM jukebox_songs WHERE id = ?").run(id);
    return row.file;
  }

  bumpJukeboxPlays(id: number): void {
    this.prep("UPDATE jukebox_songs SET plays = plays + 1 WHERE id = ?").run(id);
  }

  // ---- Casino items: the gun + the locker (migration 69) --------------------
  // See src/casino/items.ts for the vocabulary. Every price BURNS (the
  // drink/talisman shape) — the only mint on this floor stays the Wheel.

  casinoInv(userId: number): { item: string; qty: number }[] {
    return this.prep("SELECT item, qty FROM casino_inv WHERE userId = ? ORDER BY item")
      .all(userId) as unknown as { item: string; qty: number }[];
  }

  casinoLocker(userId: number): { slot: number; item: string; qty: number }[] {
    return this.prep("SELECT slot, item, qty FROM casino_locker WHERE userId = ? ORDER BY slot")
      .all(userId) as unknown as { slot: number; item: string; qty: number }[];
  }

  /** Rounds in the CARRIED gun, or null if no gun is carried. The floor's
   *  hold-frame check — a gun parked in the locker can't be drawn. */
  casinoGunRounds(userId: number): number | null {
    const row = this.prep("SELECT qty FROM casino_inv WHERE userId = ? AND item = 'gun'")
      .get(userId) as { qty: number } | undefined;
    return row ? row.qty : null;
  }

  /** Sterling's big-ticket sale. Refuses a second gun WHEREVER the first one
   *  is — carried or lockered — then burns the price and hands over a loaded
   *  gun plus one spare clip, all in one transaction. */
  buyCasinoGun(userId: number, price: number, rounds: number): { ok: true; coins: number } | { ok: false; error: string } {
    return this.transaction(() => {
      const owned =
        this.prep("SELECT 1 FROM casino_inv WHERE userId = ? AND item = 'gun'").get(userId) ??
        this.prep("SELECT 1 FROM casino_locker WHERE userId = ? AND item = 'gun'").get(userId);
      if (owned) return { ok: false as const, error: "gun_owned" };
      const left = this.spendCoins(userId, price);
      if (left === null) return { ok: false as const, error: "insufficient" };
      this.prep("INSERT INTO casino_inv (userId, item, qty) VALUES (?, 'gun', ?)")
        .run(userId, rounds);
      this.prep(
          `INSERT INTO casino_inv (userId, item, qty) VALUES (?, 'clip', 1)
           ON CONFLICT(userId, item) DO UPDATE SET qty = qty + 1`,
        )
        .run(userId);
      return { ok: true as const, coins: left };
    });
  }

  /** The house hands somebody a loaded gun and spare clips, charging nothing
   *  (THE LAST NIGHT'S PISTOL, Oct 19 2026: a regular, never a player). A gun
   *  already owned is just topped up to full, and the clips added. */
  grantCasinoGun(userId: number, rounds: number, clips: number): void {
    this.transaction(() => {
      const has = this.prep("SELECT 1 FROM casino_inv WHERE userId = ? AND item = 'gun'").get(userId);
      if (has) this.prep("UPDATE casino_inv SET qty = ? WHERE userId = ? AND item = 'gun'").run(rounds, userId);
      else this.prep("INSERT INTO casino_inv (userId, item, qty) VALUES (?, 'gun', ?)").run(userId, rounds);
      if (clips > 0) {
        this.prep(
            `INSERT INTO casino_inv (userId, item, qty) VALUES (?, 'clip', ?)
             ON CONFLICT(userId, item) DO UPDATE SET qty = qty + excluded.qty`,
          )
          .run(userId, clips);
      }
    });
  }

  /** A spare magazine. Refused without a gun somewhere — Sterling doesn't sell
   *  ammunition to the unarmed, and it stops the listing being a burn trap. */
  buyCasinoClip(userId: number, price: number): { ok: true; coins: number; clips: number } | { ok: false; error: string } {
    return this.transaction(() => {
      const owned =
        this.prep("SELECT 1 FROM casino_inv WHERE userId = ? AND item = 'gun'").get(userId) ??
        this.prep("SELECT 1 FROM casino_locker WHERE userId = ? AND item = 'gun'").get(userId);
      if (!owned) return { ok: false as const, error: "no_gun" };
      const left = this.spendCoins(userId, price);
      if (left === null) return { ok: false as const, error: "insufficient" };
      this.prep(
          `INSERT INTO casino_inv (userId, item, qty) VALUES (?, 'clip', 1)
           ON CONFLICT(userId, item) DO UPDATE SET qty = qty + 1`,
        )
        .run(userId);
      const clips = (this.prep("SELECT qty FROM casino_inv WHERE userId = ? AND item = 'clip'").get(userId) as { qty: number }).qty;
      return { ok: true as const, coins: left, clips };
    });
  }

  /** One round leaves the chamber — the guarded decrement IS the ammo rule:
   *  no carried gun or an empty one and nothing happens. Returns rounds left,
   *  or null for a dry trigger. */
  casinoSpendRound(userId: number): number | null {
    const info = this.prep("UPDATE casino_inv SET qty = qty - 1 WHERE userId = ? AND item = 'gun' AND qty > 0")
      .run(userId);
    if (info.changes === 0) return null;
    return this.casinoGunRounds(userId);
  }

  /** Swap magazines: a spare clip becomes a full gun. The part-used mag is
   *  discarded with whatever it held — a mag swap, not a bullet-counting
   *  top-up — and reloading a full gun is refused so the clip isn't wasted. */
  casinoReload(userId: number, fullRounds: number): { ok: true; rounds: number; clips: number } | { ok: false; error: string } {
    return this.transaction(() => {
      const gun = this.prep("SELECT qty FROM casino_inv WHERE userId = ? AND item = 'gun'")
        .get(userId) as { qty: number } | undefined;
      if (!gun) return { ok: false as const, error: "no_gun" };
      if (gun.qty >= fullRounds) return { ok: false as const, error: "already_full" };
      const took = this.prep("UPDATE casino_inv SET qty = qty - 1 WHERE userId = ? AND item = 'clip' AND qty > 0")
        .run(userId);
      if (took.changes === 0) return { ok: false as const, error: "no_clip" };
      this.prep("DELETE FROM casino_inv WHERE userId = ? AND item = 'clip' AND qty <= 0").run(userId);
      this.prep("UPDATE casino_inv SET qty = ? WHERE userId = ? AND item = 'gun'").run(fullRounds, userId);
      const clip = this.prep("SELECT qty FROM casino_inv WHERE userId = ? AND item = 'clip'").get(userId) as { qty: number } | undefined;
      return { ok: true as const, rounds: fullRounds, clips: clip?.qty ?? 0 };
    });
  }

  /** Put a carried item into the locker. A `targetSlot` (the UI's organizing
   *  click) must be empty — or hold the same stackable item, which merges;
   *  with no target, clips merge into their existing stack and anything else
   *  takes the first free slot under the cap. All-or-nothing: short
   *  inventory, a full locker or an occupied target moves nothing. */
  casinoStoreItem(
    userId: number,
    item: string,
    qty: number,
    maxSlots: number,
    targetSlot?: number,
  ): { ok: true; slot: number } | { ok: false; error: string } {
    return this.transaction(() => {
      if (!Number.isInteger(qty) || qty <= 0) return { ok: false as const, error: "bad_qty" };
      const have = this.prep("SELECT qty FROM casino_inv WHERE userId = ? AND item = ?")
        .get(userId, item) as { qty: number } | undefined;
      // The gun's qty is its LOAD, not a count — it moves whole, whatever the
      // caller passed for qty.
      const moveQty = item === "gun" ? (have?.qty ?? 0) : qty;
      if (!have || (item !== "gun" && have.qty < qty)) return { ok: false as const, error: "not_carried" };
      let slot: number;
      if (targetSlot !== undefined) {
        if (!Number.isInteger(targetSlot) || targetSlot < 0 || targetSlot >= maxSlots)
          return { ok: false as const, error: "bad_slot" };
        const there = this.prep("SELECT item FROM casino_locker WHERE userId = ? AND slot = ?")
          .get(userId, targetSlot) as { item: string } | undefined;
        if (there && (there.item !== item || item === "gun"))
          return { ok: false as const, error: "slot_taken" };
        slot = targetSlot;
        if (there) {
          this.prep("UPDATE casino_locker SET qty = qty + ? WHERE userId = ? AND slot = ?")
            .run(moveQty, userId, slot);
        } else {
          this.prep("INSERT INTO casino_locker (userId, slot, item, qty) VALUES (?, ?, ?, ?)")
            .run(userId, slot, item, moveQty);
        }
      } else {
        // merge clips into the stack they already have going
        const merge =
          item === "gun"
            ? undefined
            : (this.prep("SELECT slot FROM casino_locker WHERE userId = ? AND item = ?")
                .get(userId, item) as { slot: number } | undefined);
        if (merge) {
          slot = merge.slot;
          this.prep("UPDATE casino_locker SET qty = qty + ? WHERE userId = ? AND slot = ?")
            .run(moveQty, userId, slot);
        } else {
          const used = new Set(
            (this.prep("SELECT slot FROM casino_locker WHERE userId = ?").all(userId) as { slot: number }[]).map((r) => r.slot),
          );
          let free = -1;
          for (let s = 0; s < maxSlots; s++) if (!used.has(s)) { free = s; break; }
          if (free < 0) return { ok: false as const, error: "locker_full" };
          slot = free;
          this.prep("INSERT INTO casino_locker (userId, slot, item, qty) VALUES (?, ?, ?, ?)")
            .run(userId, slot, item, moveQty);
        }
      }
      if (item === "gun" || have.qty === moveQty) {
        this.prep("DELETE FROM casino_inv WHERE userId = ? AND item = ?").run(userId, item);
      } else {
        this.prep("UPDATE casino_inv SET qty = qty - ? WHERE userId = ? AND item = ?").run(moveQty, userId, item);
      }
      return { ok: true as const, slot };
    });
  }

  /** Rearrange the locker: move a slot's contents to another slot — SWAPPING
   *  if the destination is occupied. Pure organisation; nothing enters or
   *  leaves the locker, so there is nothing here to conserve but sanity. */
  casinoMoveSlot(
    userId: number,
    from: number,
    to: number,
  ): { ok: true } | { ok: false; error: string } {
    return this.transaction(() => {
      if (from === to) return { ok: true as const };
      const a = this.prep("SELECT item, qty FROM casino_locker WHERE userId = ? AND slot = ?")
        .get(userId, from) as { item: string; qty: number } | undefined;
      if (!a) return { ok: false as const, error: "empty_slot" };
      const bRow = this.prep("SELECT item, qty FROM casino_locker WHERE userId = ? AND slot = ?")
        .get(userId, to) as { item: string; qty: number } | undefined;
      this.prep("DELETE FROM casino_locker WHERE userId = ? AND slot IN (?, ?)").run(userId, from, to);
      this.prep("INSERT INTO casino_locker (userId, slot, item, qty) VALUES (?, ?, ?, ?)").run(userId, to, a.item, a.qty);
      if (bRow) {
        this.prep("INSERT INTO casino_locker (userId, slot, item, qty) VALUES (?, ?, ?, ?)").run(userId, from, bRow.item, bRow.qty);
      }
      return { ok: true as const };
    });
  }

  /** Take a slot's contents back into carried inventory. */
  casinoTakeItem(userId: number, slot: number): { ok: true; item: string; qty: number } | { ok: false; error: string } {
    return this.transaction(() => {
      const row = this.prep("SELECT item, qty FROM casino_locker WHERE userId = ? AND slot = ?")
        .get(userId, slot) as { item: string; qty: number } | undefined;
      if (!row) return { ok: false as const, error: "empty_slot" };
      this.prep("DELETE FROM casino_locker WHERE userId = ? AND slot = ?").run(userId, slot);
      this.prep(
          `INSERT INTO casino_inv (userId, item, qty) VALUES (?, ?, ?)
           ON CONFLICT(userId, item) DO UPDATE SET qty = qty + excluded.qty`,
        )
        .run(userId, row.item, row.qty);
      return { ok: true as const, item: row.item, qty: row.qty };
    });
  }

  // ---- The Casino Escape Room (migration 70; design ESCAPE.md) -------------
  // Every price BURNS. The stake burns the EMOJI. Nothing here mints — the
  // chest tables (E3) will be the one sanctioned mint, with their own audit.

  /** The active pass, or undefined. endedAt NULL = alive. */
  erPass(userId: number): { id: number; code: string; at: number } | undefined {
    return this.prep("SELECT id, code, at FROM er_passes WHERE userId = ? AND endedAt IS NULL")
      .get(userId) as { id: number; code: string; at: number } | undefined;
  }

  /** Stake one owned emoji of the required tier for THE PASS. The emoji is
   *  DESTROYED here and now — there is no returning condition (no win refunds
   *  it, only death ends it), so escrow would be machinery with no purpose. */
  erStakePass(
    userId: number,
    code: string,
    tier: string,
  ): { ok: true } | { ok: false; error: string } {
    return this.transaction(() => {
      if (this.erPass(userId)) return { ok: false as const, error: "already_passed" };
      const owned = this.prep("SELECT 1 FROM user_emoji WHERE userId = ? AND code = ?")
        .get(userId, code);
      if (!owned) return { ok: false as const, error: "not_owned" };
      const e = this.getEmoji(code);
      if (!e || e.tier !== tier) return { ok: false as const, error: "wrong_tier" };
      this.removeEmoji(userId, code); // the burn
      this.prep("INSERT INTO er_passes (userId, code, at) VALUES (?, ?, ?)")
        .run(userId, code, Date.now());
      return { ok: true as const };
    });
  }

  /** Public grant into the bag (the zone's key pickup) — same slot law as
   *  the counter. Returns false (and moves nothing) when the bag is full. */
  erGrantItem(userId: number, item: string, qty: number, maxSlots: number): boolean {
    return this.transaction(() => this.erGrant(userId, item, qty, maxSlots));
  }

  /** Drink/use ONE charge from a carried stack — the guarded decrement is
   *  the rule (nothing carried, nothing happens), the empty row is swept. */
  erConsumeItem(userId: number, item: string): boolean {
    const info = this.prep("UPDATE er_inventory SET qty = qty - 1 WHERE userId = ? AND item = ? AND qty > 0")
      .run(userId, item);
    if (info.changes === 0) return false;
    this.prep("DELETE FROM er_inventory WHERE userId = ? AND item = ? AND qty <= 0").run(userId, item);
    return true;
  }

  /** Remove one stack outright (the key being used, reset, or crumbling). */
  erRemoveItem(userId: number, item: string): void {
    this.prep("DELETE FROM er_inventory WHERE userId = ? AND item = ?").run(userId, item);
  }

  /** Boot hygiene: THE KEY is live-session state — a crash must not strand
   *  it in a bag or the complex is keyless forever. */
  erClearKeys(): void {
    this.prep("DELETE FROM er_inventory WHERE item = 'key'").run();
    // The locker never legally holds a key (the route refuses it), but any
    // phantom row from before that rule sweeps out here — a key is live
    // zone state wherever it sits.
    this.prep("DELETE FROM er_locker WHERE item = 'key'").run();
  }

  /** Death inside (or an admin scrub) ends the pass. Idempotent. */
  erRevokePass(userId: number, reason: string): boolean {
    const info = this.prep("UPDATE er_passes SET endedAt = ?, endReason = ? WHERE userId = ? AND endedAt IS NULL")
      .run(Date.now(), reason, userId);
    return info.changes > 0;
  }

  erInventory(userId: number): { item: string; qty: number }[] {
    return this.prep("SELECT item, qty FROM er_inventory WHERE userId = ? ORDER BY item")
      .all(userId) as unknown as { item: string; qty: number }[];
  }

  erLocker(userId: number): { item: string; qty: number }[] {
    return this.prep("SELECT item, qty FROM er_locker WHERE userId = ? ORDER BY item")
      .all(userId) as unknown as { item: string; qty: number }[];
  }

  /** Grant into the carried bag, honouring the DISTINCT-item slot cap
   *  (stacks share a slot). Refusal must cost nothing — callers charge only
   *  after this succeeds, or inside the same txn. */
  private erGrant(userId: number, item: string, qty: number, maxSlots: number): boolean {
    const have = this.prep("SELECT qty FROM er_inventory WHERE userId = ? AND item = ?")
      .get(userId, item) as { qty: number } | undefined;
    if (!have) {
      const slots = (
        this.prep("SELECT COUNT(*) AS n FROM er_inventory WHERE userId = ?").get(userId) as { n: number }
      ).n;
      if (slots >= maxSlots) return false;
    }
    this.prep(
        `INSERT INTO er_inventory (userId, item, qty) VALUES (?, ?, ?)
         ON CONFLICT(userId, item) DO UPDATE SET qty = qty + excluded.qty`,
      )
      .run(userId, item, qty);
    return true;
  }

  /** Sterling's ante-room counter: burn the price, hand over the tool. The
   *  slot check runs BEFORE the wallet is touched (the jukebox rule: every
   *  refusal is free). */
  erBuyTool(
    userId: number,
    item: string,
    price: number,
    maxSlots: number,
  ): { ok: true; coins: number } | { ok: false; error: string } {
    return this.transaction(() => {
      const have = this.prep("SELECT 1 FROM er_inventory WHERE userId = ? AND item = ?")
        .get(userId, item);
      if (!have) {
        const slots = (
          this.prep("SELECT COUNT(*) AS n FROM er_inventory WHERE userId = ?").get(userId) as { n: number }
        ).n;
        if (slots >= maxSlots) return { ok: false as const, error: "bag_full" };
      }
      const left = this.spendCoins(userId, price);
      if (left === null) return { ok: false as const, error: "insufficient" };
      if (!this.erGrant(userId, item, 1, maxSlots)) {
        // Unreachable given the pre-check, but the txn makes even a logic slip
        // refund rather than eat the coins.
        throw new Error("er_grant_failed");
      }
      return { ok: true as const, coins: left };
    });
  }

  /** Bag → locker. What you carry dies with you; what you locker survives. */
  erLockerStore(
    userId: number,
    item: string,
    qty: number,
    maxLocker: number,
  ): { ok: true } | { ok: false; error: string } {
    return this.transaction(() => {
      if (!Number.isInteger(qty) || qty < 1) return { ok: false as const, error: "bad_qty" };
      const have = this.prep("SELECT qty FROM er_inventory WHERE userId = ? AND item = ?")
        .get(userId, item) as { qty: number } | undefined;
      if (!have || have.qty < qty) return { ok: false as const, error: "not_carried" };
      const inLocker = this.prep("SELECT 1 FROM er_locker WHERE userId = ? AND item = ?")
        .get(userId, item);
      if (!inLocker) {
        const slots = (
          this.prep("SELECT COUNT(*) AS n FROM er_locker WHERE userId = ?").get(userId) as { n: number }
        ).n;
        if (slots >= maxLocker) return { ok: false as const, error: "locker_full" };
      }
      this.prep("UPDATE er_inventory SET qty = qty - ? WHERE userId = ? AND item = ?")
        .run(qty, userId, item);
      this.prep("DELETE FROM er_inventory WHERE userId = ? AND item = ? AND qty <= 0").run(userId, item);
      this.prep(
          `INSERT INTO er_locker (userId, item, qty) VALUES (?, ?, ?)
           ON CONFLICT(userId, item) DO UPDATE SET qty = qty + excluded.qty`,
        )
        .run(userId, item, qty);
      return { ok: true as const };
    });
  }

  /** Locker → bag. Refused if the bag has no slot for a new item kind. */
  erLockerTake(
    userId: number,
    item: string,
    qty: number,
    maxSlots: number,
  ): { ok: true } | { ok: false; error: string } {
    return this.transaction(() => {
      if (!Number.isInteger(qty) || qty < 1) return { ok: false as const, error: "bad_qty" };
      const have = this.prep("SELECT qty FROM er_locker WHERE userId = ? AND item = ?")
        .get(userId, item) as { qty: number } | undefined;
      if (!have || have.qty < qty) return { ok: false as const, error: "not_stored" };
      if (!this.erGrant(userId, item, qty, maxSlots)) return { ok: false as const, error: "bag_full" };
      this.prep("UPDATE er_locker SET qty = qty - ? WHERE userId = ? AND item = ?")
        .run(qty, userId, item);
      this.prep("DELETE FROM er_locker WHERE userId = ? AND item = ? AND qty <= 0").run(userId, item);
      return { ok: true as const };
    });
  }

  getChips(userId: number): number {
    const row = this.prep("SELECT chips FROM users WHERE id = ?").get(userId) as { chips: number } | undefined;
    return row?.chips ?? 0;
  }

  addChips(userId: number, n: number): void {
    if (n <= 0) return;
    this.prep("UPDATE users SET chips = chips + ? WHERE id = ?").run(n, userId);
  }

  /** THE HOUSE-GAME DEBIT (E3b): chips first, silver for the rest. PLAIN
   *  STATEMENTS, no transaction of its own — its callers (bjPlaceBet,
   *  rouletteBet, slots' pull) are already transactional, and transaction()
   *  DOES NOT NEST (the killUser rule). The silver guard runs before any
   *  mutation, so a standalone call is still refuse-free. Returns the split
   *  (the escrow row records `chips` so every REFUND path can give chips
   *  back as chips — refunding them as silver would be a free 1:1 converter,
   *  ESCAPE.md's standing warning), or null untouched. */
  spendCoinsChipsFirst(
    userId: number,
    amount: number,
  ): { chips: number; silver: number; coins: number } | null {
    if (!Number.isInteger(amount) || amount <= 0) return null;
    const bal = this.getChips(userId);
    const chips = Math.min(bal, amount);
    const silver = amount - chips;
    const left = silver > 0 ? this.spendCoins(userId, silver) : this.getCoins(userId);
    if (left === null) return null;
    if (chips > 0) this.prep("UPDATE users SET chips = chips - ? WHERE id = ?").run(chips, userId);
    return { chips, silver, coins: left };
  }

  /** One free slot pull leaves the balance — the guarded decrement is the
   *  rule, as ever. */
  erConsumeFreePull(userId: number): boolean {
    const info = this.prep("UPDATE users SET freePulls = freePulls - 1 WHERE id = ? AND freePulls > 0")
      .run(userId);
    return info.changes > 0;
  }

  getFreePulls(userId: number): number {
    const row = this.prep("SELECT freePulls FROM users WHERE id = ?").get(userId) as { freePulls: number } | undefined;
    return row?.freePulls ?? 0;
  }

  /** The five casino colorways this player has pulled from chests (the skin
   *  column's dedupe input). Suits live in backrooms_locker — the same rows
   *  the floor's suit check already trusts. */
  erOwnedSkins(userId: number, skinIds: readonly string[]): string[] {
    const rows = this.prep(
        `SELECT color FROM backrooms_locker WHERE userId = ? AND kind = 'suit'
         AND color IN (${skinIds.map(() => "?").join(",")})`,
      )
      .all(userId, ...skinIds) as { color: string }[];
    return rows.map((r) => r.color);
  }

  /** OPEN A CHEST — the mint's single write path. The allowance check runs
   *  FIRST and a refusal grants nothing (the jukebox rule); the grant and
   *  the count bump commit together or not at all. `roll` was made by
   *  escape-loot's crypto tables; this op only honours it. */
  erOpenChest(
    userId: number,
    roll: { kind: string; amount?: number; skin?: string },
    maxPerDay: number,
  ): { ok: true; opens: number } | { ok: false; error: string } {
    return this.transaction(() => {
      const day = new Date().toISOString().slice(0, 10);
      const row = this.prep("SELECT count FROM er_opens WHERE userId = ? AND day = ?")
        .get(userId, day) as { count: number } | undefined;
      const used = row?.count ?? 0;
      if (used >= maxPerDay) return { ok: false as const, error: "no_opens" };
      // Validate the roll's SHAPE before the allowance bump: transaction()
      // commits on a non-throw return, so a bad_roll after the INSERT would
      // consume a daily open and grant nothing (the jukebox rule — a
      // refusal must cost nothing). Unreachable while rollChest only emits
      // these kinds; this is the contract, not a hot path.
      const KINDS = ["silver", "spins", "chips", "pulls", "skin"];
      if (!KINDS.includes(roll.kind) || (roll.kind === "skin" && !roll.skin)) {
        return { ok: false as const, error: "bad_roll" };
      }
      this.prep(
          `INSERT INTO er_opens (userId, day, count) VALUES (?, ?, 1)
           ON CONFLICT(userId, day) DO UPDATE SET count = count + 1`,
        )
        .run(userId, day);
      const n = roll.amount ?? 0;
      // The mint's books, in the same txn as the grant (migration 71).
      const bump = (col: string, v: number): void => {
        this.prep(
            `INSERT INTO er_mint (day, ${col}, opens) VALUES (?, ?, 1)
             ON CONFLICT(day) DO UPDATE SET ${col} = ${col} + excluded.${col}, opens = opens + 1`,
          )
          .run(day, v);
      };
      if (roll.kind === "silver") {
        this.addCoins(userId, n);
        bump("silver", n);
      } else if (roll.kind === "spins") {
        this.addBonusSpins(userId, n);
        bump("spins", n);
      } else if (roll.kind === "chips") {
        this.prep("UPDATE users SET chips = chips + ? WHERE id = ?").run(n, userId);
        bump("chips", n);
      } else if (roll.kind === "pulls") {
        this.prep("UPDATE users SET freePulls = freePulls + ? WHERE id = ?").run(n, userId);
        bump("pulls", n);
      } else if (roll.kind === "skin" && roll.skin) {
        bump("silver", 0); // an open with no numeric mint still counts
        this.prep("INSERT INTO backrooms_locker (userId, kind, level, color, createdAt) VALUES (?, 'suit', 0, ?, ?)")
          .run(userId, roll.skin, Date.now());
        this.prep("INSERT OR IGNORE INTO er_discoveries (userId, skin, at) VALUES (?, ?, ?)")
          .run(userId, roll.skin, Date.now());
      } else return { ok: false as const, error: "bad_roll" };
      return { ok: true as const, opens: used + 1 };
    });
  }

  /** The mint's day row (the tripwire + panel read). */
  erMintDay(day: string): { silver: number; chips: number; spins: number; pulls: number; opens: number } {
    const row = this.prep("SELECT silver, chips, spins, pulls, opens FROM er_mint WHERE day = ?").get(day) as
      | { silver: number; chips: number; spins: number; pulls: number; opens: number }
      | undefined;
    return row ?? { silver: 0, chips: 0, spins: 0, pulls: 0, opens: 0 };
  }

  /** The last N days of mint rows, newest first — the weekly report's line. */
  erMintRecent(days: number): { day: string; silver: number; chips: number; spins: number; pulls: number; opens: number }[] {
    return this.prep("SELECT day, silver, chips, spins, pulls, opens FROM er_mint ORDER BY day DESC LIMIT ?")
      .all(days) as { day: string; silver: number; chips: number; spins: number; pulls: number; opens: number }[];
  }

  /** Chest opens spent today (the HUD's n-of-10). */
  erOpensToday(userId: number): number {
    const day = new Date().toISOString().slice(0, 10);
    const row = this.prep("SELECT count FROM er_opens WHERE userId = ? AND day = ?")
      .get(userId, day) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  /** Death inside the complex: carried items are destroyed, the pass ends.
   *  The locker is untouched — that asymmetry is its whole purpose. */
  erDeath(userId: number, reason: string): void {
    this.transaction(() => {
      this.prep("DELETE FROM er_inventory WHERE userId = ?").run(userId);
      this.erRevokePass(userId, reason);
    });
  }

  /** Lightweight connectivity check used by the health endpoint. */
  healthy(): boolean {
    try {
      this.prep("SELECT 1").get();
      return true;
    } catch {
      return false;
    }
  }

  /** Pages the WAL may reach before a commit checkpoints it; 0 = never
   *  (src/db/checkpointer.ts does it off the event loop instead). */
  setAutoCheckpoint(pages: number): void {
    this.db.exec(`PRAGMA wal_autocheckpoint = ${Math.max(0, Math.floor(pages))};`);
  }

  /** The main connection's auto-checkpoint threshold, in pages. */
  autoCheckpoint(): number {
    const r = this.prep("PRAGMA wal_autocheckpoint").get() as { wal_autocheckpoint: number };
    return r.wal_autocheckpoint;
  }

  close(): void {
    this.db.close();
  }
}
