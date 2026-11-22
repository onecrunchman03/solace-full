// THE FLOOR's socket client — /ws-casino. Mirrors the backrooms gamenet in
// miniature: token in the query string, JSON frames, handlers injected by
// the game screen. See src/casino/floor.ts for the protocol.

import { getToken, wsUrl } from "../backrooms/gameapi";

export interface FloorPeer {
  id: number;
  name: string;
  x: number;
  y: number;
  yaw: number;
  p: number;
  suit: string;
  seat: number | null;
  emote: string;
  /** 1 = they have had a few. Cosmetic: it only chooses which locomotion
   *  clips their body plays (see drunkState). */
  d?: number;
  /** What's in their right hand ("" = empty). Persisted state, so a body that
   *  was already holding a bottle when you walked in is still holding it. */
  hold?: string;
  /** Look pitch (radians). Peers lean the head/chest and tilt a raised
   *  pistol with it — the body looks where its owner looks. */
  pt?: number;
  /** How far into a SLORP trip they are (0 none · 1 · 2 · 3). Persisted, so
   *  somebody walking in nine minutes late still sees the state the room has
   *  been watching build. */
  sl?: number;
  /** How many STAR DUST hits they're riding (0 none · 1 · 2 · 3 doomed).
   *  Persisted like `sl` — the helium voice and the leak greet a newcomer. */
  sd?: number;
  /** How swollen their head is on EGO, quarter-doses 0..12. Persisted — a
   *  newcomer sees the right hat size and hears the right baritone. */
  eg?: number;
  /** The pose-3 ragdoll seed (0/absent = none). Every observer — newcomers
   *  included — folds a collapsed body with the same seed. */
  ds?: number;
}

/** THE JUKEBOX as the floor sees it. Mirrors JukeboxStateDTO on the server —
 *  a filename, a playhead and a queue. No wallets ride this wire; the silver
 *  for a pick is charged over HTTP. */
export interface JukeEntry {
  id: number;
  title: string;
  artist: string;
  durationMs: number;
  by: string | null;
  byId: number | null;
}
export interface JukeState {
  now: (JukeEntry & { file: string; posMs: number }) | null;
  queue: JukeEntry[];
  votes: number;
  need: number;
  listeners: number;
  price: number;
  skipPrice: number;
}

