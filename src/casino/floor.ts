// THE FLOOR's wire — /ws-casino, the third socket (chat /ws, backrooms
// /ws-game). CASINO.md's contract: an in-memory roster of positions and
// nothing else — no DB, no HP, no inventory. A crash loses nobody anything
// but where they were standing. The hall is one room at friend-group scale,
// so frames fan out to EVERYONE on the floor (no proximity scoping — unlike
// the backrooms, being seen is the point of a casino).
//
// Client → server: {type:"enter", suit} · {type:"move", x, y, yaw, p, d, pt, ds?} ·
//                  {type:"sit", seat|null} · {type:"em", id} ·
//                  {type:"hold", id} · {type:"drink"} · {type:"leave"} ·
//                  {type:"shoot", hit?} · {type:"reload"} ·
//                  {type:"slorp", stage} · {type:"pop"} ·
//                  {type:"stardust", hits} · {type:"puff"} ·
//                  {type:"ego", v} · {type:"egopop"}
// Server → client: {type:"welcome", you, peers:[…]} · {type:"denied", error} ·
//                  {type:"join", peer} · {type:"pos", id, x, y, yaw, p, d, pt, ds} ·
//                  {type:"seat", id, seat} · {type:"em", id, emote} ·
//                  {type:"hold", id, hold} · {type:"drink", id} ·
//                  {type:"bye", id} · {type:"wheel", slot, by} ·
//                  {type:"death", id, x, y, suit, seed} ·
//                  {type:"slots", id, reels} ·
//                  {type:"bang", id} · {type:"ammo", rounds, clips, dry?} ·
//                  {type:"reload", id} ·
//                  {type:"gundeath", id, by, byName, x, y, suit, seed, dir} ·
//                  {type:"slorp", id, stage} · {type:"boom", id, x, y, suit, seed} ·
//                  {type:"stardust", id, hits} · {type:"pow", id, x, y, suit, seed} ·
//                  {type:"ego", id, v} · {type:"egopop", id, x, y, suit, seed}
//
// THE GUN (Josh, Aug 2026) is the one place this relay touches the DB, and
// only for the SCARCE thing: rounds. A shot is refused unless the shooter's
// carried gun has one to spend (`casinoSpendRound`, a guarded decrement), so
// no client can invent ammunition; WHO it hit is the shooter's client's claim,
// which is the same trust the whole relay runs on — positions are
// client-authoritative and a gun death is cosmetic (10s on the carpet and a
// walk back from the entrance; the Wake never hears about it). A dead body
// can neither shoot nor be shot again while it's down.
//
// The last two are the C4 showpieces and are the ONLY server-pushed events
// here that don't originate from a client frame: they're forwarded off the
// `wheel.spin` bus event. Presentational only — see the handler at the bottom.
//
// `p` is the body pose (0 stand · 1 crouch · 2 airborne · 3 down) — cosmetic, clamped,
// relayed. Airborne only says WHICH CLIP a peer body plays; the jump arc itself
// is local, exactly as in the backrooms. `d` rides beside it on the same terms:
// 1 = they have had a few, which swaps their standing and straight-line
// locomotion for the drunk clips and nothing else. The bar is the only thing
// that sets it, but a client that lies about it has only made itself stagger.
// SUIT RULE (locked): yellow is free for everyone; any other color must be
// OWNED in the backrooms locker — a READ-ONLY check, nothing is consumed or
// locked. SEATS are cosmetic first-come claims validated only for range and
// uniqueness; where seat 7 physically is, is the client layout's business.

import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Server, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { Store } from "../db/store";
import { rememberSocketToken, sessionStandsFor, userForToken } from "../auth";
import { termsOutstanding } from "../legal";
import type { Bus } from "../bus";
import { CLIP_ROUNDS, GUN_RESPAWN_MS, SHOT_MIN_MS } from "./items";
import { award } from "../achievements";
import { makeRateLimiter } from "../http";

// cells — the hall's size lives in hall.ts, held against client layout.ts by test_hall_nav
import { HALL_W, HALL_H, ENTRANCE } from "./hall";
import { Pockets, POCKET_ITEMS, setPocketDesk, type PocketItem } from "./pockets";
const MAX_FLOOR = 32; // bodies — Josh: "make the casino hold a max of 32 players"
// Range guard only — the client layout defines the real seats. It must stay
// ABOVE the layout's seat count (test_casino_layout pins it): the Boulevard has
// 69, and at 64 the server silently refused five of the rotunda's lounge chairs.
export const MAX_SEATS = 96;
// A BUCKET, not a minimum gap (Oct 2026): a hiccup delivers several frames at
// once, and a 40ms gap kept the OLDEST of them, so everyone else watched that
// body stall where the burst began. Same shape as the Backrooms' (net.ts).
const MOVE_BURST = 10;
const MOVE_RATE = 25;
/** State frames a body may send per window (review round 2): enter, sit,
 *  em, hold and drink each broadcast to the whole floor (enter also reads
 *  the locker + the gun), and alternating values defeats every no-change
 *  check. A person changes seats and bottles a few times a minute. */
