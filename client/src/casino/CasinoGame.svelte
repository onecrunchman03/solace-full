<script lang="ts">
  // THE FLOOR — C1: the hall, walked first-person (backrooms controller,
  // same keybinds, same climb rule). C2: PRESENCE — the /ws-casino wire,
  // hazmat peers with the full locomotion set, the suit pick (yellow free,
  // owned variants read-only), and E-to-sit cosmetic seats.
  import { onMount, onDestroy } from "svelte";
  import * as THREE from "three";
  import { createController, PITCH_DOWN_MAX, type PlayerState } from "../backrooms/controller";
  import { brSettings } from "../backrooms/settings.svelte";
  import { HallBloom, loadGlowPref, saveGlowPref } from "./bloom";
  import {
    ensureHazmat, makeAvatar, tickAvatar, disposeAvatar, setAvatarEmote,
    loadEmoteClip, EMOTES,
    makeViewmodel, tickViewmodel, placeViewmodel,
    type PeerAvatar, type Viewmodel,
  } from "../backrooms/world";
  import { joinProximityVoice, type ProximityVoice, type SpatialPeer } from "../backrooms/voicechat";
  // the APP's voice channels — the floor takes over from them on entry
  import { leaveVoice } from "../lib/voice.svelte";
  import { getToken } from "../backrooms/gameapi";
  import { SUIT_SWATCH, suitColorLabel } from "../backrooms/suitcolor";
  import { suitPic, suitPicStyle } from "../lib/suitpic.svelte";
  import { api } from "../lib/api";
  import { isDesktopShell, isMac } from "../lib/platform";
  import { acquirePointerLock, isTeleport } from "../lib/pointerlock";
  import { Chess, type Square } from "chess.js";
  import { CasinoWorld, loadCasinoAssets, buildHall, resetWheelFace, CELL, EYE, SPAWN, type Hall, type SlotWinTier, type SterlingGlide } from "./world";
  import { SEATS, STATIONS, DOOR, ESCAPE_DOOR, H, W as HALL_W, type Station, slotSectionAt, type SlotSection } from "./layout";
  import { standOff } from "./standoff";
  import { createDeathThrower, type DeathThrower } from "./deaths";
  import { connectFloor, type FloorCloseInfo, type FloorNet, type FloorPeer, type FloorDrop, type JukeState } from "./net";
  import { reportNote } from "../lib/errorreport";
  // NB: the panel is JukeboxPanel, not Jukebox — a component file that differs
  // from jukebox.svelte.ts only in case is the same file to Windows.
  import JukeboxPanel from "./JukeboxPanel.svelte";
  import { adoptJukeboxPrefs, applyJukeState, resetJukebox } from "./jukebox.svelte";
  import { tickMusic, stopMusic, setMusicWarp } from "./music";
  import { loadSteps, stepSound } from "./steps";
  import { playSfx, setSfxRate } from "../lib/sfx";
  // the 2D machine's own reward sounds — the floor should pay out in the same
  // voice the Slots view does, not a second sound language
  import { winJingle, coinCascade, loseThud } from "../lib/slots-audio";
  import { THEME_LABELS, THEME_JINGLE } from "./slot-themes";
  import { desiredGhosts } from "./ghosts";
  import { buildFelts, type FeltOverlays } from "./felts";
  import { buildChessBoard, type ChessBoard3D } from "./chessboard";
  import BlackjackStrip from "./strips/BlackjackStrip.svelte";
  import HoldemStrip from "./strips/HoldemStrip.svelte";
  import RouletteStrip from "./strips/RouletteStrip.svelte";
  import PitStrip from "./strips/PitStrip.svelte";
  import ChessStrip from "./strips/ChessStrip.svelte";
  import KioskBet from "./KioskBet.svelte";
  import SterlingShop from "./SterlingShop.svelte";
  import LockerPanel from "./LockerPanel.svelte";
  import LenderStrip from "./strips/LenderStrip.svelte";
  import { drunkState, DRUNK_CLIPS } from "./drunkclips";
  import { gunState, GUN_RESPAWN_MS, GUN_THROW_POWER, GUN_THROW_REACH, FIRE_MIN_MS } from "./gunclips";
  import {
    ensurePistol, givePistol, takePistol, pistolFire, pistolReload, pistolRack, tickGun,
    setSharedMuzzleFlash, pistolWarmProp,
  } from "./gunanim";
  // ONE gesture for the swig: your own arms and the body the room watches are
  // the same rig, the same bone and the same clock — see drinkanim.ts.
  import {
    setHeldDrink, startDrink, tickDrink, scrubDrink, heldModel, heldDrink, isDrinking,
    DRINK_MS, type DrinkRig,
  } from "./drinkanim";
  import { buildJumbotron, type Jumbotron } from "./jumbo.svelte";
  import {
    DRINKS, drinkById, DRUNK_MAX, DRUNK_SHOW, DRUNK_VERT, DRUNK_FRAG, BLACKOUT_MS,
    tickDrunk, applyDrink, drunkK, freshDrunk, type DrunkState,
  } from "./drink";
  import {
    SLORP_VERT, SLORP_FRAG, SLORP_MS, SLORP_THROW_POWER, SLORP_THROW_REACH,
    slorpPhase, slorpPitch, slorpNoiseGap, slorpAmp, slorpMusicWarp, type SlorpPhase,
  } from "./slorp";
  import { slorpDrinkSynth, slorpGurgleSynth, slorpBurstSynth } from "./slorp-audio";
  import {
    MAX_HITS, CANISTER_HUFFS, STARDUST_THROW_POWER, STARDUST_THROW_REACH,
    gasPhase, gasDoom, gasPitch, huffHits, gasSmoke,
  } from "./stardust";
  import { huffSynth, gasPopSynth } from "./stardust-audio";
  import { makeCanister, gasStream, gasCloud, tickGasFx, clearGasFx } from "./stardust-fx";
  import {
    EGO_MAX, EGO_CREAK_MS, EGO_THROW_POWER, EGO_THROW_REACH,
    egoDecay, egoShot, egoHeadScale, egoFish, egoPitch, egoQuant, egoFromWire, egoCreak,
  } from "./ego";
  import { egoGulpSynth, egoCreakSynth, egoPopSynth } from "./ego-audio";
  import { makeShotGlass, egoConfetti, tickEgoFx, clearEgoFx, findHeadBone } from "./ego-fx";
  import { makeVial } from "./vial-fx";
  import { bloodExplosion, tickGore, clearGore } from "./gore";
  import { bj, loadBlackjack, joinTable as bjJoinTable, leaveTable as bjLeaveTable, myLobbyIndex as bjMyLobby } from "../lib/blackjack.svelte";
  import { holdem, loadHoldem, leaveHoldem, inLiveHand as holdemLive } from "../lib/holdem.svelte";
  import { ask } from "../lib/confirm.svelte";
  import { pit, loadPit, myGame as myPitGame } from "../lib/bonepit.svelte";
  import { chessduel, loadChess, myGame as myChessGame, sendMove } from "../lib/chessduel.svelte";
  import { loadLender } from "../lib/lender.svelte";
  import { sterlingLine } from "../lib/sterling-lines";
  import { takeIdle } from "../lib/npcvoice";
  import { roulette, loadRoulette } from "../lib/roulette.svelte";
  import { session } from "../lib/session.svelte";
  import { emoji, refreshOwned } from "../lib/emoji.svelte";
  import { loadDerby, derby } from "../lib/derby.svelte";
  import { loadWallet, wallet } from "../lib/wallet.svelte";
  import { wheel, loadWheelStatus, loadBoards, doSpin, SPIN_MS } from "../lib/wheel.svelte";
  import { pollBigWins } from "./bigwins.svelte";
  import { slots, loadSlots, pullSlots, settleSlotsWallet } from "../lib/slots.svelte";
  import { playSfxAt, playSfxLoop } from "../lib/sfx";
  import Terminated from "../components/Terminated.svelte";
  let { onExit, onEscape, spawnAt = "entrance" }: {
    onExit: () => void;
    onEscape?: () => void;
    /** Where the body appears: the entrance doors, or just inside the escape
     *  room's door (walking back out of the ante-room must not teleport you
     *  across the hall — Josh, Aug 2026). */
    spawnAt?: "entrance" | "escape";
  } = $props();
  let holder: HTMLDivElement;
  let loading = $state(true);
  let failed = $state(false);
  let deniedMsg = $state("");
  let locked = $state(false);
  let wasLocked = $state(false);
  let lockFallback = false;
  /** A refused lock leaves you unlocked on purpose — say so, or it reads as
   *  the floor having stopped responding. */
  let lockHint = $state(false);
  let crouching = false;
  let connected = $state(false);
  let mySeat = $state<number | null>(null);
  /** Set by a fresh welcome: the frame loop forgets what it last sent. */
  let resendPose = false;
  // ---- THE BAR: three pockets, one hand, and how far gone you are ----------
  // Three DRINK slots (Josh), the backrooms' shape: number keys pick, G sets
  // down, left-click uses what you're holding — plus a FOURTH slot that is
  // the holster: key 4 draws the Casino Gun when you carry it. A slot stays a
  // plain id string ("gun" joins the drink ids); the gun slot is filled from
  // the server's welcome frame, never by buying a drink.
  const GUN_SLOT = 3;
  let bag = $state<(string | null)[]>([null, null, null, null]);
  let bagSel = $state(0);
  // ---- THE GUN: ammo (authoritative from the wire) + being shot ------------
  /** Rounds in the carried gun; null = no gun carried. */
  let gunRounds = $state<number | null>(null);
  let gunClips = $state(0);
  /** Who shot you (their display name) — non-null = you're on the carpet. */
  let shotBy = $state<string | null>(null);
  /** Countdown seconds for the overlay. */
  let shotLeft = $state(0);
  let shotTimer: ReturnType<typeof setInterval> | undefined;
  let respawnHook: (() => void) | null = null;
  // PLAIN, not $state (Aug 2026 perf review): tickDrunk writes level every
  // frame while drunk, and a deep-proxy write flushes Svelte effects at 60Hz
  // for the length of a bender. The HUD reads the quantized mirror below.
  let drunk: DrunkState = freshDrunk();
  /** HUD mirror of drunk.level, in half-point steps. */
  let drunkUi = $state(0);
  let outCold = $state(false);
  // ---- SLORP (Josh, Aug 2026) — see casino/slorp.ts for the programme ------
  /** When the vial went down (performance.now), 0 = not tripping. Client
   *  state on purpose, exactly like the bottle: it is worth nothing to
   *  anybody, and the silver already burned at the counter. Walk out mid-trip
   *  and you left it at the bar. */
  let slorpAt = 0;
  /** The stage the ROOM has been told about — the wire only carries changes. */
  let slorpStage = 0;
  /** The last phase computed, held through the white-out so the pass can fade
   *  out after the body has already come apart. */
  let slorpLast: SlorpPhase | null = null;
  /** Overall weight of the slorp pass, 1 while tripping then decaying. */
  let slorpFade = 0;
  /** The white-out at the pop, 1 → 0. */
  let slorpFlash = 0;
  let lastSlorpNoise = 0;
  /** If the wire never answers a pop, burst locally rather than leaving
   *  somebody stuck mid-hallucination. */
  let popFallback: ReturnType<typeof setTimeout> | undefined;
  /** True while a trip is running — the shop refuses to sell you a second. */
  let tripping = $state(false);
  const SLORP_TOASTS: Record<number, string> = {
    1: "the lights are getting friendly",
    2: "the room has started moving",
    3: "something is very wrong",
  };
  // ---- STAR DUST (Josh, Aug 2026) — see casino/stardust.ts -----------------
  /** Hits currently riding (0 = sober) and when the LAST one went down — every
   *  huff resets the ten-minute window. Client state like the bottle. */
  let gasHits = 0;
  let gasAt = 0;
  /** The third hit's timestamp. Thirty seconds of shake, then the pop. */
  let gasDoomAt = 0;
  /** Pass weight for the neon, eased out on sobriety/pop — slorpFade's twin —
   *  and the glow it's fading FROM (hits drop to 0 the moment it expires). */
  let gasFade = 0;
  let gasGlowHeld = 0;
  /** The bottom-left "gassed" meter (0..1) and its pinned-red doom state. */
  let gasLevel = $state(0);
  let gasMaxed = $state(false);
  /** Huffs left in the canister in your pocket (a can holds three). */
  let canister = $state(0);
  /** The hits count the room was last told. */
  let gasWire = 0;
  let puffFallback: ReturnType<typeof setTimeout> | undefined;
  const GAS_TOASTS: Record<number, string> = {
    1: "the room goes a little neon",
    2: "everything sparkles. something gurgles",
    3: "TOO MUCH — your insides start to rumble",
  };
  // ---- EGO (Josh, Aug 2026) — see casino/ego.ts ----------------------------
  /** The swell meter: +1 per shot, draining continuously — the head and the
   *  fisheye both read it, so sobering is smooth by construction. */
  let egoS = 0;
  /** When the creak began (swell hit 3), 0 = not critical. */
  let egoCreakAt = 0;
  let lastEgoCreakSfx = 0;
  /** The quantised swell the room was last told. */
  let egoWire = 0;
  /** HUD: the meter (0..1) and the pinned-critical flash. */
  let egoLevel = $state(0);
  let egoMaxed = $state(false);
  let egoPopFallback: ReturnType<typeof setTimeout> | undefined;
  const EGO_TOASTS: Record<number, string> = {
    1: "you feel… correct about everything",
    2: "doorways seem narrower than they used to be",
    3: "SOMETHING CREAKS — you have never been more right in your life",
  };
  /** How much of the drunk body's own head movement the LENS takes, at full
   *  drunkenness. Over 1 because the clips are animating a head that is
   *  already inside the mask — a share under 1 reads as a steady view over a
   *  swaying model, which is the thing being fixed. */
  const LOOK_SWAY = 0.8;
  /** …and never further than this from where your eye actually is. */
  const LOOK_MAX = 0.085;
  /** Set inside onMount, where the camera lives — swapping the model in hand
   *  needs the scene, but buying happens up here in the shop panel. */
  let syncHandHook: (() => void) | null = null;
  /** The stake dialog's confirm lives in the mount closure (it re-locks the
   *  pointer and calls onEscape); the markup reaches it through this hook. */
  let stakeAndEnterHook: ((code: string) => Promise<void>) | null = null;
  /** Puts a bought bottle in the first free DRINK pocket (the gun slot is
   *  not a pocket a bottle can land in). False = hands full. */
  const takeDrink = (id: string): boolean => {
    const k = bag.findIndex((b, i) => b === null && i !== GUN_SLOT);
    if (k < 0) return false;
    bag[k] = id;
    bagSel = k;
    syncHandHook?.();
    return true;
  };
  /** GIVING (Oct 2026): whatever somebody bought you, handed you, or you
   *  picked up off the carpet. A canister arrives with however many huffs
   *  are left in it. */
  const takeItem = (id: string, huffs = 0): boolean => {
    if (id === "stardust") {
      if (!takeStardust()) return false;
      if (huffs > 0) canister = Math.min(CANISTER_HUFFS, huffs);
      return true;
    }
    return takeDrink(id);
  };
  /** What a pocket item is called, for prompts and toasts. */
  const itemName = (id: string): string =>
    id === "stardust" ? "a can of Star Dust"
    : id === "ego" ? "a shot of EGO"
    : id === "slorp" ? "a vial of Slorp"
    : `a ${drinkById(id)?.name ?? id}`;
  /** Everybody else on the floor — who a round can be bought for. */
  let floorPeople = $state<{ id: number; name: string }[]>([]);
  /** A dropped item at your feet (E picks it up). */
  let nearDrop = $state<{ id: number; item: string } | null>(null);
  /** Somebody in front of you to hand what you're holding to (H). */
  let handTo = $state<{ id: number; name: string } | null>(null);
  /** Sterling hands over a STAR DUST canister: it lands in a free drink
   *  pocket holding CANISTER_HUFFS huffs. One can at a time — the pocket IS
   *  the inventory, client state exactly like the bottles. */
  const takeStardust = (): boolean => {
    if (bag.includes("stardust")) return false;
    const k = bag.findIndex((b, i) => b === null && i !== GUN_SLOT);
    if (k < 0) return false;
    bag[k] = "stardust";
    bagSel = k;
    canister = CANISTER_HUFFS;
    syncHandHook?.();
    return true;
  };
  /** Sterling's counter changed your armament: rounds < 0 means "unchanged".
   *  Fills or empties the holster slot to match. */
  const setArmament = (rounds: number, clips: number): void => {
    if (rounds >= 0) gunRounds = rounds;
    gunClips = clips;
    bag[GUN_SLOT] = gunRounds !== null ? "gun" : null;
    if (bag[GUN_SLOT] === null && bagSel === GUN_SLOT) bagSel = 0;
    syncHandHook?.();
  };
  /** The locker moved things: re-read the carried set. A gun stored while it
   *  was in your hand leaves the hand (syncHand tells the room). */
  const onLockerInv = (inv: { item: string; qty: number }[]): void => {
    const g = inv.find((i) => i.item === "gun");
    gunRounds = g ? g.qty : null;
    gunClips = inv.find((i) => i.item === "clip")?.qty ?? 0;
    bag[GUN_SLOT] = g ? "gun" : null;
    if (!g && bagSel === GUN_SLOT) bagSel = 0;
    syncHandHook?.();
  };
  let nearSeat = $state<number | null>(null);

  // ---- C3: the stations — the REAL games, docked over the floor -------------
  // `station` non-null = the overlay is open: pointer lock is released, keys
  // belong to the game view, the body stays where it stood (peers still see
  // it; a seat taken on the way in stays taken). These are the SAME prop-less
  // components the 2D hub lazy-loads — the floor is presentation, the money
  // paths all stay theirs.
  let station = $state<Station | null>(null);
  // RAW: the frame loop assigns this every frame, and a deep $state proxies a
  // fresh object per assignment (and an effect flush) every frame.
  let nearStation = $state.raw<Station | null>(null);
  let nearDoor = $state(false);
  /** At the ESCAPE ROOM door on the north wall. */
  let nearEscape = $state(false);
  /** The stake dialog: null closed, else the owned rares to pick from. */
  let stakeOpen = $state<null | { code: string; name: string; url: string }[]>(null);
  let stakeBusy = $state(false);
  let stakeErr = $state("");
  // NO 2D GAME WINDOWS ANYWHERE (Josh, third and final telling): every game
  // plays top-down IN the world — the felts carry the live state (felts.ts),
  // the chess set moves its own men (chessboard.ts), and a station only adds
  // a thin ACTION STRIP of choices along the bottom. The wheel and slots
  // don't even need that; the kiosk keeps its slim racer-bet screen.

  // ---- IN-WORLD PLAY: the wheel and the slots (no overlays) -----------------
  // A small toast is the whole UI — the ROOM is the rest of it: the stage
  // wheel turns via the server mirror, the cabinet's own reels land the
  // result, the wallet chip moves.
  let toast = $state<{ text: string; kind: "win" | "info" | "bad" } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const showToast = (text: string, kind: "win" | "info" | "bad" = "info", ms = 4200): void => {
    toast = { text, kind };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), ms);
  };
  let nearSlotIdx = $state<number | null>(null);
  /** the section of the cabinet in front of you — its name and its stake */
  let nearSlotSec = $state<SlotSection | null>(null);
  let pulling = $state(false);
  let floorSpinning = $state(false);

  // ---- THE LIVE FELTS + THE LIVE CHESS SET ---------------------------------
  // Built once the hall stands; the $effects below repaint them from the same
  // stores the 2D hub uses, so a felt is always current — player or passer-by.
  let felts = $state<FeltOverlays | null>(null);
  let jumbo: Jumbotron | null = null;
  /** The hall, surfaced for component-level effects (roulette spin trigger). */
  let hallS = $state<Hall | null>(null);
  let rouSpinRound = -1;
  $effect(() => {
    const st = roulette.state;
    if (!hallS || !st || st.phase !== "spinning" || st.pocket === null) return;
    if (st.round === rouSpinRound) return;
    rouSpinRound = st.round;
    hallS.spinRoulette(st.pocket, Math.max(1500, (st.endsAt ?? Date.now()) - Date.now()));
  });
  // $state, NOT a plain let (Aug 2026 — "the chess board does not work"): the
  // set builds seconds AFTER the chess API loads, and the paint effect below
  // had already run and returned on the null board. Nothing re-triggered it
  // until the next move BROADCAST, so a walk-up to a game in progress showed
  // the opening position and every click died against board3d === null.
  let board3d = $state<ChessBoard3D | null>(null);
  let chessFrom = $state<string | null>(null);
  $effect(() => {
    if (!felts) return;
    for (let i = 0; i < 4; i++) felts.bj(i, bj.lobbies[i] ?? null, session.user?.id ?? 0);
  });
  // the stage's spin clock, fed from the wheel store (which refreshes on every
  // spin and on the 2-hour reset)
  $effect(() => {
    hallS?.showSpinReset(wheel.nextReset, wheel.spins.total);
  });
  $effect(() => {
    felts?.holdem(holdem.lobby?.tables[0] ?? null, session.user?.id ?? 0);
  });
  $effect(() => {
    felts?.roulette(roulette.state, roulette.revealed);
  });
  $effect(() => {
    felts?.pit(
      myPitGame() ?? pit.games.find((g) => g.phase === "playing") ?? pit.games.find((g) => g.phase === "gathering") ?? null,
      session.user?.id ?? -1,
    );
  });
  // the duel on the table: mine, else the liveliest — men move with the FEN
  const shownChessGame = $derived(
    myChessGame() ?? chessduel.games.find((g) => g.status === "active") ?? chessduel.games[0] ?? null,
  );
  $effect(() => {
    if (!board3d) return;
    board3d.setFEN(shownChessGame?.fen ?? null);
    // The 2D board's last-move wash, on the felt too.
    const lm = shownChessGame?.lastMove ?? null;
    const last: [string, string] | null = lm ? [lm.from, lm.to] : null;
    board3d.setMarks({ from: chessFrom, targets: chessTargets(), last });
  });
  const chessTargets = (): string[] => {
    if (!chessFrom || !shownChessGame) return [];
    try {
      const c = new Chess(shownChessGame.fen);
      return c.moves({ square: chessFrom as Square, verbose: true }).map((m) => m.to);
    } catch {
      return [];
    }
  };
  const myChessColor = (): "w" | "b" | null => {
    const g = shownChessGame;
    const me = session.user?.id;
    if (!g || me == null) return null;
    return g.white.id === me ? "w" : g.black.id === me ? "b" : null;
  };
  /** A click on the board while the chess station is open: select, then move. */
  const chessClick = (e: MouseEvent): void => {
    if (!board3d || !cameraRef || !renderer) return;
    const g = shownChessGame;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cameraRef);
    const hit = ray.intersectObject(board3d.pickPlane, false)[0];
    if (!hit) return;
    const sq = board3d.squareAt(hit.point);
    if (!sq) return;
    const color = myChessColor();
    if (!g || g.status !== "active" || !color || g.turn !== color) return;
    if (!chessFrom) {
      // only pick up your own man
      try {
        const c = new Chess(g.fen);
        const piece = c.get(sq as Square);
        if (piece && piece.color === color) chessFrom = sq;
      } catch {
        /* bad FEN mid-broadcast — ignore the click */
      }
      return;
    }
    if (sq === chessFrom) {
      chessFrom = null;
      return;
    }
    const from = chessFrom;
    chessFrom = null;
    // auto-queen, the house rule everywhere here
    void sendMove(g.id, from, sq, "q").then((ok) => {
      if (ok) playSfx("chess-move", 0.5);
    });
  };

  /** The tier of MY OWN win, whose value the pull response told me — the same
   *  rungs the 2D machine's jingle steps through. */
  const winTier = (payout: number): SlotWinTier =>
    payout >= 200 ? "jackpot" : payout >= 40 ? "big" : payout >= 10 ? "good" : "small";
  /** A PEER's win, tiered from the payline alone. The floor wire carries
   *  symbols and never money (routes/slots.ts), so this reads the machine's
   *  SYMBOL ladder instead of its paytable — a triple is a big win and a
   *  triple of crowns is the top of the machine, and both stay true however
   *  the payouts are retuned. Two-of-a-kind pays but is indistinguishable
   *  from a near miss here, so it passes quietly. */
  const peerWinTier = (reels: string[]): SlotWinTier | null => {
    if (reels.length !== 3 || reels[0] !== reels[1] || reels[1] !== reels[2]) return null;
    if (reels[0] === "crown") return "jackpot";
    return reels[0] === "diamond" || reels[0] === "seven" ? "big" : "good";
  };
  /** What a peer's tier sounds like — the jingle picks its run from a number,
   *  so each rung lends it a representative one. */
  const TIER_TONE: Record<SlotWinTier, number> = { small: 4, good: 20, big: 80, jackpot: 250 };

  // ---- proximity voice (the backrooms spatial graph, casino room) ----------
  let voice: ProximityVoice | null = null;
  // A floor reconnect re-runs the welcome; LiveKit doesn't care about the
  // floor socket, so a room already up (or joining) is kept (Oct 2026 review:
  // every reconnect joined a SECOND room and leaked the first, AudioContext
  // and all).
  let voiceJoining = false;
  /** A slot pull whose reels are still turning (settled on destroy). */
  let pendingPull: Awaited<ReturnType<typeof pullSlots>> = null;
  let voiceOn = $state(false);
  /** In the room and hearing it, but the microphone wouldn't start. */
  let micBroken = $state(false);
  let micMuted = $state(false);
  const casinoGrant = async (): Promise<{ token: string; url: string }> => {
    const res = await fetch("/api/casino/voice-token", {
      method: "POST",
      headers: { authorization: `Bearer ${getToken() ?? ""}`, "content-type": "application/json" },
      body: "{}",
    });
    if (!res.ok) throw new Error("voice_grant_failed");
    return (await res.json()) as { token: string; url: string };
  };

  // ---- the emote wheel (hold B — the backrooms dances, casino floor) --------
  let wheelOpen = $state(false);
  let wheelX = $state(0);
  let wheelY = $state(0);
  let wheelPick = $state<number | null>(null);
  let dancing = $state(false);

  /**
   * WHAT THIS SPOT DOES, if anything. Only ever an AFFORDANCE — the thing in
   * front of you and the key that works it — never a tutorial: Josh, Aug
   * 2026, "take away the how to play hints in the middle". The old fallback
   * ("WASD · SHIFT run · B emote · ESC menu") is gone, which is also why this
   * is a string rather than an always-rendered chain: an empty prompt renders
   * NO box at all, so standing in the middle of the room shows a clean floor.
   */
  const prompt = $derived.by(() => {
    if (dancing) return "the dance plays out — mouse orbits";
    if (pulling) return "the reels are running…";
    if (nearSlotIdx !== null) {
      const sec = nearSlotSec;
      const free = (sec?.stake ?? 10) === 10 && slots.freePulls > 0 ? " · free pull" : "";
      return `E — pull the lever · ${sec?.name ?? "SLOTS"} · ${sec?.stake ?? slots.cost} silver${free}`;
    }
    if (nearStation?.game === "wheel") {
      if (floorSpinning || wheel.spinning) return "the wheel is spinning…";
      if (wheel.spins.total <= 0) return "no spins left — more at the reset";
      return `E — spin the Wheel · ${wheel.spins.total} left`;
    }
    if (handTo && bagSel !== GUN_SLOT && bag[bagSel]) return `H — hand ${itemName(bag[bagSel]!)} to ${handTo.name}`;
    if (nearDrop) return `E — pick up ${itemName(nearDrop.item)}`;
    if (nearStation && nearSeat !== null) return `E — sit & play ${nearStation.prompt ?? nearStation.label}`;
    if (nearStation) return `E — ${nearStation.prompt ?? `play ${nearStation.label}`}`;
    if (nearDoor) return "E — leave the casino";
    if (nearEscape) return "E — the Escape Room";
    if (mySeat !== null) return "move to stand up";
    if (nearSeat !== null) return "E — take a seat";
    return "";
  });
  // The ring grew with the list (Aug 2026): ELEVEN 96px pills need 112px of
  // chord between neighbours, which r=150 could not give (85px — the labels
  // sat on top of each other). Picking is by ANGLE, so the radius is layout
  // only; the cursor clamp rides it so the dot still reaches the pills.
  const WHEEL_R = 200;
  const wheelAngle = (i: number): number => (i * 2 * Math.PI) / EMOTES.length - Math.PI / 2;
  const updateWheelPick = (): void => {
    const r = Math.hypot(wheelX, wheelY);
    if (r < 36) {
      wheelPick = null;
      return;
    }
    const step = (2 * Math.PI) / EMOTES.length;
    const ang = Math.atan2(wheelY, wheelX) + Math.PI / 2;
    wheelPick = ((Math.round(ang / step) % EMOTES.length) + EMOTES.length) % EMOTES.length;
  };

  // ---- the suit pick (yellow free; owned variants — read-only check) -------
  // The suit survives the session (E2c): the escape room walks in wearing
  // whatever you last wore on the floor, and the floor itself remembers.
  // Per-machine like device picks; the server re-validates ownership anyway.
  let suit = $state(localStorage.getItem("solace_suit") || "yellow");
  /** THE GLOW (Oct 2026): the Vegas look's light spill, a preview switch in
   *  the pause menu so it can be compared on and off (casino/bloom.ts). */
  let glowOn = $state(loadGlowPref());
  let ownedSuits = $state<string[]>([]);
  onMount(() => {
    void api
      .backroomsMe()
      .then((me) => {
        const colors = new Set<string>();
        for (const i of me.items) if (i.kind === "suit") colors.add(i.color ?? "yellow");
        colors.delete("yellow");
        ownedSuits = [...colors];
      })
      .catch(() => {});
  });

  let renderer: THREE.WebGLRenderer | null = null;
  let cameraRef: THREE.PerspectiveCamera | null = null;
  let net: FloorNet | null = null;
  // THE FLOOR COMES BACK (Josh, Oct 2026: "on my mac i never see anyone in
  // the casino i just saw rollo and he disapeeared"). A dropped socket used
  // to leave you walking a frozen, emptying copy of the room with nothing
  // said; now it reconnects on its own, backing off, and says so.
  let reconnectTries = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let raf = 0;
  // Guards the two seconds-long async windows (asset load, voice connect)
  // against a player backing out mid-way. Without it the voice join resolved
  // onto the dead component — leave() was never called, and a HOT MIC plus a
  // live LiveKit room + Web Audio graph ran invisibly for the rest of the app
  // session, one more copy per occurrence (found in the Aug 2026 perf review).
  let disposed = false;
  const cleanupFns: (() => void)[] = [];

  onMount(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 140);
    cameraRef = camera;
    // frame-loop temps (no per-frame allocation): the player's eye, and the
    // table shot's target while a station dock is open
    const eyeTmp = new THREE.Vector3();
    const camTmp = new THREE.Vector3();
    /** The eased lens offset that carries the drunk body's stagger. */
    const lensSway = new THREE.Vector3();
    // `alpha` is load-bearing, not cosmetic: the jumbotron's racetrack is REAL
    // DOM sitting behind this canvas, and the only way anything in the hall can
    // stand in front of it is for the screen's own quad to punch a transparent
    // hole through the frame (jumbo.svelte.ts). Nothing else is transparent —
    // the room's own walls fill the view.
    renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: true, powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    holder.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    // The canvas stays STATIC on purpose. Positioning it (to sit over the
    // jumbotron's DOM layer) put it above every HUD element — those are
    // absolutely positioned with an automatic z-index, and positioned content
    // paints over in-flow content, so a canvas with z-index 1 swallowed the
    // hotbar and the wallet chip. The layer goes to z-index -1 instead, which
    // paints above .casino's own background and below everything else.

    // The held bottle hangs off the CAMERA, and three only draws what it can
    // reach from the scene root — so the camera has to be in the graph. (The
    // viewmodel dodges this by living in the scene and being placed by hand.)
    scene.add(camera);
    const world = new CasinoWorld();
    // Returning from the escape ante-room re-enters AT ITS DOOR (facing the
  // hall), not back at the entrance — you walked out of a room, not into
  // the building. Forward is (−sin yaw, −cos yaw), so π faces south.
  // Forward is (−sin yaw, −cos yaw), so facing the door's own `face` (into
  // the room) is yaw = atan2(−fx, −fy): π on the classic north wall.
  const startPose =
    spawnAt === "escape"
      ? {
          x: ESCAPE_DOOR.x + ESCAPE_DOOR.face[0] * 1.1,
          y: ESCAPE_DOOR.y + ESCAPE_DOOR.face[1] * 1.1,
          yaw: Math.atan2(-ESCAPE_DOOR.face[0], -ESCAPE_DOOR.face[1]),
        }
      : SPAWN;
  const player: PlayerState = { x: startPose.x, y: startPose.y, yaw: startPose.yaw, pitch: 0, moving: false, alt: 0 };
    const ctl = createController(player, world);
    // dev/verification hook, same convention as the backrooms' __brDbg. The
    // camera + THREE ride along so a probe can unproject a screen pixel onto a
    // known plane — how the felt's printed betting boxes were measured.
    (window as unknown as { __cas?: unknown }).__cas = {
      player, world, camera, THREE,
      // __cas.glow(true, { strength, threshold, knee, radius }) — tune by eye
      glow: (on?: boolean, t?: Partial<typeof bloom.tuning>) => {
        if (on !== undefined) glowOn = on;
        if (t) Object.assign(bloom.tuning, t);
        return { on: glowOn, ...bloom.tuning };
      },
    };
    cleanupFns.push(() => delete (window as unknown as { __cas?: unknown }).__cas);

    // THE DRUNK PASS — a render target and a fullscreen quad. Idle until the
    // first drink; see casino/drink.ts for why double vision has to be a real
    // second sample rather than a blur.
    // samples: the canvas is antialiased, so the target must be too or the
    // whole hall visibly degrades the moment anyone has a drink.
    // samples 2, not 4 (Aug 2026 perf review): the drunk pass's own blur and
    // double vision hide the difference, and 4× MSAA at full DPR was doubling
    // the intoxicated frame's bandwidth on top of the extra pass.
    const drunkRT = new THREE.WebGLRenderTarget(2, 2, { samples: 2 });
    const drunkMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: drunkRT.texture },
        uK: { value: 0 },
        uTime: { value: 0 },
        uDark: { value: 0 },
        // DECLARED HERE OR THE FLOOR FREEZES. Slorp added uEncode to
        // DRUNK_FRAG and the frame loop's write, but not to this list — so
        // the first drink after that ship threw "cannot set 'value' of
        // undefined" every frame, AFTER the scene rendered into the target
        // and BEFORE the quad wrote the canvas: the screen held its last
        // frame until the meter decayed under 0.02. test_slorp now sweeps
        // every uniform write in this file against these declarations.
        uEncode: { value: 1 },
      },
      vertexShader: DRUNK_VERT,
      fragmentShader: DRUNK_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const drunkScene = new THREE.Scene();
    drunkScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), drunkMat));
    const drunkCam = new THREE.Camera();
    // …and SLORP's, which can run after it (see casino/slorp.ts). A second
    // target only exists for the both-at-once case: drunk writes into it and
    // slorp samples it, rather than either pass reading what it is writing.
    const slorpRT = new THREE.WebGLRenderTarget(2, 2, { samples: 2 });
    const slorpMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uColour: { value: 0 },
        uBend: { value: 0 },
        uFear: { value: 0 },
        uFlash: { value: 0 },
        // STAR DUST rides this pass (Aug 2026): the neon and the doom shake.
        uGas: { value: 0 },
        uGasShake: { value: 0 },
        // …and EGO's fisheye, tracking the swelling head.
        uEgo: { value: 0 },
        uEncode: { value: 1 },
      },
      vertexShader: SLORP_VERT,
      fragmentShader: SLORP_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const slorpScene = new THREE.Scene();
    slorpScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), slorpMat));
    // THE GLOW: renders the room itself (in place of a plain scene render)
    // and hands the next pass, or the canvas, the room with its light spill.
    const bloom = new HallBloom();
    cleanupFns.push(() => {
      bloom.dispose();
      drunkRT.dispose();
      drunkMat.dispose();
      slorpRT.dispose();
      slorpMat.dispose();
      clearGore(); // the carpet is cleaned between visits
      clearGasFx(); // …and the air (STAR DUST's smoke + clouds)
      clearEgoFx(); // …and the confetti (EGO's former heads)
      // Walking out mid-trip must not leave the whole app pitched: these are
      // process-wide, and the floor is the only thing that ever moves them.
      setSfxRate(1);
      setMusicWarp(slorpMusicWarp(null, 0));
    });
    /** What the bag says is in your hand, so a change can be pushed to the
     *  room once rather than every frame. The bottle itself hangs off the
     *  viewmodel's hand bone, put there by the frame loop (drinkanim.ts) —
     *  exactly like every other body in the hall. */
    let heldId: string | null = null;
    let drinkAnim = 0;
    /** A swig your own first-person arm still has to play. Same shape as
     *  standInSwig below: the click knows, the body finds out on its frame. */
    let vmSwig = false;
    /** A swig your own STAND-IN body still has to play — set when you drink,
     *  consumed by the body loop. The stand-in is built lazily (only while a
     *  table shot is up), so the trigger can't be delivered straight to it. */
    let standInSwig = false;
    /** Review-only: hold the debug taster's swig at a fixed phase (__cas.drinkPhase). */
    let drinkFreeze: number | null = null;
    /** Throttle for the post-chain fallback's error line (see the frame loop). */
    let lastPostErrAt = 0;

    /** Announce whatever pocket `bagSel` is on. The MODEL is the frame loop's
     *  job (it hangs off the hand bone); this only has to tell the room, which
     *  is why it fires on change rather than every frame. `hold` is persisted
     *  server-side, so a newcomer still walks in on your bottle. */
    const syncHand = (): void => {
      const want = bag[bagSel] ?? null;
      if (want === heldId) return;
      heldId = want;
      net?.hold(want ?? "");
    };
    syncHandHook = syncHand;
    cleanupFns.push(() => { syncHandHook = null; });
    /** THE ESCAPE ROOM DOOR. Pass in hand → straight through; otherwise the
     *  stake dialog (your rares, one burns). The gun is refused BY NAME — it
     *  stays in the casino locker, and the server re-checks all of this. */
    const openEscapeDoor = async (): Promise<void> => {
      if (!onEscape) return;
      try {
        const t = await api.escape();
        if (t.gunCarried) {
          showToast("the gun stays here — store it in the casino locker first", "bad");
          return;
        }
        if (t.pass) {
          onEscape();
          return;
        }
        const rares = emoji.owned
          .filter((e) => e.tier === t.stakeTier)
          .map((e) => ({ code: e.code, name: e.name, url: `/emoji/${e.file}` }));
        stakeErr = rares.length ? "" : "the door wants a RARE — you don't own one";
        stakeOpen = rares;
        if (document.pointerLockElement) document.exitPointerLock();
      } catch {
        showToast("the door isn't answering", "bad");
      }
    };
    const stakeAndEnter = async (code: string): Promise<void> => {
      if (stakeBusy) return;
      stakeBusy = true;
      stakeErr = "";
      try {
        await api.escapeStake(code);
        void refreshOwned(); // one rare fewer, everywhere in the app
        stakeOpen = null;
        onEscape?.();
      } catch (err) {
        stakeErr =
          (err as { error?: string }).error === "already_passed"
            ? "you already hold a pass"
            : "the stake was refused";
      } finally {
        stakeBusy = false;
      }
    };
    stakeAndEnterHook = stakeAndEnter;
    cleanupFns.push(() => { stakeAndEnterHook = null; });

    // ---- STAR DUST: the huff ---------------------------------------------
    /** Left-click with the canister selected. The same raise-to-the-face
     *  gesture as a swig (one rig, one wire frame — the room sees a canister
     *  at your lips), but what goes down is a hit: the window resets, the
     *  neon steps up, and the third one starts a clock nothing stops. */
    const takeHuff = (): void => {
      if (outCold || shotBy || gasDoomAt || drinkAnim > 0) return;
      if (canister <= 0) return;
      canister--;
      drinkAnim = DRINK_MS;
      vmSwig = true;
      standInSwig = true;
      net?.drink(); // the one-shot gesture every peer plays with the canister
      playSfx("stardust-huff", 0.85, () => huffSynth(0.85));
      // NEVER MIX DRINK WITH COMPRESSED GAS (Josh, Aug 2026): a huff taken
      // hammered counts DOUBLE — a drunk with a canister can reach the line
      // on the second press of the valve, and this toast is the only warning.
      const worth = huffHits(drunk.level);
      gasHits = Math.min(MAX_HITS, gasHits + worth);
      gasAt = performance.now();
      gasFade = 1;
      gasWire = gasHits;
      net?.stardust(gasHits);
      if (worth > 1) showToast("the drink thins it out — that huff counted TWICE", "bad");
      else showToast(GAS_TOASTS[gasHits] ?? "", gasHits >= MAX_HITS ? "bad" : "info");
      if (gasHits >= MAX_HITS) {
        gasDoomAt = performance.now();
        gasMaxed = true;
      }
      if (canister <= 0) {
        // the can is spent — it leaves the hand once the huff lands
        window.setTimeout(() => {
          const k = bag.indexOf("stardust");
          if (k >= 0) bag[k] = null;
          syncHand();
        }, DRINK_MS * 0.6);
      }
    };

    // ---- EGO: the shot ---------------------------------------------------
    /** Left-click with the shot glass selected. The swig gesture, a goopy
     *  triple-glug, and one more dose on the swell — the glass empties like a
     *  bottle. The shot that puts you at three starts a creak nothing stops. */
    const takeEgoShot = (): void => {
      if (outCold || shotBy || egoCreakAt || drinkAnim > 0) return;
      drinkAnim = DRINK_MS;
      vmSwig = true;
      standInSwig = true;
      net?.drink(); // the room watches you knock it back
      playSfx("ego-gulp", 0.8, () => egoGulpSynth(0.8));
      egoS = egoShot(egoS);
      const dose = Math.min(EGO_MAX, Math.ceil(egoS));
      egoWire = egoQuant(egoS);
      net?.ego(egoWire);
      showToast(EGO_TOASTS[dose] ?? "", egoS >= EGO_MAX ? "bad" : "info");
      if (egoS >= EGO_MAX) {
        egoCreakAt = performance.now();
        egoMaxed = true;
      }
      // the glass goes when the swig lands, like a bottle
      window.setTimeout(() => {
        const k = bag.indexOf("ego");
        if (k >= 0) bag[k] = null;
        syncHand();
      }, DRINK_MS * 0.55);
    };

    /** Left-click with a bottle selected: pull it to your face, empty it. */
    const takeSwig = (): void => {
      if (outCold || shotBy || drinkAnim > 0) return;
      const id = bag[bagSel];
      if (!id) return;
      if (id === "stardust") {
        takeHuff();
        return;
      }
      if (id === "ego") {
        takeEgoShot();
        return;
      }
      if (id === "slorp") {
        // a vial somebody gave you (or you picked up): down it like a shot
        if (slorpAt) {
          showToast("you're already on one", "bad");
          return;
        }
        drinkAnim = DRINK_MS;
        vmSwig = true;
        standInSwig = true;
        net?.drink();
        window.setTimeout(() => {
          const k = bag.indexOf("slorp");
          if (k >= 0) bag[k] = null;
          syncHand();
          startSlorpHook?.();
        }, DRINK_MS * 0.55);
        return;
      }
      const d = drinkById(id);
      if (!d) return;
      drinkAnim = DRINK_MS;
      playSfx("drink", 0.75);
      // …and everyone else watches you do it. One-shot: they each play the
      // same raise-tilt-lower off their own clock.
      net?.drink();
      standInSwig = true;
      vmSwig = true;
      // the bottle goes when the swig lands, not when it starts — from the
      // slot it STARTED on (Oct 2026 review: changing slot or being handed
      // something mid-swig emptied whichever pocket was selected by then)
      const swigSlot = bagSel;
      const swigId = bag[swigSlot];
      window.setTimeout(() => {
        if (bag[swigSlot] === swigId) bag[swigSlot] = null;
        syncHand();
        const wentDown = applyDrink(drunk, d.kick, performance.now());
        if (wentDown) {
          // Down you go — a CRUMPLE, not a stage throw (Josh, Aug 2026: "just
          // ragdoll the character"). throwOff aims off the stage with
          // THROW_POWER behind it, so passing out at the bar used to fire the
          // body across the hall; collapse drops it where the feet are.
          outCold = true;
          showToast("out cold");
          ctl.keys.clear();
          // ONE SEED, EVERY OBSERVER: the fold you watch is the fold the room
          // watches — the seed rides the pose-3 move frame (and persists on
          // the occupant, so even a newcomer mid-collapse folds this body the
          // same way). Before this, your own client rolled a clock seed and
          // every peer derived one from your user id — the same person folded
          // identically for observers every time, and differently for himself.
          const foldSeed = (Date.now() & 0xffffffff) >>> 0;
          deathsRef?.collapse({
            key: "me", x: player.x, y: player.y, suit: suit || "yellow",
            seed: foldSeed, dir: player.yaw,
          });
          net?.move(player.x, player.y, player.yaw, 3, drunk.level > DRUNK_SHOW, player.pitch, foldSeed); // the room sees you drop
        } else if (drunk.level > DRUNK_MAX * 0.7) showToast("the room is moving");
      }, DRINK_MS * 0.55);
    };

    // ---- THE TRIGGER ---------------------------------------------------------
    /** A reload was asked for; the next ammo frame says whether it happened
     *  (the gesture + sound wait for the server so a clipless click is free
     *  AND silent — the drinkanim honesty rule). */
    let reloadAsked = false;
    /** Nearest peer body along the crosshair ray, or null. A capsule test per
     *  body — the same shape the game reasons about players with everywhere —
     *  rather than mesh raycasts against animated skins. */
    const pickTarget = (): number | null => {
      const org = camera.getWorldPosition(new THREE.Vector3());
      const dir = camera.getWorldDirection(new THREE.Vector3());
      let best: { id: number; t: number } | null = null;
      for (const [id, a] of peers) {
        if (a.pose === 3 || deathsRef?.isDown("p" + id)) continue; // corpses aren't targets
        // capsule: feet → head, radius 0.38m
        const feet = a.group.position;
        for (let h = 0.25; h <= 1.65; h += 0.35) {
          const px = feet.x - org.x, py = feet.y + h - org.y, pz = feet.z - org.z;
          const t = px * dir.x + py * dir.y + pz * dir.z; // along-ray distance
          if (t < 0.3 || t > 80) continue;
          const cx = org.x + dir.x * t, cy = org.y + dir.y * t, cz = org.z + dir.z * t;
          const dd = Math.hypot(feet.x - cx, feet.y + h - cy, feet.z - cz);
          if (dd < 0.38 && (!best || t < best.t)) best = { id, t };
        }
      }
      return best?.id ?? null;
    };
    /** Left-click with the gun drawn. The round is the SERVER'S to spend — the
     *  local decrement is a prediction its ammo frame corrects, and the local
     *  cooldown (FIRE_MIN_MS, mirroring the server's) is what keeps that
     *  prediction honest: clicks the server would refuse play nothing here
     *  either, so the HUD can never run ahead of the real count. */
    let lastFireAt = 0;
    const fireGun = (): void => {
      if (outCold || shotBy || station) return;
      const nowF = performance.now();
      if (nowF - lastFireAt < FIRE_MIN_MS) return;
      if ((gunRounds ?? 0) <= 0) {
        playSfx("gun-empty", 0.6);
        return; // an empty gun clicks locally; nothing worth the wire
      }
      lastFireAt = nowF;
      gunRounds = Math.max(0, (gunRounds ?? 1) - 1);
      if (viewmodel) pistolFire(viewmodel);
      playSfx("gun-shot", 0.9);
      // muzzle climb — a real kick you re-aim from, not a cosmetic shake
      player.pitch = Math.min(1.45, player.pitch + 0.028);
      net?.shoot(pickTarget() ?? undefined);
    };
    // ---- SLORP: down the hatch, and ten minutes later, the carpet ---------
    // Starting is a local act (the silver already burned at the counter over
    // HTTP); the room hears about it one stage at a time.
    startSlorpHook = () => {
      if (slorpAt || outCold || shotBy) return;
      slorpAt = performance.now();
      slorpStage = 0;
      slorpFlash = 0;
      slorpFade = 1;
      tripping = true;
      lastSlorpNoise = performance.now();
      playSfx("slorp-drink", 0.75, slorpDrinkSynth);
      showToast("you knock it back. it tastes like a battery");
    };
    /** The end of the ten minutes. The BODY is the room's business (the server
     *  stamps the seed and the ten seconds down, exactly like a gun death), the
     *  mess and the white-out are everyone's, and the trip lets go of the audio
     *  on its own clock afterwards. */
    const popSlorp = (): void => {
      if (!slorpAt) return;
      slorpAt = 0;
      slorpStage = 0;
      tripping = false;
      slorpFlash = 1;
      net?.pop();
      // MY OWN EXPLOSION COMES BACK OFF THE WIRE, like everyone else's. The
      // server stamps the seed and broadcasts to the whole floor INCLUDING
      // me, so the body I watch is the body the room watches — one appearance,
      // every observer. Bursting locally with a local seed (the first cut)
      // would have flailed my corpse differently from theirs.
      //
      // …unless the wire is dead, in which case the trip must still end: a
      // short fallback bursts on a local seed rather than leaving somebody
      // mid-hallucination forever.
      clearTimeout(popFallback);
      popFallback = setTimeout(() => {
        if (shotBy) return; // the boom landed and did the work
        burstMe(player.x, player.y, (Date.now() ^ 0x51075) >>> 0);
      }, 700);
    };
    /** My own explosion: the ragdoll thrown like a shot body, the spray, the
     *  sound. Shared with the wire handler so a peer's pop and mine are the
     *  same event drawn from the same numbers. */
    /**
     * DEATH SOBERS YOU COMPLETELY (Josh, Aug 2026: "if a player is
     * intoxicated by multiple different substances and one kills them they
     * respawn still affected by the other ones. should be a full reset in
     * sobriety upon death").
     *
     * Every death path used to clear only the substance that did the killing,
     * so an ego pop left you gassed and drunk on the carpet and you stood up
     * still tripping. This clears ALL FOUR — drink, slorp, star dust, ego —
     * and pushes the cleared state to the wire, so the room sees a sober body
     * get up. Called AT DEATH rather than at respawn: the ten seconds down
     * shouldn't be spent watching a neon room through a fisheye.
     *
     * The server clears its own copy on pop/puff/egopop/gundeath; these
     * frames make the client agree rather than relying on that alone (a body
     * that dies with the socket down must still wake up sober).
     */
    const soberUp = (): void => {
      // Alcohol: the meter, the blackout clock, the hangover grace.
      drunk.level = 0;
      drunk.outUntil = 0;
      drunk.hangoverUntil = 0;
      outCold = false;
      // SLORP: the trip, its fade-out, and its stage on the wire.
      slorpAt = 0;
      slorpLast = null;
      slorpFade = 0;
      slorpFlash = 0;
      if (slorpStage !== 0) {
        slorpStage = 0;
        net?.slorp(0);
      }
      setSfxRate(1);
      setMusicWarp(slorpMusicWarp(null, 0));
      voice?.setVoicePitch(1);
      // STAR DUST: hits, the window, the doom clock, the meter.
      gasDoomAt = 0;
      gasAt = 0;
      gasHits = 0;
      gasMaxed = false;
      gasLevel = 0;
      gasGlowHeld = 0;
      gasFade = 0; // the doom shake is frame-local — cleared by gasDoomAt = 0
      if (gasWire !== 0) {
        gasWire = 0;
        net?.stardust(0);
      }
      // EGO: the swell, the creak, the lens.
      egoCreakAt = 0;
      egoS = 0;
      egoMaxed = false;
      egoLevel = 0;
      if (egoWire !== 0) {
        egoWire = 0;
        net?.ego(0);
      }
    };

    const burstMe = (bx: number, by: number, seed: number): void => {
      playSfx("slorp-burst", 0.95, slorpBurstSynth);
      bloodExplosion(scene, bx, by, world.groundAt(bx, by), seed);
      deathsRef?.shot({
        key: "me", x: bx, y: by, suit: suit || "yellow", seed,
        dir: (seed % 628) / 100, // nobody threw you: the burst picks a way
        power: SLORP_THROW_POWER, reach: SLORP_THROW_REACH,
      });
      // From here it IS the gun's death, and for the same reasons: a table
      // left open behind a corpse showed up as a teleport later (Josh's
      // report), and a dance can't outlive its dancer.
      if (station) {
        standUpHook?.();
        station = null;
        chessFrom = null;
      }
      endEmote("slorp");
      ctl.keys.clear();
      soberUp(); // death is a full reset — you don't wake up still on the rest
      shotBy = "you came apart all over the carpet"; // slorp's ending, in full
      clearInterval(shotTimer);
      const deadline = Date.now() + GUN_RESPAWN_MS;
      shotLeft = Math.ceil(GUN_RESPAWN_MS / 1000);
      shotTimer = setInterval(() => {
        shotLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        if (Date.now() >= deadline) {
          clearInterval(shotTimer);
          respawnHook?.();
        }
      }, 250);
    };

    // ---- STAR DUST: the detonation ----------------------------------------
    /** The thirty seconds are up. Same contract as popSlorp: the wire stamps
     *  the consequences (`pow`), a short fallback bursts locally if the
     *  socket is dead rather than leaving somebody shaking forever. */
    const puffGas = (): void => {
      if (!gasDoomAt) return;
      gasDoomAt = 0;
      gasAt = 0;
      gasHits = 0;
      gasWire = 0;
      gasMaxed = false;
      net?.puff();
      clearTimeout(puffFallback);
      puffFallback = setTimeout(() => {
        if (shotBy) return; // the pow landed and did the work
        gasBurstMe(player.x, player.y, (Date.now() ^ 0x94f7) >>> 0);
      }, 700);
    };
    /** My own detonation, shared with the wire handler so a peer's pop and
     *  mine are the same event: Josh's recording, the dissipating green
     *  cloud, and the vial's measured throw numbers. No blood — it's gas. */
    const gasBurstMe = (bx: number, by: number, seed: number): void => {
      playSfx("stardust-pop", 0.95, () => gasPopSynth(0.95));
      gasCloud(scene, bx, by, world.groundAt(bx, by), seed);
      deathsRef?.shot({
        key: "me", x: bx, y: by, suit: suit || "yellow", seed,
        dir: (seed % 628) / 100,
        power: STARDUST_THROW_POWER, reach: STARDUST_THROW_REACH,
      });
      if (station) {
        standUpHook?.();
        station = null;
        chessFrom = null;
      }
      endEmote("stardust");
      ctl.keys.clear();
      soberUp();
      shotBy = "detonated by star dust";
      clearInterval(shotTimer);
      const deadline = Date.now() + GUN_RESPAWN_MS;
      shotLeft = Math.ceil(GUN_RESPAWN_MS / 1000);
      shotTimer = setInterval(() => {
        shotLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        if (Date.now() >= deadline) {
          clearInterval(shotTimer);
          respawnHook?.();
        }
      }, 250);
    };

    // ---- EGO: the pop ------------------------------------------------------
    /** The creak is over. Same contract as the other two: the wire stamps the
     *  consequences (`egopop`), a fallback pops locally if the socket died. */
    const doEgoPop = (): void => {
      if (!egoCreakAt) return;
      egoCreakAt = 0;
      egoS = 0;
      egoWire = 0;
      egoMaxed = false;
      net?.egopop();
      clearTimeout(egoPopFallback);
      egoPopFallback = setTimeout(() => {
        if (shotBy) return; // the egopop frame landed and did the work
        egoBurstMe(player.x, player.y, (Date.now() ^ 0x360d) >>> 0);
      }, 700);
    };
    /** My head, going. Confetti — not gore — where it used to be, a soft fold
     *  where I stood (a head-pop is not an explosion under the body), and the
     *  gun's ten seconds. Shared with the wire handler: one seed, every
     *  observer. */
    const egoBurstMe = (bx: number, by: number, seed: number): void => {
      playSfx("ego-pop", 0.95, () => egoPopSynth(0.95));
      egoConfetti(scene, bx, by, world.groundAt(bx, by) + 1.6, seed);
      deathsRef?.shot({
        key: "me", x: bx, y: by, suit: suit || "yellow", seed,
        dir: (seed % 628) / 100,
        power: EGO_THROW_POWER, reach: EGO_THROW_REACH,
      });
      if (station) {
        standUpHook?.();
        station = null;
        chessFrom = null;
      }
      endEmote("ego");
      ctl.keys.clear();
      soberUp();
      shotBy = "popped by your own ego";
      clearInterval(shotTimer);
      const deadline = Date.now() + GUN_RESPAWN_MS;
      shotLeft = Math.ceil(GUN_RESPAWN_MS / 1000);
      shotTimer = setInterval(() => {
        shotLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        if (Date.now() >= deadline) {
          clearInterval(shotTimer);
          respawnHook?.();
        }
      }, 250);
    };

    // Ten seconds after the shot: the corpse leaves with you, and you walk
    // back in at the entrance — nothing lost but the pride.
    respawnHook = () => {
      deathsRef?.revive("me");
      shotBy = null;
      player.x = SPAWN.x;
      player.y = SPAWN.y;
      player.yaw = SPAWN.yaw;
      player.pitch = 0;
      net?.move(player.x, player.y, player.yaw, 0);
      showToast("you come round at the entrance");
    };
    cleanupFns.push(() => {
      respawnHook = null;
      startSlorpHook = null;
      clearInterval(shotTimer);
      clearTimeout(popFallback);
      clearTimeout(puffFallback);
      clearTimeout(egoPopFallback);
    });

    const resize = (): void => {
      const w = holder.clientWidth || window.innerWidth;
      const h = holder.clientHeight || window.innerHeight;
      renderer!.setSize(w, h);
      jumbo?.resize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);
    cleanupFns.push(() => window.removeEventListener("resize", resize));

    // ---- PEERS ---------------------------------------------------------------
    const peers = new Map<number, PeerAvatar>();
    // Peers still standing at teardown get the same disposal a `bye` gives
    // them (mixer stopped, name-tag texture freed) — the backrooms already
    // did this on destroy; the casino skipped it.
    cleanupFns.push(() => {
      for (const a of peers.values()) disposeAvatar(scene, a);
      peers.clear();
    });
    /** Suit colour per peer — the ragdoll that plays their pass-out is built
     *  from the model file, not from their walking avatar, so it needs it. */
    const peerSuit = new Map<number, string>();
    const seatBy = new Map<number, number>(); // seat id -> user id (occupancy)
    /** Who is on a SLORP trip and how far in (1..3). Their stage is the room's
     *  business — it swaps their locomotion and, at 3, makes them audible —
     *  but the trip itself only ever happens to their own screen. */
    const peerSlorp = new Map<number, number>();
    /** Who is riding STAR DUST and how many hits (1..3). Drives their helium
     *  voice (the per-listener shifter in voicechat), the green leak off the
     *  body, and — like every intoxicant here — the drunk locomotion set. */
    const peerGas = new Map<number, number>();
    /** The RAW alcohol flag off the wire (`d`), kept separately from the
     *  avatar's `drunk` — that field is the locomotion union of every
     *  intoxicant, so reading it for the drink×gas smoke rule would make gas
     *  itself count as drink and every huffer leak a stage early. */
    const peerBoozy = new Map<number, boolean>();
    // Scratch for the leak's emission point — no per-frame allocation.
    const V_GASPOS = new THREE.Vector3();
    const V_GASBACK = new THREE.Vector3();
    /** Who is on EGO and how swollen (wire quarter-doses 0..12), plus the
     *  smoothed scale each head is currently DRAWN at — the wire steps in
     *  quarter-doses, and a head should grow, not tick. */
    const peerEgo = new Map<number, number>();
    const peerHeadScale = new Map<number, number>();
    /** The bone each body's head is SKINNED to, found by weight measurement
     *  and cached — the rig's nominal `head` is a weightless tip, and scaling
     *  a tip moves nothing (Josh's screenshot: bone 2.2×, hat unchanged). */
    const headBones = new WeakMap<object, THREE.Bone | null>();
    const headBoneOf = (a: { group: THREE.Object3D; head: THREE.Object3D | null }): THREE.Bone | null => {
      const hit = headBones.get(a);
      if (hit !== undefined) return hit;
      // The GLTF skeleton arrives well after makeAvatar returns — an early
      // call must NOT cache its miss, or the head stays a tip forever (the
      // first shipped cut did exactly that). The cheap presence check gates
      // the expensive weight scan; the result is cached only once the skin
      // was actually there to measure.
      let hasSkin = false;
      a.group.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) hasSkin = true; });
      if (!hasSkin) return null; // not resolved — try again next frame
      const hb = findHeadBone(a.group);
      headBones.set(a, hb);
      return hb;
    };
    /** ONE voice per peer, both drugs composed: star dust's helium times
     *  ego's baritone, through the same per-listener shifter. */
    const peerVoiceRatio = (id: number): number =>
      gasPitch(peerGas.get(id) ?? 0) * egoPitch(egoFromWire(peerEgo.get(id) ?? 0));
    /** …and when each of them last made a noise, so the gurgles don't sync up
     *  into a chant when two people are gone at once. */
    const peerGurgleAt = new Map<number, number>();
    let myId = 0;

    /** Feet height for a body on seat `i` — the Mixamo sitting idle assumes a
     *  ~45cm chair, so taller stools raise the whole body. */
    const seatFeetY = (i: number): number => Math.max(0, SEATS[i].h - 0.45) + 0.17;

    const applySeat = (a: PeerAvatar, seat: number | null): void => {
      a.seated = seat !== null;
      if (seat !== null && SEATS[seat]) {
        const s = SEATS[seat];
        const gy = world.groundAt(s.x, s.y);
        a.target.set(s.x * CELL, gy + seatFeetY(seat), s.y * CELL);
        a.group.position.copy(a.target);
        a.heading = s.heading;
      }
    };

    /** Is the player LOOKING AT a spot? E only acts on what the crosshair is
     *  near (Josh: no accidental sits/joins). Standing on top of it counts. */
    const facing = (tx: number, ty: number, minDot = 0.55): boolean => {
      const dx = tx - player.x;
      const dy = ty - player.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.35) return true;
      return ((dx / len) * -Math.sin(player.yaw)) + ((dy / len) * -Math.cos(player.yaw)) > minDot;
    };
    // While a table shot is up, the first-person viewmodel (headless by
    // design) is swapped for a full-headed peer-style body — Josh: "their
    // heads are missing". Lazily managed from the frame loop.
    let standIn: PeerAvatar | null = null;
    // Set once the assets land; onWelcome calls it so the first-person arms
    // are rebuilt if the suit pick changed after they were first sewn.
    let rebuildViewmodelHook: (() => void) | null = null;

    const spawnPeer = (p: FloorPeer): void => {
      if (peers.has(p.id) || p.id === myId) return;
      const a = makeAvatar(scene, p.name, p.suit || "yellow");
      peerSuit.set(p.id, p.suit || "yellow"); // the pass-out ragdoll wears it
      a.target.set(p.x * CELL, world.groundAt(p.x, p.y), p.y * CELL);
      a.group.position.copy(a.target);
      a.heading = p.yaw;
      a.pose = p.p;
      a.drunk = p.d === 1; // walking in on someone already swaying
      peerBoozy.set(p.id, p.d === 1); // the raw drink flag, for the smoke rule
      a.salt = p.id; // …and shifting their weight on their own beat
      a.pitch = p.pt ?? 0;
      a.downSeed = p.ds ?? 0; // mid-collapse newcomers fold the same body
      peers.set(p.id, a);
      peerNames.set(p.id, p.name);
      refreshPeople();
      if (p.seat !== null) {
        seatBy.set(p.seat, p.id);
        applySeat(a, p.seat);
      }
      if (p.emote) setAvatarEmote(a, p.emote);
      // Walking in on somebody who is already holding a bottle — or the gun:
      // `hold` is persisted state on the wire precisely so the hall isn't
      // full of empty hands until the next round is bought.
      if (p.hold) putInHand(a, p.hold);
      // …or already three hits deep. The helium and the leak greet you.
      if (p.sd) {
        peerGas.set(p.id, p.sd);
        a.drunk = a.drunk || p.sd >= 1;
      }
      // …or already big-headed. The hat size and the baritone greet you too.
      if (p.eg) {
        peerEgo.set(p.id, p.eg);
        a.drunk = a.drunk || p.eg >= 4; // a full dose staggers (top-heavy)
      }
      if (p.sd || p.eg) voice?.setPeerPitch(p.id, peerVoiceRatio(p.id));
      if ((p.sl ?? 0) >= 1) a.drunk = true; // one drunk set for every drug
    };

    /** Hang a bar bottle off a body's right hand. The prop is already resident
     *  in the hall, so this is a clone, not a fetch. */
    const putBottleInHand = (a: DrinkRig, hold: string): void => {
      setHeldDrink(a, hold, (id) => {
        // STAR DUST's canister and EGO's shot glass are procedural (no prop
        // in the hall looks like either); bottles clone the hall's props.
        if (id === "stardust") return makeCanister();
        if (id === "ego") return makeShotGlass();
        if (id === "slorp") return makeVial();
        const d = drinkById(id);
        return d && hallS ? hallS.takeBottle(d.prop) : null;
      });
    };

    // ---- THE CARPET: drinks and drugs somebody set down (Oct 2026) --------
    // The server owns what's lying where (src/casino/floor.ts); this only
    // draws it — the same model as in a hand, stood upright on the floor,
    // with a faint ring so it reads as something you can pick up.
    const carpet = new Map<number, { item: string; x: number; y: number; obj: THREE.Object3D }>();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf2d27a, transparent: true, opacity: 0.35, depthWrite: false, forceSinglePass: true });
    const ringGeo = new THREE.RingGeometry(0.16, 0.2, 24);
    const carpetModel = (id: string): THREE.Object3D | null => {
      if (id === "stardust") return makeCanister();
      if (id === "ego") return makeShotGlass();
      if (id === "slorp") return makeVial();
      const d = drinkById(id);
      return d && hallS ? hallS.takeBottle(d.prop) : null;
    };
    const placeDrop = (d: { id: number; item: string; x: number; y: number }): void => {
      if (carpet.has(d.id)) return;
      const g = new THREE.Group();
      const m = carpetModel(d.item);
      if (m) {
        // size it like a real one: a bottle ~30cm, a shot or a vial ~10cm
        const box = new THREE.Box3().setFromObject(m);
        const h = Math.max(0.001, box.max.y - box.min.y);
        const want = d.item === "ego" || d.item === "slorp" ? 0.11 : d.item === "stardust" ? 0.2 : 0.3;
        m.scale.multiplyScalar(want / h);
        const b2 = new THREE.Box3().setFromObject(m);
        m.position.y -= b2.min.y;
        g.add(m);
      }
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.012;
      g.add(ring);
      g.position.set(d.x * CELL, world.groundAt(d.x, d.y), d.y * CELL);
      g.rotation.y = (d.id * 2.399) % (Math.PI * 2);
      scene.add(g);
      carpet.set(d.id, { item: d.item, x: d.x, y: d.y, obj: g });
    };
    const removeDrop = (id: number): void => {
      const c = carpet.get(id);
      if (!c) return;
      scene.remove(c.obj);
      carpet.delete(id);
      if (nearDrop?.id === id) nearDrop = null;
    };
    const clearCarpet = (): void => {
      for (const id of [...carpet.keys()]) removeDrop(id);
    };
    cleanupFns.push(clearCarpet);
    /** Who's on the floor, by name, for the counter's "for" picker. */
    const peerNames = new Map<number, string>();
    const refreshPeople = (): void => {
      floorPeople = [...peerNames].map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    };

    /** Route a hold id to the right prop system: the gun and the bottles are
     *  different modules on the same bone, and a hand carries one thing. The
     *  `armed` flag (PeerAvatar only) swaps the body's locomotion set. */
    const putInHand = (a: DrinkRig, hold: string): void => {
      if (hold === "gun") {
        putBottleInHand(a, "");
        givePistol(a); // self-healing — retried from the tick until the hand exists
        (a as unknown as PeerAvatar).armed = true;
      } else {
        takePistol(a);
        (a as unknown as PeerAvatar).armed = false;
        putBottleInHand(a, hold);
      }
    };

    const clearSeatOf = (id: number): void => {
      for (const [s, uid] of seatBy) if (uid === id) seatBy.delete(s);
    };

    // Late-bound so the socket handlers can reach the hall/thrower, which are
    // only built once the casino assets finish loading.
    let hallRef: Hall | null = null;
    // Sterling's last glide along the bar (server-sent, in local time) — kept
    // so a welcome that lands before the hall is built still places him.
    let sterlingGlide: SterlingGlide | null = null;
    const sterlingStation = STATIONS.find((z) => z.game === "sterling") ?? null;
    let deathsRef: DeathThrower | null = null;
    // The most recent stage spin, so a death can wait for its wheel to land.
    let lastSpin: Promise<void> | null = null;

    /** What the Mac sees, once a session, a few seconds after walking in —
     *  nobody here has a Mac, so the Mac reports it (Josh couldn't see a
     *  friend standing on the same floor). */
    let macDiagSent = false;
    const macDiag = (welcomeCount: number): void => {
      if (!isMac || macDiagSent) return;
      macDiagSent = true;
      setTimeout(() => {
        if (disposed) return;
        let gpu = "";
        try {
          const gl = renderer?.getContext();
          const ext = gl?.getExtension("WEBGL_debug_renderer_info");
          gpu = String(ext && gl ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "");
        } catch { /* best effort */ }
        const bodies = [...peers.entries()].map(([id, a]) => ({
          id,
          model: !!a.mixer,
          visible: a.group.visible,
          inScene: !!a.group.parent,
          x: Math.round(a.group.position.x * 10) / 10,
          y: Math.round(a.group.position.y * 10) / 10,
          z: Math.round(a.group.position.z * 10) / 10,
        }));
        const models = bodies.filter((b) => b.model).length;
        reportNote(
          `casino mac diag: welcome ${welcomeCount}, bodies ${peers.size}, models ${models}, connected ${connected}`,
          JSON.stringify({ bodies, gpu, ua: navigator.userAgent, shell: isDesktopShell, assetsLoaded: !loading, hall: !!hallRef }),
        );
      }, 12_000);
    };
    const dropAllPeers = (): void => {
      for (const id of [...peers.keys()]) handlers.onBye(id);
    };
    const scheduleReconnect = (): void => {
      if (disposed || reconnectTimer) return;
      const wait = Math.min(10_000, 1000 * 2 ** reconnectTries++);
      showToast("lost the floor — reconnecting…", "bad", Math.min(wait + 1500, 6000));
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (disposed || net) return;
        net = pendingConnect?.() ?? null;
      }, wait);
    };

    const handlers = {
      onWelcome: (you: { id: number; gun?: number | null; clips?: number; suit?: string }, list: FloorPeer[], jukeState: JukeState | null) => {
        myId = you.id;
        connected = true;
        // The server builds a fresh body on every enter — standing, at the
        // door, in no seat (Oct 2026 review: a reconnect while seated left the
        // client in the chair, sending no moves, while everybody else saw the
        // body at the entrance). Stand up here too, and resend the position.
        if (mySeat !== null) { mySeat = null; standUpHook?.(); }
        resendPose = true;
        // The server put you in a different suit (one you don't own any
        // more walks in yellow) — wear what the room sees.
        if (you.suit && you.suit !== suit) {
          showToast("you don't own that suit any more — wearing yellow", "info", 5000);
          suit = you.suit;
          try { localStorage.setItem("solace_suit", suit); } catch { /* private window */ }
        }
        reconnectTries = 0;
        // A reconnect lands in a fresh room: whoever we still drew from the
        // last socket is stale, and the welcome is the truth.
        dropAllPeers();
        macDiag(list.length);
        // THE SUIT YOU SEE IS THE SUIT YOU SENT. The viewmodel is built when
        // the assets land, which can be before the menu's suit pick was final
        // — if its sleeves don't match what `enter` just told the room,
        // rebuild them (your arms were the only thing in the hall wearing
        // the stale colour).
        rebuildViewmodelHook?.();
        // Your armament, authoritative: a carried gun fills the holster slot.
        gunRounds = you.gun ?? null;
        gunClips = you.clips ?? 0;
        bag[GUN_SLOT] = gunRounds !== null ? "gun" : null;
        for (const p of list) spawnPeer(p);
        // THE JUKEBOX is already playing — join the record where the room is,
        // at whatever volume this account asked for.
        adoptJukeboxPrefs();
        applyJukeState(jukeState);
        // THE FLOOR TAKES YOUR VOICE (Josh, Aug 2026): walking in hands you
        // over to proximity chat, so you can't be sitting in a channel and on
        // the casino floor at once — two rooms in one pair of ears, and a
        // second LiveKit connection fighting the first for the mic. Same rule
        // the backrooms play by. Awaited, so the channel is released before
        // the floor's own room takes the device.
        // One room for the life of the component (see voiceJoining).
        if (!voice && !voiceJoining) {
        voiceJoining = true;
        void leaveVoice()
          .catch(() => {})
          .then(() => {
        // open-mic proximity voice, backrooms rules — fails silent (no
        // LiveKit / no mic just means a quiet floor). The floor's own
        // acoustics (Josh, Aug 2026: "the proximity chat needs to go a
        // little farther"): the relay streams every body in the hall, so the
        // gate can cover the whole 62m room (67m corner to corner) with no
        // privacy geometry to stay inside, and the gentler rolloff keeps a
        // voice across the floor present instead of technically-there.
        void joinProximityVoice(casinoGrant, { hardGateM: 70, rolloff: 0.85, audienceDeaf: true }).then((r) => {
          voiceJoining = false;
          // A quiet failure here reads as "nobody can hear me and I can't hear
          // anybody" with no clue why — say so (disabled = no LiveKit on this box).
          if (!r.ok) {
            if (!disposed && r.reason !== "disabled") showToast("voice chat couldn't connect — reload to try again", "bad", 6000);
            return;
          }
          micBroken = !r.micOk;
          if (micBroken && !disposed) showToast("no microphone — you can hear the room, but nobody can hear you", "bad", 6000);
          // Backed out while connecting → hang up NOW, or the mic stays hot
          // on a component that no longer exists to leave().
          if (disposed) { r.voice.leave(); return; }
          voice = r.voice;
          voiceOn = true;
          voice.setMuted(micMuted);
          voice.applyAudio({
            micGain: brSettings.micGain,
            micSensitivity: brSettings.micSensitivity,
            neuralNS: brSettings.neuralNS,
            voiceVolume: brSettings.voiceVolume,
            inputDevice: brSettings.inputDevice,
            outputDevice: brSettings.outputDevice,
          });
          // Anyone already on something when I walked in gets their voice the
          // moment the graph exists — the want survives late track attaches.
          const dosed = new Set([...peerGas.keys(), ...peerEgo.keys()]);
          for (const pid of dosed) voice.setPeerPitch(pid, peerVoiceRatio(pid));
        });
          });
        }
      },
      onDenied: (error: string) => {
        reportNote(`casino entry refused: ${error}${isMac ? " (mac)" : ""}`, navigator.userAgent);
        // A refusal must be SEEN: on the Mac app's pointer fallback the menu
        // carrying it stayed hidden behind a "locked" view of an empty hall.
        if (lockFallback && locked) {
          locked = false;
          canvas.style.cursor = "";
        }
        deniedMsg =
          error === "suit_not_owned" ? "you don't own that suit — yellow is always free."
          : error === "floor_full" ? "the floor is full — 32 souls max. Try again in a bit."
          : error === "replaced" ? "you walked in from another window."
          : error === "show_full" ? "the show is full right now — try again in a bit."
          : error;
        connected = false;
      },
      onJoin: (p: FloorPeer) => spawnPeer(p),
      onPos: (id: number, x: number, y: number, yaw: number, p: number, drunkPeer: boolean, pitch: number, downSeed: number) => {
        const a = peers.get(id);
        if (!a) return;
        const now = performance.now();
        if (a.lastPosAt) {
          const dtw = (now - a.lastPosAt) / 1000;
          if (dtw > 0.01) {
            const sp = Math.hypot(x * CELL - a.target.x, y * CELL - a.target.z) / dtw;
            a.wireSpeed = a.wireSpeed * 0.6 + sp * 0.4;
          }
        }
        a.lastPosAt = now;
        a.target.set(x * CELL, world.groundAt(x, y), y * CELL);
        a.heading = yaw;
        a.pose = p;
        // …their body starts to stagger. ONE DRUNK SET FOR EVERY DRUG (Josh,
        // Aug 2026: "for all drugs including the alcohol put the same drunk
        // animations") — a bottle, the vial from its first stage, and star
        // dust from its first hit all borrow the same clips rather than
        // inventing a second set of them.
        peerBoozy.set(id, drunkPeer); // the raw drink flag, for the smoke rule
        a.drunk = drunkPeer || (peerSlorp.get(id) ?? 0) >= 1 || (peerGas.get(id) ?? 0) >= 1;
        a.pitch = pitch; // …and their head leans where they're looking
        a.downSeed = downSeed; // the fold every observer replays for pose 3
      },
      onSeat: (id: number, seat: number | null) => {
        clearSeatOf(id);
        if (seat !== null) seatBy.set(seat, id);
        if (id === myId) {
          sitPendingUntil = 0; // the echo landed — the wire may speak again
          const was = mySeat;
          mySeat = seat;
          // getting up steps you off the stool (standoff.ts): a seat sits
          // inside its stool's collider, which trapped you against the felt
          if (seat === null && was !== null && SEATS[was]) {
            const p = standOff(SEATS[was], (x, y) => world.propsNear(x, y), { w: HALL_W, h: H });
            if (p) { player.x = p.x; player.y = p.y; }
          }
          if (seat !== null && SEATS[seat]) {
            player.x = SEATS[seat].x;
            player.y = SEATS[seat].y;
            player.yaw = SEATS[seat].heading;
          }
          return;
        }
        const a = peers.get(id);
        if (a) applySeat(a, seat);
      },
      onEmote: (id: number, emote: string) => {
        const a = peers.get(id);
        if (a) setAvatarEmote(a, emote);
      },
      // A PLAYER BOUGHT YOU A DRINK, or handed you one, or you picked one up
      // off the carpet. The server already put it in your
      // pockets; this puts it in the bag you see.
      onGotItem: (item: string, huffs: number, from: string, how: string) => {
        const took = takeItem(item, huffs);
        const what = itemName(item);
        if (how === "picked") {
          playSfx("drink", 0.35);
          showToast(took ? `you pick up ${what}` : "your hands are full");
          return;
        }
        playSfx("register", 0.4);
        const verb = how === "handed" ? "handed you" : "bought you";
        showToast(took ? `${from} ${verb} ${what}` : `${from} ${verb} ${what}, but your hands are full`);
      },
      onDrops: (list: FloorDrop[]) => {
        clearCarpet();
        for (const d of list) placeDrop(d);
      },
      onDrop: (d: FloorDrop) => placeDrop(d),
      onUndrop: (id: number) => removeDrop(id),
      onHanded: (_to: number, item: string, name: string) => {
        const k = bag[bagSel] === item ? bagSel : bag.findIndex((b, i) => b === item && i !== GUN_SLOT);
        if (k >= 0) bag[k] = null;
        syncHand();
        showToast(`you hand ${itemName(item)} to ${name}`);
      },
      onHandNo: (_to: number, error: string) => {
        showToast(
          error === "too_far" ? "get closer"
          : error === "hands_full" ? "their hands are full"
          : error === "refused" ? "they won't take it"
          : error === "not_yours" ? "that one isn't yours to give"
          : "you can't hand that over",
          "bad",
        );
      },
      onPutNo: (item: string, error: string) => {
        // the carpet is full: it never left your pockets, so it comes back
        if (error === "carpet_full" && takeItem(item)) showToast("the carpet's full — pick something up first", "bad");
      },
      onPickNo: (_id: number, error: string) => {
        if (error === "hands_full") showToast("your hands are full", "bad");
        else if (error === "too_far") showToast("get closer", "bad");
      },
      onHold: (id: number, hold: string) => {
        const a = peers.get(id);
        if (a) putInHand(a, hold);
      },
      onDrink: (id: number) => {
        const a = peers.get(id);
        if (!a || !startDrink(a)) return;
        // Heard from where they're standing, on the same distance fade the
        // peer footsteps use — a swig across the hall shouldn't sound like
        // one at your elbow. A canister at the face hisses; a bottle glugs.
        const d = Math.hypot(
          a.group.position.x - player.x * CELL,
          a.group.position.z - player.y * CELL,
        );
        if (d >= 16) return;
        const fade = 1 - d / 16;
        if (heldDrink(a) === "stardust") playSfx("stardust-huff", 0.6 * fade, () => huffSynth(0.6 * fade));
        else if (heldDrink(a) === "ego") playSfx("ego-gulp", 0.6 * fade, () => egoGulpSynth(0.6 * fade));
        else playSfx("drink", 0.55 * fade);
      },
      // ---- THE GUN -----------------------------------------------------------
      onBang: (id: number) => {
        const a = peers.get(id);
        if (!a) return;
        givePistol(a); // a late model is better than a silent muzzle
        pistolFire(a);
        // A gunshot carries — further than a swig, faded on the same rule.
        const d = Math.hypot(a.group.position.x - player.x * CELL, a.group.position.z - player.y * CELL);
        if (d < 26) playSfx("gun-shot", 0.85 * (1 - d / 26));
      },
      onAmmo: (rounds: number, clips: number, dry: boolean, err?: string) => {
        gunRounds = rounds;
        gunClips = clips;
        if (dry) playSfx("gun-empty", 0.6);
        if (reloadAsked) {
          reloadAsked = false;
          if (!err) {
            if (viewmodel) pistolReload(viewmodel);
            playSfx("gun-reload", 0.7);
          } else if (err === "no_clip") showToast("no spare magazines — Sterling sells them", "bad");
          else if (err === "already_full") showToast("already loaded");
        }
      },
      onReload: (id: number) => {
        const a = peers.get(id);
        if (!a) return;
        pistolReload(a);
        const d = Math.hypot(a.group.position.x - player.x * CELL, a.group.position.z - player.y * CELL);
        if (d < 14) playSfx("gun-reload", 0.5 * (1 - d / 14));
      },
      onGunDeath: (id: number, _by: number, byName: string, x: number, y: number, suitC: string, seed: number, dir: number) => {
        // The theatrical part — every client throws the identical body along
        // the bullet's line, hard (Josh: "ragdoll out very intensely").
        const key = id === myId ? "me" : "p" + id;
        deathsRef?.shot({ key, x, y, suit: suitC, seed, dir, power: GUN_THROW_POWER, reach: GUN_THROW_REACH });
        if (id !== myId) {
          // Mark the peer down NOW, off this event — the victim's pos frame
          // saying so is a round trip away, and until it lands the down-loop
          // below would `revive` the thrown body one frame after it was
          // created, then re-collapse it with power 0 where they stood. The
          // launch you watch as the victim is the launch the room watches.
          const a = peers.get(id);
          if (a) {
            a.pose = 3;
            a.downSeed = seed;
          }
          return;
        }
        // …and it's you. Ten seconds on the carpet, then the entrance.
        //
        // BEING SHOT INTERRUPTS EVERYTHING (Josh's report: shot at a table,
        // the game stayed open, and leaving it later "showed up at spawn" —
        // the respawn had moved the body behind the player's back). A table
        // shot closes NOW, so the death cam and the overlay actually show and
        // the walk back in is something you watched happen, not a teleport
        // you discover. The strip's own onDestroy leave rules keep the felt
        // money-safe — an unplayed bet refunds, a live hand stands + settles.
        if (station) {
          standUpHook?.();
          station = null;
          chessFrom = null;
        }
        endEmote("shot"); // a dance ends when its dancer is shot
        soberUp(); // …and so does every substance they were on
        shotBy = `shot by ${byName || "someone"}`;
        ctl.keys.clear();
        // No pose one-shot needed: the server already forced pose 3 on the
        // occupant at shot time (and holds it there against our death-cam
        // move frames), and the pose loop above now reads shotBy as down.
        clearInterval(shotTimer);
        const deadline = Date.now() + GUN_RESPAWN_MS;
        shotLeft = Math.ceil(GUN_RESPAWN_MS / 1000);
        shotTimer = setInterval(() => {
          shotLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
          if (Date.now() >= deadline) {
            clearInterval(shotTimer);
            respawnHook?.();
          }
        }, 250);
      },
      // ---- SLORP, as the room sees it --------------------------------------
      // Somebody's trip changed stage. Cosmetic, and deliberately quiet: from
      // stage 2 their body carries itself like a drunk's (the clips already
      // exist and "cannot hold still" is the same read), and at stage 3 the
      // noises start. Nobody's screen melts but their own.
      onSlorp: (id: number, stage: number) => {
        if (id === myId) return; // my own trip is my own clock
        if (stage) peerSlorp.set(id, stage);
        else peerSlorp.delete(id);
        const a = peers.get(id);
        if (a) a.drunk = a.drunk || stage >= 1; // don't wait for their next pos frame
      },
      // ---- STAR DUST, as the room sees it ---------------------------------
      // Somebody's hit count moved. Their voice comes up helium ON MY SIDE
      // (the drug rides the speaker, the shift happens per listener), their
      // body borrows the drunk clips, and past two hits it starts to leak.
      onStardust: (id: number, hits: number) => {
        if (id === myId) return; // my own can is my own clock
        if (hits) peerGas.set(id, hits);
        else peerGas.delete(id);
        voice?.setPeerPitch(id, peerVoiceRatio(id));
        const a = peers.get(id);
        if (a) a.drunk = a.drunk || hits >= 1;
      },
      // ---- EGO, as the room sees it ---------------------------------------
      // Somebody's head changed size. The scale itself is applied smoothly in
      // the frame loop (the wire steps in quarter-doses; a head should grow,
      // not tick); here is just the state, the baritone, and the stagger.
      onEgo: (id: number, v: number) => {
        if (id === myId) return; // my own head is my own clock
        if (v) peerEgo.set(id, v);
        else peerEgo.delete(id);
        voice?.setPeerPitch(id, peerVoiceRatio(id));
        const a = peers.get(id);
        if (a) a.drunk = a.drunk || v >= 4;
      },
      // …and a head reaching critical mass: confetti where it used to be, a
      // soft fold where they stood. One seed, every observer.
      onEgoPop: (id: number, x: number, y: number, suitC: string, seed: number) => {
        if (id === myId) {
          clearTimeout(egoPopFallback);
          if (!shotBy) egoBurstMe(x, y, seed);
          return;
        }
        peerEgo.delete(id);
        peerHeadScale.delete(id);
        voice?.setPeerPitch(id, peerVoiceRatio(id));
        {
          const d = Math.hypot(x * CELL - player.x * CELL, y * CELL - player.y * CELL);
          const g = Math.max(0.3, 1 - d / 26);
          playSfx("ego-pop", g, () => egoPopSynth(g));
        }
        egoConfetti(scene, x, y, world.groundAt(x, y) + 1.6, seed);
        deathsRef?.shot({
          key: "p" + id, x, y, suit: suitC, seed,
          dir: (seed % 628) / 100, power: EGO_THROW_POWER, reach: EGO_THROW_REACH,
        });
        const a = peers.get(id);
        if (a) {
          a.pose = 3;
          a.downSeed = seed;
          headBoneOf(a)?.scale.setScalar(1); // the ragdoll gets an ordinary body
          peerHeadScale.delete(id);
        }
      },
      // …and the detonation. One seed, every observer — a green cloud and a
      // thrown body where a person used to be standing.
      onPow: (id: number, x: number, y: number, suitC: string, seed: number) => {
        if (id === myId) {
          clearTimeout(puffFallback);
          if (!shotBy) gasBurstMe(x, y, seed);
          return;
        }
        peerGas.delete(id);
        voice?.setPeerPitch(id, peerVoiceRatio(id));
        {
          const d = Math.hypot(x * CELL - player.x * CELL, y * CELL - player.y * CELL);
          const g = Math.max(0.3, 1 - d / 26);
          playSfx("stardust-pop", g, () => gasPopSynth(g));
        }
        gasCloud(scene, x, y, world.groundAt(x, y), seed);
        deathsRef?.shot({
          key: "p" + id, x, y, suit: suitC, seed,
          dir: (seed % 628) / 100, power: STARDUST_THROW_POWER, reach: STARDUST_THROW_REACH,
        });
        const a = peers.get(id);
        if (a) {
          a.pose = 3;
          a.downSeed = seed;
        }
      },
      // …and the end of one. Every screen throws the same body into the same
      // mess off the server's seed — including a newcomer who walked in on it.
      onBoom: (id: number, x: number, y: number, suitC: string, seed: number) => {
        if (id === myId) {
          // Mine, off the same frame everyone else gets it on.
          clearTimeout(popFallback);
          if (!shotBy) burstMe(x, y, seed);
          return;
        }
        peerSlorp.delete(id);
        peerGurgleAt.delete(id);
        // Heard from where it happened, on the peer-footstep fade — but with
        // a floor under it, because somebody coming apart across the hall is
        // still the loudest thing that has happened all evening.
        {
          const d = Math.hypot(x * CELL - player.x * CELL, y * CELL - player.y * CELL);
          const g = Math.max(0.28, 1 - d / 26);
          playSfx("slorp-burst", g, () => slorpBurstSynth(g));
        }
        bloodExplosion(scene, x, y, world.groundAt(x, y), seed);
        deathsRef?.shot({
          key: "p" + id, x, y, suit: suitC, seed,
          dir: (seed % 628) / 100, power: SLORP_THROW_POWER, reach: SLORP_THROW_REACH,
        });
        const a = peers.get(id);
        if (a) {
          a.pose = 3;
          a.downSeed = seed;
        }
      },
      // STERLING WORKS THE BAR (src/npc/barwork.ts): each glide, from the server.
      onHouseMove: (who: string, g: { x0: number; x1: number; ago: number; dur: number; face: number | null; greet: boolean }) => {
        if (who !== "sterling" || !Number.isFinite(g.x0) || !Number.isFinite(g.x1)) return;
        sterlingGlide = { x0: g.x0, x1: g.x1, t0: performance.now() - g.ago, dur: g.dur, face: Number.isFinite(g.face) ? g.face : null, greet: g.greet };
        hallRef?.sterlingMove(sterlingGlide);
      },
      onBye: (id: number) => {
        clearSeatOf(id);
        peerNames.delete(id);
        refreshPeople();
        peerSlorp.delete(id);
        peerGas.delete(id);
        peerBoozy.delete(id);
        peerEgo.delete(id);
        peerHeadScale.delete(id);
        voice?.setPeerPitch(id, 1);
        deathsRef?.revive("p" + id); // a drunk who logs out takes their body
        peerSuit.delete(id);
        const a = peers.get(id);
        if (a) {
          disposeAvatar(scene, a);
          peers.delete(id);
        }
      },
      // ---- the C4 showpieces, driven by the server -------------------------
      // Late-bound through refs: the handlers object is built before the hall
      // exists (assets load async), so these can fire before there's anything
      // to drive — hence the optional calls rather than a captured binding.
      onWheel: (slot: number, by: number, info: { name?: string; outcome?: string; tier?: string; emojiFile?: string; emojiName?: string; face?: (string | null)[] }) => {
        // THE FACE FIRST, then the spin. The server decided what all 32 wedges
        // show for this spin and pinned the award onto the landed one, so the
        // room watches the same wheel stop on the same prize. Painting before
        // the disc moves hides the swap in the blur.
        if (info.face) hallRef?.setWheelFace(info.face);
        lastSpin = hallRef?.spinWheel(slot) ?? null;
        // When the wheel rests: the stage's result screen updates for the whole
        // room, and a legendary pops the party (Josh's track + strobe + confetti).
        void (lastSpin ?? Promise.resolve()).then(() => {
          hallRef?.showWheelResult(info);
          if (info.tier === "legendary") hallRef?.legendaryParty();
        });
      },
      onDeath: (id: number, x: number, y: number, suitColor: string, seed: number) => {
        // The death frame arrives WITH the wheel frame, but the stage wheel
        // takes SPIN_DUR to land — so the throw waits for the spin to resolve
        // (the sound-sync doctrine's visual twin: the body flies when the room
        // SEES the wheel stop on the reaper, not when the packet lands).
        const go = (): void => {
          // The standing body becomes a thrown one — drop the avatar first so
          // the room isn't briefly showing the same person twice.
          clearSeatOf(id);
          deathsRef?.revive("p" + id); // a passed-out drunk who then dies
          peerSuit.delete(id);
          const a = peers.get(id);
          if (a) {
            disposeAvatar(scene, a);
            peers.delete(id);
          }
          playSfx("wheel-reaper", 0.55);
          deathsRef?.throwOff({ x, y, suit: suitColor, seed });
        };
        void (lastSpin ?? Promise.resolve()).then(go);
      },
      // A peer's real Slots pull: their nearest cabinet runs the true payline,
      // reel sounds faded by MY distance to it. Own pulls are handled locally
      // (pullInPlace already animated this cabinet with the same symbols — the
      // no-double-run guard is pullReels' own busy check).
      onSlots: (id: number, reels: string[]) => {
        if (id === myId || !hallRef) return;
        const peer = peers.get(id);
        if (!peer) return;
        const nc = hallRef.nearestCabinet(peer.group.position.x / CELL, peer.group.position.z / CELL);
        if (!nc || nc.d > 1.6) return;
        const d = Math.hypot(
          peer.group.position.x / CELL - player.x,
          peer.group.position.z / CELL - player.y,
        );
        // their arm comes down too — a bank where someone is playing should
        // LOOK played, not just sound played
        hallRef.pullLever(nc.index);
        if (d < 10) {
          const gain = 0.4 * (1 - d / 10);
          playSfx("slots-lever", gain * 0.9);
          playSfxLoop("slots-reelspin", 2300, gain);
          playSfxAt("slots-reelstop", 1400, gain);
          playSfxAt("slots-reelstop", 1850, gain);
          playSfxAt("slots-reelstop", 2300, gain);
        }
        // …and when their reels land, their machine celebrates: the light
        // show plays for everyone, the sound only for ears near enough
        void hallRef.pullReels(nc.index, reels).then(() => {
          const tier = peerWinTier(reels);
          if (!tier || !hallRef) return;
          hallRef.slotWin(nc.index, tier);
          if (d < 12) winJingle(TIER_TONE[tier], 0.55 * (1 - d / 12), THEME_JINGLE[slotSectionAt(nc.x, nc.y).theme]);
        });
      },
      // THE JUKEBOX changed record (or its queue/votes moved). The audio
      // module seeks to the room's playhead rather than starting at zero.
      onJuke: (s: JukeState) => applyJukeState(s),
      onClose: (info: FloorCloseInfo) => {
        connected = false;
        reportNote(
          `casino socket closed: code ${info.code}${info.welcomed ? "" : " before the welcome"}${isMac ? " (mac)" : ""}`,
          JSON.stringify({ ...info, bodies: peers.size, visible: document.visibilityState, ua: navigator.userAgent }),
        );
        dropAllPeers();
        net = null;
        // Refused at the door (replaced, floor full, a suit) is a decision,
        // not a dropped line — don't argue with it.
        if (!deniedMsg) scheduleReconnect();
      },
      // A frame whose handler threw. The socket lives on; we hear about it.
      onHandlerError: (type: string, err: unknown) => {
        const e = err as { message?: string; stack?: string };
        reportNote(`casino frame "${type}" threw: ${String(e?.message ?? err).slice(0, 160)}`, String(e?.stack ?? ""));
      },
    };
    // the ENTER button (outside this closure) connects with these handlers
    pendingConnect = () => {
      localStorage.setItem("solace_suit", suit);
      return connectFloor(suit, handlers, () => bag.filter((b, i): b is string => !!b && i !== GUN_SLOT));
    };

    // ---- MY dance: root the player, film a full-headed stand-in in third
    // person, run to completion (the backrooms' rules, leaner room). The
    // stand-in is a full PEER body — same constructor, same suit, same held
    // bottle/gun, same clip path (setAvatarEmote) — because the dance you
    // watch in third person must be EXACTLY the dance the room watches (one
    // appearance, every observer; the old makeEmoteBody clone had no hands,
    // so you danced empty-handed while peers saw the bottle ride the dance).
    let emoting: { id: string; body: PeerAvatar } | null = null;
    let emoteYaw = 0;
    let emotePitch = 0.35;
    let emoteEndsAt = 0;
    const endEmote = (reason = "direct"): void => {
      if (!emoting) return;
      console.debug("[casino] emote ended:", reason);
      disposeAvatar(scene, emoting.body);
      emoting = null;
      dancing = false;
      net?.emote("");
    };
    const startEmote = (id: string): void => {
      if (emoting || mySeat !== null) return;
      const body = makeAvatar(scene, "", suit || "yellow");
      body.tag.visible = false; // you never see your own tag
      body.salt = myId; // the drunk idle peers watch is the one you watch
      body.target.set(player.x * CELL, world.groundAt(player.x, player.y), player.y * CELL);
      body.group.position.copy(body.target);
      body.heading = player.yaw;
      body.group.rotation.y = player.yaw;
      putInHand(body, bag[bagSel] ?? ""); // the bottle/gun rides the dance
      emoteYaw = player.yaw;
      emotePitch = 0.35;
      emoting = { id, body };
      dancing = true;
      emoteEndsAt = performance.now() + 20_000; // fetch cap; tightened below
      net?.emote(id);
      // The same loader+player every peer body uses (and makeAvatar's late
      // model load replays a.emote, so a not-yet-cloned skeleton still ends
      // up dancing). The duration fetch just tightens the deadline.
      setAvatarEmote(body, id, true);
      void loadEmoteClip(id).then((clip) => {
        if (emoting?.id !== id) return;
        if (!clip) return endEmote("clip-missing");
        emoteEndsAt = performance.now() + clip.duration * 1000 + 750;
      });
    };
    cleanupFns.push(() => endEmote());
    const isEmoting = (): boolean => !!emoting;

    // ---- pointer lock (the lean cut of the backrooms' logic, Mac fallback
    // included — same three shapes: no API, refusal, silent no-grant) --------
    const engageFallback = (): void => {
      if (lockFallback && locked) return;
      lockFallback = true;
      locked = true;
      wasLocked = true;
      canvas.style.cursor = "none";
    };
    /** Ask for the mouse. Policy (who may use the cursor-following pseudo-lock,
     *  which refusals are worth answering) is shared with the backrooms in
     *  lib/pointerlock.ts and covered by scripts/checks/test_pointerlock.mjs.
     *  Closing a station panel lands here a few milliseconds after the click
     *  that released the lock, which Chromium refuses outright — that refusal
     *  is now waited out rather than treated as "this machine can't lock". */
    const grabPointer = (): void => {
      acquirePointerLock(canvas, {
        raw: brSettings.rawMouse,
        env: {
          hasApi: typeof canvas.requestPointerLock === "function",
          isMac,
          isShell: isDesktopShell,
        },
        onFallback: engageFallback,
        onUnlocked: () => {
          lockHint = true;
          setTimeout(() => (lockHint = false), 2600);
        },
      });
    };
    const onClick = (e: MouseEvent): void => {
      voice?.onGesture(); // retry autoplay-blocked audio on any real input
      if (locked) return;
      if (station) {
        // the chess duel is played by CLICKING THE BOARD in the world
        if (station.game === "chess") chessClick(e);
        return; // the world doesn't grab the mouse back while a game is up
      }
      if (lockFallback) {
        engageFallback();
        return;
      }
      grabPointer();
    };
    // ---- IN-WORLD WHEEL: E on the stage spins for real ---------------------
    // The canonical spin flow (lib/wheel doSpin) keeps death/Terminated,
    // achievements and spin counts exactly as the 2D game has them; the STAGE
    // wheel turns via the server's own mirror broadcast, and the toast waits
    // for it to rest — the room is the reveal.
    const revealText = (r: NonNullable<typeof wheel.reveal>): string => {
      if (r.type === "emoji" && r.emoji) {
        const m = r.mystery ? "🎁 the box held " : "";
        const nm = r.nearMiss ? " — the legendary blinked" : "";
        return `${m}${r.emoji.name} — a ${r.emoji.tier}${nm}`;
      }
      if (r.type === "blank") return r.reaperMissed ? "💀 …the reaper blinked" : "nothing — the wheel shrugs";
      if (r.type === "talisman") return r.alreadyHad ? "the talisman again — already shielded" : "🧿 THE TALISMAN — a death shield";
      if (r.type === "mystery_spins") return `🎁 the box held ${r.spins} bonus spins`;
      if (r.type === "death_survived") return r.immune ? "the house cannot die" : "💀→🧿 the talisman burned — you live";
      return "";
    };
    /** THE WHEEL ALWAYS COMES BACK (Josh, Aug 2026: "the wheel spin is now
     *  broken its just says wheel is spinning").
     *
     *  `floorSpinning` gates BOTH the prompt and the E key, and every path
     *  that cleared it used to be a happy one: four `= false` assignments
     *  spread through a nested callback chain, with no `finally` and no
     *  deadline. Worse, the chain only STARTED once `lastSpin` resolved — a
     *  promise fed by the server's mirror broadcast and settled by the stage
     *  wheel's own ticker. So anything that threw in the spin, and anything
     *  that stopped that ticker or that frame from arriving, left the wheel
     *  permanently unusable, reading "the wheel is spinning…" with no recovery
     *  short of reloading the page.
     *
     *  Two rules now: the unlock is a `finally`, and the stage wheel is a VIEW
     *  of the spin rather than its clock — it gets raced against a deadline,
     *  never awaited outright. The animation may stall; the wheel may not. */
    const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, Math.max(0, ms)));
    /** Headroom past the disc's own SPIN_MS before we stop waiting on the view
     *  and give the player their wheel back. Generous — this is a backstop for
     *  a broken frame, not a timing constant anything normal relies on. */
    const STAGE_GRACE_MS = 4000;
    const spinInPlace = async (): Promise<void> => {
      if (floorSpinning || wheel.spinning || wheel.dead) return;
      if (wheel.spins.total <= 0) {
        showToast("no spins left — more at the next reset", "bad");
        return;
      }
      floorSpinning = true;
      const started = performance.now();
      const left = (): number => SPIN_MS + STAGE_GRACE_MS - (performance.now() - started);
      try {
        await doSpin();
        if (wheel.error) {
          showToast("the wheel jammed — try again", "bad");
          return;
        }
        // Let the mirror frame land, then ride the stage wheel to its rest —
        // but only for as long as the deadline allows.
        await wait(400);
        await Promise.race([lastSpin ?? Promise.resolve(), wait(left())]);
        while (!wheel.dead && !wheel.reveal && wheel.spinning && left() > 0) await wait(250);
        if (wheel.dead) return; // the Terminated cinematic owns the screen now
        const rv = wheel.reveal;
        if (!rv) return; // nothing to announce (a death, or the spin never resolved)
        // THE RESULT SOUND (Josh: "no result sound effect") — the same accents
        // the 2D reveal plays, timed to the stage wheel's rest.
        const sfxId =
          rv.type === "emoji" ? `wheel-win-${rv.emoji?.tier ?? "common"}`
          : rv.type === "blank" ? "wheel-womp"
          : rv.type === "talisman" ? "wheel-talisman"
          : rv.type === "mystery_spins" ? "mystery-open"
          : rv.type === "death_survived" ? "wheel-talisman"
          : null;
        if (sfxId) playSfx(sfxId, 0.65);
        showToast(revealText(rv), rv.type === "blank" ? "info" : "win", 5200);
        wheel.reveal = null; // consumed — the 2D view must never replay it
        // No re-roll here any more: the SERVER draws a fresh face with every
        // spin and the broadcast paints it before the disc turns, so the
        // wedges are already the next spin's real candidates.
      } catch (err) {
        console.error("[casino] the wheel spin failed", err);
        showToast("the wheel jammed — try again", "bad");
      } finally {
        floorSpinning = false;
      }
    };

    // ---- IN-WORLD SLOTS: E at a cabinet pulls ITS lever --------------------
    const pullInPlace = async (): Promise<void> => {
      const idx = nearSlotIdx;
      const stake = nearSlotSec?.stake ?? 10;
      const theme = nearSlotSec?.theme ?? "fruit";
      if (pulling || idx === null || !hallRef) return;
      pulling = true;
      // the arm swings on the keypress, with its own sound — the machine
      // answers a beat later, when the server says what it paid
      hallRef.pullLever(idx);
      playSfx("slots-lever", 0.6);
      const r = await pullSlots(stake);
      if (!r) {
        pulling = false;
        showToast(`this machine plays ${stake} silver a pull`, "bad");
        return;
      }
      playSfxLoop("slots-reelspin", 2300, 0.4);
      playSfxAt("slots-reelstop", 1400, 0.5);
      playSfxAt("slots-reelstop", 1850, 0.5);
      playSfxAt("slots-reelstop", 2300, 0.55);
      // The reels resolve on the hall's clock; walk out mid-spin and they never
      // do — so onDestroy settles a pull still in flight (Oct 2026 review: the
      // wallet chip kept showing the stake gone and the payout missing).
      pendingPull = r;
      await hallRef.pullReels(idx, r.reels);
      pendingPull = null;
      settleSlotsWallet(r);
      if (r.result.type === "win") {
        const pay = r.result.payout;
        // the celebration is sized by the LINE, not the coins: a cherry at a
        // 100 machine pays 10 and is still a loss, a crown at 10 is still the
        // jackpot. `line` is what the payout is at the base stake.
        const line = pay / (stake / 10);
        // the 2D game's own scaled jingle + coin tray, and the cabinet's
        // light show at the tier its symbols earned
        winJingle(line, 1, THEME_JINGLE[theme]);
        if (line >= 75) coinCascade(line >= 250 ? 40 : 20);
        hallRef.slotWin(idx, winTier(line), pay);
        showToast(`+${pay} silver — ${THEME_LABELS[theme][r.result.line] ?? r.result.line}`, "win");
      } else {
        loseThud();
        showToast("no win", "info", 2000);
      }
      pulling = false;
    };

    // ---- opening/closing a game (C3) --------------------------------------
    const openStation = (s: Station): void => {
      station = s;
      wheelOpen = false;
      // E AT A BLACKJACK TABLE TAKES A SEAT (Josh) — walking up and pressing E
      // is the whole gesture; nobody should have to find a SIT DOWN button in
      // the strip afterwards. Refused server-side if the table is full or
      // you're already seated somewhere, which is where it belongs.
      if (s.game === "blackjack" && s.lobby != null && bjMyLobby() === null) {
        void bjJoinTable(s.lobby);
      }
      playSfx("chip-place", 0.35); // sitting down to play — a chip on the felt
      // hand the mouse to the overlay — both lock flavours release here
      if (document.pointerLockElement) document.exitPointerLock();
      if (lockFallback) {
        lockFallback = false;
        canvas.style.cursor = "";
      }
      locked = false;
      ctl.keys.clear();
      crouching = false;
    };
    const onLockChange = (): void => {
      const real = document.pointerLockElement === canvas;
      if (real && lockFallback) {
        lockFallback = false;
        canvas.style.cursor = "";
      }
      if (lockFallback) return;
      locked = real;
      if (locked) wasLocked = true;
      else {
        ctl.keys.clear();
        crouching = false;
        wheelOpen = false; // held input dies with the lock; a RUNNING dance keeps dancing
      }
    };
    let fbLastX = 0;
    let fbLastY = 0;
    let fbHaveLast = false;
    /** Where a locked delta goes: the emote wheel's cursor while it's open,
     *  the third-person orbit while a dance plays, the view otherwise — one
     *  router so the Mac fallback and the real lock agree (backrooms rule). */
    const routeLook = (dx: number, dy: number, sens: number, invert: number): void => {
      if (wheelOpen) {
        wheelX = Math.max(-WHEEL_R, Math.min(WHEEL_R, wheelX + dx));
        wheelY = Math.max(-WHEEL_R, Math.min(WHEEL_R, wheelY + dy));
        updateWheelPick();
        return;
      }
      if (emoting) {
        emoteYaw -= dx * 0.005;
        emotePitch = Math.max(0.08, Math.min(1.15, emotePitch + dy * 0.004));
        return;
      }
      ctl.onMouse(dx * sens, dy * sens * invert);
    };
    const onMouseMove = (e: MouseEvent): void => {
      if (!locked) {
        fbHaveLast = false;
        return;
      }
      const sens = brSettings.mouseSensitivity;
      const invert = brSettings.invertY ? -1 : 1;
      if (lockFallback) {
        let dx = e.movementX;
        let dy = e.movementY;
        if (typeof dx !== "number" || typeof dy !== "number") {
          dx = fbHaveLast ? e.clientX - fbLastX : 0;
          dy = fbHaveLast ? e.clientY - fbLastY : 0;
        }
        fbLastX = e.clientX;
        fbLastY = e.clientY;
        fbHaveLast = true;
        if (isTeleport(dx, dy)) return; // the cursor left the window, not a flick
        routeLook(dx * 1.5, dy * 1.5, sens, invert);
        return;
      }
      routeLook(e.movementX, e.movementY, sens, invert);
    };
    const tryTakeSeat = (): void => {
      if (mySeat !== null || nearSeat === null || airborne) return; // land first
      // Hold the move wire from THIS moment, not from the echo: a pos frame
      // slipping out between the sit request and the server's seat frame made
      // the server silently stand you up ("moving is standing up") while your
      // client believed you were seated — you rendered standing through the
      // chair, free to emote (Josh's report, Aug 2026). Cleared by the echo,
      // or by a short timeout when the seat was taken and no echo comes.
      sitPendingUntil = performance.now() + 1500;
      net?.sit(nearSeat); // the server's seat frame confirms (or stays silent if taken)
    };
    /** Getting up from a blackjack STOOL also leaves that table's GAME seat
     *  (Josh). The stool ids map to engine lobbies by construction:
     *  18-29 = tables 0-3 x stools 0-2, 36-47 = tables 0-3 x stools 3-5. */
    const leaveBjIfSeated = (): void => {
      if (mySeat === null) return;
      const lobby =
        mySeat >= 18 && mySeat <= 29 ? Math.floor((mySeat - 18) / 3)
        : mySeat >= 36 && mySeat <= 47 ? Math.floor((mySeat - 36) / 3)
        : null;
      if (lobby !== null && bjMyLobby() === lobby) void bjLeaveTable(lobby);
    };
    /** The stool your ENGINE seat corresponds to at the open blackjack table.
     *  The engine is authoritative for where you are sitting; the floor wire's
     *  `mySeat` is only how PEERS hear about it, so your own body must not
     *  wait on the socket to sit down (it left you standing on the carpet
     *  beside your own cards whenever the floor socket was slow). */
    const engineStool = (): number | null => {
      // Hold'em: the engine seat k sits floor chair 30+k (k 0-5) / 48 (k 6).
      if (station?.game === "holdem") return holdemChairOf(holdemMyIdx());
      if (station?.game !== "blackjack" || station.lobby == null) return null;
      const lob = bj.lobbies[station.lobby];
      const uid = session.user?.id ?? 0;
      const k = lob ? lob.seats.findIndex((st) => st && st.user.id === uid) : -1;
      if (k < 0) return null;
      return k < 3 ? 18 + station.lobby * 3 + k : 36 + station.lobby * 3 + (k - 3);
    };
    standUpHook = (): void => {
      const lob = bjMyLobby();
      if (lob !== null) void bjLeaveTable(lob);
      // The floor's oval hosts tables[0]; a seat at the hub's other Hold'em
      // tables is not this dock's to give up.
      const ht = holdem.lobby?.tables[0];
      if (ht && holdemMyIdx() >= 0) void leaveHoldem(ht.id).catch(() => {});
      if (mySeat !== null) net?.sit(null);
    };
    const standIfSeated = (code: string): boolean => {
      if (mySeat === null) return false;
      const K = brSettings.keys;
      if ([K.forward, K.back, K.left, K.right, "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code)) {
        leaveBjIfSeated();
        net?.sit(null);
        return true;
      }
      return false;
    };
    const onKey = (down: boolean) => (e: KeyboardEvent): void => {
      // A game overlay owns the keyboard — except Escape, which hands the
      // floor back. Checked BEFORE the lock gate: the overlay only exists
      // unlocked.
      if (station) {
        if (down && e.code === "Escape") {
          e.preventDefault();
          closeStation();
          return;
        }
        // A MOVEMENT key walks away from the table — closing the view and
        // standing you up if you were seated (Josh: players must properly
        // get out of every seat; the old behavior swallowed WASD and left
        // you trapped in the chess chair until you found ESC). Typing in a
        // bet field never triggers it.
        //
        // EXCEPT WHEN YOU'RE IN A HAND. Once the engine has seated you at
        // blackjack, a stray W must not stand you up and forfeit the seat
        // (Josh) — you leave by "back to the floor" (or the strip's leave
        // button), both of which give the seat up properly. Movement keys are
        // simply swallowed while seated there.
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (down && tag !== "INPUT" && tag !== "TEXTAREA") {
          const K = brSettings.keys;
          if ([K.forward, K.back, K.left, K.right, "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
            if (
              (station.game === "blackjack" && bjMyLobby() !== null) ||
              (station.game === "holdem" && holdemMyIdx() >= 0)
            ) {
              e.preventDefault();
              return;
            }
            if (mySeat !== null) {
              leaveBjIfSeated();
              net?.sit(null);
            }
            closeStation();
            e.preventDefault();
            return;
          }
        }
        return;
      }
      if (!locked) return;
      if (e.code === "Escape" && lockFallback && down) {
        // Claimed: nothing past the game acts on it (the Mac kick-out, Sep 2026).
        e.preventDefault();
        e.stopImmediatePropagation();
        locked = false;
        canvas.style.cursor = "";
        ctl.keys.clear();
        wheelOpen = false;
        return;
      }
      // ON THE CARPET YOU DO NOTHING but talk (Oct 2026 review): the guard
      // below sat after E, G, the digits and the emote wheel, so a shot or
      // passed-out player could still open stations, pull levers and dance.
      if (down && (outCold || shotBy) && e.code !== brSettings.keys.mic) { e.preventDefault(); return; }
      // HOLD-B EMOTE WHEEL (standing only — the server refuses seated dances,
      // and a dance mid-air would root you in it)
      if (e.code === brSettings.keys.emote) {
        if (down && !wheelOpen && !isEmoting() && mySeat === null && !airborne) {
          wheelOpen = true;
          wheelX = 0;
          wheelY = 0;
          wheelPick = null;
        } else if (!down && wheelOpen) {
          const pick = wheelPick;
          wheelOpen = false;
          if (pick !== null) startEmote(EMOTES[pick].id);
        }
        e.preventDefault();
        return;
      }
      if (down && e.code === brSettings.keys.mic) {
        micMuted = !micMuted;
        voice?.setMuted(micMuted);
      }
      // E: take the seat if one's in reach, AND act on where you're standing —
      // a slot cabinet pulls ITS lever, the stage spins the real wheel (both
      // in-world, no overlay), everything else opens its docked view. Sitting
      // at a blackjack stool still opens the table in front of you.
      if (down && e.code === brSettings.keys.interact) {
        tryTakeSeat();
        if (nearSlotIdx !== null && !isEmoting()) {
          void pullInPlace();
          e.preventDefault();
          return;
        }
        if (nearStation && !isEmoting()) {
          if (nearStation.game === "wheel") void spinInPlace();
          else openStation(nearStation);
          e.preventDefault();
          return;
        }
        if (nearDrop && !isEmoting()) {
          net?.pick(nearDrop.id);
          e.preventDefault();
          return;
        }
        if (nearDoor) {
          // the entrance doors work now (Josh): E walks you out of the casino
          onExit();
          e.preventDefault();
          return;
        }
        if (nearEscape) {
          void openEscapeDoor();
          e.preventDefault();
          return;
        }
      }
      // THE JUMP (Josh, Aug 2026: the same FPS body as the backrooms, minus the
      // swimming). Same key, same 4.6 m/s takeoff, same rule that leaving the
      // ground freezes the height reference so an arc across a ledge keeps its
      // air. What it does NOT carry over is the stamina bill: the backrooms
      // prices jumps because something is chasing you, and nothing on this floor
      // is. Seated players stand up first (a move key does that), and a dance
      // roots you, so neither can launch.
      if (down && e.code === brSettings.keys.jump && !airborne && mySeat === null && !isEmoting()) {
        airborne = true;
        airBase = groundY;
        jumpY = 0;
        vy = 4.6;
      }
      if (down && standIfSeated(e.code)) {
        e.preventDefault();
        return; // the keypress stands you up; the NEXT one walks
      }
      // THE POCKETS (Josh: "the same pickup and drop system like the
      // backrooms"). 1-3 pick, G sets the bottle down — which on a casino
      // floor means a barman clears it away, so it's a discard, not a
      // world drop; there is nothing here worth littering the carpet with.
      if (down && /^Digit[1-3]$/.test(e.code)) {
        bagSel = Number(e.code.slice(5)) - 1;
        syncHand();
        e.preventDefault();
        return;
      }
      // 4 = the holster. Only selectable while a gun is actually carried, and
      // drawing it racks the slide the first time everyone hears it.
      if (down && e.code === "Digit4" && bag[GUN_SLOT]) {
        bagSel = GUN_SLOT;
        syncHand();
        e.preventDefault();
        return;
      }
      // R = reload, with the gun in hand. The server owns the clip count; the
      // gesture and the sound play when its ammo frame agrees.
      if (down && e.code === "KeyR" && bagSel === GUN_SLOT && bag[GUN_SLOT] && !shotBy) {
        reloadAsked = true;
        net?.reload();
        e.preventDefault();
        return;
      }
      // H: hand what you're holding to the person in front of you
      if (down && e.code === "KeyH" && bagSel !== GUN_SLOT && bag[bagSel] && !shotBy && !outCold) {
        if (handTo) net?.hand(handTo.id);
        else showToast("nobody close enough to take it", "bad");
        e.preventDefault();
        return;
      }
      if (down && e.code === "KeyG" && bag[bagSel]) {
        // Holstering, not littering: G on the gun just puts it away — a
        // 150,000-silver purchase is not a thing "set down" destroys.
        if (bagSel === GUN_SLOT) {
          bagSel = 0;
          syncHand();
          showToast("you holster it");
        } else {
          // ON THE CARPET (Oct 2026): set down where you stand, for you or
          // anybody to pick up again
          const item = bag[bagSel]!;
          bag[bagSel] = null;
          syncHand();
          net?.put(item);
          showToast("you set it down");
        }
        e.preventDefault();
        return;
      }
      if (outCold || shotBy) { e.preventDefault(); return; } // you're on the floor
      if (down) ctl.keys.add(e.code);
      else ctl.keys.delete(e.code);
      if (e.code === brSettings.keys.crouch) crouching = down;
      e.preventDefault();
    };
    const kd = onKey(true);
    const ku = onKey(false);
    const onCanvasMouse = (e: MouseEvent): void => {
      if (e.button !== 0 || !locked || station) return;
      if (bagSel === GUN_SLOT && bag[GUN_SLOT]) {
        fireGun();
        e.preventDefault();
      } else if (bag[bagSel]) {
        takeSwig();
        e.preventDefault();
      }
    };
    // ALT-TAB IS A SANCTIONED EXIT — and it must land in the floor menu on
    // every surface (the mouse-stays-in-the-window law). A real lock gets
    // this free: the browser releases it on focus loss and onLockChange
    // pauses. The Mac shell's pseudo-lock has no such event, and without
    // this the hall stayed "locked" and live behind whatever window the
    // player switched to — held keys and all.
    const onBlur = (): void => {
      ctl.keys.clear();
      crouching = false;
      if (lockFallback && locked) {
        locked = false;
        canvas.style.cursor = "";
        wheelOpen = false;
      }
    };
    canvas.addEventListener("mousedown", onCanvasMouse);
    canvas.addEventListener("click", onClick);
    document.addEventListener("pointerlockchange", onLockChange);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", onBlur);
    cleanupFns.push(() => {
      canvas.removeEventListener("mousedown", onCanvasMouse);
      canvas.removeEventListener("click", onClick);
      document.removeEventListener("pointerlockchange", onLockChange);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", onBlur);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    });

    // ---- the vertical body (the backrooms arc, without the water) -----------
    // `groundY` is the EASED floor under the feet — eased so the stage's step
    // reads as a rise rather than a teleport. While `airborne` the body ignores
    // the terrain entirely and flies from `airBase + jumpY`, landing only when
    // that height meets whatever is actually underneath: this is what lets you
    // jump OFF the stage and get air instead of being snapped down its edge.
    let groundY = world.groundAt(player.x, player.y);
    let airBase = groundY;
    let jumpY = 0;
    let vy = 0;
    let airborne = false;
    let crouchAmt = 0;
    let bobT = 0;
    // FIRST PERSON WITH A BODY (Josh: "I also can see my body"). The backrooms'
    // viewmodel, whole — the same suited figure, with the mask faces cut so the
    // camera inside its head sees the room and not the inside of a hood. It
    // lives in the SCENE, not on the camera: parented to the camera it would
    // inherit pitch and tip over like a turret (see placeViewmodel).
    let viewmodel: Viewmodel | null = null;

    // ---- THE GHOSTS: 2D players embodied at their tables (C3) ---------------
    // ghosts.ts derives who SHOULD be visible from the app-level game stores;
    // this loop reconciles avatars against that list at ~1Hz. Seed every store
    // once on entry — broadcasts keep them current after that, but without the
    // seed a table full of people who sat down before you logged in would
    // stand empty until their next action.
    void loadBlackjack();
    void loadHoldem();
    void loadPit();
    void loadChess();
    void loadRoulette();
    void loadWallet();
    void loadDerby(); // the jumbotron reads this store
    void loadWheelStatus(); // in-world spins: the count on the hint bar
    void loadSlots(); // in-world pulls: the cost on the hint bar
    void loadBoards(); // the bar's wheel-feed screen reads wheel.feed
    void loadLender(); // Sterling's debt disdain reads the goblins' ledger
    const ghostAv = new Map<string, PeerAvatar>();
    let ghostCheckIn = 0;
    const reconcileGhosts = (): void => {
      const exclude = new Set<number>([myId, ...peers.keys()]);
      const want = desiredGhosts(exclude);
      const wantKeys = new Set(want.map((g) => g.key));
      for (const [key, a] of ghostAv) {
        if (!wantKeys.has(key)) {
          disposeAvatar(scene, a);
          ghostAv.delete(key);
        }
      }
      for (const g of want) {
        if (ghostAv.has(g.key)) continue;
        const a = makeAvatar(scene, g.name, "yellow");
        const feet = world.groundAt(g.x, g.y) + (g.seatH !== undefined ? Math.max(0, g.seatH - 0.45) : 0);
        a.target.set(g.x * CELL, feet, g.y * CELL);
        a.group.position.copy(a.target);
        a.heading = g.heading;
        a.seated = g.seatH !== undefined;
        ghostAv.set(g.key, a);
      }
    };
    cleanupFns.push(() => {
      for (const a of ghostAv.values()) disposeAvatar(scene, a);
      ghostAv.clear();
    });

    // ---- carpet footsteps (Josh's sample) — stride accumulators -------------
    loadSteps();
    let strideAcc = 0;
    let lastPX = player.x;
    let lastPY = player.y;
    const peerStride = new Map<number, { acc: number; x: number; y: number }>();

    // ---- the hall + the loop ---------------------------------------------
    let eyeY = EYE;
    let last = performance.now();
    let lastSend = 0;
    let sitPendingUntil = 0; // sit request in flight — the move wire holds its breath
    let sentX = -1;
    let sentY = -1;
    let sentYaw = -999;
    let sentPitch = -999;
    let sentPose = -1;
    let sentDrunk = false;
    const forgetSent = (): void => { sentX = -1; sentY = -1; sentYaw = -999; sentPitch = -999; sentPose = -1; };
    // proximity-voice spatial updates: reused container + 12Hz clock
    let spatialCd = 0;
    const spatialPeers = new Map<number, SpatialPeer>();
    // The pistol loads alongside but is NOT awaited — givePistol self-heals
    // from the tick, and a hall shouldn't wait on a gun most nights nobody
    // draws.
    void ensurePistol();
    Promise.all([loadCasinoAssets(), ensureHazmat()])
      .then(([assets]) => {
        // Backed out during the load screen → don't build a hall onto a dead
        // component (the jumbotron's Svelte mount and the shared muzzle-flash
        // ref would outlive it — their cleanupFns already ran).
        if (disposed) return;
        const hall = buildHall(scene, world, assets);
        // Body slams read as hard footfalls, distance-faded — the same trick
        // the backrooms uses for its ragdolls (a thud IS a very hard step).
        const deaths = createDeathThrower(scene, world, (i) => {
          const d = Math.hypot(i.x / CELL - player.x, i.z / CELL - player.y);
          if (d < 14 && i.speed > 3.4) stepSound(Math.max(0.15, 0.7 * (1 - d / 14)), true);
        });
        hallRef = hall;
        deathsRef = deaths;
        // THE SHARED MUZZLE LIGHT: one scene-resident PointLight every pistol
        // borrows for its flash, registered here because the hall owns the
        // scene. Parenting a light per gun changed the light count per
        // holder, and a light-count change recompiles every shader in the
        // hall — the "freezes when they switch to the gun" bug.
        {
          const mz = new THREE.PointLight(0xffc46a, 0, 3.2, 2);
          scene.add(mz);
          setSharedMuzzleFlash(mz);
          cleanupFns.push(() => setSharedMuzzleFlash(null));
        }
        // THE PREWARM (Josh, Aug 2026: "sometimes the game freezes for people
        // when they get the jackpot, drink a drink, switch to the gun").
        // Every one of those freezes was a first-use shader compile on the
        // render thread — measured at 348ms on a good desktop for the drink
        // alone. Three.js bakes the render target's output encoding into
        // every material's program, so the FIRST drink (the first frame the
        // scene renders into the drunk pass's target) recompiled the whole
        // hall; the gun's materials compiled on first draw; the post quads on
        // first use. All of it is compiled here instead, in the background,
        // right after the doors open: compileAsync rides
        // KHR_parallel_shader_compile, so the driver links off-thread and
        // the hall stays responsive while it warms.
        void (async () => {
          try {
            await ensurePistol(); // resolves even on failure
            const warmProp = pistolWarmProp();
            if (warmProp) scene.add(warmProp); // invisible; keeps the gun's programs alive
            if (!renderer) return;
            // canvas-target variant (covers the gun + every pooled-light path)
            await renderer.compileAsync(scene, camera);
            if (!renderer) return;
            // the post chain: size the targets now (first-bind allocates the
            // MSAA framebuffers) and compile the RT-output variant of the
            // whole hall + both fullscreen quads
            const w = renderer.domElement.width, h = renderer.domElement.height;
            if (drunkRT.width !== w || drunkRT.height !== h) drunkRT.setSize(w, h);
            if (slorpRT.width !== w || slorpRT.height !== h) slorpRT.setSize(w, h);
            renderer.setRenderTarget(drunkRT);
            const rtWarm = renderer.compileAsync(scene, camera);
            renderer.setRenderTarget(null);
            await rtWarm;
            if (!renderer) return;
            await renderer.compileAsync(drunkScene, drunkCam);
            if (!renderer) return;
            await renderer.compileAsync(slorpScene, drunkCam);
            if (!renderer) return;
            // …and one real (hidden) pass through the whole chain: the first
            // draw into an MSAA target still sets up the resolve blit and
            // per-program state that compile alone doesn't touch — measured
            // as a leftover 63ms hitch on the first drink without this.
            renderer.setRenderTarget(drunkRT);
            renderer.render(scene, camera);
            renderer.setRenderTarget(slorpRT);
            renderer.render(drunkScene, drunkCam);
            const keepDiffuse = slorpMat.uniforms.tDiffuse.value;
            slorpMat.uniforms.tDiffuse.value = slorpRT.texture;
            renderer.setRenderTarget(drunkRT); // NOT the canvas — the warm stays invisible
            renderer.render(slorpScene, drunkCam);
            slorpMat.uniforms.tDiffuse.value = keepDiffuse;
            renderer.setRenderTarget(null);
            // …and the glow's chain, whether or not it is switched on yet:
            // flipping it in the menu must not cost a compile
            await bloom.warm(renderer, scene, camera, drunkRT);
            if (!renderer) return;
            // THE LATE-PROP WARM (Aug 2026 stutter hunt, measured). The
            // hall's GLB props STREAM IN — the jukebox, the bar pack, the
            // ATM land whenever their fetch resolves, which is routinely
            // AFTER the compile pass above — so their programs and textures
            // missed the warm, and the first LOOK at each cluster stalled
            // the render thread (150ms on a 3090 Ti: a synchronous first-use
            // program link check plus texture uploads; worse on laptops,
            // and it read as "stutters here and there" while walking). For
            // the first ~20s, re-warm every 2s: compileAsync is a cache hit
            // for everything already compiled, and initTexture uploads any
            // texture the GPU hasn't seen. Both run off the visible frame.
            const warmedTex = new Set<THREE.Texture>();
            for (let round = 0; round < 10; round++) {
              await new Promise((r) => setTimeout(r, 2000));
              if (!renderer) return;
              await renderer.compileAsync(scene, camera);
              if (!renderer) return;
              scene.traverse((o) => {
                const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
                if (!m) return;
                for (const mm of Array.isArray(m) ? m : [m]) {
                  for (const v of Object.values(mm)) {
                    if (v && (v as THREE.Texture).isTexture && !warmedTex.has(v as THREE.Texture)) {
                      warmedTex.add(v as THREE.Texture);
                      renderer?.initTexture(v as THREE.Texture);
                    }
                  }
                }
              });
            }
          } catch {
            // a driver that refuses just keeps the old first-use compiles
          }
        })();
        // The wheel advertises real, winnable prizes from the moment you walk
        // in — the resting face comes from GET /api/wheel.
        if (wheel.face.length) hall.setWheelFace(wheel.face);
        // the live felts + the live chess set (the in-world games)
        felts = buildFelts(scene);
        hallS = hall;
        // THE BARMAN KNOWS YOU (Josh, Aug 2026): proximity murmurs at the bar
        // come from Sterling's one brain — your name, your purse, your recent
        // wins on this floor, and his opinion of your goblin debts.
        // THE HOUSE'S BRAINS (lib/npcvoice.ts): written for you by the model;
        // the scripted brain only while a batch is on its way.
        hall.setSterlingLines(() => takeIdle("sterling", "bar") ?? sterlingLine("bar"));
        if (sterlingGlide) hall.sterlingMove(sterlingGlide);
        // THE JUMBOTRON: the hub's real racetrack component, mounted in 3D on
        // the screen above the bar (Josh: "put the same screen someone would
        // see in the 2d casino"). It renders in its own CSS3D layer over the
        // canvas, so it is drawn AFTER the WebGL frame, below.
        jumbo = buildJumbotron(holder, scene, hall.jumboAt);
        cleanupFns.push(() => { jumbo?.dispose(); jumbo = null; });
        (window as unknown as { __cas: Record<string, unknown> }).__cas.feltsDebug = felts;
        (window as unknown as { __cas: Record<string, unknown> }).__cas.scene = scene;
        (window as unknown as { __cas: Record<string, unknown> }).__cas.spinRouDbg = (pk: number, ms: number) => hall.spinRoulette(pk, ms);
        if (hall.chessSet) {
          try {
            board3d = buildChessBoard(hall.chessSet);
          } catch (err) {
            console.warn("[casino] chess set unreadable — board stays static", err);
            // Surface it: a silently static board reads as "chess is broken"
            // with nothing in the errors panel to say why. Re-thrown async so
            // the app-level reporter files it without unwinding this mount.
            setTimeout(() => {
              throw new Error(`casino chess set unreadable: ${err instanceof Error ? err.message : String(err)}`);
            });
          }
        }
        // YOUR OWN BODY, in the suit you actually walked in wearing. In the
        // SCENE, not on the camera — parented to the camera it would inherit
        // pitch and tip forward like a turret (placeViewmodel's note).
        viewmodel = makeViewmodel(suit || "yellow");
        let vmSuit = suit || "yellow";
        if (viewmodel) {
          scene.add(viewmodel.group);
          const vm = viewmodel;
          cleanupFns.push(() => scene.remove(vm.group));
        }
        // The assets can land while the menu is still up, freezing whatever
        // suit was picked at that instant into the sleeves — onWelcome calls
        // this to re-sew them in the colour the wire actually announced.
        rebuildViewmodelHook = () => {
          const want = suit || "yellow";
          if (!viewmodel || vmSuit === want) return;
          scene.remove(viewmodel.group);
          viewmodel = makeViewmodel(want);
          vmSuit = want;
          if (viewmodel) {
            scene.add(viewmodel.group);
            const vm = viewmodel;
            cleanupFns.push(() => scene.remove(vm.group));
          }
        };
        cleanupFns.push(() => deaths.dispose());
        // dev hooks: drive the showpieces by hand until C4 wires them to real
        // wheel outcomes — __cas.spinWheel(n) and __cas.throwOff(x, y)
        Object.assign((window as unknown as { __cas: Record<string, unknown> }).__cas, {
          spinWheel: hall.spinWheel,
          // Open a station's dock without pressing E. Headless browsers don't
          // grant pointer lock, and the key handler is behind that gate — so a
          // review sweep could screenshot the ROOM but never the panels. Dev
          // hook only, alongside the rest of these.
          openStation: (game: string) => {
            const s = STATIONS.find((z) => z.game === game);
            if (s) openStation(s);
            return s ? s.game : null;
          },
          // A BODY WITH A BOTTLE, standing where you can see it. The grip
          // offset and the tip of the wrist are the kind of thing that is
          // wrong until you look at it from a player's eye, and looking at it
          // otherwise needs a second person on the floor. Spawns a peer-shaped
          // stand-in a couple of metres in front, hands it a drink, and lets a
          // review sweep scrub the swig to any phase for a still.
          drinkDbg: (id = "beer", ahead = 2.2) => {
            const a = makeAvatar(scene, "TASTER", suit || "yellow");
            // Placed along the CAMERA's own direction rather than a guess at
            // the yaw convention — the first version of this hook put the
            // body politely behind the reviewer's head.
            // (a unit vector in metres moved `ahead` CELLS, then back to cells,
            // is just the vector times `ahead`)
            const fwd = new THREE.Vector3();
            camera.getWorldDirection(fwd);
            const px = player.x + fwd.x * ahead;
            const py = player.y + fwd.z * ahead;
            a.target.set(px * CELL, world.groundAt(px, py), py * CELL);
            a.group.position.copy(a.target);
            a.heading = player.yaw + Math.PI; // turned to face you
            a.group.rotation.y = a.heading;
            putBottleInHand(a, id);
            peers.set(-1, a);
            return { at: [px, py], hold: id };
          },
          /** Park the taster's swig at a fixed phase (0..1) for a still. Held
           *  by re-applying every frame, since the peer loop is otherwise
           *  advancing the gesture past it. */
          drinkPhase: (t = 0.5) => {
            // Set the freeze FIRST: it drives your own hands too, and there is
            // no reason a first-person still should need a taster spawned.
            drinkFreeze = t;
            const a = peers.get(-1);
            if (a) scrubDrink(a, t);
            return t;
          },
          /** REVIEW ONLY — start a SLORP trip already `frac` of the way
           *  through it (0..1), so all three stages can be looked at without
           *  standing in a casino for ten minutes. No silver moves: this is
           *  the trip, not the purchase. `__cas.slorp(0.8)` for the fear. */
          slorp: (frac = 0) => {
            const f = Math.max(0, Math.min(0.999, frac));
            startSlorpHook?.();
            slorpAt = performance.now() - SLORP_MS * f;
            return slorpPhase(SLORP_MS * f);
          },
          /** …and end one now, wherever it is. */
          slorpPop: () => {
            if (slorpAt) slorpAt = performance.now() - SLORP_MS;
            return !!slorpAt;
          },
          /** REVIEW ONLY — ride STAR DUST at `hits` (1..3) without buying a
           *  can. Three hits starts the real thirty-second doom clock; pass
           *  `doomFrac` to fast-forward the shake (0.9 = nearly gone). */
          stardust: (hits = 1, doomFrac = 0) => {
            gasHits = Math.max(1, Math.min(MAX_HITS, Math.round(hits)));
            gasAt = performance.now();
            gasFade = 1;
            gasWire = gasHits;
            net?.stardust(gasHits);
            if (gasHits >= MAX_HITS) {
              gasMaxed = true;
              gasDoomAt = performance.now() - 30_000 * Math.max(0, Math.min(0.999, doomFrac));
            }
            return gasPhase(gasHits, 0);
          },
          /** …and detonate now. */
          gasPop: () => {
            if (gasDoomAt) gasDoomAt = performance.now() - 30_000;
            return !!gasDoomAt;
          },
          /** REVIEW ONLY — swell the head to `doses` (0..3) without buying a
           *  shot. Three starts the real creak; `creakFrac` fast-forwards it. */
          ego: (doses = 1, creakFrac = 0) => {
            egoS = Math.max(0, Math.min(EGO_MAX, doses));
            egoWire = egoQuant(egoS);
            net?.ego(egoWire);
            if (egoS >= EGO_MAX) {
              egoMaxed = true;
              egoCreakAt = performance.now() - EGO_CREAK_MS * Math.max(0, Math.min(0.999, creakFrac));
            }
            return { swell: egoS, scale: egoHeadScale(egoS), fish: egoFish(egoS) };
          },
          /** …and pop it now. */
          egoPop: () => {
            if (egoCreakAt) egoCreakAt = performance.now() - EGO_CREAK_MS;
            return !!egoCreakAt;
          },
          /** Put a drink in your own pocket without walking to the bar — the
           *  first-person hold is otherwise only reachable by buying one. */
          giveDrink: (id = "beer") => {
            bag[bagSel] = id;
            syncHand();
            return bag[bagSel];
          },
          /** Take a swig, exactly as clicking would. */
          swig: () => { takeSwig(); return true; },
          /** Review-only: the escape door's E, without standing at it. */
          escapeDoor: () => { void openEscapeDoor(); return true; },
          /** Dance, exactly as the wheel would ask — the wheel sits behind
           *  pointer lock, which headless review drivers can't hold. The
           *  law sweep uses this to photograph the third-person stand-in
           *  (it must carry the same bottle/gun the room sees). */
          emote: (id = "gangnam") => { startEmote(id); return !!emoting; },
          /** Pull the trigger, exactly as clicking would — headless drivers
           *  can't pass the pointer-lock gate on the real click path. */
          fire: () => { fireGun(); return true; },
          /** Draw the gun without the keyboard (the key handler sits behind
           *  pointer lock, which headless drivers hold only unreliably).
           *  Presentation only — rounds stay whatever the server said. */
          drawGun: () => {
            bag[GUN_SLOT] = "gun";
            if (gunRounds === null) gunRounds = 9;
            bagSel = GUN_SLOT;
            syncHand();
            return true;
          },
          /** A BODY WITH THE GUN, standing where you can see it — the
           *  drinkDbg shape: the grip and the aim are wrong until they're
           *  looked at from a player's eye. */
          gunDbg: (ahead = 2.2) => {
            const a = makeAvatar(scene, "GUNNER", suit || "yellow");
            const fwd = new THREE.Vector3();
            camera.getWorldDirection(fwd);
            const px = player.x + fwd.x * ahead;
            const py = player.y + fwd.z * ahead;
            a.target.set(px * CELL, world.groundAt(px, py), py * CELL);
            a.group.position.copy(a.target);
            a.heading = player.yaw + Math.PI; // turned to face you
            a.group.rotation.y = a.heading;
            putInHand(a, "gun");
            peers.set(-2, a);
            return { at: [px, py] };
          },
          /** Play a gun gesture on the taster (or your own hands): the slices
           *  of the model's timeline are measured guesses until they're
           *  watched — this is how the review sweep watches them. */
          gunGesture: (which = "fire", who = "taster") => {
            const a = who === "taster" ? peers.get(-2) : viewmodel;
            if (!a) return false;
            if (which === "fire") pistolFire(a);
            else if (which === "reload") pistolReload(a);
            else pistolRack(a);
            return true;
          },
          drinkPlay: () => {
            drinkFreeze = null;
            const a = peers.get(-1);
            if (a) startDrink(a);
            return true;
          },
          /** MEASURE THE GRIP, rather than squinting at a still. For your own
           *  hands and the taster's: how upright the bottle is (its own up-axis
           *  dotted with world up — 1 stands, 0 is horizontal, negative pours),
           *  how far it sits from the wrist, and where it lands on screen as a
           *  fraction of the frame, which is the only honest test of whether
           *  you can actually see what you're holding. */
          handDbg: () => {
            const read = (a: DrinkRig | null, hand: THREE.Object3D | null) => {
              const holder = a ? heldModel(a) : null;
              const obj = holder?.children[0];
              if (!a || !holder || !obj || !hand) return null;
              obj.updateWorldMatrix(true, false);
              // THE BOTTLE'S OWN up-axis, read through the model — the holder's
              // +Y is not it (the model's up is whatever axis the file was
              // authored on, which is the entire point of measuring it).
              const up = new THREE.Vector3(0, 1, 0)
                .applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()));
              // …but POSITION comes from the HOLDER. The model was re-centred
              // onto the holder's origin at attach (obj.position.sub(centre)),
              // so obj's own origin is half a bottle away from where the bottle
              // actually is — measuring that put it a phantom 13cm low.
              const p = holder.getWorldPosition(new THREE.Vector3());
              const s = p.clone().project(camera);
              // WHICH WAY THE NECK POINTS, against the way the body faces.
              // Negative = back toward the drinker's mouth, which is drinking;
              // positive = out in front of them, which is pouring it away. The
              // uprightness alone can't tell those two apart.
              const fwd = new THREE.Vector3(0, 0, -1)
                .applyQuaternion(a.group.quaternion).setY(0).normalize();
              return {
                neck: +up.clone().normalize().dot(fwd).toFixed(3),
                upright: +up.y.toFixed(3),
                tiltDeg: +((Math.acos(Math.max(-1, Math.min(1, up.y))) * 180) / Math.PI).toFixed(1),
                wristCm: +(hand.getWorldPosition(new THREE.Vector3()).distanceTo(p) * 100).toFixed(1),
                camCm: +(camera.getWorldPosition(new THREE.Vector3()).distanceTo(p) * 100).toFixed(1),
                screen: [+s.x.toFixed(2), +s.y.toFixed(2)],
                inFrame: Math.abs(s.x) < 1 && Math.abs(s.y) < 1 && s.z > -1 && s.z < 1,
              };
            };
            return {
              me: read(viewmodel, viewmodel?.hand ?? null),
              taster: read(peers.get(-1) ?? null, peers.get(-1)?.hand ?? null),
            };
          },
          // a thunk, not the value: `wheelReady` is a getter, and Object.assign
          // would freeze whatever it said at build time
          wheelReady: () => hall.wheelReady,
          throwOff: (x = 13, y = 6.5, seed = 1) =>
            deaths.throwOff({ x, y, suit: suit || "yellow", seed }),
          deathDebug: () => deaths.debug(),
          // WHICH CLIP IS ON THE BODY RIGHT NOW. Reports the state the rig was
          // asked for, the clip that state actually resolved to (a missing file
          // silently degrades to its sober twin — this is how you see that),
          // and what is carrying weight this frame.
          bodyDbg: () => {
            const acts = viewmodel?.actions ?? {};
            const clipOf = (s: string): string | null => acts[s]?.getClip().name ?? null;
            let live: string | null = null;
            let best = 0;
            for (const [s, a] of Object.entries(acts)) {
              const w = a?.getEffectiveWeight() ?? 0;
              if (w > best) { best = w; live = `${s} → ${a?.getClip().name}`; }
            }
            return {
              asked: viewmodel?.state ?? null,
              playing: live,
              weight: +best.toFixed(2),
              drunkLevel: drunk.level,
              bound: Object.fromEntries(
                Object.keys(DRUNK_CLIPS).map((s) => [s, clipOf(s)]),
              ),
            };
          },
          // set the meter without buying a round — the verification hook for
          // the drunk locomotion clips (yours and, over the wire, everyone's)
          drunkTo: (level = 80) => {
            drunk.level = Math.max(0, Math.min(DRUNK_MAX, level));
            drunk.hangoverUntil = 0;
          },
          // put yourself on the carpet without drinking four bottles — the
          // verification hook for the pass-out ragdoll and its orbit camera
          passOut: (ms = 12_000) => {
            drunk.level = DRUNK_MAX;
            drunk.outUntil = performance.now() + ms;
            outCold = true;
            ctl.keys.clear();
            deaths.collapse({
              key: "me", x: player.x, y: player.y, suit: suit || "yellow",
              seed: (Date.now() & 0xffff) >>> 0, dir: player.yaw,
            });
            net?.move(player.x, player.y, player.yaw, 3);
          },
          // swing a cabinet's arm without spending silver — the verification
          // hook for the lever's arc
          pullLever: (i = 0) => hall.pullLever(i),
          // stage a win at any tier without feeding the machine
          slotWin: (i = 0, tier: SlotWinTier = "big", pay?: number) => hall.slotWin(i, tier, pay),
          renderInfo: () => ({ ...renderer!.info.render, ...renderer!.info.memory }),
        });
        loading = false;
        last = performance.now();
        const frame = (now: number): void => {
          raf = requestAnimationFrame(frame);
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          hall.tick(dt, player.x, player.y);
          deaths.tick(dt);
          // THE JUKEBOX, faded by where you're standing: loud at the machine,
          // a bed under the ceiling speakers, thin in the gaps between them.
          tickMusic(player.x, player.y);
          ctl.mods.scale = crouching ? 0.55 : 1;
          // THE CLIMB RULE, client side: one step walking, two while airborne —
          // the mantle. Unchanged from the backrooms, which is what keeps the
          // stage's stair strip the only way up while a jump can still put you
          // onto its 1m platform from the side.
          ctl.mods.climb = airborne ? 2 : 1;
          if (locked && mySeat === null && !emoting) ctl.tick(dt);

          // ---- the vertical body ------------------------------------------
          crouchAmt += ((crouching ? 1 : 0) - crouchAmt) * Math.min(1, dt * 10);
          if (airborne) {
            vy -= 12 * dt;
            jumpY += vy * dt;
            const gUnder = world.groundAt(player.x, player.y);
            if (vy <= 0 && airBase + jumpY <= gUnder + 0.001) {
              groundY = gUnder;
              airBase = gUnder;
              jumpY = 0;
              vy = 0;
              airborne = false;
              stepSound(0.3, true); // the landing, one hard step
            } else {
              groundY = airBase; // in the air the eye rides the arc, not the floor
            }
          }
          if (mySeat !== null && SEATS[mySeat]) {
            // Seated: the feet go where a PEER's seated body goes, so the eye
            // lands wherever the sitting clip actually puts the head.
            groundY = world.groundAt(player.x, player.y) + seatFeetY(mySeat);
            airBase = groundY;
            jumpY = 0;
            vy = 0;
            airborne = false;
          } else if (!airborne) {
            const gNow = world.groundAt(player.x, player.y);
            if (gNow < groundY - 0.35) {
              // THE FLOOR FELL AWAY — walking off the stage edge is a fall from
              // where the feet already are, not a snap down to carpet level.
              airborne = true;
              airBase = groundY;
              jumpY = 0;
              vy = 0;
            } else {
              groundY += (gNow - groundY) * Math.min(1, dt * 14);
              airBase = groundY;
            }
          }

          // my dance: drive the stand-in EXACTLY like a peer body — same
          // tick, same held-item pass — and watch the deadline. tickAvatar
          // clears a.emote itself when the clip pauses out, which is the
          // same finish signal every other client acts on.
          if (emoting) {
            const b = emoting.body;
            b.group.rotation.y = b.heading;
            tickAvatar(b, dt);
            putInHand(b, bag[bagSel] ?? "");
            tickDrink(b, dt * 1000);
            if (b.armed) {
              givePistol(b);
              tickGun(b, dt);
            }
            if (b.emote === "") endEmote("finished");
            else if (now > emoteEndsAt) endEmote("deadline");
          }

          // the seat prompt: nearest free seat within reach AND in view
          if (mySeat === null) {
            let best: number | null = null;
            let bestD = 0.8; // cells (~1.6m)
            for (let i = 0; i < SEATS.length; i++) {
              if (seatBy.has(i)) continue;
              const d = Math.hypot(SEATS[i].x - player.x, SEATS[i].y - player.y);
              if (d < bestD && facing(SEATS[i].x, SEATS[i].y, 0.5)) {
                bestD = d;
                best = i;
              }
            }
            nearSeat = best;
          } else nearSeat = null;

          // …and the station prompt: nearest zone you're standing in (C3)
          if (!station) {
            let bestS: Station | null = null;
            let bestSD = Infinity;
            // "talk to Sterling" is wherever he is along the bar right now
            if (sterlingStation && hallRef) {
              const sx = hallRef.sterlingX();
              sterlingStation.x = sx;
              if (sterlingStation.aim) sterlingStation.aim[0] = sx;
              if (sterlingStation.cam) sterlingStation.cam[0] = sx;
              if (sterlingStation.look) sterlingStation.look[0] = sx;
            }
            for (const s of STATIONS) {
              const d = Math.hypot(s.x - player.x, s.y - player.y);
              // the wheel wants you LOOKING RIGHT AT IT (Josh); other games
              // take a comfortable cone
              const dot = s.game === "wheel" ? 0.72 : 0.5;
              const [ax, ay] = s.aim ?? [s.x, s.y];
              if (d < s.r && d < bestSD && facing(ax, ay, dot)) {
                bestSD = d;
                bestS = s;
              }
            }
            nearStation = bestS;
            // …a drink or a drug on the carpet at your feet
            {
              let bd: { id: number; item: string } | null = null;
              let bdd = 1.2;
              for (const [id, c] of carpet) {
                const d = Math.hypot(c.x - player.x, c.y - player.y);
                if (d < bdd && facing(c.x, c.y, 0.2)) {
                  bdd = d;
                  bd = { id, item: c.item };
                }
              }
              if (bd?.id !== nearDrop?.id) nearDrop = bd;
            }
            // …and somebody in front of you to hand what you're holding to
            {
              let bh: { id: number; name: string } | null = null;
              if (bagSel !== GUN_SLOT && bag[bagSel]) {
                let bhd = 2.2;
                for (const [id, a] of peers) {
                  if (a.pose === 3 || deathsRef?.isDown("p" + id)) continue;
                  const px = a.group.position.x / CELL;
                  const py = a.group.position.z / CELL;
                  const d = Math.hypot(px - player.x, py - player.y);
                  if (d < bhd && facing(px, py, 0.8)) {
                    bhd = d;
                    bh = { id, name: peerNames.get(id) ?? "them" };
                  }
                }
              }
              if (bh?.id !== handTo?.id) handTo = bh;
            }
            // …and the in-world slots: arm's reach AND looking at the cabinet
            const nc = hallRef?.nearestCabinet(player.x, player.y);
            nearSlotIdx = nc && nc.d < 1.15 && facing(nc.x, nc.y, 0.55) ? nc.index : null;
            const sec = nearSlotIdx !== null && nc ? slotSectionAt(nc.x, nc.y) : null;
            if (sec !== nearSlotSec) nearSlotSec = sec;
            // …and the way out: at the entrance doors, facing them
            nearDoor = player.y > H - 1.4 && player.x > DOOR.x0 - 0.3 && player.x < DOOR.x1 + 0.3 && facing((DOOR.x0 + DOOR.x1) / 2, H, 0.45);
            // …and the ESCAPE ROOM door, on whichever wall the hall hangs it:
            // within 1.4 cells of its plane, 0.85 either side, facing the wall
            {
              const [fx, fy] = ESCAPE_DOOR.face;
              const ax = player.x - ESCAPE_DOOR.x;
              const ay = player.y - ESCAPE_DOOR.y;
              nearEscape =
                ax * fx + ay * fy < 1.4 &&
                Math.abs(ax * fy - ay * fx) < 0.85 &&
                facing(ESCAPE_DOOR.x - fx * 0.1, ESCAPE_DOOR.y - fy * 0.1, 0.45);
            }
          } else {
            nearStation = null;
            nearSlotIdx = null;
            nearDoor = false;
            nearEscape = false;
            nearDrop = null;
            handTo = null;
          }

          // position wire (12Hz when something changed; silent while seated —
          // the server treats any move frame as standing up — and silent
          // while a sit request is in flight, for the same reason)
          if (resendPose) { resendPose = false; forgetSent(); }
          if (connected && mySeat === null && now >= sitPendingUntil && now - lastSend > 80) {
            // SHOT counts as down too — the death-cam mouse kept satisfying
            // the yaw test, and a pose-0 frame stood the corpse back up for
            // the whole room while its owner watched it lie there.
            const pose = outCold || shotBy ? 3 : airborne ? 2 : crouching ? 1 : 0;
            // DRUNK enough to show it — the same threshold the HUD calls
            // "drunk" rather than "merry", so the body and the label agree.
            const tipsy = drunk.level > DRUNK_SHOW;
            if (
              Math.abs(player.x - sentX) > 0.003 || Math.abs(player.y - sentY) > 0.003 ||
              Math.abs(player.yaw - sentYaw) > 0.01 || Math.abs(player.pitch - sentPitch) > 0.02 ||
              pose !== sentPose || tipsy !== sentDrunk
            ) {
              net?.move(player.x, player.y, player.yaw, pose, tipsy, player.pitch);
              sentX = player.x;
              sentY = player.y;
              sentYaw = player.yaw;
              sentPitch = player.pitch;
              sentPose = pose;
              sentDrunk = tipsy;
              lastSend = now;
            }
          }

          // my stride: a step every ~1.35m walking, 1.7m running — real-pace
          // cadence (Josh: the old 0.74m stride fired 5+ steps a second at the
          // 4.1 m/s walk speed, which jumbled the slices into a shuffle).
          // Silent in the air — the landing is the one step a jump is worth.
          {
            const dm = Math.hypot(player.x - lastPX, player.y - lastPY) * CELL;
            lastPX = player.x;
            lastPY = player.y;
            const running = dm / Math.max(1e-4, dt) > 4.4;
            strideAcc += dm;
            const stride = running ? 1.7 : 1.35;
            if (strideAcc > stride) {
              strideAcc = 0;
              if (!airborne) stepSound(0.2, running);
            }
          }

          // ghosts: reconcile against the game stores at ~1Hz, animate always
          ghostCheckIn -= dt;
          if (ghostCheckIn <= 0) {
            ghostCheckIn = 1.1;
            reconcileGhosts();
            pollBigWins(); // the bar's winners screen collects on the same beat
            // YOUR BODY SITS WHERE THE GAME SEATED YOU (Josh: "it doesn't
            // show you seated"). The engine picks the seat on join — it
            // rarely matches whichever stool you happened to walk up to, and
            // a body one stool over from its own cards is the glitch. The
            // engine is authoritative, so the body follows it: claim the
            // stool for my game seat whenever I'm not already on it. Stool
            // ids are 18+lobby*3+k (k 0-2) and 36+lobby*3+(k-3), by
            // construction of SEATS.
            const stool = engineStool();
            if (stool !== null && mySeat !== stool && !seatBy.has(stool)) net?.sit(stool);
          }
          for (const a of ghostAv.values()) {
            a.group.rotation.y = a.heading;
            tickAvatar(a, dt);
          }

          // peers glide + animate (+ their footsteps, faded by distance)
          const k = 1 - Math.exp(-9 * dt);
          for (const [id, a] of peers) {
            if (!a.seated) a.group.position.lerp(a.target, k);
            a.group.rotation.y = a.heading;
            tickAvatar(a, dt);
            const ps = peerStride.get(id) ?? { acc: 0, x: a.group.position.x, y: a.group.position.z };
            const dm = Math.hypot(a.group.position.x - ps.x, a.group.position.z - ps.y);
            ps.x = a.group.position.x;
            ps.y = a.group.position.z;
            ps.acc += dm;
            if (ps.acc > (a.wireSpeed > 4.5 ? 1.7 : 1.35)) {
              ps.acc = 0;
              const d = Math.hypot(a.group.position.x - player.x * CELL, a.group.position.z - player.y * CELL);
              if (d < 16) stepSound(0.16 * (1 - d / 16), a.wireSpeed > 4.5);
            }
            peerStride.set(id, ps);
            // The swig, AFTER tickAvatar: the gesture is posed on top of
            // whatever locomotion clip the mixer just wrote.
            if (drinkFreeze !== null && id === -1) scrubDrink(a, drinkFreeze);
            else tickDrink(a, dt * 1000);
            // …and the pistol, same rule. givePistol every frame is the
            // self-healing attach (skeletons and the gun model both arrive
            // late); it no-ops once hung.
            if (a.armed) {
              givePistol(a);
              tickGun(a, dt);
            }
          }

          // ---- THE BODY, and the eye that rides its head --------------------
          // State comes from what the player is actually DOING — this is the one
          // body whose input we know exactly — so a strafe plays the strafe clip.
          const sprinting = ctl.keys.has(brSettings.keys.sprint) && player.moving && !crouching;
          if (viewmodel) {
            // the dance and the table shot both show the stand-in instead; out
            // cold (or shot dead), the RAGDOLL is your body and the
            // first-person rig would hang in the orbit shot beside it
            viewmodel.group.visible = !emoting && !station && !outCold && !shotBy;
            if (!emoting) {
              const K = brSettings.keys;
              let fwd = 0;
              let strafe = 0;
              if (ctl.keys.has(K.forward) || ctl.keys.has("ArrowUp")) fwd += 1;
              if (ctl.keys.has(K.back) || ctl.keys.has("ArrowDown")) fwd -= 1;
              if (ctl.keys.has(K.left) || ctl.keys.has("ArrowLeft")) strafe -= 1;
              if (ctl.keys.has(K.right) || ctl.keys.has("ArrowRight")) strafe += 1;
              // Forward wins ties, so diagonals read as forward movement.
              const dir =
                !player.moving ? ""
                : Math.abs(fwd) >= Math.abs(strafe) ? (fwd >= 0 ? "" : "back")
                : strafe > 0 ? "right"
                : "left";
              // Your OWN hands stagger too — it is the first thing you
              // notice about being drunk, and the peer bodies read it off the
              // same table (drunkState).
              // …and armed wraps drunk wraps sober, same as every peer body.
              tickViewmodel(viewmodel,
                gunState(drunkState(
                  // "sitidle", NOT "sit": peers play the animated sitting
                  // idle for a seated body — your own first-person body must
                  // breathe on the same clip, not the boat's frozen pose.
                  mySeat !== null ? "sitidle"
                  : airborne ? "jump"
                  : crouching ? (player.moving ? (dir ? `crouch${dir}` : "crouchwalk") : "crouchidle")
                  : !player.moving ? "idle"
                  : sprinting ? `run${dir}`
                  : `walk${dir}`,
                  // one drunk set for every intoxicant (Josh, Aug 2026) —
                  // your own hands stagger on drink, slorp, star dust AND ego
                  drunk.level > DRUNK_SHOW || slorpStage >= 1 || gasHits >= 1 || egoS >= 1,
                  // your own user id, NOT 0: the salt picks WHICH drunk idle
                  // plays, so a zero here had you watching a different stagger
                  // than the one your id dealt everyone else
                  myId,
                  now,
                ), bagSel === GUN_SLOT && !!bag[GUN_SLOT]),
                dt);
            }
          }
          // Headbob, and only on the ground: a bob in mid-air is a wobble.
          bobT = player.moving && !airborne && mySeat === null
            ? bobT + dt * (sprinting ? 12 : crouchAmt > 0.5 ? 6.5 : 9)
            : 0;
          const bob = bobT > 0 ? Math.sin(bobT) * 0.035 : 0;
          // THE EYE FOLLOWS THE BODY'S OWN HEAD. `headDrop` is measured off the
          // real head bone every frame (placeViewmodel), so crouching, sitting
          // and landing move the view by exactly as much as they move the model
          // — instead of by a constant that has to be re-guessed per pose. The
          // fallbacks only cover the frames before the suit has loaded.
          const poseDrop = viewmodel
            ? viewmodel.headDrop
            : mySeat !== null ? -0.59 : -crouchAmt * 0.55;
          // Set, not eased: groundY is already the eased floor, and easing on top
          // of it would put the camera a beat behind its own jump.
          eyeY = groundY + EYE + poseDrop + jumpY + bob;
          {
            // Headroom clamp — whatever the floor is doing, the eye never leaves
            // the room. A jump under the bar's low soffit must not put the camera
            // through the ceiling.
            const cx = Math.floor(player.x);
            const cy = Math.floor(player.y);
            eyeY = Math.min(eyeY, world.floorAt(cx, cy) + world.cellHeightAt(cx, cy) - 0.25);
          }
          // Where the player's own head is this frame — the camera in walk mode,
          // and the BODY's anchor always (so the table shot below can watch your
          // own body sit at the felt instead of dragging it to the camera).
          // Only once the drunk clips are actually playing (the same threshold
          // the HUD stops calling you merry at), and never while out cold —
          // the ragdoll owns the camera then.
          const drunkLook =
            drunk.level > DRUNK_SHOW && !outCold && !station && !emoting
              ? drunkK(drunk) * LOOK_SWAY
              : 0;
          eyeTmp.set(player.x * CELL, eyeY, player.y * CELL);
          // DRINK YOU CAN SEE FROM INSIDE (Josh: "make sure too the player from
          // their pov can see the animations as well of being drunk. not just
          // everyone else"). placeViewmodel PINS the head to the lens — it
          // cancels whatever the clip does to the head, which is right for
          // crouching but meant a drunk's own view sat perfectly steady while
          // their body staggered underneath it. So the eye takes the stagger
          // back: `vm.sway` is how far the animation moved the head this frame,
          // and the camera rides a share of it, scaled by how drunk you are.
          // The body is anchored to eyeTmp below, so it comes along and the
          // mask keeps its framing — the whole rig lurches, together.
          // CLAMPED AND SMOOTHED, both learned by measuring it: the raw head
          // travel of these clips is over a metre fore-and-aft on the idle
          // alone (they lean, hard), which as a camera is unusable — and an
          // idle VARIATION swapping mid-blend would jump the lens. So the
          // offset is capped at LOOK_MAX per axis and eased toward, which also
          // turns the whole thing into a weight-shift rather than a twitch.
          if (viewmodel) {
            const clamp = (v: number): number => Math.max(-LOOK_MAX, Math.min(LOOK_MAX, v * drunkLook));
            const k = 1 - Math.exp(-5 * dt);
            lensSway.x += (clamp(viewmodel.sway.x) - lensSway.x) * k;
            lensSway.y += (clamp(viewmodel.sway.y) - lensSway.y) * k;
            lensSway.z += (clamp(viewmodel.sway.z) - lensSway.z) * k;
            eyeTmp.add(lensSway);
          }
          if (station?.cam) {
            // THE TABLE SHOT (option 1 — Josh's pick): the dock is open, so the
            // camera glides to the station's framing and the felt IS the screen.
            const [cx, cy, ch] = station.cam;
            camTmp.set(cx * CELL, ch, cy * CELL);
            camera.position.lerp(camTmp, 1 - Math.exp(-5 * dt));
            const [lx, ly, lh] = station.look ?? station.cam;
            camera.lookAt(lx * CELL, lh, ly * CELL);
          } else {
            camera.position.copy(eyeTmp);
            camera.rotation.order = "YXZ";
            camera.rotation.y = player.yaw;
            camera.rotation.x = Math.max(-PITCH_DOWN_MAX, Math.min(1.45, player.pitch));
          }
          // The body goes where the PLAYER's eye is — placed after tickViewmodel
          // (which it overrides at the neck). Anchored to eyeTmp, NOT the camera:
          // with the table shot live the camera is across the felt, and the body
          // must stay seated in frame rather than teleporting to the lens.
          // Skipped mid-dance: what's on screen then is the stand-in clone.
          // While a STATION is open the viewmodel (headless — it's a first-
          // person rig) is swapped for a full-headed stand-in body.
          // Your own body takes the ENGINE's seat first and the wire's second,
          // so it sits the moment the table seats you.
          const bodySeat = engineStool() ?? mySeat;
          if (station && !standIn) {
            standIn = makeAvatar(scene, "", suit || "yellow");
            standIn.tag.visible = false;
            standIn.salt = myId; // same drunk idle as the body peers see
            standIn.pitch = player.pitch; // …and the same head lean
            if (bodySeat !== null && SEATS[bodySeat]) applySeat(standIn, bodySeat);
            else {
              standIn.target.set(player.x * CELL, world.groundAt(player.x, player.y), player.y * CELL);
              standIn.group.position.copy(standIn.target);
              standIn.heading = player.yaw;
            }
            if (viewmodel) viewmodel.group.visible = false;
          } else if (!station && standIn) {
            disposeAvatar(scene, standIn);
            standIn = null;
            if (viewmodel) viewmodel.group.visible = true;
          }
          // OUT COLD, for everyone else (Josh's bar). Pose 3 RAGDOLLS the peer
          // where they stand: the walking body is hidden and the same verlet
          // figure the death cinematic uses folds onto the carpet. The first
          // cut just rotated the standing model 90° and it read as a plank
          // (Josh: "the passed out from being drunk is not good just ragdoll
          // the character"). The sim is local to each viewer — an unconscious
          // drunk is cosmetic, so it needs no wire beyond the pose flag.
          for (const [id, a] of peers) {
            const down = a.pose === 3;
            const key = "p" + id;
            if (down && !deathsRef?.isDown(key)) {
              deathsRef?.collapse({
                key,
                x: a.group.position.x / CELL,
                y: a.group.position.z / CELL,
                suit: peerSuit.get(id) ?? "yellow",
                // The seed off the wire — the victim's own client generated it
                // as they folded (or the server stamped it for a gun death),
                // so this body collapses the same way on every screen. The id
                // hash only covers frames before the wire value lands.
                seed: a.downSeed || (id * 2654435761) >>> 0,
                dir: a.heading,
              });
            } else if (!down && deathsRef?.isDown(key)) {
              deathsRef.revive(key);
            }
            // The walking body goes; the NAME TAG stays, dropped to carpet
            // height — the room should still be able to see who that is.
            for (const ch of a.group.children) ch.visible = down ? ch === a.tag : true;
            a.tag.position.y = down ? 0.6 : 2.15;
          }
          for (const a of peers.values()) a.tag.visible = !station;
          if (standIn) {
            if (bodySeat !== null && SEATS[bodySeat]) applySeat(standIn, bodySeat);
            standIn.group.rotation.y = standIn.heading;
            // one drunk set for every intoxicant — the table shot sees it too
            standIn.drunk = drunk.level > DRUNK_SHOW || slorpStage >= 1 || gasHits >= 1 || egoS >= 1;
            // …and your stand-in wears your actual head size
            headBoneOf(standIn)?.scale.setScalar(egoHeadScale(egoS));
            standIn.pitch = player.pitch; // the head leans like the room sees it lean
            tickAvatar(standIn, dt);
            // Your own body holds — and drinks — the same bottle (or gun)
            // everyone else sees you with. This is the only view where you
            // watch yourself do it, so a mismatch here would be the first
            // thing anyone noticed.
            putInHand(standIn, bag[bagSel] ?? "");
            if (standIn.armed) tickGun(standIn, dt);
            if (standInSwig) {
              standInSwig = false;
              startDrink(standIn);
            }
            tickDrink(standIn, dt * 1000);
          }
          if (viewmodel && !emoting && !station) placeViewmodel(viewmodel, eyeTmp, player.yaw, player.pitch);
          // YOUR OWN HAND. Same bone, same code, same gesture as everybody
          // else's body — run AFTER placeViewmodel, which writes the arm pose,
          // so the swig layers on top of it rather than being overwritten.
          //
          // The swig flag is consumed whether or not the arm is on screen: it
          // is a one-shot, and a click made while the table shot was up must
          // not be banked and fired at nothing minutes later.
          const swigNow = vmSwig;
          vmSwig = false;
          if (viewmodel && viewmodel.group.visible) {
            const want = bag[bagSel] ?? "";
            if (want === "gun") {
              // THE GUN. Same bone as the bottles, its own module: the barrel
              // follows the eye (pitch included — a gun that can't aim at the
              // floor can't threaten anyone's shoes), the arm holds it up in
              // the lower right, and the slide/mag animations are the model's
              // own, sliced from its timeline.
              putBottleInHand(viewmodel, "");
              givePistol(viewmodel); // self-healing — retried until the hand exists
              tickGun(viewmodel, dt, { eye: eyeTmp, yaw: player.yaw, pitch: player.pitch });
              tickDrink(viewmodel, dt * 1000); // lets an interrupted swig finish
            } else {
              takePistol(viewmodel);
              putBottleInHand(viewmodel, want);
              if (swigNow) startDrink(viewmodel);
              // The first-person framing only applies while there's something
              // to hold — an empty hand keeps the pose the walk cycle gave it.
              // It also has to outlive the BOTTLE: you finish the drink 500ms
              // into a 900ms gesture, and the arm still has to come back down.
              // Without the second half of this test those last frames fall
              // through to the peer path and the hand reaches for the head
              // BONE, which in first person is your own neck.
              const fp = want || isDrinking(viewmodel)
                ? { eye: eyeTmp, yaw: player.yaw }
                : null;
              if (drinkFreeze !== null) scrubDrink(viewmodel, drinkFreeze, fp);
              else tickDrink(viewmodel, dt * 1000, fp);
            }
          }
          // THIRD PERSON FOR THE DANCE — orbit the stand-in; set LAST so the
          // writes above can't undo the lookAt (the death-cam lesson).
          if (emoting) {
            const bx = player.x * CELL;
            const bz = player.y * CELL;
            const focusY = world.groundAt(player.x, player.y) + 1.15;
            const cosP = Math.cos(emotePitch);
            const dist = 2.7;
            camera.position.set(
              bx + Math.sin(emoteYaw) * cosP * dist,
              focusY + Math.sin(emotePitch) * dist,
              bz + Math.cos(emoteYaw) * cosP * dist,
            );
            camera.lookAt(bx, focusY, bz);
          }

          // Proximity voice: everyone at their body. Openness 0.25, NOT 1
          // (Josh, Aug 2026: "there is a lot of echo in the voice while in
          // the casino") — openness 1 is the flooded-hall reverb, a 2.6s
          // ringing tail with a 75ms pre-delay, and it read as exactly that.
          // A casino is a big room, but it's carpeted, coffered and full of
          // furniture: mostly the tight dry room, a quarter of the hall.
          // THROTTLED TO ~12Hz (Aug 2026 perf review): every call schedules a
          // pile of Web Audio setTargetAtTime events (9 listener + up to a
          // dozen per peer) — at 60Hz with four peers that was thousands of
          // automation-timeline insertions a second, for panning nobody can
          // hear update faster than this. The Map is reused for the same
          // reason: no per-frame allocation for a per-83ms job.
          spatialCd -= dt;
          if (voice && spatialCd <= 0) {
            spatialCd = 1 / 12;
            spatialPeers.clear();
            for (const [id, a] of peers) {
              spatialPeers.set(id, { x: a.group.position.x / CELL, y: a.group.position.z / CELL, walls: 0 });
            }
            voice.updateSpatial({ x: player.x, y: player.y, yaw: player.yaw }, spatialPeers, undefined, 0.25);
          }
          if (!renderer) return; // torn down mid-frame — nothing left to draw
          // ---- DRINK: the meter, the hands, and the eyes -----------------
          const nowMs = performance.now();
          tickDrunk(drunk, dt, nowMs);
          drunkUi = Math.round(drunk.level * 2) / 2; // same-value writes are free
          const wasOut = outCold;
          outCold = drunk.outUntil > nowMs;
          if (wasOut && !outCold) {
            showToast("you come round on the carpet");
            deathsRef?.revive("me"); // the body gets up
            net?.move(player.x, player.y, player.yaw, 0, drunk.level > DRUNK_SHOW, player.pitch); // back on your feet
          }
          const dk = drunkK(drunk);
          // the world tilts before it doubles
          if (!emoting && !outCold) {
            camera.rotation.z =
              Math.sin(nowMs / 900) * 0.055 * dk + Math.sin(nowMs / 337) * 0.02 * dk;
          }
          // OUT COLD: watch your own ragdoll from outside, the death cam's
          // orbit at a drunk's pace. Set LAST so the walk/station writes above
          // can't undo the lookAt — the same rule the dance camera follows.
          // SHOT DEAD rides the same orbit — the body it watches was thrown
          // rather than crumpled, but it's the same "me"-keyed ragdoll.
          if (outCold || shotBy) {
            const body = deathsRef?.bodyAt("me");
            const bx = body?.x ?? player.x * CELL;
            const bz = body?.z ?? player.y * CELL;
            const by = body?.y ?? world.groundAt(player.x, player.y) + 0.3;
            const a = player.yaw + nowMs / 9000; // a slow drift, not a spin
            camera.position.set(bx + Math.sin(a) * 2.3, by + 1.35, bz + Math.cos(a) * 2.3);
            camera.rotation.z = 0;
            camera.lookAt(bx, by + 0.1, bz);
          }
          // …and everyone else's voice smears with it
          voice?.setImpairment(outCold ? 0.85 : dk * 0.9);
          if (drinkAnim > 0) drinkAnim = Math.max(0, drinkAnim - dt * 1000);

          // ---- SLORP ----------------------------------------------------
          // The ten minutes, ticked in one place: the room's pitch, the stage
          // the wire is carrying, the noises you start making, the shake, and
          // finally the pop. All of it reads off slorpPhase(), which is pure
          // and pinned by test_slorp.mjs — nothing here decides anything.
          const trip = slorpAt ? slorpPhase(nowMs - slorpAt) : null;
          if (trip) {
            slorpLast = trip;
            slorpFade = 1;
            if (trip.done) {
              popSlorp(); // the carpet
            } else {
              if (trip.stage !== slorpStage) {
                slorpStage = trip.stage;
                net?.slorp(trip.stage);
                showToast(SLORP_TOASTS[trip.stage] ?? "");
              }
              // Everything you hear, dragged off its pitch together — except
              // the RECORD, which must keep the server's time (a slowed
              // element fought the playhead sync and skipped): the jukebox
              // gets the spectral warp instead.
              const rate = slorpPitch(trip, nowMs);
              setSfxRate(rate);
              setMusicWarp(slorpMusicWarp(trip, nowMs));
              voice?.setVoicePitch(rate);
              // The shake is the CAMERA's, not the shader's: your eyes are
              // going, so the head moves. It rides on top of the drunk tilt
              // and never touches player.yaw — peers see a steady head,
              // because this is happening to you, not to your body.
              if (trip.fear > 0.001 && !outCold && !shotBy) {
                const f = trip.fear;
                camera.rotation.z += Math.sin(nowMs / 41) * 0.012 * f;
                camera.rotation.x += Math.sin(nowMs / 29) * 0.010 * f;
                camera.rotation.y += Math.cos(nowMs / 37) * 0.010 * f;
              }
              // …and the sounds you make, which the room hears too.
              const gap = slorpNoiseGap(trip);
              if (gap && nowMs - lastSlorpNoise > gap) {
                lastSlorpNoise = nowMs;
                playSfx("slorp-gurgle", 0.5, slorpGurgleSynth);
              }
            }
            // …and the room hears everyone ELSE who is at that stage. Each
            // body keeps its own clock (peerGurgleAt) so two people gone at
            // the same time don't fall into step and start chanting.
          } else if (slorpFade > 0) {
            // AFTER the pop: the room's pitch comes back and the pass fades
            // out under the white-out rather than cutting, so the last frame
            // of a trip is the trip letting go of you.
            slorpFade = Math.max(0, slorpFade - dt / 1.1);
            slorpFlash = Math.max(0, slorpFlash - dt / 0.55);
            const ease = slorpFade;
            setSfxRate(1 + (slorpPitch(slorpLast!, nowMs) - 1) * ease);
            setMusicWarp(slorpMusicWarp(slorpLast, nowMs, ease));
            voice?.setVoicePitch(1 + (slorpPitch(slorpLast!, nowMs) - 1) * ease);
            if (slorpFade === 0) {
              slorpLast = null;
              setSfxRate(1);
              setMusicWarp(slorpMusicWarp(null, 0));
              voice?.setVoicePitch(1);
            }
          }
          // Everyone else's stage-3 noises, heard from where they're standing.
          if (peerSlorp.size) {
            for (const [pid, st] of peerSlorp) {
              if (st !== 3) continue;
              const a = peers.get(pid);
              if (!a) continue;
              const last = peerGurgleAt.get(pid) ?? 0;
              // The same tightening the tripper hears from the inside, but
              // seeded off their id so no two bodies gurgle in unison.
              if (nowMs - last < 2600 + (pid % 7) * 260) continue;
              peerGurgleAt.set(pid, nowMs);
              const d = Math.hypot(
                a.group.position.x - player.x * CELL,
                a.group.position.z - player.y * CELL,
              );
              if (d > 18) continue;
              const g = 0.5 * (1 - d / 18);
              playSfx("slorp-gurgle", g, () => slorpGurgleSynth(g));
            }
          }
          // ---- STAR DUST ------------------------------------------------
          // The window, the doom clock, the neon and the leak — all pure
          // reads off casino/stardust.ts, pinned by test_stardust.mjs.
          let gasShakeNow = 0;
          if (gasDoomAt) {
            gasLevel = 1; // pinned red and flashing: there is no undo
            const doom = gasDoom(nowMs - gasDoomAt);
            gasShakeNow = doom.shake;
            gasGlowHeld = 1;
            gasFade = 1;
            // The shake is the CAMERA's, like slorp's fear — your eyes are
            // going; peers see a steady head and a very leaky body.
            if (!outCold && !shotBy && !emoting) {
              camera.rotation.z += Math.sin(nowMs / 23) * 0.020 * doom.shake;
              camera.rotation.x += Math.sin(nowMs / 17) * 0.016 * doom.shake;
              camera.rotation.y += Math.cos(nowMs / 19) * 0.016 * doom.shake;
            }
            if (doom.done) puffGas();
          } else if (gasAt) {
            const gp = gasPhase(gasHits, nowMs - gasAt);
            // quantized: a $state write per frame flushes effects at 60Hz for
            // the whole gassed window; 0.5% steps repaint the meter just as
            // smoothly (same-value assigns are free in Svelte 5)
            gasLevel = Math.round(gp.bar * 200) / 200;
            if (gp.expired) {
              gasAt = 0;
              gasHits = 0;
              if (gasWire !== 0) {
                gasWire = 0;
                net?.stardust(0);
              }
              showToast("the sparkle drains away");
            } else {
              gasGlowHeld = gp.glow;
              gasFade = 1;
            }
          } else if (gasFade > 0) {
            gasLevel = 0;
            gasFade = Math.max(0, gasFade - dt / 1.3);
            if (gasFade === 0) gasGlowHeld = 0;
          }
          // …and the room's leaks: a green stream off every body past half a
          // can ("over half" = two hits) — a whole stage EARLIER off a body
          // that's also drinking (gasSmoke; drink loosens everything, and
          // both inputs ride the wire so every observer draws the same
          // trousers) — heavier off a body about to go.
          for (const [pid, hits] of peerGas) {
            const stage = gasSmoke(hits, peerBoozy.get(pid) ?? false);
            if (!stage) continue;
            const a = peers.get(pid);
            if (!a || a.pose === 3) continue;
            // The seat of the trousers: +Z is BEHIND the body (both rigs flip
            // their model inside the group; -Z is where they face).
            V_GASBACK.set(0, 0, 1).applyQuaternion(a.group.quaternion).setY(0).normalize();
            V_GASPOS.copy(a.group.position).addScaledVector(V_GASBACK, 0.13);
            V_GASPOS.y += 0.82;
            gasStream(scene, V_GASPOS, V_GASBACK, stage, dt);
          }
          tickGasFx(dt);
          // ---- EGO ------------------------------------------------------
          // The swell drains continuously — head, lens and meter all read the
          // same number, so sobering is smooth on every screen. At three the
          // creak takes over: the drain stops (a critical head does not
          // quietly let the air out) and the groans tighten until it goes.
          let egoLensNow = 0;
          if (egoCreakAt) {
            egoLevel = 1;
            const ck = egoCreak(nowMs - egoCreakAt);
            egoLensNow = 1 + 0.08 * Math.sin(nowMs / 55) * ck.strain; // the throb
            if (nowMs - lastEgoCreakSfx > 950 - 700 * ck.strain) {
              lastEgoCreakSfx = nowMs;
              playSfx("ego-creak", 0.65, () => egoCreakSynth(ck.strain, 0.65));
            }
            if (ck.done) doEgoPop();
          } else if (egoS > 0) {
            // LIQUOR PRESERVES CONFIDENCE (Josh, Aug 2026): drunk past the
            // show line, the swell drains at half speed — the big-headed man
            // at the bar stays big-headed as long as he keeps drinking.
            egoS = egoDecay(egoS, dt * 1000, drunk.level > DRUNK_SHOW);
            egoLevel = Math.round((egoS / EGO_MAX) * 200) / 200; // quantized, same as gas
            const q = egoQuant(egoS);
            if (q !== egoWire) {
              egoWire = q;
              net?.ego(q);
              if (q === 0) showToast("your head returns to its usual size");
            }
            egoLensNow = egoFish(egoS);
          } else {
            egoLevel = 0;
          }
          // …and every big head in the room eases toward its wire size (the
          // wire steps in quarter-doses; the head grows and shrinks smoothly).
          for (const [pid, a] of peers) {
            const q = peerEgo.get(pid) ?? 0;
            const cur = peerHeadScale.get(pid) ?? 1;
            if (q === 0 && Math.abs(cur - 1) < 0.002) continue;
            const target = a.pose === 3 ? 1 : egoHeadScale(egoFromWire(q));
            const nu = cur + (target - cur) * (1 - Math.exp(-4 * dt));
            peerHeadScale.set(pid, nu);
            headBoneOf(a)?.scale.setScalar(nu);
          }
          tickEgoFx(dt, world.groundAt(player.x, player.y));
          tickGore(dt, world.groundAt(player.x, player.y));
          // THE POST CHAIN. Two passes that can each be absent: drink's double
          // vision and slorp's everything. Whichever runs LAST writes the
          // canvas and owes the sRGB encode (uEncode) — do it twice and the
          // room washes out, which is the bug drink.ts already carries a
          // paragraph about. Straight and sober still renders directly, so
          // nobody pays for a pass they can't see.
          const drunkOn = dk > 0.02 || outCold;
          const tripView = trip && !trip.done ? trip : slorpLast;
          const tripOn = !!tripView && slorpFade > 0.001;
          // STAR DUST and EGO ride the slorp pass (same quad, extra
          // uniforms) — `postOn` is "the second pass runs at all".
          const gasOn = gasGlowHeld * gasFade > 0.001 || gasShakeNow > 0.001;
          const egoOn = egoLensNow > 0.001;
          const postOn = tripOn || gasOn || egoOn;
          // FAIL SAFE, NOT FROZEN: a throw anywhere in the post chain lands
          // after the target render and before the canvas write, so the
          // screen holds its stale frame while rAF spins — the uEncode bug
          // above froze every drinker's view until they sobered up. Any
          // future pass bug degrades to a plain sober render instead.
          try {
          if (drunkOn || postOn) {
            const w = renderer!.domElement.width, h = renderer!.domElement.height;
            if (drunkRT.width !== w || drunkRT.height !== h) drunkRT.setSize(w, h);
            if (postOn && drunkOn && (slorpRT.width !== w || slorpRT.height !== h)) slorpRT.setSize(w, h);
            // the room (with its glow, if on) lands in drunkRT, linear, for
            // the drug passes to read exactly as they always have
            if (glowOn) {
              bloom.render(renderer!, scene, camera, drunkRT, false);
            } else {
              renderer!.setRenderTarget(drunkRT);
              renderer!.render(scene, camera);
            }
            renderer!.setRenderTarget(null);
            if (drunkOn) {
              drunkMat.uniforms.uK.value = dk;
              drunkMat.uniforms.uTime.value = nowMs / 1000;
              // Out cold used to fade to 93% black — which now hides the very
              // thing worth seeing, your own body folded on the carpet. A dim
              // is enough to read as "you are not driving this".
              drunkMat.uniforms.uDark.value = outCold ? 0.15 : 0;
              drunkMat.uniforms.uEncode.value = postOn ? 0 : 1;
              if (postOn) renderer!.setRenderTarget(slorpRT);
              renderer!.render(drunkScene, drunkCam);
              renderer!.setRenderTarget(null);
            }
            if (postOn) {
              slorpMat.uniforms.tDiffuse.value = (drunkOn ? slorpRT : drunkRT).texture;
              slorpMat.uniforms.uTime.value = nowMs / 1000;
              // `slorpFade` carries the pass out after the pop, so the last
              // thing a dying screen does is calm down rather than cut. The
              // slorp uniforms are written EVERY pass — a gas-only frame must
              // not inherit a stale trip from ten minutes ago.
              slorpMat.uniforms.uColour.value = tripOn ? tripView!.colour * slorpFade : 0;
              slorpMat.uniforms.uBend.value = tripOn ? tripView!.bend * slorpFade : 0;
              slorpMat.uniforms.uFear.value = tripOn ? tripView!.fear * slorpFade : 0;
              slorpMat.uniforms.uFlash.value = slorpFlash;
              // THE TRIP DOESN'T RESPECT YOUR OTHER PURCHASES (Josh, Aug
              // 2026): while the room bends, slorp amplifies the OTHER
              // drugs' visuals up to 1.5× (slorpAmp). Clamped — hit-3 neon
              // is the shader's designed ceiling, and the fisheye past ~1.2
              // stops reading as a lens. The doom shake is deliberately NOT
              // amplified: it's a countdown, not a mood.
              const dAmp = tripOn ? slorpAmp(tripView) : 1;
              slorpMat.uniforms.uGas.value = Math.min(1, gasGlowHeld * gasFade * dAmp);
              slorpMat.uniforms.uGasShake.value = gasShakeNow;
              slorpMat.uniforms.uEgo.value = Math.min(1.2, egoLensNow * dAmp);
              slorpMat.uniforms.uEncode.value = 1;
              renderer!.render(slorpScene, drunkCam);
            }
          } else if (glowOn) {
            bloom.render(renderer!, scene, camera, null, true);
          } else {
            renderer!.render(scene, camera);
          }
          } catch (e) {
            // Post pass down: say so once a second, then draw the room plainly.
            if (nowMs - lastPostErrAt > 1000) {
              lastPostErrAt = nowMs;
              console.error("[casino] post pass failed, rendering direct", e);
            }
            renderer!.setRenderTarget(null);
            renderer!.render(scene, camera);
          }
          // …and the racetrack in its own layer (it is DOM behind the canvas,
          // seen through the hole the hall punches in the frame — it cannot be
          // part of the WebGL draw). It IS handed exactly what the two passes
          // just did, though: a fixture has to swim with its own wall, or the
          // screen reads as something stuck to the player's eyes (Josh, Aug
          // 2026). These are the SAME numbers written into the uniforms above
          // — read them from one place and they can't drift apart.
          jumbo?.render(camera, player.x, player.y, {
            drunk: drunkOn ? dk : 0,
            bend: postOn && tripOn ? tripView!.bend * slorpFade : 0,
            fear: postOn && tripOn ? tripView!.fear * slorpFade : 0,
            gas: postOn ? gasShakeNow : 0,
            ego: postOn ? Math.min(1.2, egoLensNow * (tripOn ? slorpAmp(tripView) : 1)) : 0,
            t: nowMs / 1000,
          });
        };
        raf = requestAnimationFrame(frame);
      })
      .catch((e) => {
        console.error("[casino] asset load failed", e);
        failed = true;
        loading = false;
      });
  });

  onDestroy(() => {
    disposed = true;
    if (pendingPull) { settleSlotsWallet(pendingPull); pendingPull = null; }
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    voice?.leave();
    voice = null;
    net?.close();
    net = null;
    // The music is the room's, not the app's — walking out stops it.
    stopMusic();
    resetJukebox();
    cancelAnimationFrame(raf);
    for (const fn of cleanupFns) fn();
    resetWheelFace();
    // dispose() alone frees three.js caches but NOT the GL context — that
    // waits for the canvas to be GC'd, so hopping casino → escape → casino
    // stacked whole halls of VRAM until the browser force-lost the oldest
    // context (a driver hitch). Lose it on the way out, deliberately.
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
    renderer = null;
  });

  // set from onMount so the ENTER button can connect with the closure handlers
  let pendingConnect: (() => FloorNet) | null = null;
  /** Give up the blackjack seat and stand the body up — set inside onMount,
   *  where the seat state lives. "Back to the floor" is now the ONLY way out
   *  of a table (Josh), so it has to do the leaving properly. */
  let standUpHook: (() => void) | null = null;

  /** My engine seat at the floor's Hold'em table (tables[0]), or -1. */
  function holdemMyIdx(): number {
    const ht = holdem.lobby?.tables[0];
    const uid = session.user?.id ?? -1;
    return ht ? ht.seats.findIndex((st) => st && st.user.id === uid) : -1;
  }
  /** Engine seat → the floor chair it sits (layout SEATS: 30-35 = chairs
   *  0-5, 48 = chair 6), and back. */
  function holdemChairOf(k: number): number | null {
    return k >= 0 && k < 6 ? 30 + k : k === 6 ? 48 : null;
  }
  function holdemSeatOfChair(chair: number | null): number | null {
    return chair === null ? null : chair >= 30 && chair <= 35 ? chair - 30 : chair === 48 ? 6 : null;
  }
  /** An "are you sure" is open for leaving a hand: a second ✕ / Escape while
   *  it's up must not open another (or close the dock behind it). */
  let leavingAsk = false;
  /** Tip the vial back — set inside onMount (the trip is the render loop's
   *  business), called from Sterling's panel up here. */
  let startSlorpHook: (() => void) | null = null;

  function enterFloor(): void {
    deniedMsg = "";
    reconnectTries = 0;
    if (!net) net = pendingConnect?.() ?? null;
    resume();
  }

  function resume(): void {
    if (lockFallback) {
      locked = true;
      wasLocked = true;
      renderer!.domElement.style.cursor = "none";
      return;
    }
    renderer?.domElement.click();
  }

  /** ✕ / Escape on a game overlay: back to the floor, mouse re-locked (the
   *  click or keypress that got us here is the user gesture the lock needs). */
  async function closeStation(): Promise<void> {
    if (leavingAsk) return;
    // Hold'em: closing the dock stands you up, like blackjack — but a LIVE
    // hand folds when you stand, so that one asks first (the house dialog,
    // never a browser confirm). "No" keeps the dock open and the hand alive.
    if (station?.game === "holdem") {
      const ht = holdem.lobby?.tables[0] ?? null;
      const idx = holdemMyIdx();
      if (ht && idx >= 0 && holdemLive(ht, ht.seats[idx])) {
        leavingAsk = true;
        let ok = false;
        try {
          ok = await ask({
            title: "Leave the table?",
            body: "You're in a hand. Standing up folds it — the chips you've put in the pot stay there.",
            confirm: "fold and stand up",
            danger: true,
          });
        } finally {
          leavingAsk = false;
        }
        if (!ok || station?.game !== "holdem") return;
      }
    }
    // Leaving the view leaves the table: this is the only exit from blackjack
    // now that movement keeps your seat, so it must hand the seat back (the
    // engine's own rules keep that money-safe — an unplayed bet refunds, a
    // live hand stands and settles).
    standUpHook?.();
    station = null;
    chessFrom = null;
    playSfx("chip-few", 0.3); // picking your chips back up
    resume();
  }