export interface FloorHandlers {
  /** `you` carries your own ammo state (authoritative): `gun` = rounds in the
   *  carried gun or null for none, `clips` = spare magazines. */
  onWelcome?: (you: { id: number; gun?: number | null; clips?: number }, peers: FloorPeer[], juke: JukeState | null) => void;
  onDenied?: (error: string) => void;
  onJoin?: (peer: FloorPeer) => void;
  onPos?: (id: number, x: number, y: number, yaw: number, p: number, drunk: boolean, pitch: number, downSeed: number) => void;
  onSeat?: (id: number, seat: number | null) => void;
  onEmote?: (id: number, emote: string) => void;
  onBye?: (id: number) => void;
  /** Sterling glides along his bar: x0→x1 cells, started `ago` ms before the
   *  frame was sent, taking `dur` ms (also on the welcome, as `house`). */
  onHouseMove?: (who: string, g: { x0: number; x1: number; ago: number; dur: number; face: number | null; greet: boolean }) => void;
  /** Something landed in your pockets: bought for you by a player, handed over, or picked up off the carpet. `huffs` is what's
   *  left in a STAR DUST canister. */
  onGotItem?: (item: string, huffs: number, from: string, how: string) => void;
  /** What's lying on the carpet: everything (welcome), one more, one gone. */
  onDrops?: (drops: FloorDrop[]) => void;
  onDrop?: (drop: FloorDrop) => void;
  onUndrop?: (id: number) => void;
  /** Your hand-over went through (`name` took it) or didn't (`error`). */
  onHanded?: (to: number, item: string, name: string) => void;
  onHandNo?: (to: number, error: string) => void;
  /** A drop or a pick-up refused. */
  onPutNo?: (item: string, error: string) => void;
  onPickNo?: (id: number, error: string) => void;
  /** A real Wheel spin by someone standing on the floor — the stage wheel
   *  mirrors it, and the stage's result screen shows what they got.
   *  Presentational: the outcome is already applied server-side. */
  onWheel?: (slot: number, by: number, info: {
    name?: string;
    outcome?: string;
    tier?: string;
    emojiFile?: string;
    emojiName?: string;
    /** The 32 wedge files THE SERVER chose for this spin, the landed one
     *  carrying the award — so every watcher paints the same wheel. */
    face?: (string | null)[];
  }) => void;
  /** …and that spin killed them. Thrown from where they stood; the seed rides
   *  the wire so every client replays the identical flail. */
  onDeath?: (id: number, x: number, y: number, suit: string, seed: number) => void;
  /** A Slots pull by someone on the floor — the room shows their cabinet's
   *  reels landing the real payline. Symbols only; money never rides this. */
  onSlots?: (id: number, reels: string[]) => void;
  /** The jukebox changed record, or its queue/votes moved. */
  onJuke?: (state: JukeState) => void;
  /** Somebody's right hand changed — a bottle picked up, or put down/emptied. */
  onHold?: (id: number, hold: string) => void;
  /** Somebody took a swig. Only the trigger travels: every client plays the
   *  same raise-tilt-lower off its own clock, so a dropped frame can never
   *  leave a body frozen with a bottle at its lips. */
  onDrink?: (id: number) => void;
  /** Somebody fired. One-shot — muzzle flash + report at their body; whether
   *  it HIT arrives separately as a gundeath. */
  onBang?: (id: number) => void;
  /** Your own ammo, authoritative from the server: after a shot, a reload, or
   *  a dry trigger (`dry`). `err` rides a refused reload ("no_clip"…). */
  onAmmo?: (rounds: number, clips: number, dry: boolean, err?: string) => void;
  /** Somebody swapped magazines — the peers' reload gesture + sound. */
  onReload?: (id: number) => void;
  /** Somebody was SHOT DEAD (cosmetic: 10s on the carpet, respawn at the
   *  entrance). The seed + dir ride the wire so every client throws the victim
   *  the identical way — dir is computed server-side from the two bodies. */
  onGunDeath?: (id: number, by: number, byName: string, x: number, y: number, suit: string, seed: number, dir: number) => void;
  /** Somebody's SLORP trip moved a stage (0 = over). Cosmetic: it changes how
   *  their body carries itself and, at 3, what it sounds like. */
  onSlorp?: (id: number, stage: number) => void;
  /** …and the end of one. The room watches them come apart; the seed rides the
   *  wire so every screen throws the same body into the same mess. */
  onBoom?: (id: number, x: number, y: number, suit: string, seed: number) => void;
  /** Somebody's STAR DUST count moved (0 = sober again). Cosmetic like slorp:
   *  it pitches their voice up on YOUR side, leaks the smoke, swaps clips. */
  onStardust?: (id: number, hits: number) => void;
  /** …and the detonation at the end of a third hit. Same contract as onBoom —
   *  one seed, every observer — but a green cloud instead of a red mess. */
  onPow?: (id: number, x: number, y: number, suit: string, seed: number) => void;
  /** Somebody's EGO swell moved (quarter-doses; 0 = deflated back to normal).
   *  Cosmetic: head scale, a deepened voice, the drunk clips. */
  onEgo?: (id: number, v: number) => void;
  /** …and a head reaching critical mass. One seed, every observer — confetti
   *  where a head used to be, and the body folds. */
  onEgoPop?: (id: number, x: number, y: number, suit: string, seed: number) => void;
  /** The socket closed without us asking: how and after how long. */
  onClose?: (info: FloorCloseInfo) => void;
  /** A handler threw on a frame. Reported, never fatal to the socket. */
  onHandlerError?: (type: string, err: unknown) => void;
}

/** A drink or a drug lying on the carpet for anybody to pick up. */
export interface FloorDrop {
  id: number;
  item: string;
  x: number;
  y: number;
}

export interface FloorCloseInfo {
  code: number;
  reason: string;
  clean: boolean;
  /** Seconds the socket was open (0 = it never opened). */
  openFor: number;
  /** Did the server's welcome ever arrive? */
  welcomed: boolean;
}

