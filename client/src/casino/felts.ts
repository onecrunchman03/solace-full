// THE FELTS — live game state painted ON the tables (Josh: "no more pop out
// windows for games… the game should be played top down"). Each hosted table
// carries a canvas plane floating 4mm over its felt; the game's public DTO is
// drawn there, so the top-down table shot IS the game — and a passer-by sees
// the same live table a player does. Secrets never land here: hole cards and
// dice cups stay in the action strip, which only their owner sees.

import * as THREE from "three";
import { BJ_TABLES, HOLDEM, ROULETTE, BONE_PIT, bjStoolLong } from "./layout";
import { CELL } from "./world";
import type { BjLobby, HoldemTable, RouletteState, PitGame, PlayingCard, BjCard } from "../lib/api";

/** The roulette cloth's canvas. 1024x414 is the betting felt's own aspect
 *  (2.45m x 0.99m, measured off the model), which is what keeps its pixels
 *  square and its numerals unstretched. */
const RW = 1024;
const RH = 414;

const SUIT = ["♠", "♥", "♦", "♣"];
const SUIT_RED = new Set([1, 2]);
const RANK = ["", "", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

interface Overlay {
  cv: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
}

function overlay(
  scene: THREE.Scene,
  px: number,
  py: number,
  wCells: {
    x: number; y: number; h: number; w: number; d: number; rot: number;
    /** Take the room's light like the cloth it is printed on, instead of
     *  glowing at full brightness. A self-lit panel over a dim felt is most
     *  of what makes an overlay read as a screenshot taped to the table. */
    lit?: boolean;
  },
): Overlay {
  const cv = document.createElement("canvas");
  cv.width = px;
  cv.height = py;
  const c = cv.getContext("2d")!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(wCells.w, wCells.d),
    wCells.lit
      // No emissive: the cloth has to shade EXACTLY like the felt it covers,
      // or its edge shows up as a rectangle of brighter green.
      ? new THREE.MeshLambertMaterial({ map: tex, transparent: true })
      : new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  // lie flat: plane's +Y (canvas top) points along -Z after this, then yaw
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = wCells.rot; // rotation order XYZ: this spins the flat plane
  m.position.set(wCells.x * CELL, wCells.h, wCells.y * CELL);
  scene.add(m);
  return { cv, c, tex };
}

/** A playing card tile (server rank 2..14 / suit 0..3). */
function card(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pc: PlayingCard | null): void {
  c.fillStyle = pc ? "#f4efe2" : "#5a2730";
  r(c, x, y, w, h, 4);
  c.fill();
  c.strokeStyle = "#00000055";
  c.lineWidth = 1.5;
  r(c, x, y, w, h, 4);
  c.stroke();
  if (!pc) {
    c.strokeStyle = "#7c3b46";
    c.lineWidth = 2;
    c.strokeRect(x + 4, y + 4, w - 8, h - 8);
    return;
  }
  c.fillStyle = SUIT_RED.has(pc.s) ? "#c22d3b" : "#20242c";
  c.textAlign = "center";
  c.font = `800 ${Math.round(h * 0.34)}px system-ui, sans-serif`;
  c.fillText(RANK[pc.r], x + w / 2, y + h * 0.42);
  c.font = `${Math.round(h * 0.36)}px system-ui, sans-serif`;
  c.fillText(SUIT[pc.s], x + w / 2, y + h * 0.82);
}

/** Blackjack cards come over the wire as {r: "A", s: "♠"} strings. */
function bjCard(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bc: BjCard): void {
  c.fillStyle = "#f4efe2";
  r(c, x, y, w, h, 4);
  c.fill();
  c.strokeStyle = "#00000055";
  c.lineWidth = 1.5;
  r(c, x, y, w, h, 4);
  c.stroke();
  c.fillStyle = bc.s === "♥" || bc.s === "♦" ? "#c22d3b" : "#20242c";
  c.textAlign = "center";
  c.font = `800 ${Math.round(h * 0.34)}px system-ui, sans-serif`;
  c.fillText(bc.r, x + w / 2, y + h * 0.42);
  c.font = `${Math.round(h * 0.36)}px system-ui, sans-serif`;
  c.fillText(bc.s, x + w / 2, y + h * 0.82);
}

function r(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number): void {
  c.beginPath();
  c.moveTo(x + rad, y);
  c.arcTo(x + w, y, x + w, y + h, rad);
  c.arcTo(x + w, y + h, x, y + h, rad);
  c.arcTo(x, y + h, x, y, rad);
  c.arcTo(x, y, x + w, y, rad);
  c.closePath();
}

/** `k` scales the stack for canvases with a different px-per-metre — the
 *  roulette cloth is drawn at its true size now, where a to-scale chip is 26px
 *  and its amount unreadable from the table camera. */
function chipStack(c: CanvasRenderingContext2D, x: number, y: number, amount: number, k = 1): void {
  if (amount <= 0) return;
  const n = Math.min(5, 1 + Math.floor(Math.log10(amount)));
  for (let i = 0; i < n; i++) {
    c.fillStyle = ["#c94f4f", "#4f7fc9", "#4fc978", "#c9a44f", "#9a4fc9"][i % 5];
    c.beginPath();
    c.ellipse(x, y - i * 4 * k, 13 * k, 8 * k, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#00000066";
    c.lineWidth = 1;
    c.stroke();
  }
  c.fillStyle = "#fff";
  c.textAlign = "center";
  c.font = `800 ${Math.round(15 * k)}px system-ui, sans-serif`;
  c.strokeStyle = "#000000aa";
  c.lineWidth = 3;
  c.strokeText(String(amount), x, y - (n * 4 + 8) * k);
  c.fillText(String(amount), x, y - (n * 4 + 8) * k);
}

function nameTag(c: CanvasRenderingContext2D, x: number, y: number, name: string, hot: boolean, dim: boolean): void {
  c.font = "700 17px system-ui, sans-serif";
  const w = Math.max(64, c.measureText(name).width + 18);
  c.fillStyle = dim ? "#00000066" : hot ? "#8a6a2cdd" : "#000000aa";
  r(c, x - w / 2, y - 13, w, 26, 13);
  c.fill();
  if (hot) {
    c.strokeStyle = "#e8c33c";
    c.lineWidth = 2;
    r(c, x - w / 2, y - 13, w, 26, 13);
    c.stroke();
  }
  c.fillStyle = dim ? "#9a938a" : "#f3ead6";
  c.textAlign = "center";
  c.fillText(name, x, y + 6);
}

export interface FeltOverlays {
  /** `myId` marks YOUR seat: it draws larger, ringed, and with its own result
   *  badge — from a 3m table camera every hand looks the same otherwise. */
  bj(lobbyIndex: number, lobby: BjLobby | null, myId: number): void;
  /** `myId` rings YOUR chair and names it YOU, like blackjack's. */
  holdem(table: HoldemTable | null, myId: number): void;
  /** `revealed` gates the dolly: the winning pocket rides the broadcast at
   *  roll time, but nothing may show it until the ball has visibly landed. */
  roulette(state: RouletteState | null, revealed: boolean): void;
  pit(game: PitGame | null, myId: number): void;
}

export function buildFelts(scene: THREE.Scene): FeltOverlays {
  // ---- blackjack: one overlay per physical felt, turned with its table ------
  // canvas top must face the DEALER side (away from the stool arc): the flat
  // plane's canvas-top points -Z before the spin, so spin it onto -arc.
  // One canvas per felt, SIZED TO THE FELT and rotated with its table:
  // canvas-top = the dealer side (-arc), canvas-x = the table's long axis.
  // The felt measures 1.54 x 3.37m (pack 1.28x2.81 at BJ_SCALE 1.2) — the
  // old 2.2x2.2m square painted its outer seat boxes onto the CARPET.
  // (Measured rot mapping: 0=top-north · pi/2=top-west · -pi/2=top-east, so
  // top toward (tx,ty) is atan2(-tx,-ty); with (tx,ty) = -arc that is
  // atan2(arc[0], arc[1]).)
  const BJ_W = 3.15; // metres along the long axis  -> canvas x
  const BJ_D = 1.42; // metres across the arc axis  -> canvas y
  const BJ_CW = 1024;
  const BJ_CH = 462;
  const bjOv = BJ_TABLES.map((t) =>
    overlay(scene, BJ_CW, BJ_CH, {
      // felt top: the 1.16m table at BJ_SCALE 1.2 = 1.392 (the first cut used
      // 1.185 and the table swallowed the plane whole)
      x: t.x, y: t.y, h: 1.4, w: BJ_W, d: BJ_D, rot: Math.atan2(t.arc[0], t.arc[1]),
    }));
  const BJ_PXM = BJ_CW / BJ_W; // canvas px per metre (uniform: 462/1.42 matches)

  // poker7 bakes 0.93 tall × its 1.1 scale = 1.023 to the rail top
  const holdOv = overlay(scene, 1024, 560, { x: HOLDEM.x, y: HOLDEM.y, h: 1.04, w: 2.5, d: 1.37, rot: 0 });
  // roulette: OUR OWN full betting board over the model's print — chips land
  // on exact tiles by construction (Josh: "for each bet place the chip on
  // top of the tile so everyone can see what others are betting"), the
  // single-zero layout matches the engine (the pack art shows an American
  // 00), and status/history ride the wheel end. rot pi/2: canvas-up = west =
  // screen-up in the horizontal table shot; canvas x+ runs north.
  // the pack table is LOW: the felt tops at raw 1.14 x the 0.62 scale = 0.71m
  // sized to blanket the model's ENTIRE printed board (an American 00
  // layout) from the table's north edge to the bowl surround
  // Sized INTO the table (1.95 cells long): the betting cloth between the
  // north rail and the bowl surround is ~1.7m x 1.3m, and the overlay stays
  // inside it — the first cuts were LONGER THAN THE TABLE and read as a
  // pasted 2D screenshot (Josh's exact complaint). Status/history live in
  // the strip now; the felt carries only the layout and the chips.
  // the model print runs y ~6.75..7.9 — the cloth blankets it fully, flush
  // …and it is PRINTED, not pasted (Josh, Aug 2026: "i do not like the 2d
  // emoji game interafce pasted one"). Three things made it read as a
  // screenshot taped to the table, all now measured off the model rather than
  // guessed:
  //   · it FLOATED — the felt tops at y 0.683, not the 0.722 the first cut
  //     estimated from the pack's raw height, so it stood 4cm proud
  //   · it was SELF-LIT — a MeshBasic panel glows at full brightness over a
  //     felt the room is only half lighting (hence `lit`)
  //   · it was the WRONG GREEN — the cloth's own albedo is #01684a (sampled
  //     from the atlas through the table's UVs), so CLOTH below fills with
  //     exactly that and the join disappears
  // It still has to be opaque: the pack prints an AMERICAN double-zero layout
  // on this felt, and two layouts showing at once is worse than either.
  // Footprint covers that print (measured: x 15.47-16.27, z 13.53-15.87) with
  // room to spare, at the same aspect as before so the drawing is unchanged.
  // Footprint measured by walking a ray grid over the tabletop: the betting
  // felt is a 0.99m strip (x 15.36-16.35) running z 13.50-15.45, opening into
  // an L-shaped shoulder at the wheel end (z 15.5-16.0, out to x 14.85). The
  // old cloth was 1.42m across and CENTRED on the table, so half a metre of it
  // hung over the rail and out into the room — which is most of why it read as
  // a screenshot laid on the furniture rather than the table's own baize.
  // Reaches z 15.95 to bury the last of the pack's American print (…15.87).
  // 1024x414 keeps the canvas pixel SQUARE at this footprint (2.39mm either
  // way), so the numerals aren't stretched — the old 1024x768 over a 1.8:1
  // plane was drawing everything a third too wide.
  const rouOv = overlay(scene, RW, RH, {
    // measured on the classic table at (7.8, 7.6): the cloth sits 0.128
    // east and 0.237 north of the table's centre — wherever the table stands
    x: ROULETTE.x + 0.128, y: ROULETTE.y - 0.237, h: 0.687, w: 2.45, d: 0.99, rot: Math.PI / 2, lit: true,
  });
  const pitOv = overlay(scene, 640, 640, { x: BONE_PIT.x, y: BONE_PIT.y, h: 1.075, w: 1.35, d: 1.35, rot: 0 });

  /** The round's verdict, as a pill you can read from the table camera. The
   *  old version reused the hand-total's 17px text, so "PUSH" and "19" looked
   *  identical at a glance and nobody could tell what had happened to them. */
  const resultBadge = (
    c: CanvasRenderingContext2D, x: number, y: number, result: string, mine: boolean,
  ): void => {
    const LOOK: Record<string, { bg: string; ink: string; word: string }> = {
      win: { bg: "#2e7d4f", ink: "#eafff2", word: "WIN" },
      blackjack: { bg: "#b8912b", ink: "#fff8dc", word: "BLACKJACK" },
      push: { bg: "#4a5568", ink: "#e8eef7", word: "PUSH" },
      lose: { bg: "#8c2f2f", ink: "#ffe8e4", word: "LOSE" },
      bust: { bg: "#8c2f2f", ink: "#ffe8e4", word: "BUST" },
    };
    const L = LOOK[result];
    if (!L) return;
    const f = mine ? 14 : 12;
    c.font = `900 ${f}px system-ui, sans-serif`;
    const w = c.measureText(L.word).width + (mine ? 14 : 11);
    const h = mine ? 22 : 19;
    c.fillStyle = L.bg;
    r(c, x - w / 2, y - h / 2, w, h, h / 2);
    c.fill();
    c.strokeStyle = mine ? "#ffffffcc" : "#00000055";
    c.lineWidth = mine ? 2 : 1.5;
    r(c, x - w / 2, y - h / 2, w, h, h / 2);
    c.stroke();
    c.fillStyle = L.ink;
    c.textAlign = "center";
    c.fillText(L.word, x, y + f * 0.35);
  };

  const bj: FeltOverlays["bj"] = (i, lobby, myId) => {
    const ov = bjOv[i];
    const t = BJ_TABLES[i];
    if (!ov || !t) return;
    const c = ov.c;
    const CX = BJ_CW / 2;
    const CY = BJ_CH / 2;
    c.clearRect(0, 0, BJ_CW, BJ_CH);
    if (!lobby) {
      ov.tex.needsUpdate = true;
      return;
    }
    // THE DEALER, top centre (canvas-up faces the dealer side in the world)
    const dly = CY - 0.44 * BJ_PXM;
    const dcards = lobby.dealer;
    if (dcards.length) {
      const w = 48, h = 66, gap = 7;
      const x0 = CX - (dcards.length * (w + gap)) / 2;
      dcards.forEach((dc, k) => {
        if (dc) bjCard(c, x0 + k * (w + gap), dly - h / 2, w, h, dc);
        else {
          c.fillStyle = "#5a2730";
          r(c, x0 + k * (w + gap), dly - h / 2, w, h, 4);
          c.fill();
          c.strokeStyle = "#7c3b46";
          c.lineWidth = 2;
          c.strokeRect(x0 + k * (w + gap) + 4, dly - h / 2 + 4, w - 8, h - 8);
        }
      });
      if (lobby.dealerValue > 0) {
        c.fillStyle = "#f3ead6";
        c.textAlign = "center";
        c.font = "800 22px system-ui, sans-serif";
        c.fillText(String(lobby.dealerValue), CX, dly + h / 2 + 22);
      }
    } else {
      c.fillStyle = "#ffffffcc";
      c.textAlign = "center";
      c.font = "700 26px system-ui, sans-serif";
      c.fillText(lobby.phase === "betting" ? "place your bets" : "—", CX, dly + 8);
    }
    // shoe meter, tucked into the dealer's corner
    c.fillStyle = "#00000055";
    r(c, BJ_CW - 132, 16, 112, 15, 8);
    c.fill();
    c.fillStyle = "#e8c33c";
    r(c, BJ_CW - 130, 18, 108 * (lobby.shoeLeft / Math.max(1, lobby.shoeSize)), 11, 5);
    c.fill();
    // THE HANDS SIT ON THE FELT'S OWN PRINTED BOXES (Josh: "their cards don't
    // exactly match up with the white square underneath"). MEASURED, not
    // guessed: the seven printed boxes were unprojected from a top-down render
    // onto the felt plane and fitted, in table-local cells, to
    //     along  = 0.396 t          across = 0.038 - 0.178 t²     t ∈ [-1, 1]
    // (residual under a centimetre at every box). The print curves TOWARD the
    // players in the middle and tucks back at the ends, which the old
    // hand-tuned curve only approximated — and its spots were evenly spaced in
    // t at ±1, ±0.6, ±0.2 while the boxes sit at sevenths, so only the two
    // outer hands ever landed on a square.
    // Six seats on a seven-box print: the CENTRE box is left empty, which
    // keeps the arrangement symmetric and reads like the open spot it is.
    const BOX_T = [-1, -2 / 3, -1 / 3, 1 / 3, 2 / 3, 1];
    const PX_CELL = BJ_PXM * CELL; // canvas px per layout cell
    lobby.seats.forEach((s, k) => {
      const t = BOX_T[k] ?? 0;
      const sx = CX - 0.396 * t * PX_CELL;
      const sy = CY + (0.038 - 0.178 * t * t) * PX_CELL;
      if (!s) {
        // The felt already PRINTS the box; a faint dash inside it says the
        // spot is open without drawing a second, differently-sized square on
        // top of the model's own art.
        c.strokeStyle = "#ffffff2e";
        c.lineWidth = 2;
        c.setLineDash([5, 5]);
        r(c, sx - 18, sy - 28, 36, 56, 5); // sized to the printed box itself
        c.stroke();
        c.setLineDash([]);
        return;
      }
      const active = lobby.phase === "acting" && lobby.activeSeat === k;
      const mine = s.user.id === myId;
      // YOUR hand is the one you have to read (Josh: "the under card is hard
      // to see"). It draws bigger, fans WIDER — the old 13px step buried all
      // but a sliver of every card under the next one — and sits in a lit ring
      // so you can find yourself on a six-seat table at a glance.
      // Sized to the PRINTED BOX PITCH (0.132 cells ≈ 86px): a four-card fan
      // has to stay clear of the neighbour's, so the fan is what gives here —
      // your own hand is spelled out full size in the strip anyway.
      const cw = mine ? 34 : 30;
      const ch = mine ? 48 : 42;
      const step = mine ? 15 : 13; // the fan: enough of each card stays out
      if (mine) {
        c.strokeStyle = active ? "#ffd76a" : "#ffd76a88";
        c.lineWidth = active ? 3 : 2;
        r(c, sx - 41, sy - 62, 82, 158, 9);
        c.stroke();
      }
      const hands: { cards: BjCard[]; value: number; bet: number; result: string | null; hot: boolean }[] = [
        { cards: s.cards, value: s.value, bet: s.bet, result: s.result, hot: active && s.activeHand === 0 },
      ];
      if (s.split) hands.push({ cards: s.cards2, value: s.value2, bet: s.bet2, result: s.result2, hot: active && s.activeHand === 1 });
      hands.forEach((hd, hi) => {
        const hx = sx + (s.split ? (hi === 0 ? -21 : 21) : 0);
        // THE CARDS STRADDLE THE BOX. They used to be drawn a card's height
        // ABOVE the spot, so even with the spot dead on the print the hand sat
        // off it — which is what Josh was looking at. Everything else stacks
        // BELOW the box: verdict, then the stake, then the name.
        const fan = (hd.cards.length - 1) * step;
        hd.cards.forEach((bc, ci) =>
          bjCard(c, hx - cw / 2 - fan / 2 + ci * step, sy - ch / 2 - 4 + ci * 3, cw, ch, bc),
        );
        // Total and verdict ride ABOVE the hand; the stake sits below the box
        // with its own label, and the name under that. chipStack writes its
        // amount UPWARD, so anything directly above it gets overprinted —
        // which is what buried "BLACKJACK" under a chip count.
        const top = sy - ch / 2 - 20;
        if (hd.result) resultBadge(c, hx, top, hd.result, mine);
        else if (hd.value > 0) {
          c.fillStyle = hd.hot ? "#ffd76a" : "#f3ead6";
          c.textAlign = "center";
          c.font = `800 ${mine ? 19 : 16}px system-ui, sans-serif`;
          c.fillText(String(hd.value), hx, top + 6);
        }
        chipStack(c, hx, sy + 52, hd.bet);
      });
      nameTag(c, sx, sy + 82, mine ? "YOU" : s.user.displayName || s.user.username, active, s.left);
    });
    ov.tex.needsUpdate = true;
  };

  const holdem: FeltOverlays["holdem"] = (t, myId) => {
    const c = holdOv.c;
    c.clearRect(0, 0, 1024, 560);
    if (!t) {
      holdOv.tex.needsUpdate = true;
      return;
    }
    const live = t.phase === "preflop" || t.phase === "flop" || t.phase === "turn" || t.phase === "river";
    // board, dead centre — an undealt street is an outline on the cloth, not
    // a face-down card (five card backs read as cards that were dealt)
    const bw = 64, bh = 90, gap = 10;
    const n = 5;
    const x0 = 512 - (n * (bw + gap)) / 2;
    for (let k = 0; k < n; k++) {
      const pc = t.board[k];
      const bx = x0 + k * (bw + gap);
      if (pc) card(c, bx, 190, bw, bh, pc);
      else {
        c.strokeStyle = "#ffffff33";
        c.lineWidth = 2;
        c.setLineDash([7, 6]);
        r(c, bx, 190, bw, bh, 5);
        c.stroke();
        c.setLineDash([]);
      }
    }
    // pot
    if (t.pot > 0) {
      c.fillStyle = "#f3ead6";
      c.textAlign = "center";
      c.font = "800 24px system-ui, sans-serif";
      c.fillText(`pot ${t.pot.toLocaleString()}`, 512, 177);
    }
    if (t.phase === "waiting") {
      c.fillStyle = "#ffffff77";
      c.textAlign = "center";
      c.font = "700 22px system-ui, sans-serif";
      c.fillText("waiting for players", 512, 320);
    } else if (t.phase === "settle" && t.winners.length) {
      // who took it, under the board, for everyone at the rail
      const line = t.winners.length > 1
        ? `split pot · ${t.winners.map((w) => `${w.user.id === myId ? "you" : w.user.displayName || w.user.username} +${w.amount.toLocaleString()}`).join(" · ")}`
        : (() => {
            const w = t.winners[0];
            const who = w.user.id === myId ? "YOU" : w.user.displayName || w.user.username;
            return `${who} wins ${w.amount.toLocaleString()}${w.hand ? ` · ${w.hand}` : ""}`;
          })();
      c.font = "800 22px system-ui, sans-serif";
      c.textAlign = "center";
      const tw = Math.min(560, c.measureText(line).width + 32);
      c.fillStyle = "#000000aa";
      r(c, 512 - tw / 2, 296, tw, 34, 17);
      c.fill();
      c.fillStyle = "#ffd76a";
      c.fillText(line, 512, 320, 540);
    }
    // seven seats on the ellipse — mirror the physical chair ring exactly
    t.seats.forEach((s, k) => {
      const a = (k / 7) * Math.PI * 2 + Math.PI / 7;
      const sx = 512 + Math.sin(a) * 400;
      const sy = 280 + Math.cos(a) * 210;
      if (!s) {
        c.strokeStyle = "#ffffff44";
        c.lineWidth = 2;
        c.setLineDash([6, 5]);
        c.beginPath();
        c.arc(sx, sy, 26, 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
        return;
      }
      const mine = s.user.id === myId;
      // THE FAR SIDE DRAWS INWARD. Above the name ran off the canvas for the
      // top chair (seat 3 sits at y≈70: its cards landed at y -8, its hand
      // name at -16), so anything near the top edge hangs BELOW the name,
      // toward the board, and its hand name and winnings go above.
      const up = sy >= 200;
      const cardY = up ? sy - 78 : sy + 26;
      if (mine) {
        c.strokeStyle = s.acting ? "#ffd76a" : "#ffd76a99";
        c.lineWidth = s.acting ? 3 : 2;
        r(c, sx - 62, sy - 19, 124, 50, 14);
        c.stroke();
      }
      // showdown reveal
      if (s.cards) s.cards.forEach((pc, ci) => card(c, sx - 40 + ci * 42, cardY, 38, 54, pc));
      else if (!s.folded && t.phase !== "waiting" && t.phase !== "settle") {
        c.fillStyle = "#5a2730";
        r(c, sx - 34, cardY + 12, 30, 42, 3);
        c.fill();
        r(c, sx + 2, cardY + 12, 30, 42, 3);
        c.fill();
      }
      // dim only a FOLD in a live hand — a chair waiting for the next deal
      // (seated mid-hand, or between hands) is not out of anything
      nameTag(c, sx, sy, mine ? "YOU" : s.user.displayName || s.user.username, s.acting, s.folded && live);
      c.fillStyle = "#e8c33c";
      c.textAlign = "center";
      c.font = "700 16px system-ui, sans-serif";
      c.fillText(s.allIn ? "ALL IN" : s.stack.toLocaleString(), sx, sy + 22);
      if (s.bet > 0) chipStack(c, sx + (sx < 512 ? 60 : -60), sy - 6, s.bet);
      if (s.button) {
        c.fillStyle = "#f4efe2";
        c.beginPath();
        c.arc(sx - 44, sy - 20, 11, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#20242c";
        c.font = "800 13px system-ui, sans-serif";
        c.fillText("D", sx - 44, sy - 15);
      }
      if (s.won > 0) {
        c.fillStyle = "#7ddf8a";
        c.font = "800 18px system-ui, sans-serif";
        c.fillText(`+${s.won.toLocaleString()}`, sx, up ? sy + 44 : sy - 24);
      }
      if (s.handName) {
        c.fillStyle = "#e8c33c";
        c.font = "700 14px system-ui, sans-serif";
        c.fillText(s.handName, sx, up ? sy - 86 : sy - 44);
      }
    });
    holdOv.tex.needsUpdate = true;
  };

  // European wheel order for the header strip colours
  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  /** The roulette table's own felt, sampled out of the pack atlas through the
   *  tabletop's UVs. Anything drawn on this cloth has to sit on THIS green. */
  const CLOTH = "#01684a";
  // The cloth's own grid, in canvas px — 2.39mm each, so these ARE millimetres
  // ×2.39 on the table: a number box is 68x78px = 16x19cm, which is what a
  // real layout's boxes measure.
  const ZX = 12;   // the zero box, hard against the wheel end
  const GX = 86;   // where the 36 numbers start
  const GY = 8;
  const CW = 68;   // box width, along the table
  const CH = 78;   // box depth, across it
  // Landscape board: canvas x+ = NORTH (away from the wheel), zero column
  // nearest the wheel, three number rows, dozens + evens below, column bets
  // at the far end — the standard cloth, with everyone's chips on the tiles.
  const roulette: FeltOverlays["roulette"] = (st, revealed) => {
    const c = rouOv.c;
    c.clearRect(0, 0, RW, RH);
    // The cloth: the felt's OWN colour, edge to edge, no frame. It hides the
    // pack's American print without announcing itself as a panel.
    c.fillStyle = CLOTH;
    c.fillRect(0, 0, RW, RH);
    const cellRect = (num: number): [number, number, number, number] => {
      const col = Math.floor((num - 1) / 3);
      const row = 3 - ((num - 1) % 3 + 1); // row 0 = the 3-6-9 rank
      return [GX + col * CW, GY + row * CH, CW, CH];
    };
    // zero, spanning all three rows beside the wheel end — outlined, not
    // filled: it is the same green cloth as everything around it
    c.strokeStyle = "#f3ead6";
    c.lineWidth = 3;
    r(c, ZX, GY, GX - ZX - 8, CH * 3, 8);
    c.stroke();
    c.fillStyle = "#f3ead6";
    c.textAlign = "center";
    c.font = "800 40px system-ui, sans-serif";
    c.fillText("0", (ZX + GX - 8) / 2, GY + CH * 1.5 + 14);
    for (let num = 1; num <= 36; num++) {
      const [x, y, w, h] = cellRect(num);
      // the red and black boxes are printed ON the cloth, so they let a little
      // of it through rather than sitting on top as flat colour
      c.fillStyle = RED.has(num) ? "#8f2626dd" : "#12151add";
      c.fillRect(x + 2, y + 2, w - 4, h - 4);
      c.strokeStyle = "#f3ead6aa";
      c.lineWidth = 2;
      c.strokeRect(x + 2, y + 2, w - 4, h - 4);
      c.fillStyle = "#f3ead6";
      c.font = "700 32px system-ui, sans-serif";
      c.fillText(String(num), x + w / 2, y + h / 2 + 11);
    }
    // column bets at the far (north) end
    const colBox = (row: number): [number, number, number, number] => [GX + 12 * CW + 4, GY + row * CH, 96, CH];
    (["col3", "col2", "col1"] as const).forEach((kind, row) => {
      const [x, y, w, h] = colBox(row);
      c.strokeStyle = "#f3ead6aa";
      c.lineWidth = 3;
      r(c, x, y + 4, w, h - 8, 8);
      c.stroke();
      c.fillStyle = "#f3ead6";
      c.font = "700 26px system-ui, sans-serif";
      c.fillText("2:1", x + w / 2, y + h / 2 + 9);
      void kind;
    });
    // dozens + evens under the grid
    const DOZY = GY + CH * 3 + 8;
    const dozBox = (i: number): [number, number, number, number] => [GX + i * CW * 4, DOZY, CW * 4, 56];
    ["1st 12", "2nd 12", "3rd 12"].forEach((label, i) => {
      const [x, y, w, h] = dozBox(i);
      c.strokeStyle = "#f3ead6aa";
      c.lineWidth = 3;
      r(c, x + 3, y, w - 6, h, 8);
      c.stroke();
      c.fillStyle = "#f3ead6";
      c.font = "700 28px system-ui, sans-serif";
      c.fillText(label, x + w / 2, y + 37);
    });
    const EVY = DOZY + 62;
    const evenBox = (i: number): [number, number, number, number] => [GX + i * CW * 2, EVY, CW * 2, 56];
    const EVENS: [string, string][] = [["low", "1–18"], ["even", "EVEN"], ["red", "RED"], ["black", "BLACK"], ["odd", "ODD"], ["high", "19–36"]];
    EVENS.forEach(([kind, label], i) => {
      const [x, y, w, h] = evenBox(i);
      if (kind === "red" || kind === "black") {
        c.fillStyle = kind === "red" ? "#8f2626dd" : "#12151add";
        r(c, x + 3, y, w - 6, h, 8);
        c.fill();
      }
      c.strokeStyle = "#f3ead6aa";
      c.lineWidth = 3;
      r(c, x + 3, y, w - 6, h, 8);
      c.stroke();
      c.fillStyle = "#f3ead6";
      c.font = "700 24px system-ui, sans-serif";
      c.fillText(label, x + w / 2, y + 37);
    });
    // ---- THE DOLLY -------------------------------------------------------------
    // The croupier's marker, standing on the number the ball is sitting in.
    // Only once the wheel has actually landed — the pocket rides the broadcast
    // the moment the server rolls it, and the no-spoiler rule says the cloth
    // must not know before the ball does.
    if (st && revealed && st.pocket !== null && st.pocket !== undefined) {
      const [dx, dy] = st.pocket === 0
        ? [(ZX + GX - 8) / 2, GY + CH * 1.5]
        : (() => {
          const [x, y, w, h] = cellRect(st.pocket!);
          return [x + w / 2, y + h / 2];
        })();
      c.fillStyle = "#f6f1e4";
      c.beginPath();
      c.ellipse(dx, dy - 28, 16, 8, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#e8dcc0";
      c.fillRect(dx - 6, dy - 28, 12, 26);
      c.fillStyle = "#f6f1e4";
      c.beginPath();
      c.ellipse(dx, dy - 2, 20, 10, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#00000055";
      c.lineWidth = 2;
      c.stroke();
    }

    // ---- everyone's chips, ON their tiles -------------------------------------
    if (st) {
      const total = new Map<string, number>();
      for (const b of st.bets) {
        const key = b.kind + ":" + (b.target ?? "");
        total.set(key, (total.get(key) ?? 0) + b.amount);
      }
      for (const [key, amt] of total) {
        const [kind, tgt] = key.split(":");
        let cx: number | null = null;
        let cy: number | null = null;
        if (kind === "straight" && tgt !== "") {
          if (Number(tgt) === 0) {
            cx = 60;
            cy = GY + CH * 1.5;
          } else {
            const [x, y, w, h] = cellRect(Number(tgt));
            cx = x + w / 2;
            cy = y + h / 2;
          }
        } else if (kind.startsWith("dozen")) {
          const [x, y, w, h] = dozBox(Number(kind.slice(5)) - 1);
          cx = x + w / 2;
          cy = y + h / 2;
        } else if (kind.startsWith("col")) {
          const row = 3 - Number(kind.slice(3));
          const [x, y, w, h] = colBox(row);
          cx = x + w / 2;
          cy = y + h / 2;
        } else {
          const i = EVENS.findIndex(([k]) => k === kind);
          if (i >= 0) {
            const [x, y, w, h] = evenBox(i);
            cx = x + w / 2;
            cy = y + h / 2;
          }
        }
        if (cx !== null && cy !== null) chipStack(c, cx, cy + 12, amt, 1.5);
      }
    }
    rouOv.tex.needsUpdate = true;
  };

  const pit: FeltOverlays["pit"] = (g, myId) => {
    const c = pitOv.c;
    c.clearRect(0, 0, 640, 640);
    if (!g) {
      pitOv.tex.needsUpdate = true;
      return;
    }
    c.textAlign = "center";
    // pot + bid, centre
    c.fillStyle = "#e8c33c";
    c.font = "800 26px system-ui, sans-serif";
    c.fillText(`pot ${g.pot}`, 320, 300);
    if (g.bid) {
      c.fillStyle = "#f3ead6";
      c.font = "900 34px system-ui, sans-serif";
      c.fillText(`${g.bid.count} × ${"⚀⚁⚂⚃⚄⚅"[g.bid.face - 1] ?? g.bid.face}`, 320, 348);
    } else if (g.phase === "playing") {
      c.fillStyle = "#ffffff77";
      c.font = "700 20px system-ui, sans-serif";
      c.fillText("opening bid…", 320, 344);
    } else if (g.phase === "gathering") {
      c.fillStyle = "#ffffff77";
      c.font = "700 20px system-ui, sans-serif";
      c.fillText(`gathering · stake ${g.stake}`, 320, 344);
    }
    // players ring
    g.players.forEach((p, k) => {
      const a = (k / Math.max(1, g.players.length)) * Math.PI * 2;
      const sx = 320 + Math.sin(a) * 230;
      const sy = 320 + Math.cos(a) * 230;
      const name = p.user ? p.user.displayName || p.user.username : "—";
      nameTag(c, sx, sy, name, g.turnUserId === p.user?.id, p.eliminated);
      // dice count as pips (cups stay secret — counts are public)
      c.fillStyle = "#f3ead6";
      c.font = "800 18px system-ui, sans-serif";
      c.fillText(`${p.diceCount} dice`, sx, sy + 24);
    });
    // reveal: everyone's cups on the felt
    if (g.reveal) {
      c.fillStyle = "#000000aa";
      r(c, 60, 380, 520, 200, 10);
      c.fill();
      c.fillStyle = "#e8c33c";
      c.font = "800 20px system-ui, sans-serif";
      c.fillText(`LIAR! ${g.reveal.bid.count}×${g.reveal.bid.face} — actual ${g.reveal.actual}`, 320, 412);
      g.reveal.cups.forEach((cup, k) => {
        const p = g.players.find((pl) => pl.user?.id === cup.userId);
        const nm = p?.user ? p.user.displayName || p.user.username : "?";
        c.fillStyle = cup.userId === g.reveal!.loserId ? "#e06a5a" : "#d8d2c4";
        c.font = "700 18px system-ui, sans-serif";
        c.textAlign = "left";
        c.fillText(`${nm}: ${cup.dice.map((d) => "⚀⚁⚂⚃⚄⚅"[d - 1] ?? d).join(" ")}`, 100, 448 + k * 28);
      });
      c.textAlign = "center";
    }
    void myId;
    pitOv.tex.needsUpdate = true;
  };

  return { bj, holdem, roulette, pit };
}