export const FLOOR_STATE_BURST = 60;
export const FLOOR_STATE_WINDOW_MS = 10_000;
// The drugs' persisted state, shoot and reload too (Oct 2026 review): their
// no-change compare is not a rate limit — alternating two values broadcast to
// the whole floor on every frame, and a refused shot or reload still read the
// database each time.
const FLOOR_STATE_FRAMES = new Set(["enter", "sit", "em", "hold", "drink", "put", "pick", "hand", "slorp", "stardust", "ego", "shoot", "reload"]);
/** Mirrors the backrooms EMOTE_IDS — the wire relays ids off this list only. */
const EMOTE_IDS = new Set([
  "hiphop", "gangnam", "twerk", "backflip", "chicken", "silly", "bboy",
  "house", "snake", "soul", "freeze",
]);
/** Mirrors client/src/casino/drink.ts DRINKS. What's in somebody's right hand
 *  is pure presentation — the silver was charged at the bar over HTTP long
 *  before this — but it is still a fixed list, because an unchecked string on
 *  a broadcast wire is how one person picks everybody else's model. */
const DRINK_IDS = new Set(["beer", "wine", "whisky", "champagne",
  // …and STAR DUST's canister + EGO's shot glass (Aug 2026) — held like a
  // bottle, taken like a bottle, and exactly as worthless to a liar.
  "stardust", "ego",
  // ...and SLORP's vial, now that one can be handed to you (Oct 2026): a vial
  // in a pocket is taken on a click like a shot.
  "slorp"]);
/** GIVING (Oct 2026): how close two bodies must be to hand something over,
 *  and to pick a dropped one up off the carpet (cells). */
export const HAND_CELLS = 2.5;
export const PICK_CELLS = 1.6;
/** Dropped things lie on the carpet this long, at most this many each and
 *  in total. */
export const DROP_MS = 10 * 60_000;
export const DROPS_EACH = 4;
export const DROPS_MAX = 40;

interface Occupant {
  ws: WebSocket;
  id: number;
  name: string;
  x: number;
  y: number;
  yaw: number;
  pose: number;
  /** Had a few at the bar. Purely which locomotion clips their body plays —
   *  relayed, never trusted for anything, and worth nothing to a liar. */
  drunk: boolean;
  suit: string;
  seat: number | null;
  emote: string;
  /** What's in their right hand right now ("" = empty). PERSISTED rather than
   *  one-shot, so somebody walking in mid-evening sees the bottle everybody is
   *  already holding instead of a hall of empty hands. */
  hold: string;
  /** Shot dead until this timestamp (0 = upright). While it runs the body can
   *  neither shoot nor be shot — a corpse is not a target, and dead men fire
   *  nothing. Cleared by the clock alone; the client's respawn walks the body
   *  back in at the entrance on its own schedule. */
  downUntil: number;
  /** Look pitch (radians, clamped) — cosmetic like yaw: peers lean the head/
   *  chest and tilt a raised pistol with it, so the body everyone sees looks
   *  where its owner is actually looking (one appearance, every observer). */
  pitch: number;
  /** How far into a SLORP trip this body is: 0 none · 1 · 2 · 3. Presentation
   *  only, like `drunk` — it swaps what the room sees them doing and, at 3,
   *  what they sound like. The pop that ends it is its own frame. */
  slorp: number;
  /** How many STAR DUST hits this body is riding: 0 none · 1 · 2 · 3 (doomed).
   *  Presentation like `slorp` — peers pitch the voice up, leak the smoke, and
   *  borrow the drunk clips off it. The pop that ends it is `puff`. */
  stardust: number;
  /** How swollen this body's HEAD is on EGO, in quarter-doses 0..12 (0 = its
   *  own hat size). Presentation like the rest: peers scale the head bone,
   *  deepen the voice, borrow the drunk clips. The pop is `egopop`. */
  ego: number;
  /** The ragdoll seed for the CURRENT pose-3 collapse (0 = none). Sent by the
   *  falling client (a pass-out) or stamped here (a gun death), and carried in
   *  the peer DTO so even someone walking in mid-collapse replays the same
   *  fold as everyone who watched it happen. */
  downSeed: number;
}

export interface CasinoFloor {
  /** Is this user currently on the floor? (Gates the voice-token route.) */
  has(userId: number): boolean;
  /** How many bodies are in the hall — the jukebox's skip vote is a share of
   *  this, and its clock only runs while somebody is here. */
  count(): number;
  ids(): number[];
  /** THE WALLET ROUND (Oct 2026): put a pocket item straight into a player's
   *  pockets (a drink somebody bought them). False = not on the floor, or no
   *  room. */
  deliver(userId: number, item: string, from: string): boolean;
  /** Would this player's pockets take one more `item` right now? */
  canDeliver(userId: number, item: string): boolean;
  /** Is this player on the floor? */
  present(userId: number): boolean;
}