export interface FloorNet {
  /** `pitch` rides every frame (peers lean with it); `downSeed` rides the
   *  pose-3 frame of a pass-out so the room folds the identical ragdoll. */
  move(x: number, y: number, yaw: number, p: number, drunk?: boolean, pitch?: number, downSeed?: number): void;
  sit(seat: number | null): void;
  emote(id: string): void;
  /** Put a bottle (or the gun) in your right hand, or "" to empty it. */
  hold(id: string): void;
  /** Take a swig — the one-shot everyone else animates. */
  drink(): void;
  /** Pull the trigger. `hit` is the peer your ray landed on, if any — the
   *  round itself is spent server-side, so a dry gun fires nothing. */
  shoot(hit?: number): void;
  /** Swap magazines (server-guarded — consumes a spare clip). */
  reload(): void;
  /** Announce what stage of a SLORP trip you're at (0 = over). Sent on the
   *  stage CHANGE only; the server drops no-change frames anyway. */
  slorp(stage: number): void;
  /** The end of the trip: you come apart. The server stamps the ten seconds
   *  down and the shared ragdoll seed, exactly as it does for a gun death. */
  pop(): void;
  /** Announce how many STAR DUST hits you're riding (0 = the window drained).
   *  Sent on change only; the server drops no-change frames anyway. */
  stardust(hits: number): void;
  /** The third hit's thirty seconds are up: you detonate. Same server stamp
   *  as pop, broadcast as `pow`. */
  puff(): void;
  /** Announce how swollen your head is (quarter-doses 0..12; 0 = deflated).
   *  Sent on quantised change only. */
  ego(v: number): void;
  /** The creak is over: your head goes. Same server stamp as the others. */
  egopop(): void;
  /** Drop the item in your hand on the carpet. */
  put(item: string): void;
  /** Pick a dropped item up (you must be beside it). */
  pick(id: number): void;
  /** Hand what's in your hand to a player in front of you. */
  hand(to: number): void;
  close(): void;
}

/** `bag`: what's in your pockets right now (the server keeps only what it
 *  agrees you have — see src/casino/pockets.ts). */