</script>

<div class="casino" bind:this={holder}>
  <!-- A death on the floor plays the same red→black cinematic as everywhere:
       Terminated is driven by the wheel store, so the in-world spin needs only
       to mount it. -->
  {#if wheel.dead}<Terminated />{/if}
  <!-- SHOT DEAD — rendered OUTSIDE the station/menu/HUD branching, because a
       death can arrive in ANY of those states: shot at a table, the station
       closes and leaves you unlocked, and the first cut's overlay lived in
       the locked-only HUD branch — so the whole death played out behind the
       pause menu (caught by the two-player sweep). It also BLOCKS the mouse:
       there is nothing to click while you are on the carpet. -->
  <!-- THE STAKE DIALOG — outside the menu/HUD branching for the same reason
       as the shot overlay below: opening it EXITS the pointer lock, and the
       unlock pops the pause menu, whose branch would otherwise swallow the
       dialog. (Caught in the E1 verification sweep — the first cut lived in
       the HUD's else-branch and never rendered once.) One rare, burned, for
       a pass only death revokes; the copy says exactly that, because
       surprise is the one thing this dialog must never deal in. -->
  {#if stakeOpen}
    <div class="stakescrim">
      <div class="stakebox">
        <h3>THE ESCAPE ROOM</h3>
        <p class="stakerule">
          Entry costs <b>one RARE emoji — destroyed</b>. You receive THE PASS:
          leave and return as you please, forever… unless you die in there.
          Death takes the pass with it.
        </p>
        {#if stakeErr}<p class="stakeerr">{stakeErr}</p>{/if}
        {#if stakeOpen.length}
          <div class="stakegrid">
            {#each stakeOpen as r (r.code)}
              <button
                class="stakepick"
                disabled={stakeBusy}
                onclick={() => void stakeAndEnterHook?.(r.code)}
                title={`stake ${r.name} — it will be destroyed`}
              >
                <img src={r.url} alt={r.name} />
                <span>{r.name}</span>
              </button>
            {/each}
          </div>
          <p class="stakenote">pick the one you can live without — this is permanent</p>
        {/if}
        <button class="stakecancel" onclick={() => (stakeOpen = null)}>not tonight</button>
      </div>
    </div>
  {/if}
  {#if shotBy}
    <div class="shotscrim">
      <span class="shotby">{shotBy.toUpperCase()}</span>
      <span class="shotnote">back on your feet at the entrance in {shotLeft}…</span>
    </div>
  {/if}
  {#if loading}
    <div class="scrim center"><span class="note">opening the floor…</span></div>
  {:else if failed}
    <div class="scrim center">
      <span class="note">the casino failed to load — try again.</span>
      <button class="btn" onclick={onExit}>back to the hub</button>
    </div>
  {:else if station}
    <!-- C3: the real game, docked over the floor. The 3D keeps rendering (and
         the wire keeps you standing there for everyone else); ESC or ✕ walks
         away. {#key} forces a full destroy/mount per game so onDestroy leave
         semantics hold — the Rumble rule. -->
    <div class="stationpanel">
      <button class="stclose" onclick={closeStation}>✕ back to the floor</button>
      <div class="stbody">
        {#key station.game + String(station.lobby ?? "")}
          {#if station.game === "blackjack"}
            <BlackjackStrip lobby={station.lobby ?? 0} />
          {:else if station.game === "holdem"}
            <HoldemStrip preferSeat={holdemSeatOfChair(mySeat)} />
          {:else if station.game === "roulette"}
            <RouletteStrip />
          {:else if station.game === "bonepit"}
            <PitStrip />
          {:else if station.game === "chess"}
            <ChessStrip />
          {:else if station.game === "kiosk"}
            <KioskBet />
          {:else if station.game === "sterling"}
            <SterlingShop
              onPour={takeDrink}
              handsFull={bag.every((b, i) => i === GUN_SLOT || b !== null)}
              gunOwned={gunRounds !== null}
              onArmed={setArmament}
              {tripping}
              onSlorp={() => {
                // Down it at the counter and get out of his shop — the ten
                // minutes are meant to be spent in the room, not in a menu.
                startSlorpHook?.();
                closeStation();
              }}
              hasCanister={bag.includes("stardust")}
              onStardust={takeStardust}
              onEgoShot={() => takeDrink("ego")}
              people={floorPeople}
            />
          {:else if station.game === "jukebox"}
            <JukeboxPanel />
          {:else if station.game === "locker"}
            <LockerPanel onInvChange={onLockerInv} />
          {:else if station.game === "lender"}
            <LenderStrip />
          {/if}
        {/key}
      </div>
    </div>
  {:else if !locked}
    <div class="scrim center menu">
      <p class="title">THE FLOOR</p>
      {#if deniedMsg}<p class="note warn">{deniedMsg}</p>{/if}
      {#if !connected}
        <div class="suits">
          <span class="suitlbl">your suit</span>
          <div class="suitrow">
            {#each ["yellow", ...ownedSuits] as c (c)}
              <button
                class="suitchip"
                class:on={suit === c}
                title={suitColorLabel(c)}
                onclick={() => (suit = c)}
              >
                <img class="pic" src={suitPic(c)} alt="" style={suitPicStyle(c)} />
                <span class="dot" style="background:{SUIT_SWATCH[c] ?? '#e8c33c'}"></span>
                {suitColorLabel(c)}
              </button>
            {/each}
          </div>
        </div>
        <p class="note">WASD move · SHIFT run · SPACE jump · C crouch · E sit · ESC menu</p>
        <button class="btn gold" onclick={enterFloor}>enter</button>
      {:else}
        <button class="btn gold" onclick={resume}>resume</button>
      {/if}
      <button
        class="btn glowsw"
        class:on={glowOn}
        onclick={() => {
          glowOn = !glowOn;
          saveGlowPref(glowOn);
        }}
      >glow: {glowOn ? "on" : "off"} <span class="tag">preview</span></button>
      <button class="btn" onclick={onExit}>leave the casino</button>
    </div>
  {:else}
    {#if prompt}
      <div class="hint">{prompt}</div>
    {/if}
    {#if voiceOn}
      <div class="micpill" class:muted={micMuted || micBroken}>{micBroken ? "🎧 listening · no mic" : micMuted ? "🔇 muted" : "🎙 open mic"} · N</div>
    {/if}
    <!-- THE BAR: three pockets and how far gone you are. Both only appear
         once there's something to say — a sober empty-handed player sees a
         clean screen. -->
    {#if bag.some((b) => b !== null)}
      <div class="pockets">
        {#each bag as b, i}
          <div class="pocket" class:on={i === bagSel} class:full={!!b} class:gunp={i === GUN_SLOT && !!b}>
            <span class="pnum">{i + 1}</span>
            {#if b}<span class="pname">{i === GUN_SLOT ? "Casino Gun" : b === "stardust" ? `Star Dust ×${canister}` : b === "ego" ? "EGO (a shot)" : b === "slorp" ? "Slorp (a vial)" : drinkById(b)?.name ?? b}</span>{/if}
          </div>
        {/each}
      </div>
    {/if}
    <!-- THE GUN: ammo readout + a crosshair, only while it's actually drawn.
         Rounds are the server's numbers (the welcome frame + ammo frames). -->
    {#if bagSel === GUN_SLOT && bag[GUN_SLOT] && !shotBy && !station}
      <div class="ammochip" class:dry={(gunRounds ?? 0) <= 0}>
        {"▮".repeat(Math.max(0, gunRounds ?? 0))}{"▯".repeat(Math.max(0, 9 - (gunRounds ?? 0)))}
        <span class="clips">{gunRounds ?? 0}/9 · {gunClips} clip{gunClips === 1 ? "" : "s"}</span>
      </div>
      <div class="crosshair"></div>
    {/if}
    {#if drunkUi > 0.5}
      <div class="drunkbar" class:out={outCold}>
        <span class="dlabel">{outCold ? "OUT COLD" : drunkUi > 75 ? "hammered" : drunkUi > 45 ? "drunk" : "merry"}</span>
        <span class="dtrack"><span class="dfill" style="width:{Math.min(100, (drunkUi / DRUNK_MAX) * 100)}%"></span></span>
      </div>
    {/if}
    <!-- STAR DUST's meter — the drunkbar's twin, one row up so both can show.
         Maxed = pinned full, red, flashing: the death sequence is running. -->
    {#if gasMaxed || gasLevel > 0.004}
      <div class="gasbar" class:maxed={gasMaxed}>
        <span class="glabel">{gasMaxed ? "GASSED OUT" : "gassed"}</span>
        <span class="gtrack"><span class="gfill" style="width:{Math.min(100, gasLevel * 100)}%"></span></span>
      </div>
    {/if}
    <!-- EGO's meter — third row up. Maxed = the creak is running. -->
    {#if egoMaxed || egoLevel > 0.004}
      <div class="egobar" class:maxed={egoMaxed}>
        <span class="elabel">{egoMaxed ? "CRITICAL MASS" : "ego"}</span>
        <span class="etrack"><span class="efill" style="width:{Math.min(100, egoLevel * 100)}%"></span></span>
      </div>
    {/if}
    {#if outCold}
      <div class="blackout"><span>you're on the floor. The room goes on without you…</span></div>
    {/if}
    {#if wallet.loaded}
      <div class="walletchip">🪙 {wallet.coins.toLocaleString()} · 🎡 {wheel.spins.total}</div>
    {/if}
    {#if toast}
      <div class="castoast {toast.kind}">{toast.text}</div>
    {/if}
    {#if lockHint}
      <!-- The browser refused the pointer (usually: asked again too soon after
           the last release). Staying unlocked is deliberate — one more click
           beats a camera that throws itself around. -->
      <div class="castoast">click to take the mouse back</div>
    {/if}
    {#if wheelOpen}
      <div class="ewheel">
        {#each EMOTES as e, i (e.id)}
          <span
            class="eitem"
            class:on={wheelPick === i}
            style="transform: translate({Math.cos(wheelAngle(i)) * WHEEL_R}px, {Math.sin(wheelAngle(i)) * WHEEL_R}px)"
          >{e.label}</span>
        {/each}
        <span class="ecursor" style="transform: translate({wheelX}px, {wheelY}px)"></span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .casino {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: #0e0a08;
  }
  .casino :global(canvas) {
    display: block;
  }
  .scrim {
    position: absolute;
    inset: 0;
    background: rgba(8, 5, 3, 0.72);
  }
  /* ---- C3, option 1+: the CHROMELESS bottom strip (Josh: "no more pop out
     windows... it should all happen within the casino"). No panel, no border,
     no header bar — the game view rises out of a soft gradient at the foot of
     the screen while the table shot fills everything above. The ✕ floats. */
  .stationpanel {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    background: linear-gradient(to top, rgba(8, 6, 4, 0.72), rgba(8, 6, 4, 0.28) 70%, transparent);
    padding: 26px 0 10px;
    pointer-events: none;
  }
  /* The dock itself is click-through so the room stays visible; each panel's
     own root re-enables the mouse. A panel missing from this list RENDERS but
     is dead to the pointer — which is how the jukebox's buttons were unusable
     in the first review pass. */
  .stationpanel :global(.strip),
  .stationpanel :global(.numpad),
  .stationpanel :global(.lstrip),
  .stationpanel :global(.kiosk),
  .stationpanel :global(.stakes),
  .stationpanel :global(.juke),
  .stationpanel .stclose {
    pointer-events: auto;
  }
  .stclose {
    position: absolute;
    top: -44px;
    right: 14px;
    background: rgba(10, 7, 4, 0.72);
    border: 1px solid #5a4a33;
    color: #cbbd9e;
    border-radius: 999px;
    padding: 7px 14px;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .stclose:hover {
    border-color: #e8c33c;
    color: #e8c33c;
  }
  .stbody {
    flex: 1;
    overflow: auto;
    overscroll-behavior: contain;
    max-width: 1080px;
    width: 100%;
    margin: 0 auto;
  }
  @media (max-width: 900px) {
    .stationpanel {
      padding-bottom: 14px;
    }
  }
  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  .title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 900;
    letter-spacing: 0.4em;
    color: #e8c33c;
    text-shadow: 0 0 24px rgba(232, 195, 60, 0.35);
  }
  .note {
    color: #b9a86e;
    font-size: 0.9rem;
  }
  .note.warn {
    color: #d97a5a;
  }
  .suits {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
  }
  .suitlbl {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.3em;
    color: #8d8360;
  }
  .suitrow {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    max-width: 480px;
  }
  .suitchip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    background: rgba(232, 195, 60, 0.06);
    border: 1px solid rgba(232, 195, 60, 0.3);
    border-radius: 999px;
    color: #d8cfae;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .suitchip.on {
    border-color: #e8c33c;
    background: rgba(232, 195, 60, 0.18);
  }
  .suitchip .dot {
    width: 11px;
    height: 11px;
    border-radius: 50%;
  }
  .suitchip .pic {
    width: 22px;
    height: 30px;
    object-fit: contain;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.25);
  }
  .btn {
    min-width: 220px;
    padding: 10px 22px;
    background: rgba(232, 195, 60, 0.08);
    border: 1px solid rgba(232, 195, 60, 0.4);
    border-radius: 6px;
    color: #d8cfae;
    font-weight: 800;
    letter-spacing: 0.14em;
    cursor: pointer;
  }
  .btn:hover {
    background: rgba(232, 195, 60, 0.18);
  }
  .btn.gold {
    background: #e8c33c;
    color: #241a04;
  }
  .btn.gold:hover {
    background: #f3d461;
  }
  /* the three pockets, bottom-left above the meter */
  /* THE POCKETS SIT IN THE MIDDLE (Josh, Aug 2026: "the intoxication status
     bars at the bottom left cover up the inventory just move the inventory to
     the middle"). Three stacked meters climb the bottom-left corner — drink,
     gas, ego — and the bag used to sit right in their lane. Centred at the
     foot of the screen it has the whole width to itself, and the corner
     belongs to the meters alone. */
  .pockets {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    bottom: 16px;
    display: flex;
    align-items: center;
    gap: 7px;
    /* The meters' corner is ~250px wide (label + a 178px track). Reserving
       280px on each side of centre keeps the bag clear of them at every
       viewport this game is playable at, rather than only at desktop width:
       at 900px the row still spans 280→620, thirty clear of the meters. */
    max-width: min(calc(100vw - 560px), 760px);
    flex-wrap: wrap;
    justify-content: center;
    pointer-events: none;
  }
  .pocket {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 34px;
    height: 34px;
    padding: 0 9px;
    border-radius: 9px;
    background: rgba(10, 7, 4, 0.72);
    border: 1px solid #4a3f2c;
    color: #9a8f7a;
    font: 700 12px system-ui, sans-serif;
  }
  .pocket.full { color: #e6dfd0; }
  .pocket.on {
    border-color: #e8c33c;
    box-shadow: 0 0 12px #e8c33c44;
  }
  .pocket .pnum { color: #8a7a58; font-weight: 900; }
  .pocket.gunp { border-color: #8a3030; }
  .ammochip {
    position: absolute;
    right: 18px;
    bottom: 64px;
    padding: 7px 12px;
    background: #120d08cc;
    border: 1px solid #4a3f2c;
    border-radius: 10px;
    color: #e8c33c;
    font: 800 13px ui-monospace, monospace;
    letter-spacing: 0.08em;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ammochip.dry { color: #cf5a5a; }
  .ammochip .clips { color: #9a8a68; font: 700 11px system-ui, sans-serif; letter-spacing: 0; }
  .crosshair {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 5px;
    height: 5px;
    margin: -2.5px 0 0 -2.5px;
    border-radius: 50%;
    background: #f2e2b8dd;
    box-shadow: 0 0 4px #000;
    pointer-events: none;
  }
  .shotscrim {
    position: absolute;
    inset: 0;
    z-index: 30; /* over the pause menu and every dock — death outranks UI */
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: radial-gradient(ellipse at center, #40000055 0%, #400000cc 100%);
    pointer-events: auto; /* nothing to click while you're on the carpet */
  }
  .shotby {
    color: #ff6a5a;
    font: 900 34px/1 system-ui, sans-serif;
    letter-spacing: 0.12em;
    text-shadow: 0 2px 14px #000;
  }
  .shotnote { color: #e6cfc2; font: 600 14px system-ui, sans-serif; }
  /* the drunk meter */
  .drunkbar {
    position: absolute;
    left: 18px;
    bottom: 34px;
    display: flex;
    align-items: center;
    gap: 9px;
    pointer-events: none;
  }
  .drunkbar .dlabel {
    color: #d8a24a;
    font: 800 11px system-ui, sans-serif;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-shadow: 0 1px 3px #000;
  }
  .drunkbar.out .dlabel { color: #c9556a; }
  .dtrack {
    width: 178px;
    height: 9px;
    border-radius: 999px;
    background: rgba(10, 7, 4, 0.78);
    border: 1px solid #4a3f2c;
    overflow: hidden;
  }
  .dfill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #7cae5f, #e8c33c 55%, #c9556a);
    transition: width 0.25s linear;
  }
  /* STAR DUST's meter — sits a row above the drunk bar (both can be earned
     in one evening). Maxed: red and FLASHING, per the brief. */
  .gasbar {
    position: absolute;
    left: 18px;
    bottom: 58px;
    display: flex;
    align-items: center;
    gap: 9px;
    pointer-events: none;
  }
  .gasbar .glabel {
    color: #6fe08a;
    font: 800 11px system-ui, sans-serif;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-shadow: 0 1px 3px #000;
  }
  .gasbar.maxed .glabel { color: #ff5a4a; }
  .gtrack {
    width: 178px;
    height: 9px;
    border-radius: 999px;
    background: rgba(10, 7, 4, 0.78);
    border: 1px solid #2c4a33;
    overflow: hidden;
  }
  .gfill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #46e07a, #b8ff6a 60%, #eaff9a);
    transition: width 0.25s linear;
  }
  .gasbar.maxed .gtrack { border-color: #a33; }
  .gasbar.maxed .gfill {
    background: #e03434;
    animation: gasflash 0.4s steps(2, jump-none) infinite;
  }
  @keyframes gasflash {
    0% { opacity: 1; }
    100% { opacity: 0.35; }
  }
  /* EGO's meter — third row up (the drugs stack, so do their bars). */
  .egobar {
    position: absolute;
    left: 18px;
    bottom: 82px;
    display: flex;
    align-items: center;
    gap: 9px;
    pointer-events: none;
  }
  .egobar .elabel {
    color: #e8c33c;
    font: 800 11px system-ui, sans-serif;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-shadow: 0 1px 3px #000;
  }
  .egobar.maxed .elabel { color: #ff5a4a; }
  .etrack {
    width: 178px;
    height: 9px;
    border-radius: 999px;
    background: rgba(10, 7, 4, 0.78);
    border: 1px solid #4a3f2c;
    overflow: hidden;
  }
  .efill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #b08ae8, #e8c33c 60%, #f3ead6);
    transition: width 0.25s linear;
  }
  .egobar.maxed .etrack { border-color: #a33; }
  .egobar.maxed .efill {
    background: #e03434;
    animation: gasflash 0.4s steps(2, jump-none) infinite;
  }
  .blackout {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.82);
    color: #8a8074;
    font: 600 15px system-ui, sans-serif;
    pointer-events: none;
  }
  /* The affordance line rides ABOVE the bag (which now owns the bottom
     centre) so the two never overlap when you walk up to a machine holding a
     drink. */
  .hint {
    position: absolute;
    left: 50%;
    bottom: 60px;
    transform: translateX(-50%);
    padding: 5px 12px;
    background: rgba(10, 7, 4, 0.6);
    border-radius: 4px;
    color: rgba(216, 207, 174, 0.75);
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    pointer-events: none;
  }
  .micpill {
    position: absolute;
    right: 14px;
    bottom: 14px;
    padding: 5px 12px;
    background: rgba(10, 7, 4, 0.6);
    border: 1px solid rgba(120, 200, 130, 0.4);
    border-radius: 999px;
    color: #9fd8a8;
    font-size: 0.74rem;
    letter-spacing: 0.06em;
    pointer-events: none;
  }
  /* THE STAKE DIALOG — the escape room's door asking its price. */
  .glowsw .tag {
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.6;
    margin-left: 6px;
  }
  .glowsw.on {
    border-color: #e8c33c;
    color: #ffe9a8;
    box-shadow: 0 0 14px rgba(232, 195, 60, 0.45);
  }
  .stakescrim {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(4, 3, 2, 0.72);
    z-index: 28; /* over the pause menu — the unlock that opens this dialog pops it */
  }
  .stakebox {
    width: min(92vw, 560px);
    max-height: 82vh;
    overflow-y: auto;
    background: linear-gradient(180deg, #17110a, #0d0a06);
    border: 1px solid #6a5535;
    border-radius: 14px;
    padding: 22px 24px;
    color: #e6dfd0;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.7);
  }
  .stakebox h3 {
    margin: 0 0 8px;
    font-size: 1.15rem;
    letter-spacing: 0.14em;
    color: #f0c869;
  }
  .stakerule { margin: 0 0 12px; font-size: 0.92rem; line-height: 1.45; color: #cfc4ae; }
  .stakerule b { color: #ff9a6a; }
  .stakeerr { margin: 0 0 10px; color: #ff8a7a; font-size: 0.9rem; font-weight: 700; }
  .stakegrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }
  .stakepick {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 9px 4px 7px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid #453723;
    border-radius: 10px;
    color: #d8cdb8;
    font-size: 0.68rem;
    cursor: pointer;
  }
  .stakepick:hover { border-color: #c9a24a; background: rgba(201, 162, 74, 0.12); }
  .stakepick img { width: 40px; height: 40px; object-fit: contain; }
  .stakepick span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stakenote { margin: 2px 0 12px; font-size: 0.78rem; color: #97917f; font-style: italic; }
  .stakecancel {
    width: 100%;
    padding: 10px;
    background: none;
    border: 1px solid #5a4a33;
    border-radius: 9px;
    color: #b9ae97;
    cursor: pointer;
    font-weight: 700;
    letter-spacing: 0.05em;
  }
  .stakecancel:hover { color: #e6dfd0; border-color: #8a7350; }

  .castoast {
    position: absolute;
    left: 50%;
    top: 16%;
    transform: translateX(-50%);
    padding: 10px 22px;
    background: rgba(12, 9, 6, 0.88);
    border: 1px solid #5a4a33;
    border-radius: 999px;
    color: #e6dfd0;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    pointer-events: none;
    animation: toast-in 0.22s ease;
    max-width: min(70vw, 640px);
    text-align: center;
  }
  .castoast.win {
    border-color: #e8c33c;
    color: #ffe08a;
    box-shadow: 0 0 26px rgba(232, 195, 60, 0.25);
  }
  .castoast.bad {
    border-color: #a5462f;
    color: #d97a5a;
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-8px);
    }
  }
  .walletchip {
    position: absolute;
    right: 14px;
    top: 14px;
    padding: 5px 12px;
    background: rgba(10, 7, 4, 0.6);
    border: 1px solid rgba(232, 195, 60, 0.35);
    border-radius: 999px;
    color: #e8c33c;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    pointer-events: none;
  }
  .micpill.muted {
    border-color: rgba(217, 122, 90, 0.4);
    color: #d97a5a;
  }
  .ewheel {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0;
    height: 0;
    pointer-events: none;
  }
  .eitem {
    position: absolute;
    left: 0;
    top: 0;
    margin: -16px 0 0 -48px;
    width: 96px;
    text-align: center;
    padding: 7px 0;
    background: rgba(12, 8, 5, 0.82);
    border: 1px solid rgba(232, 195, 60, 0.35);
    border-radius: 999px;
    color: #d8cfae;
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.06em;
  }
  .eitem.on {
    background: #e8c33c;
    border-color: #f3d461;
    color: #241a04;
  }
  .ecursor {
    position: absolute;
    left: -5px;
    top: -5px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #f3d461;
    box-shadow: 0 0 10px rgba(232, 195, 60, 0.8);
  }
</style>