/** What the floor needs from THE JUKEBOX: the current record for a newcomer's
 *  welcome frame, and a nudge when the room's population changes. Structural
 *  on purpose — floor.ts stays independent of the jukebox module. */
interface JukeboxHook {
  state(): unknown;
  poke(): void;
}

export function attachCasinoFloor(
  httpServer: Server,
  store: Store,
  bus?: Bus,
  juke?: JukeboxHook,
): CasinoFloor {
  const entry = { ...ENTRANCE };
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 }); // pos frames, not uploads
  const floor = new Map<number, Occupant>();
  const authed = new Map<WebSocket, { id: number; name: string }>();
  const moveBucket = new Map<number, { tokens: number; at: number }>();
  const stateBudget = makeRateLimiter();
  const lastShot = new Map<number, number>();
  // THE POCKETS + THE CARPET (Oct 2026) -- see pockets.ts for why the
  // server keeps its own list of what each body carries.
  const pockets = new Pockets();
  type Drop = { id: number; item: string; huffs: number; x: number; y: number; by: number; at: number };
  const drops = new Map<number, Drop>();
  let dropSeq = 1;
  const dropDto = (d: Drop) => ({ id: d.id, item: d.item, x: Math.round(d.x * 100) / 100, y: Math.round(d.y * 100) / 100 });
  const near = (a: { x: number; y: number }, b: { x: number; y: number }, cells: number): boolean =>
    Math.hypot(a.x - b.x, a.y - b.y) <= cells;
  const gotItem = (o: Occupant, p: PocketItem, from: string, how: string): void => {
    send(o.ws, { type: "gotitem", item: p.item, huffs: p.huffs, from: String(from).slice(0, 60), how });
  };
  const sweepDrops = (): void => {
    const now = Date.now();
    for (const d of drops.values()) {
      if (now - d.at > DROP_MS) {
        drops.delete(d.id);
        broadcast({ type: "undrop", id: d.id });
      }
    }
    pockets.prune(now);
  };
  const dropTimer = setInterval(sweepDrops, 15_000);
  dropTimer.unref?.();
  setPocketDesk({
    room: (userId, item) => {
      if (!floor.has(userId)) return "off";
      return pockets.canTake(userId, item) ? "ok" : "full";
    },
    credit: (userId, item) => floor.has(userId) && pockets.add(userId, item),
  });

  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws-casino") return;
    const user = userForToken(store, url.searchParams.get("token") ?? undefined);
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    // THE PAPERWORK: no Terms on file, no floor (legal.ts).
    if (termsOutstanding(user)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      rememberSocketToken(ws, url.searchParams.get("token"));
      authed.set(ws, { id: user.id, name: user.displayName });
      wss.emit("connection", ws, req);
    });
  });

  const send = (ws: WebSocket, msg: unknown): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const broadcast = (msg: unknown, except?: number): void => {
    for (const o of floor.values()) if (o.id !== except) send(o.ws, msg);
  };
  const peerDto = (o: Occupant) => ({
    id: o.id, name: o.name, x: o.x, y: o.y, yaw: o.yaw, p: o.pose,
    suit: o.suit, seat: o.seat, emote: o.emote, d: o.drunk ? 1 : 0, hold: o.hold,
    pt: o.pitch, ds: o.downSeed, sl: o.slorp, sd: o.stardust, eg: o.ego,
  });

  // THE STERLING SPECIAL (Josh, Aug 2026): drunk, tripping, gassed and
  // swollen AT ONCE earns "The Pharmacist" — detected HERE because this is
  // the one place all four states already live (the relay's own Occupant;
  // no new wire, no new trust — each input is exactly as client-claimed as
  // it always was, and the badge is worth exactly what a lie about it is).
  // The local set only spares the store a lookup per move frame while the
  // cocktail holds; award() itself is idempotent and house-excluded.
  const cocktailed = new Set<number>();
  const maybeCocktail = (o: Occupant): void => {
    if (cocktailed.has(o.id)) return;
    if (!o.drunk || o.slorp < 1 || o.stardust < 1 || o.ego < 1) return;
    cocktailed.add(o.id);
    try {
      award(o.id, "pharmacist");
    } catch {
      /* a badge must never take a frame down */
    }
  };

  // A ban, suspension, scrub or jailing hangs up THIS wire too — the app
  // socket already did, but a banned body kept shooting until it left on
  // its own (Sep 2026 review). Closing runs drop() through the close event.
  bus?.on("user.kick", ({ userId }) => {
    // Only sockets whose session is gone.
    for (const [ws, who] of authed) if (who.id === userId && !sessionStandsFor(store, ws)) ws.close(4003, "kicked");
  });

  const drop = (ws: WebSocket): void => {
    const who = authed.get(ws);
    authed.delete(ws);
    if (!who) return;
    const o = floor.get(who.id);
    if (o && o.ws === ws) {
      floor.delete(who.id);
      pockets.left(who.id);
      broadcast({ type: "bye", id: who.id });
      // The roster's "🎰 on the casino floor" line goes out with them.
      bus?.emit("zone.presence", { userId: who.id, zone: "casino", on: false, detail: null });
      // The last person out parks the music (and their skip vote leaves with
      // them) — the jukebox's clock is a function of who's actually here.
      juke?.poke();
    }
  };

  wss.on("connection", (ws: WebSocket) => {
    ws.on("close", () => drop(ws));
    ws.on("error", () => drop(ws));
    ws.on("message", (raw: RawData) => {
      const who = authed.get(ws);
      if (!who) return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (FLOOR_STATE_FRAMES.has(String(msg.type)) && !stateBudget(`floor:${who.id}`, FLOOR_STATE_BURST, FLOOR_STATE_WINDOW_MS)) {
        return;
      }

      if (msg.type === "enter") {
        // the room holds 32 — a returning body (same user, new tab) always fits
        if (!floor.has(who.id) && floor.size >= MAX_FLOOR) {
          send(ws, { type: "denied", error: "floor_full" });
          return;
        }
        // AN UNOWNED SUIT WALKS IN YELLOW (Oct 2026) — the escape room's
        // rule. Refusing it stranded people: the suit is remembered per
        // machine, so a colour you no longer have (or one picked on another
        // device) turned the door away on every visit, and on the Mac
        // app's pointer fallback the refusal was never even on screen —
        // Josh walked an empty hall with his friend standing in it. The
        // welcome says which suit you're actually wearing.
        let suit = String(msg.suit ?? "yellow");
        if (suit !== "yellow") {
          const owned = store
            .brLockerItems(who.id)
            .some((i) => i.kind === "suit" && (i.color ?? "yellow") === suit);
          if (!owned) suit = "yellow";
        }
        // one body per person: a second tab replaces the first
        const prev = floor.get(who.id);
        if (prev && prev.ws !== ws) {
          send(prev.ws, { type: "denied", error: "replaced" });
          prev.ws.close();
        }
        // A body lying on the carpet stays there (Oct 2026 review): a second
        // enter — same socket or a new tab — built a fresh occupant with
        // downUntil 0, standing the corpse up to fire back at once.
        const stillDown = prev && prev.downUntil > Date.now() ? prev : null;
        const o: Occupant = {
          ws, id: who.id, name: who.name,
          x: stillDown?.x ?? entry.x, y: stillDown?.y ?? entry.y, yaw: 0, pose: stillDown ? 3 : 0, drunk: false, suit, seat: null, emote: "", hold: "",
          downUntil: stillDown?.downUntil ?? 0, pitch: 0, downSeed: stillDown?.downSeed ?? 0, slorp: 0, stardust: 0, ego: 0,
        };
        floor.set(who.id, o);
        // What's in your pockets is whatever BOTH of us think is there.
        pockets.reconcile(who.id, msg.bag);
        // Your own ammo state rides the welcome — authoritative, and it saves
        // the client a fetch it would otherwise race the hall load with.
        const rounds = store.casinoGunRounds(who.id);
        const clips = store.casinoInv(who.id).find((i) => i.item === "clip")?.qty ?? 0;
        send(ws, {
          type: "welcome",
          you: { id: who.id, gun: rounds, clips, suit },
          peers: [...floor.values()].filter((p) => p.id !== who.id).map(peerDto),
          // What's on the jukebox right now, and how far into it we are — a
          // newcomer joins the record already playing rather than starting it.
          juke: juke?.state() ?? null,
          // what's lying on the carpet
          drops: [...drops.values()].map(dropDto),
        });
        broadcast({ type: "join", peer: peerDto(o) }, who.id);
        // …and the whole app's roster learns where they went.
        bus?.emit("zone.presence", { userId: who.id, zone: "casino", on: true, detail: null });
        // First one in starts the music.
        juke?.poke();
        return;
      }

      const o = floor.get(who.id);
      if (!o || o.ws !== ws) return; // must enter first

      // THE DOWNED DO NOTHING (Oct 2026 review): a body on the carpet could
      // still sit, dance, draw, swig, re-dose and hand things out. Frames that
      // only ever CLEAR state (stand up, put down, sober) still pass.
      if (o.downUntil > Date.now()) {
        const t = String(msg.type);
        const sets =
          (t === "sit" && msg.seat !== null) ||
          (t === "em" && String(msg.id ?? "") !== "") ||
          (t === "hold" && String(msg.id ?? "") !== "") ||
          (t === "slorp" && Number(msg.stage) > 0) ||
          (t === "stardust" && Number(msg.hits) > 0) ||
          (t === "ego" && Number(msg.v) > 0) ||
          t === "drink" || t === "put" || t === "pick" || t === "hand";
        if (sets) return;
      }

      if (msg.type === "move") {
        const now = Date.now();
        const bk = moveBucket.get(who.id) ?? { tokens: MOVE_BURST, at: now };
        bk.tokens = Math.min(MOVE_BURST, bk.tokens + ((now - bk.at) / 1000) * MOVE_RATE);
        bk.at = now;
        moveBucket.set(who.id, bk);
        if (bk.tokens < 1) return;
        bk.tokens -= 1;
        const x = Number(msg.x);
        const y = Number(msg.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        o.x = Math.min(HALL_W - 0.05, Math.max(0.05, x));
        o.y = Math.min(HALL_H - 0.05, Math.max(0.05, y));
        o.yaw = Number(msg.yaw) || 0;
        // 0 stand · 1 crouch · 2 airborne · 3 DOWN (drunk, out cold — Josh's
        // bar). Clamped rather than trusted: it drives which clip a peer body
        // plays and nothing else, so a garbage value should read as
        // "standing", never as an exception. Pose 3 costs nothing to fake and
        // buys nothing either — the worst a liar can do is lie on the carpet.
        o.pose = msg.p === 1 || msg.p === 2 || msg.p === 3 ? msg.p : 0;
        // SHOT DEAD OVERRIDES THE CLIENT'S POSE. The victim's death-cam mouse
        // still sends move frames, and before this guard a pose-0 frame stood
        // the corpse back up for the whole room while its owner watched it
        // lie there — the wire is the one truth, so the wire holds the body
        // down until the clock says otherwise.
        if (o.downUntil > now) o.pose = 3;
        o.drunk = msg.d === 1;
        const pt = Number(msg.pt);
        o.pitch = Number.isFinite(pt) ? Math.max(-1.5, Math.min(1.5, pt)) : 0;
        // The pass-out ragdoll seed rides the fall's own move frame, so every
        // observer folds the body the same way. Kept until the body stands.
        const ds = Number(msg.ds);
        if (o.pose === 3 && Number.isFinite(ds)) o.downSeed = ds >>> 0;
        if (o.pose !== 3) o.downSeed = 0;
        if (o.seat !== null) {
          // moving is standing up — one rule, enforced where the state lives
          o.seat = null;
          broadcast({ type: "seat", id: o.id, seat: null });
        }
        broadcast(
          { type: "pos", id: o.id, x: o.x, y: o.y, yaw: o.yaw, p: o.pose, d: o.drunk ? 1 : 0, pt: o.pitch, ds: o.downSeed },
          who.id,
        );
        maybeCocktail(o);
        return;
      }

      if (msg.type === "sit") {
        if (msg.seat === null) {
          if (o.seat !== null) {
            o.seat = null;
            broadcast({ type: "seat", id: o.id, seat: null });
          }
          return;
        }
        const seat = Number(msg.seat);
        if (!Number.isInteger(seat) || seat < 0 || seat >= MAX_SEATS) return;
        for (const other of floor.values())
          if (other.seat === seat && other.id !== o.id) return; // taken — silently refused
        o.seat = seat;
        o.emote = "";
        broadcast({ type: "seat", id: o.id, seat });
        return;
      }

      if (msg.type === "em") {
        const id = String(msg.id ?? "");
        if (id !== "" && !EMOTE_IDS.has(id)) return;
        if (o.seat !== null && id !== "") return; // no dancing in a chair
        o.emote = id;
        broadcast({ type: "em", id: o.id, emote: id }, who.id);
        return;
      }

      // WHAT'S IN YOUR RIGHT HAND. Persisted state, not a one-shot: a body
      // holds a bottle until it's emptied or put down, and a newcomer's
      // welcome frame has to carry it or the hall's hands are all empty until
      // the next round.
      if (msg.type === "hold") {
        const id = String(msg.id ?? "");
        // The gun joins the drinks on the hold wire, but with an OWNERSHIP
        // gate (the suit rule's shape: a read-only store check, nothing
        // consumed) — you can only draw a gun that's carried, not lockered,
        // not somebody else's, not imaginary.
        if (id === "gun") {
          if (store.casinoGunRounds(who.id) === null) return;
        } else if (id !== "" && !DRINK_IDS.has(id)) return;
        if (id === o.hold) return; // no-change frames don't need a broadcast
        o.hold = id;
        broadcast({ type: "hold", id: o.id, hold: id }, who.id);
        return;
      }

      // THE TRIGGER. Rounds are the server's (a guarded decrement — no client
      // invents ammunition); the HIT is the shooter's claim, same trust as
      // positions. `dir` for the ragdoll is computed HERE from the two bodies'
      // last known positions, so every client throws the victim the same way
      // and a liar can't pick the direction someone else flies.
      if (msg.type === "shoot") {
        const now = Date.now();
        if (o.hold !== "gun") return;
        if (o.downUntil > now) return; // dead men fire nothing
        const clipsNow = (): number => store.casinoInv(who.id).find((i) => i.item === "clip")?.qty ?? 0;
        // A rate-limited trigger is refused WITH AN AMMO FRAME, never
        // silently: the client predicts rounds per click, and a silent
        // refusal let a fast finger walk the HUD to zero while the server's
        // count stood — Josh stored an "empty" gun and the locker handed him
        // back the two rounds the server had refused to spend.
        if (now - (lastShot.get(who.id) ?? 0) < SHOT_MIN_MS) {
          send(ws, { type: "ammo", rounds: store.casinoGunRounds(who.id) ?? 0, clips: clipsNow() });
          return;
        }
        lastShot.set(who.id, now);
        const rounds = store.casinoSpendRound(who.id);
        if (rounds === null) {
          send(ws, { type: "ammo", rounds: store.casinoGunRounds(who.id) ?? 0, clips: clipsNow(), dry: 1 });
          return;
        }
        send(ws, { type: "ammo", rounds, clips: clipsNow() });
        broadcast({ type: "bang", id: o.id }, who.id);
        const hitId = Number(msg.hit);
        if (!Number.isInteger(hitId) || hitId === o.id) return;
        const victim = floor.get(hitId);
        if (!victim) return;
        if (victim.downUntil > now) return; // a corpse is not a target
        victim.downUntil = now + GUN_RESPAWN_MS;
        victim.pose = 3; // the welcome frame carries the body on the carpet
        // DEATH SOBERS YOU COMPLETELY (Josh, Aug 2026). A bullet ends every
        // substance the victim was on, exactly as their own detonations do —
        // otherwise a newcomer's welcome frame describes a corpse that is
        // still tripping, and the body stands up neon.
        victim.slorp = 0;
        victim.stardust = 0;
        victim.ego = 0;
        victim.drunk = false;
        const seed = (now ^ (victim.id * 2654435761)) >>> 0;
        victim.downSeed = seed; // a newcomer mid-death folds the same body
        if (victim.seat !== null) {
          victim.seat = null;
          broadcast({ type: "seat", id: victim.id, seat: null });
        }
        const dx = victim.x - o.x;
        const dy = victim.y - o.y;
        store.bumpStat(o.id, "casino_kills"); // Ledger/achievement telemetry (cosmetic murder — no economy)
        broadcast({
          type: "gundeath",
          id: victim.id, by: o.id, byName: o.name,
          x: victim.x, y: victim.y, suit: victim.suit,
          seed,
          // the sim's cell convention: heading vector is (sin dir, cos dir)
          dir: Math.atan2(dx, dy),
        });
        return;
      }

      // THE MAG SWAP. A spare clip becomes a full gun (store-guarded — the
      // part-used mag is discarded, a full gun is refused so the clip isn't
      // wasted). The one-shot broadcast is the peers' reload gesture + sound.
      if (msg.type === "reload") {
        if (o.hold !== "gun" || o.downUntil > Date.now()) return;
        const r = store.casinoReload(who.id, CLIP_ROUNDS);
        if (!r.ok) {
          send(ws, {
            type: "ammo",
            rounds: store.casinoGunRounds(who.id) ?? 0,
            clips: store.casinoInv(who.id).find((i) => i.item === "clip")?.qty ?? 0,
            err: r.error,
          });
          return;
        }
        send(ws, { type: "ammo", rounds: r.rounds, clips: r.clips });
        broadcast({ type: "reload", id: o.id }, who.id);
        return;
      }

      // TAKING A SWIG — a one-shot, like an emote. Only the trigger travels;
      // every client plays the same raise-tilt-lower from its own clock, so a
      // late frame can't leave somebody frozen with a bottle at their lips.
      // Refused with nothing in hand, which is also what stops it being a way
      // to make somebody else's body mime drinking air.
      if (msg.type === "drink") {
        if (!o.hold) return;
        pockets.spend(who.id, o.hold); // a swig: a bottle or a shot gone, a huff off the can
        broadcast({ type: "drink", id: o.id }, who.id);
        return;
      }

      // DROPPING something on the carpet (G). The server takes it from YOUR
      // pockets (a client can't drop what it never had) and lays it where
      // you stand for anyone to pick up.
      if (msg.type === "put") {
        const item = String(msg.item ?? "");
        if (!POCKET_ITEMS.has(item)) return;
        if (o.downUntil > Date.now()) return;
        const mine = [...drops.values()].filter((d) => d.by === who.id);
        if (mine.length >= DROPS_EACH || drops.size >= DROPS_MAX) {
          send(ws, { type: "putno", item, error: "carpet_full" });
          return;
        }
        const p = pockets.take(who.id, item);
        if (!p) {
          send(ws, { type: "putno", item, error: "not_yours" });
          return;
        }
        const d: Drop = { id: dropSeq++, item, huffs: p.huffs, x: o.x, y: o.y, by: who.id, at: Date.now() };
        drops.set(d.id, d);
        broadcast({ type: "drop", drop: dropDto(d) });
        return;
      }

      // PICKING one up (E beside it): reach, and a free pocket.
      if (msg.type === "pick") {
        const d = drops.get(Number(msg.id));
        if (!d) return send(ws, { type: "pickno", id: Number(msg.id), error: "gone" });
        if (o.downUntil > Date.now()) return;
        if (!near(o, d, PICK_CELLS)) return send(ws, { type: "pickno", id: d.id, error: "too_far" });
        if (!pockets.add(who.id, d.item, d.huffs)) return send(ws, { type: "pickno", id: d.id, error: "hands_full" });
        drops.delete(d.id);
        broadcast({ type: "undrop", id: d.id });
        gotItem(o, { item: d.item, huffs: d.huffs }, "", "picked");
        return;
      }

      // HANDING what's in your hand to the person in front of you -- a player
      // or a regular. Nothing leaves your hand until they've taken it.
      if (msg.type === "hand") {
        const to = Number(msg.to);
        const item = o.hold;
        const no = (error: string): void => send(ws, { type: "handno", to, error });
        if (!item || !POCKET_ITEMS.has(item)) return no("nothing_in_hand");
        if (o.downUntil > Date.now()) return no("down");
        if (!pockets.list(who.id).some((p) => p.item === item)) return no("not_yours");
        const t = floor.get(to);
        if (t && t.id !== who.id) {
          if (t.downUntil > Date.now()) return no("down");
          if (!near(o, t, HAND_CELLS)) return no("too_far");
          if (store.isBlockedEither(who.id, t.id)) return no("refused");
          if (!pockets.canTake(t.id, item)) return no("hands_full");
          const p = pockets.take(who.id, item)!;
          pockets.add(t.id, p.item, p.huffs);
          gotItem(t, p, who.name, "handed");
          send(ws, { type: "handed", to, item, name: t.name });
          return;
        }
        return no("nobody");
      }

      // SLORP — what stage of the trip this body is at (0 none · 1 · 2 · 3).
      // PERSISTED like the bottle and the drunk flag, so somebody walking in
      // ten minutes late sees the state everyone else has been watching build.
      // Trusted on exactly the terms the rest of this relay is: a client that
      // lies has made its own body twitch and its own screen melt, which is a
      // thing you can buy for 1,500 silver anyway.
      if (msg.type === "slorp") {
        const st = Number(msg.stage);
        const stage = Number.isFinite(st) ? Math.max(0, Math.min(3, Math.round(st))) : 0;
        if (stage === o.slorp) return; // no-change frames stay off the wire
        o.slorp = stage;
        broadcast({ type: "slorp", id: o.id, stage }, who.id);
        maybeCocktail(o);
        return;
      }

      // …AND THE END OF IT. The trip is timed on the tripper's own clock (it is
      // their eyes and ears it happens to), so the client declares the pop; the
      // SERVER stamps the consequences — the ten seconds down, the pose, and
      // the shared seed — exactly as it does for a gun death, so every screen
      // throws the identical body and a newcomer mid-explosion finds the same
      // corpse. Faking one costs you ten seconds on the carpet.
      if (msg.type === "pop") {
        const nowP = Date.now();
        if (o.downUntil > nowP) return; // already down; one death at a time
        o.slorp = 0;
        o.stardust = 0; // a body in pieces is done with everything it was on
        o.ego = 0;
        o.drunk = false;
        o.downUntil = nowP + GUN_RESPAWN_MS;
        o.pose = 3;
        const seed = (nowP ^ (o.id * 40503)) >>> 0;
        o.downSeed = seed;
        if (o.seat !== null) {
          o.seat = null;
          broadcast({ type: "seat", id: o.id, seat: null });
        }
        broadcast({ type: "boom", id: o.id, x: o.x, y: o.y, suit: o.suit, seed });
        return;
      }

      // STAR DUST — how many hits this body is riding (0 none · 1 · 2 · 3).
      // Slorp's relay exactly: persisted so a newcomer sees the smoke everyone
      // else has been backing away from, clamped rather than believed, and
      // worth nothing to a liar beyond a helium voice and a leaky body.
      if (msg.type === "stardust") {
        const h = Number(msg.hits);
        const hits = Number.isFinite(h) ? Math.max(0, Math.min(3, Math.round(h))) : 0;
        if (hits === o.stardust) return; // no-change frames stay off the wire
        o.stardust = hits;
        broadcast({ type: "stardust", id: o.id, hits }, who.id);
        maybeCocktail(o);
        return;
      }

      // …AND THE DETONATION. The doom clock runs on the huffer's own screen
      // (their eyes, their thirty seconds), so the client declares the puff;
      // the SERVER stamps the consequences exactly as it does for the vial —
      // the ten seconds down, the pose, the shared seed — so every screen
      // throws the identical body through the identical cloud.
      if (msg.type === "puff") {
        const nowP = Date.now();
        if (o.downUntil > nowP) return; // already down; one death at a time
        o.stardust = 0;
        o.slorp = 0;
        o.ego = 0;
        o.drunk = false;
        o.downUntil = nowP + GUN_RESPAWN_MS;
        o.pose = 3;
        const seed = (nowP ^ (o.id * 48271)) >>> 0;
        o.downSeed = seed;
        if (o.seat !== null) {
          o.seat = null;
          broadcast({ type: "seat", id: o.id, seat: null });
        }
        broadcast({ type: "pow", id: o.id, x: o.x, y: o.y, suit: o.suit, seed });
        return;
      }

      // EGO — how swollen this body's head is (quarter-doses 0..12). The
      // relay's usual terms: persisted so a newcomer sees the right hat size,
      // clamped rather than believed, and worth nothing to a liar beyond a
      // big head and a deep voice.
      if (msg.type === "ego") {
        const q = Number(msg.v);
        const v = Number.isFinite(q) ? Math.max(0, Math.min(12, Math.round(q))) : 0;
        if (v === o.ego) return; // no-change frames stay off the wire
        o.ego = v;
        broadcast({ type: "ego", id: o.id, v }, who.id);
        maybeCocktail(o);
        return;
      }

      // …AND THE POP. The creak runs on the owner's clock (their head, their
      // eight seconds); the server stamps the consequences exactly as for the
      // vial and the canister — the ten seconds, the pose, the shared seed —
      // so every screen pops the same head into the same confetti.
      if (msg.type === "egopop") {
        const nowP = Date.now();
        if (o.downUntil > nowP) return; // already down; one death at a time
        o.ego = 0;
        o.stardust = 0;
        o.slorp = 0;
        o.drunk = false;
        o.downUntil = nowP + GUN_RESPAWN_MS;
        o.pose = 3;
        const seed = (nowP ^ (o.id * 69621)) >>> 0;
        o.downSeed = seed;
        if (o.seat !== null) {
          o.seat = null;
          broadcast({ type: "seat", id: o.id, seat: null });
        }
        broadcast({ type: "egopop", id: o.id, x: o.x, y: o.y, suit: o.suit, seed });
        return;
      }

      if (msg.type === "leave") {
        drop(ws);
        ws.close();
      }
    });
  });

  // ---- THE STAGE WHEEL + THE STAGE DEATH -------------------------------------
  // The floor mirrors a real spin on its 3D wheel. Strictly presentational: the
  // spin already happened through /api/wheel, the outcome is already applied,
  // and nothing here touches the economy — the C4 showpiece is a VIEW of an
  // event, which is what keeps "zero new money paths" true.
  //
  // Only spins by someone STANDING ON THE FLOOR are mirrored. Every wheel spin
  // server-wide would leave the stage turning more or less permanently, and the
  // moment only means anything if the person it happened to is in the room.
  // Same doctrine for Slots: a pull by someone ON the floor shows its payline
  // on the cabinet they're standing at (the client picks the cabinet from the
  // peer's position — the server doesn't know furniture). Symbols only; the
  // payout and balance never ride this wire.
  bus?.on("slots.pull", ({ userId, reels }) => {
    const o = floor.get(userId);
    if (!o) return;
    broadcast({ type: "slots", id: userId, reels });
  });

  bus?.on("wheel.spin", ({ userId, slotIndex, died, outcome, tier, emojiFile, emojiName, face }) => {
    const o = floor.get(userId);
    if (!o) return;
    broadcast({
      // `face` is what the spinner's wedges were showing, the landed one
      // carrying the award — so the room watches the same wheel land on the
      // same prize instead of each client inventing its own wedges.
      type: "wheel", slot: slotIndex, by: userId, name: o.name,
      outcome, tier, emojiFile, emojiName, face,
    });
    if (!died) return;
    // Thrown from wherever they were standing. The seed rides the wire so every
    // client replays the IDENTICAL flail — the backrooms' death rule.
    broadcast({
      type: "death",
      id: userId,
      x: o.x,
      y: o.y,
      suit: o.suit,
      seed: (Date.now() ^ (userId * 2654435761)) >>> 0,
    });
  });

  // THE JUKEBOX. State changes are pushed to the room the same way the stage
  // wheel is — the floor is the only place the music exists, so nothing about
  // it goes to the app-wide realtime socket.
  bus?.on("jukebox.state", ({ state }) => broadcast({ type: "juke", state }));

  return {
    deliver: (userId, item, from) => {
      const o = floor.get(userId);
      if (!o || !POCKET_ITEMS.has(item)) return false;
      if (!pockets.add(userId, item)) return false;
      gotItem(o, pockets.list(userId).filter((p) => p.item === item).pop()!, from, "bought");
      return true;
    },
    canDeliver: (userId, item) => floor.has(userId) && pockets.canTake(userId, item),
    present: (userId) => floor.has(userId),
    has: (userId) => floor.has(userId),
    count: () => floor.size,
    ids: () => [...floor.keys()],
  };
}