export function connectFloor(suit: string, h: FloorHandlers, bag?: () => string[]): FloorNet {
  const token = getToken() ?? "";
  const ws = new WebSocket(`${wsUrl("/ws-casino")}?token=${encodeURIComponent(token)}`);
  let closed = false;
  let openedAt = 0;
  let welcomed = false;

  const send = (msg: unknown): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  ws.onopen = () => {
    openedAt = Date.now();
    send({ type: "enter", suit, bag: bag?.() ?? [] });
  };
  ws.onclose = (ev) => {
    if (closed) return;
    h.onClose?.({
      code: ev.code,
      reason: ev.reason,
      clean: ev.wasClean,
      openFor: openedAt ? Math.round((Date.now() - openedAt) / 1000) : 0,
      welcomed,
    });
  };
  ws.onmessage = (ev) => {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    // A handler that throws on one frame must not take the rest of the
    // frame (or the next one) with it — and somebody should hear about it.
    try {
    switch (m.type) {
      case "welcome":
        welcomed = true;
        h.onWelcome?.(
          m.you as { id: number; gun?: number | null; clips?: number; suit?: string },
          (m.peers as FloorPeer[]) ?? [],
          (m.juke as JukeState | null) ?? null,
        );
        {
          const st = (m.house as { sterling?: { x0: number; x1: number; ago: number; dur: number; face?: number | null; greet?: number } } | null)?.sterling;
          h.onDrops?.(Array.isArray(m.drops) ? (m.drops as FloorDrop[]) : []);
          if (st) h.onHouseMove?.("sterling", { x0: Number(st.x0), x1: Number(st.x1), ago: Number(st.ago) || 0, dur: Number(st.dur) || 0, face: st.face == null ? null : Number(st.face), greet: st.greet === 1 });
        }
        break;
      case "denied":
        h.onDenied?.(String(m.error ?? "denied"));
        break;
      case "join":
        h.onJoin?.(m.peer as FloorPeer);
        break;
      case "pos":
        h.onPos?.(Number(m.id), Number(m.x), Number(m.y), Number(m.yaw), Number(m.p), m.d === 1, Number(m.pt) || 0, Number(m.ds) || 0);
        break;
      case "seat":
        h.onSeat?.(Number(m.id), m.seat === null ? null : Number(m.seat));
        break;
      case "em":
        h.onEmote?.(Number(m.id), String(m.emote ?? ""));
        break;
      case "housemove":
        h.onHouseMove?.(String(m.who ?? ""), { x0: Number(m.x0), x1: Number(m.x1), ago: Number(m.ago) || 0, dur: Number(m.dur) || 0, face: m.face == null ? null : Number(m.face), greet: m.greet === 1 });
        break;
      case "gotitem":
        h.onGotItem?.(String(m.item ?? ""), Number(m.huffs) || 0, String(m.from ?? ""), String(m.how ?? ""));
        break;
      case "drop":
        h.onDrop?.(m.drop as FloorDrop);
        break;
      case "undrop":
        h.onUndrop?.(Number(m.id));
        break;
      case "handed":
        h.onHanded?.(Number(m.to), String(m.item ?? ""), String(m.name ?? ""));
        break;
      case "handno":
        h.onHandNo?.(Number(m.to), String(m.error ?? ""));
        break;
      case "putno":
        h.onPutNo?.(String(m.item ?? ""), String(m.error ?? ""));
        break;
      case "pickno":
        h.onPickNo?.(Number(m.id), String(m.error ?? ""));
        break;
      case "bye":
        h.onBye?.(Number(m.id));
        break;
      case "wheel":
        h.onWheel?.(Number(m.slot), Number(m.by), {
          name: m.name ? String(m.name) : undefined,
          outcome: m.outcome ? String(m.outcome) : undefined,
          tier: m.tier ? String(m.tier) : undefined,
          emojiFile: m.emojiFile ? String(m.emojiFile) : undefined,
          emojiName: m.emojiName ? String(m.emojiName) : undefined,
          face: Array.isArray(m.face)
            ? m.face.map((f) => (f && typeof f === "object" && "file" in f ? String((f as { file: unknown }).file) : null))
            : undefined,
        });
        break;
      case "death":
        h.onDeath?.(Number(m.id), Number(m.x), Number(m.y), String(m.suit ?? "yellow"), Number(m.seed));
        break;
      case "slots":
        h.onSlots?.(Number(m.id), Array.isArray(m.reels) ? m.reels.map(String) : []);
        break;
      case "juke":
        h.onJuke?.(m.state as JukeState);
        break;
      case "hold":
        h.onHold?.(Number(m.id), String(m.hold ?? ""));
        break;
      case "drink":
        h.onDrink?.(Number(m.id));
        break;
      case "bang":
        h.onBang?.(Number(m.id));
        break;
      case "ammo":
        h.onAmmo?.(Number(m.rounds), Number(m.clips ?? 0), m.dry === 1, m.err ? String(m.err) : undefined);
        break;
      case "reload":
        h.onReload?.(Number(m.id));
        break;
      case "gundeath":
        h.onGunDeath?.(
          Number(m.id), Number(m.by), String(m.byName ?? ""),
          Number(m.x), Number(m.y), String(m.suit ?? "yellow"),
          Number(m.seed), Number(m.dir),
        );
        break;
      case "slorp":
        h.onSlorp?.(Number(m.id), Number(m.stage));
        break;
      case "boom":
        h.onBoom?.(
          Number(m.id), Number(m.x), Number(m.y),
          String(m.suit ?? "yellow"), Number(m.seed),
        );
        break;
      case "stardust":
        h.onStardust?.(Number(m.id), Number(m.hits));
        break;
      case "pow":
        h.onPow?.(
          Number(m.id), Number(m.x), Number(m.y),
          String(m.suit ?? "yellow"), Number(m.seed),
        );
        break;
      case "ego":
        h.onEgo?.(Number(m.id), Number(m.v));
        break;
      case "egopop":
        h.onEgoPop?.(
          Number(m.id), Number(m.x), Number(m.y),
          String(m.suit ?? "yellow"), Number(m.seed),
        );
        break;
    }
    } catch (err) {
      h.onHandlerError?.(String(m.type), err);
    }
  };

  return {
    move: (x, y, yaw, p, drunk, pitch, downSeed) =>
      send(downSeed === undefined
        ? { type: "move", x, y, yaw, p, d: drunk ? 1 : 0, pt: pitch ?? 0 }
        : { type: "move", x, y, yaw, p, d: drunk ? 1 : 0, pt: pitch ?? 0, ds: downSeed }),
    sit: (seat) => send({ type: "sit", seat }),
    emote: (id) => send({ type: "em", id }),
    hold: (id) => send({ type: "hold", id }),
    drink: () => send({ type: "drink" }),
    shoot: (hit) => send(hit === undefined ? { type: "shoot" } : { type: "shoot", hit }),
    reload: () => send({ type: "reload" }),
    slorp: (stage) => send({ type: "slorp", stage }),
    pop: () => send({ type: "pop" }),
    stardust: (hits) => send({ type: "stardust", hits }),
    puff: () => send({ type: "puff" }),
    ego: (v) => send({ type: "ego", v }),
    egopop: () => send({ type: "egopop" }),
    put: (item) => send({ type: "put", item }),
    pick: (id) => send({ type: "pick", id }),
    hand: (to) => send({ type: "hand", to }),
    close: () => {
      closed = true;
      send({ type: "leave" });
      ws.close();
    },
  };
}
