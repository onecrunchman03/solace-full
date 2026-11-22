// THE FLOOR — layout invariants. Pure DATA checks over client/src/casino/layout.ts
// (THE BOULEVARD since Oct 2026 — ported from the classic hall's checks: the
// general rules kept word for word, the geometry re-pinned to the new floor),
// so they need no browser and no WebGL: colliders, walkways, seats, the slot banks
// and the blackjack pit. Every assert here corresponds to something that was
// actually wrong in the hall at some point.
//
//   node scripts/checks/test_casino_layout.mjs
//
// (Node 24 strips the TypeScript types on import — layout.ts is deliberately
// free of runtime-only TS, and importing it directly is what keeps this harness
// honest: it tests the SHIPPED data, not a copy of it.)


import { readFileSync } from "node:fs";
import {
  W, H, CEIL, STAGE, WING_X, THROW_REACH, THROW_POWER, PLACEMENTS, SEATS, LAMPS, PENDANTS,
  LIGHTS, STATIONS, BJ_TABLES, BJ_SCALE, HOLDEM, bjStool, holdemSeat, stageThrowAim,
  JUKEBOX, SPEAKERS, musicLevelAt, LOCKER, KIOSK, DOOR, LENDER, LENDER_SCALE, LENDER_LIFT, LENDER_MODEL,
  BAR, ROTUNDA, SLOT_BANKS, CAROUSEL, BONE_PIT, CHESS, SHELL, ESCAPE_DOOR, SLOT_CAPS, HIGH_LIMIT,
  SLOT_SECTIONS, slotSectionAt, CABINET_COLLIDER,
} from "../../client/src/casino/layout.ts";
import { SLOT_BACK, SLOT_PITCH } from "../../client/src/casino/layout-kit.ts";
import { CABINET_SPECS } from "../../client/src/casino/slot-cabinets.ts";
// The server's seat range guard, read from source (this harness stays pure
// data — importing floor.ts would drag in the server).
const FLOOR_SRC = readFileSync(new URL("../../src/casino/floor.ts", import.meta.url), "utf8");
const MAX_SEATS = Number(FLOOR_SRC.match(/MAX_SEATS = (\d+)/)?.[1] ?? 0);
import {
  SLOTS, SPIN_DUR, WHEEL_SLOTS_3D, spinEase, spinEaseInv, spinSweep, sweepFrom, clackSchedule,
} from "../../client/src/casino/spin.ts";
import { EU_ORDER, EU_RED, pocketAngle } from "../../client/src/casino/wheel37.ts";
import {
  DRUNK_OF, DRUNK_CLIPS, DRUNK_IDLES, IDLE_SWAP_MS, drunkState,
} from "../../client/src/casino/drunkclips.ts";

let pass = 0;
const fails = [];
const ok = (cond, label) => {
  if (cond) pass++;
  else fails.push(label);
};

// ---- colliders ---------------------------------------------------------------
const withCollider = PLACEMENTS.filter((p) => p.collider);
ok(withCollider.length > 0, "some placements carry colliders");
ok(
  withCollider.every((p) => p.collider[0] > 0 && p.collider[1] > 0),
  "no zero/negative collider half-extents",
);
// A collider wider than ~3 cells is either the bar counter or a mistake. An
// oversized box IS an invisible wall — the class of bug Josh hits within minutes.
const bigOnes = withCollider.filter((p) => p.collider[0] > 3 || p.collider[1] > 3);
ok(
  bigOnes.length === 1 && bigOnes[0].collider[0] === (BAR.x1 - BAR.x0) / 2,
  `only the bar counter is a big collider (found ${bigOnes.length})`,
);
ok(
  PLACEMENTS.every((p) => p.at[0] >= 0 && p.at[0] < W && p.at[1] >= 0 && p.at[1] < H),
  "every placement sits inside the hall",
);

// ---- colliders match the models they stand for -------------------------------
// Footprints MEASURED from the shipped GLBs' baked transforms (scratchpad
// glbfoot.mjs — accessor bounds through node matrices), body-height where the
// full bbox lies (the fortune wheel's 3.45m "depth" is its raised disc; the
// pedestal is what a body hits). [alongX, alongZ] at yaw 0, metres, scale 1.
// The blackjack pit shipped with colliders for the UNROTATED table — invisible
// walls north/south of every felt, walk-through at the arc — and roulette had
// the same box rotated 90°. This table is what stops the next one.
{
  const FOOT = {
    blackjacktable: [1.28, 2.81],
    casinomachine: [1.08, 1.32],
    roulettetable: [2.93, 6.29],
    fortuneroulette: [1.2, 1.81], // pedestal, not the disc
    pokertable: [2.8, 2.8],
    cube010: [0.5 / 0.62, 0.5 / 0.62], // bar stool (measured AT its 0.62 scale)
    cube011: [0.55 / 0.55, 0.59 / 0.55], // chair
    cube019: [1.1 / 0.55, 1.1 / 0.55], // square/round table tops
    // 1.82 × 1.14 until Aug 2026 — those are kiosk.glb's RAW accessor bounds,
    // and its Cube_0 node carries a 0.8632 scale the reading skipped, so every
    // number here was 16% too big. World-space (the same bbox world.ts recentres
    // the prop on) is 1.573 × 0.981. The ±0.3m tolerance below hid it.
    all_kiosk: [1.573, 0.981],
  };
  // the measured cabinets, native depth × width (inspect.mjs) at their scale
  const MEASURED_FOOT = {
    lucky: [0.677 * CABINET_SPECS.lucky.scale, 0.817 * CABINET_SPECS.lucky.scale],
    jackpot: [0.943 * CABINET_SPECS.jackpot.scale, 0.91 * CABINET_SPECS.jackpot.scale],
    star: [0.911 * CABINET_SPECS.star.scale, 0.937 * CABINET_SPECS.star.scale],
    bulb: [0.879 * CABINET_SPECS.bulb.scale, 1.048 * CABINET_SPECS.bulb.scale],
  };
  for (const p of withCollider) {
    if (p.pick === "__collider__" || p.pick.startsWith("stanchion")) continue; // manual / toe-over base
    // a slot section's MEASURED machine carries its own size and scale
    // (slot-cabinets.ts): native bounding box × its hall scale, depth along x
    // (the cabinet faces −x at yaw 0), width along z
    const kind = p.pick === "casinomachine" ? slotSectionAt(p.at[0], p.at[1]).cabinet : "classic";
    const key = kind !== "classic" ? `cabinet:${kind}` : p.src === "kiosk" ? "all_kiosk" : p.pick;
    const foot = kind !== "classic" ? MEASURED_FOOT[kind] : FOOT[key];
    if (!foot) continue;
    const s = kind !== "classic" ? 1 : p.scale ?? 1;
    const swap = ((p.yawDeg ?? 0) % 180) === 90;
    const [fx, fz] = swap ? [foot[1] * s, foot[0] * s] : [foot[0] * s, foot[1] * s];
    const cx = p.collider[0] * 4; // half-cells → full metres
    const cz = p.collider[1] * 4;
    const okX = cx - fx > -0.3 && cx - fx < 0.3;
    const okZ = cz - fz > -0.3 && cz - fz < 0.3;
    ok(
      okX && okZ,
      `${key}@${p.at}: collider ${cx.toFixed(2)}x${cz.toFixed(2)}m matches model ${fx.toFixed(2)}x${fz.toFixed(2)}m`,
    );
  }
}

// ---- the walkways a player actually uses -------------------------------------
const blocked = (x, y) =>
  withCollider.some(
    (p) => Math.abs(p.at[0] - x) < p.collider[0] && Math.abs(p.at[1] - y) < p.collider[1],
  );
const walk = (label, x0, y0, x1, y1, n = 80) => {
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (blocked(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return ok(false, `${label} is clear`);
  }
  ok(true, `${label} is clear`);
};
// the boulevard and the loop round the rotunda are the spine; every district
// hangs off them (hall.ts draws the regulars' graph on the same lines)
walk("the boulevard, door to loop (x=18)", 18, 21.2, 18, 16.75);
walk("the loop's south side (y=16.75)", 10.5, 16.75, 25.5, 16.75);
walk("the loop's north side (y=6.25)", 10.5, 6.25, 25.5, 6.25);
walk("the loop's west side (x=10.5)", 10.5, 6.25, 10.5, 16.75);
walk("the loop's east side (x=25.5)", 25.5, 6.25, 25.5, 16.75);
walk("the bar front, behind the stools (y=2.95)", 11.0, 2.95, 25.0, 2.95);
walk("up from the loop to the bar (x=18)", 18, 6.25, 18, 2.95);
// the slots: the aisle between the two bank columns, the cross aisle between
// the north and south blocks, and the wall aisle
walk("the slots' middle aisle (x=4.5)", 4.5, 2.4, 4.5, 14.4);
walk("the slots' cross aisle (y=7.0)", 0.9, 7.0, 8.6, 7.0);
walk("the slots' west wall aisle (x=1.1)", 1.1, 2.4, 1.1, 14.4);
walk("the high-limit aisle (y=20.6)", 1.2, 20.6, 8.6, 20.6);
walk("from the carousel down to the high-limit row (x=4.5)", 4.5, 17.8, 4.5, 21.0);
walk("from the slots to the loop (y=7.0)", 8.6, 7.0, 10.5, 6.25);
// the pit: in from the loop between the felts, round the roulette
walk("into the pit (y=10)", 25.5, 10, 30.2, 10);
walk("the pit's west aisle (x=27.6)", 27.6, 4.6, 27.6, 15.4);
walk("between the felts and the roulette (y=8.4)", 27.6, 8.4, 35.4, 8.4);
walk("between the felts and the roulette (y=11.6)", 27.6, 11.6, 35.4, 11.6);
// the services bays and the doors
walk("the west services bay (y=20.6)", 9.5, 20.6, 16, 20.6);
walk("the east services bay (y=20.6)", 20, 20.6, 26.5, 20.6);

// ---- the slot banks ----------------------------------------------------------
const slots = PLACEMENTS.filter((p) => p.pick === "casinomachine");
const banked = SLOT_BANKS.reduce((n, b) => n + b.n * 2, 0);
ok(slots.length === banked + CAROUSEL.n + HIGH_LIMIT.n, `${banked} banked machines + the carousel's ${CAROUSEL.n} + the high-limit row's ${HIGH_LIMIT.n} (found ${slots.length})`);
// BACK-TO-BACK (the classic hall's review-sweep fix, kept): each bank's west
// row faces west and its east row faces east, the two rows one cabinet-depth
// apart — no raw cabinet back toward any player. Facing by yawDeg is
// 0=west · 180=east (measured).
for (const b of SLOT_BANKS) {
  const inBank = (p) => p.at[1] >= b.y0 - 0.01 && p.at[1] <= b.y0 + b.n + 0.01;
  const west = slots.filter((p) => Math.abs(p.at[0] - (b.x - SLOT_BACK / 2)) < 0.01 && inBank(p));
  const east = slots.filter((p) => Math.abs(p.at[0] - (b.x + SLOT_BACK / 2)) < 0.01 && inBank(p));
  const tag = `bank at x ${b.x}, y ${b.y0}`;
  ok(west.length === b.n && east.length === b.n, `${tag}: ${b.n} machines a row`);
  ok(west.every((p) => p.yawDeg === 0) && east.every((p) => p.yawDeg === 180), `${tag}: the rows face out, backs together`);
  // Banked shoulder-to-shoulder, but never overlapping: neighbours must not
  // share collider space or the bank becomes one long invisible wall.
  const pitchOk = (row) => {
    const ys = row.map((p) => p.at[1]).sort((a, c) => a - c);
    for (let i = 1; i < ys.length; i++) {
      const gap = ys[i] - ys[i - 1];
      if (gap <= 0 || gap > 0.9) return false;
      if (gap <= row[0].collider[1] * 2) return false;
    }
    return true;
  };
  ok(pitchOk(west) && pitchOk(east), `${tag}: banked tight, colliders never overlapping`);
}
// the carousel: a ring of cabinets facing OUT round its column
{
  const ring = slots.filter((p) => Math.hypot(p.at[0] - CAROUSEL.x, p.at[1] - CAROUSEL.y) < CAROUSEL.r + 0.05);
  ok(ring.length === CAROUSEL.n, `the carousel's ring has its ${CAROUSEL.n} (found ${ring.length})`);
  ok(ring.every((p) => {
    // a cabinet's front at yaw y points (−cos y, sin y) in the floor's x/y
    const t = ((p.yawDeg ?? 0) * Math.PI) / 180;
    const fx = -Math.cos(t), fy = Math.sin(t);
    const ox = p.at[0] - CAROUSEL.x, oy = p.at[1] - CAROUSEL.y;
    return (fx * ox + fy * oy) / Math.hypot(ox, oy) > 0.95;
  }), "every carousel cabinet faces out, away from the column");
}
ok(slots.every((p) => p.glow > 0), "every cabinet self-illuminates");
// THE END CAPS (the polish pass): both ends of every bank are closed, so no
// aisle looks at a cabinet's bare side — and each cap is a collider across the
// bank's full depth, tight to its end cabinet
{
  const caps = PLACEMENTS.filter((p) => p.pick === "__collider__" && SLOT_CAPS.some(([x, y]) => p.at[0] === x && p.at[1] === y));
  ok(caps.length === SLOT_BANKS.length * 2, `both ends of every bank are capped (${caps.length} caps for ${SLOT_BANKS.length} banks)`);
  ok(caps.every((c) => c.collider[0] >= SLOT_BACK / 2 + 0.23), "each cap spans the bank's full depth (both rows)");
  ok(
    caps.every((c) => {
      const end = slots.filter((p) => Math.abs(p.at[0] - c.at[0]) < 0.6).map((p) => Math.abs(p.at[1] - c.at[1])).sort((a, b) => a - b)[0];
      return end > 0.275 + c.collider[1] && end < 0.45;
    }),
    "each cap sits just off its end cabinet — tight, never inside it",
  );
}
// THE HIGH-LIMIT ROW: against the south wall, facing north across the aisle,
// lit by its own pendant and named by its own neon
{
  const row = slots.filter((p) => p.at[1] === HIGH_LIMIT.y);
  ok(row.length === HIGH_LIMIT.n, `the high-limit row has its ${HIGH_LIMIT.n} (found ${row.length})`);
  ok(row.every((p) => p.yawDeg === 270), "…every cabinet facing north, into the room");
  const [deep, wide] = CABINET_COLLIDER[slotSectionAt(row[0].at[0], row[0].at[1]).cabinet];
  ok(row.every((p) => p.collider[0] === wide && p.collider[1] === deep), "…with its cabinet's collider turned to match");
  ok(H - HIGH_LIMIT.y - 0.23 > 0 && H - HIGH_LIMIT.y - 0.23 < 0.05, "…backs against the south wall");
  const mid = HIGH_LIMIT.x0 + ((HIGH_LIMIT.n - 1) * 0.62) / 2;
  ok(PENDANTS.some((p) => Math.abs(p.x - mid) < 0.6 && p.y > HIGH_LIMIT.y - 2 && p.y < HIGH_LIMIT.y), "…lit by a pendant hung over its aisle");
  ok(!SHELL.pictures.some((pic) => pic.y > H - 0.5 && pic.x > HIGH_LIMIT.x0 - 0.5 && pic.x < HIGH_LIMIT.x0 + HIGH_LIMIT.n * 0.62), "…and no picture hangs hidden behind it");
}
// THE SECTIONS' MACHINES (Oct 2026): every cabinet belongs to a section, each
// section names a machine that was measured (slot-cabinets.ts), and each
// machine's box is its own — off the bank's spine and inside the bank's pitch.
{
  ok(SLOT_SECTIONS.every((s) => s.cabinet === "classic" || CABINET_SPECS[s.cabinet]),
    "every section's cabinet is either the classic or a measured one");
  const kinds = new Set(SLOT_SECTIONS.map((s) => s.cabinet));
  ok(kinds.size >= 5, `the sections stand ${kinds.size} different machines`);
  const bad = slots.filter((p) => {
    const kind = slotSectionAt(p.at[0], p.at[1]).cabinet;
    if (kind === "classic") return false;
    const [deep, wide] = CABINET_COLLIDER[kind];
    const yaw = (((p.yawDeg ?? 0) % 360) + 360) % 360;
    const want = yaw === 0 || yaw === 180 ? [deep, wide] : yaw === 90 || yaw === 270 ? [wide, deep] : [Math.max(deep, wide), Math.max(deep, wide)];
    return p.collider[0] !== want[0] || p.collider[1] !== want[1];
  });
  ok(bad.length === 0, `every measured machine wears its own box (${bad.length} don't)`);
  // (the classic's own box has always overlapped its back-to-back twin's —
  // two solid boxes meeting inside solid machines — so only the measured ones)
  ok(Object.entries(CABINET_COLLIDER).every(([k, [deep]]) => k === "classic" || deep <= SLOT_BACK / 2 + 0.01),
    "no measured machine's box reaches past its bank's spine into the machine behind it");
  ok(Object.entries(CABINET_COLLIDER).every(([, [, wide]]) => wide * 2 <= SLOT_PITCH),
    "no machine's box is wider than the bank's pitch");
  ok(Object.values(CABINET_SPECS).every((c) => Math.abs(c.screen.x - c.bodyX) < 0.1 && Math.abs(c.lever.pivot[0] - c.bodyX) > 0.3),
    "each measured screen sits across its body, each lever off its side");
  // world.ts layoutFor: a screen draws 213px tall with three 112px windows and
  // two 10px gaps across it, so its aspect must leave room for 356px of reels
  ok(Object.values(CABINET_SPECS).every((c) => c.screen.w / c.screen.h >= 356 / 213),
    "each measured screen is wide enough for three square reels");
}

// ---- the blackjack tables (the EAST WING, Josh's map — Aug 2026) -------------
const tables = PLACEMENTS.filter((p) => p.pick === "blackjacktable");
ok(tables.length === 4, `four blackjack tables (found ${tables.length})`);
ok(
  BJ_TABLES.every((t) => tables.some((p) => p.at[0] === t.x && p.at[1] === t.y && p.yawDeg === t.yawDeg)),
  "every felt sits at its BJ_TABLES spot with its authored yaw",
);
ok(tables.every((t) => t.at[0] > WING_X), "the whole pit lives in the east wing");
ok(tables.every((t) => (t.scale ?? 1) === BJ_SCALE), `every felt at the six-seat scale (${BJ_SCALE})`);
// spacing: no two felts within 4 cells, none crowding the oval — Josh:
// "i dont want any table to be crowded"
ok(
  BJ_TABLES.every((a, i) => BJ_TABLES.every((b, j) =>
    i === j || Math.hypot(a.x - b.x, a.y - b.y) >= 4,
  )),
  "the felts keep their distance from each other",
);
ok(
  BJ_TABLES.every((t) => Math.hypot(t.x - HOLDEM.x, t.y - HOLDEM.y) >= 3.4),
  "no felt crowds the hold'em oval",
);
// The stool arc mirrors bjStool exactly — one geometry for placements, SEATS
// and ghosts — and no stool may sit inside any of the table's collider boxes.
{
  const boxes = tables.flatMap((t) => (t.colliders ?? []).map(([dx, dy, rx, ry]) => ({
    x: t.at[0] + dx, y: t.at[1] + dy, rx, ry,
  })));
  ok(boxes.length === tables.length * 6, "each felt carries its six-box chain collider");
  const stools = PLACEMENTS.filter((p) => p.pick === "cube010" && p.at[0] > WING_X);
  ok(stools.length === 24, `six stools per wing felt (found ${stools.length})`);
  ok(
    stools.every((s) =>
      boxes.every((b) => Math.abs(s.at[0] - b.x) > b.rx + 0.1 || Math.abs(s.at[1] - b.y) > b.ry + 0.1),
    ),
    "no stool sits inside the felt's collider chain",
  );
  ok(
    BJ_TABLES.every((t) => [0, 1, 2, 3, 4, 5].every((i) => {
      const s = bjStool(t, i);
      return stools.some((p) => p.at[0] === s.x && p.at[1] === s.y);
    })),
    "the placed stools ARE bjStool's arc — the shared geometry holds",
  );
  // chain union spans the felt's long axis: 2.81m × 1.2 ≈ 1.69 cells
  const span = 2 * (0.54 + 0.3);
  ok(Math.abs(span - (2.81 * BJ_SCALE) / 2) < 0.2, "collider chain spans the felt's length");

  // NOBODY SITS IN ANYONE'S LAP (Josh, Aug 2026: "players are sitting right on
  // top of each other"). A body is about 0.5m across, so neighbouring seats
  // need a real gap — the old straight rail gave them 0.28 cells (56cm) and
  // they overlapped on screen. The rail is walked by ARC LENGTH now, so the
  // spacing is even all the way round the corners.
  let minGap = Infinity, maxGap = 0;
  for (const t of BJ_TABLES) {
    for (let i = 0; i < 5; i++) {
      const a = bjStool(t, i), b = bjStool(t, i + 1);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      minGap = Math.min(minGap, d);
      maxGap = Math.max(maxGap, d);
    }
  }
  ok(minGap > 0.36, `neighbouring stools clear a body's width (min ${(minGap * 2).toFixed(2)}m)`);
  ok(maxGap - minGap < 0.06, `the rail seats evenly (spread ${((maxGap - minGap) * 2).toFixed(2)}m)`);
  // …and every seat still reaches its own felt: a player 1.6m from the table
  // centre can't deal onto it.
  ok(
    BJ_TABLES.every((t) => [0, 1, 2, 3, 4, 5].every((i) => {
      const s = bjStool(t, i);
      return Math.hypot(s.x - t.x, s.y - t.y) < 1.35;
    })),
    "every stool is still within arm's reach of its own felt",
  );
}

// ---- the hold'em oval (poker7, seven seats) ----------------------------------
{
  const oval = PLACEMENTS.find((p) => p.src === "poker7");
  ok(!!oval, "the wing centres on Josh's poker7 oval");
  ok(oval.at[0] === HOLDEM.x && oval.at[1] === HOLDEM.y, "the oval sits at HOLDEM");
  ok((oval.colliders ?? []).length === 3, "the oval carries its three-box chain");
  const chairs7 = PLACEMENTS.filter((p) => p.src === "chair" && Math.hypot(p.at[0] - HOLDEM.x, p.at[1] - HOLDEM.y) < 1.8);
  ok(chairs7.length === 7, `seven chairs ring the oval (found ${chairs7.length})`);
  ok(
    [0, 1, 2, 3, 4, 5, 6].every((i) => {
      const s = holdemSeat(i);
      return chairs7.some((c) => c.at[0] === s.x && c.at[1] === s.y);
    }),
    "the chairs ARE holdemSeat's ellipse — the shared geometry holds",
  );
}

// ---- seats -------------------------------------------------------------------
ok(MAX_SEATS > 0 && SEATS.length <= MAX_SEATS, `every seat id is inside the server's MAX_SEATS guard (${SEATS.length}/${MAX_SEATS}) — past it, a chair silently can't be sat in`);
ok(
  SEATS.every((s) => s.x >= 0 && s.x < W && s.y >= 0 && s.y < H),
  "every seat is inside the hall",
);
ok(SEATS.every((s) => s.h > 0.2 && s.h < 1.2), "seat surfaces are plausible heights");
const seatKeys = SEATS.map((s) => `${s.x.toFixed(2)},${s.y.toFixed(2)}`);
ok(new Set(seatKeys).size === seatKeys.length, "no two seats share a position");
// Seat ids ARE wire ids and are append-only — these first eighteen are load
// bearing: a mid-list insert teleports everyone sitting behind it.
ok(SEATS.length >= 18, "the original eighteen seats are still present");
ok(
  SEATS.slice(0, 10).every((s) => Math.abs(s.y - 2.35) < 0.01),
  "seats 0-9 are still the bar stools",
);
ok(SEATS.length === 71, `seventy-one seats — fourteen bar, eighteen lounge (the poker room's spectators' corner since the dressing round), two chess, twenty-four blackjack, seven hold'em, six in the race book (found ${SEATS.length})`);
// the seat blocks are EXACTLY the shared geometry — ids stable, positions shared
ok(
  BJ_TABLES.every((t, ti) => [0, 1, 2].every((i) => {
    const s = bjStool(t, i);
    const seat = SEATS[18 + ti * 3 + i];
    return seat.x === s.x && seat.y === s.y && Math.abs(seat.heading - s.heading) < 1e-9;
  })),
  "seats 18-29 are bjStool 0-2 of each table",
);
ok(
  BJ_TABLES.every((t, ti) => [3, 4, 5].every((i) => {
    const s = bjStool(t, i);
    const seat = SEATS[36 + ti * 3 + (i - 3)];
    return seat.x === s.x && seat.y === s.y && Math.abs(seat.heading - s.heading) < 1e-9;
  })),
  "seats 36-47 are bjStool 3-5 of each table",
);
ok(
  [0, 1, 2, 3, 4, 5].every((i) => {
    const s = holdemSeat(i);
    const seat = SEATS[30 + i];
    return seat.x === s.x && seat.y === s.y;
  }) && SEATS[48].x === holdemSeat(6).x && SEATS[48].y === holdemSeat(6).y,
  "seats 30-35 + 48 are holdemSeat's seven",
);

// ---- the chess table ---------------------------------------------------------
// The set is one "all" pick sitting ON the table, so it carries no collider of
// its own (the table's is the one that stops you) and its height must be the
// table top exactly — a centimetre out and the men float or sink.
{
  const chess = PLACEMENTS.filter((p) => p.src === "chess");
  ok(chess.length === 1, `one chess set on the floor (found ${chess.length})`);
  const table = PLACEMENTS.find((p) => p.src === "square_table");
  ok(!!table, "the chess table is still a square_table");
  ok(
    chess[0].at[0] === table.at[0] && chess[0].at[1] === table.at[1],
    "the set is centred on its table",
  );
  ok(chess[0].h === 0.84, `the set sits on the table top, h 0.84 (found ${chess[0].h})`);
  ok(!chess[0].collider, "the set has no collider of its own — the table stops you");
  ok(!chess[0].yawDeg, "unyawed: the armies line up with the two chairs (see layout.ts)");
  ok(
    !PLACEMENTS.some((p) => p.src === "chessboard"),
    "the bar pack's blocky chessboard is gone, not doubled up with the real set",
  );
  // The two chairs must still flank it along the axis the armies face.
  const chairs = PLACEMENTS.filter((p) => p.src === "chair" && Math.abs(p.at[0] - table.at[0]) < 0.01);
  ok(chairs.length === 2, `the chess table keeps its two chairs (found ${chairs.length})`);
  ok(
    chairs.every((c) => Math.abs(c.at[1] - table.at[1]) > 0.3),
    "the chairs sit off the table's own cell, one either side",
  );
  // …and each chair's SEAT must open toward the board. The chair model opens
  // +x at yaw 0 (measured); rotated, the opening is (cos yaw, −sin yaw). The
  // chess pair once reused the lounge pair's 0/180 yaws while flanking
  // north/south — both players sat sideways to the board.
  const chairOpens = (c, tx, ty) => {
    const t = ((c.yawDeg ?? 0) * Math.PI) / 180;
    const dx = tx - c.at[0];
    const dy = ty - c.at[1];
    const len = Math.hypot(dx, dy) || 1;
    return (Math.cos(t) * dx - Math.sin(t) * dy) / len > 0.7;
  };
  ok(
    chairs.every((c) => chairOpens(c, table.at[0], table.at[1])),
    "both chess chairs open toward the board",
  );
  // lounge chairs: every chair beside a round table opens toward it
  const rounds = PLACEMENTS.filter((p) => p.src === "round_table");
  const loungeChairs = PLACEMENTS.filter((p) => p.src === "chair" && rounds.some((t) => Math.hypot(t.at[0] - p.at[0], t.at[1] - p.at[1]) < 0.6));
  ok(loungeChairs.length === rounds.length * 2, `two chairs at every lounge table (${loungeChairs.length} for ${rounds.length})`);
  ok(
    loungeChairs.every((c) => {
      const t = rounds.reduce((a, b) => Math.hypot(b.at[0] - c.at[0], b.at[1] - c.at[1]) < Math.hypot(a.at[0] - c.at[0], a.at[1] - c.at[1]) ? b : a);
      return chairOpens(c, t.at[0], t.at[1]);
    }),
    "every lounge chair opens toward its own table",
  );
  // the race book's chairs open toward the board wall (north)
  const book = PLACEMENTS.filter((p) => p.src === "chair" && p.at[0] > WING_X && p.at[1] < 5);
  ok(book.length === 6 && book.every((c) => chairOpens(c, c.at[0], 0)), "the race book's six chairs open toward the board");
  // …and the hold'em oval's seven all open onto the felt
  const ring = PLACEMENTS.filter(
    (p) => p.src === "chair" && Math.hypot(p.at[0] - HOLDEM.x, p.at[1] - HOLDEM.y) < 1.8,
  );
  ok(ring.length === 7, `the hold'em oval has its seven chairs (found ${ring.length})`);
  ok(ring.every((c) => chairOpens(c, HOLDEM.x, HOLDEM.y)), "every hold'em chair opens toward the felt");
}

// ---- seat headings face their furniture --------------------------------------
// The avatar convention, MEASURED with the camera (same math): a seated body's
// forward is (−sin heading, −cos heading) — 0 = north · π/2 = WEST · −π/2 =
// EAST. The (sin, cos) guess once pointed six lounge chairs and all twelve
// blackjack stools away from their own tables.
{
  const faces = (s, tx, ty) => {
    const fx = -Math.sin(s.heading);
    const fy = -Math.cos(s.heading);
    const dx = tx - s.x;
    const dy = ty - s.y;
    const len = Math.hypot(dx, dy) || 1;
    return (fx * dx + fy * dy) / len > 0.7;
  };
  ok(SEATS.slice(0, 10).every((s) => faces(s, s.x, 1.85)), "bar-stool seats face the counter");
  ok(SEATS.slice(49, 53).every((s) => faces(s, s.x, BAR.y)), "the last four bar stools face the counter too");
  const rounds = PLACEMENTS.filter((p) => p.src === "round_table");
  const loungeSeatIds = [...SEATS.keys()].filter((i) => (i >= 10 && i <= 15) || (i >= 53 && i <= 54) || i >= 61);
  ok(loungeSeatIds.length === 18, `eighteen lounge seats (found ${loungeSeatIds.length})`);
  ok(
    loungeSeatIds.every((i) => {
      const s = SEATS[i];
      const t = rounds.reduce((a, b) => Math.hypot(b.at[0] - s.x, b.at[1] - s.y) < Math.hypot(a.at[0] - s.x, a.at[1] - s.y) ? b : a);
      return faces(s, t.at[0], t.at[1]);
    }),
    "lounge seats face their tables",
  );
  ok(faces(SEATS[16], CHESS.x, CHESS.y) && faces(SEATS[17], CHESS.x, CHESS.y), "chess seats face the board");
  ok(SEATS.slice(55, 61).every((s) => faces(s, s.x, 0)), "the race book's seats face the board wall");
  // blackjack stools face their own table (the nearest BJ_TABLES entry)
  ok(
    [...SEATS.slice(18, 30), ...SEATS.slice(36, 48)].every((s) => {
      const t = BJ_TABLES.reduce((a, b) =>
        Math.hypot(b.x - s.x, b.y - s.y) < Math.hypot(a.x - s.x, a.y - s.y) ? b : a,
      );
      return faces(s, t.x, t.y);
    }),
    "blackjack-stool seats face their own felt",
  );
  ok(
    [...SEATS.slice(30, 36), SEATS[48]].every((s) => faces(s, HOLDEM.x, HOLDEM.y)),
    "hold'em seats face the oval",
  );
}

// ---- stations (C3) -----------------------------------------------------------
// A station is only honest if its zone stands AT its furniture — a prompt for
// a game across the room is worse than none.
{
  ok(STATIONS.every((s) => s.x > 0 && s.x < W && s.y > 0 && s.y < H), "every station is inside the hall");
  ok(STATIONS.every((s) => s.r >= 1 && s.r <= 4), "station zones are walk-into sized (1-4 cells)");
  const near = (s, px, py, max = 1.2) => Math.hypot(s.x - px, s.y - py) <= max;
  const one = (game, px, py) => {
    const list = STATIONS.filter((s) => s.game === game);
    return list.some((s) => near(s, px, py));
  };
  const stageCx = (STAGE.x0 + STAGE.x1) / 2;
  const stageCy = (STAGE.y0 + STAGE.y1) / 2;
  ok(one("wheel", stageCx, stageCy), "the wheel station is the stage");
  const bjs = STATIONS.filter((s) => s.game === "blackjack");
  ok(
    bjs.length === 4 && BJ_TABLES.every((t) => bjs.some((s) => near(s, t.x + t.arc[0] * 1.35, t.y + t.arc[1] * 1.35, 0.3))),
    "one blackjack station at each felt's arc",
  );
  const at = (pick) => PLACEMENTS.find((p) => p.pick === pick)?.at;
  ok(one("roulette", ...at("roulettetable")), "the roulette station stands at the roulette table");
  ok(one("holdem", HOLDEM.x, HOLDEM.y), "the hold'em station stands at the wing's oval");
  ok(one("bonepit", BONE_PIT.x, BONE_PIT.y), "the bone pit station stands at its poker table");
  ok(one("chess", CHESS.x, CHESS.y), "the chess station stands at the chess table");
  const kioskAt = PLACEMENTS.find((p) => p.src === "kiosk").at;
  ok(one("kiosk", kioskAt[0], kioskAt[1]), "the kiosk station stands at the SOUL KIOSK");
  ok(
    !STATIONS.some((s) => s.game === "slots"),
    "slots carry no station — the cabinet itself is the in-world interaction",
  );
}

// ---- lamps -------------------------------------------------------------------
ok(LAMPS.length >= 6, "the hall has its hanging lamps");
ok(
  !PLACEMENTS.some((p) => p.pick === "lamp" && Math.hypot(p.at[0] - ROTUNDA.x, p.at[1] - ROTUNDA.y) < ROTUNDA.r),
  "no pendant inside the dome — its chandelier lights the rotunda",
);

// ---- the stage wheel's face matches the ECONOMY's wheel ----------------------
// The slot order already lives in three places CLAUDE.md warns must stay in
// sync; the painted 3D face is a fourth. Diff it against the server's list
// rather than trusting anyone to remember.
{
  const src = readFileSync(new URL("../../src/wheel.ts", import.meta.url), "utf8");
  const block = src.match(/WHEEL_SLOTS:\s*SlotType\[\]\s*=\s*\[([\s\S]*?)\]/);
  ok(!!block, "found WHEEL_SLOTS in src/wheel.ts");
  const server = [...block[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  ok(server.length === 32, `the server wheel has 32 slots (found ${server.length})`);
  ok(
    server.join(",") === WHEEL_SLOTS_3D.join(","),
    "the stage wheel's painted face matches src/wheel.ts WHEEL_SLOTS exactly",
  );
  ok(server[0] === "mystery" && server[16] === "death", "mystery on top, death at the bottom");
  ok(SLOTS === server.length, "spin.ts SLOTS agrees with the server");
}

// ---- the spin curve and the clacks derived from it ---------------------------
ok(Math.abs(spinEase(0)) < 1e-9 && Math.abs(spinEase(1) - 1) < 1e-9, "the ease spans 0..1");
{
  let mono = true;
  for (let u = 0; u < 1; u += 0.01) if (spinEase(u + 0.01) <= spinEase(u)) mono = false;
  ok(mono, "the ease is monotonic — the wheel never runs backwards");
  // decelerating: equal time slices must cover shrinking angle
  const early = spinEase(0.2) - spinEase(0.1);
  const late = spinEase(0.95) - spinEase(0.85);
  ok(early > late * 3, "the wheel decelerates hard into its landing");
  let invOk = true;
  for (let e = 0.05; e < 1; e += 0.05) if (Math.abs(spinEase(spinEaseInv(e)) - e) > 1e-9) invOk = false;
  ok(invOk, "spinEaseInv actually inverts spinEase");
}
{
  const sweep0 = spinSweep(0);
  ok(Math.abs(sweep0 - Math.PI * 2 * 5) < 1e-9, "slot 0 is a whole number of turns");
  ok(spinSweep(8) > sweep0 && spinSweep(31) > spinSweep(8), "later slots sweep further");
  ok(
    Math.abs(spinSweep(16) - sweep0 - Math.PI) < 1e-9,
    "slot 16 (death) is exactly half a turn past slot 0",
  );
  // THE ACCUMULATOR BUG (Josh's miku-shock spin): consecutive spins from
  // wherever the disc rests must EACH land their own wedge under the pointer
  // — rotation ≡ -slot·(2π/SLOTS) (mod 2π) after every spin, with at least
  // five full turns of theatre in between.
  const twoPi = Math.PI * 2;
  const wedge = twoPi / SLOTS;
  let rot = 0;
  let landingsOk = true;
  let turnsOk = true;
  for (const slot of [7, 16, 3, 3, 29, 0, 31, 12]) {
    const sweep = sweepFrom(rot, slot);
    if (sweep < twoPi * 5 - 1e-9) turnsOk = false;
    rot -= sweep;
    // where does the pointer sit? normalize -rot into [0, 2π): that is the
    // wedge angle under the flapper
    const under = ((-rot % twoPi) + twoPi) % twoPi;
    if (Math.abs(under - slot * wedge) > 1e-6 && Math.abs(under - slot * wedge - twoPi) > 1e-6) landingsOk = false;
  }
  ok(landingsOk, "eight consecutive spins EACH rest their own wedge under the pointer");
  ok(turnsOk, "every spin still turns at least five full revolutions");
}
for (const slot of [0, 8, 16, 31]) {
  const cl = clackSchedule(spinSweep(slot));
  ok(cl.length > 20, `slot ${slot}: the flapper clacks a plausible number of times (${cl.length})`);
  ok(
    cl.every((c, i) => i === 0 || c.t > cl[i - 1].t),
    `slot ${slot}: clacks are strictly ordered in time`,
  );
  ok(
    cl.every((c, i) => i === 0 || c.t - cl[i - 1].t >= 0.035 - 1e-9),
    `slot ${slot}: no two clacks land closer than the ear can separate`,
  );
  ok(cl[cl.length - 1].t <= SPIN_DUR + 1e-9, `slot ${slot}: the last clack lands before the thud`);
  // gaps must GROW — that widening tick is the whole sound of a wheel dying
  const firstGap = cl[1].t - cl[0].t;
  const lastGap = cl[cl.length - 1].t - cl[cl.length - 2].t;
  ok(lastGap > firstGap, `slot ${slot}: clacks spread out as the wheel slows`);
  ok(
    cl[0].gain > cl[cl.length - 1].gain,
    `slot ${slot}: it hits hard while flying and ticks as it dies`,
  );
  ok(cl.every((c) => c.gain > 0 && c.gain <= 1), `slot ${slot}: every gain is in range`);
}

// ---- the stage death throw ---------------------------------------------------
// Josh's ask is that a death slot throws you OFF the stage. The rules that
// makes real: always outward, never landing back on the platform, never inside
// a wall. Checked from every square metre of the stage, not a sampled corner.
{
  const onStage = (x, y) => x >= STAGE.x0 && x < STAGE.x1 && y >= STAGE.y0 && y < STAGE.y1;
  const cx = (STAGE.x0 + STAGE.x1) / 2;
  const cy = (STAGE.y0 + STAGE.y1) / 2;
  let offStage = true, inHall = true, outward = true, reach = true;
  for (let x = STAGE.x0; x <= STAGE.x1; x += 0.25) {
    for (let y = STAGE.y0; y <= STAGE.y1; y += 0.25) {
      const { dir, restX, restY } = stageThrowAim(x, y);
      if (onStage(restX, restY)) offStage = false;
      if (restX < 1 || restX > W - 1 || restY < 1 || restY > H - 1) inHall = false;
      // the heading must point from the stage centre toward the rest spot
      const vx = Math.sin(dir);
      const vy = Math.cos(dir);
      if (Math.hypot(x - cx, y - cy) > 0.5) {
        const ux = (x - cx) / Math.hypot(x - cx, y - cy);
        const uy = (y - cy) / Math.hypot(x - cx, y - cy);
        if (vx * ux + vy * uy < 0.999) outward = false;
      }
      if (Math.hypot(restX - cx, restY - cy) > THROW_REACH + 1e-9) reach = false;
    }
  }
  ok(offStage, "a stage death never lands you back on the stage");
  ok(inHall, "a stage death never throws you into a wall");
  ok(outward, "the throw heading points away from the stage centre");
  ok(reach, "the rest spot never exceeds THROW_REACH from the centre");
  // dead centre is the one ambiguous case — it must still resolve, toward the room
  const mid = stageThrowAim(cx, cy);
  ok(
    Number.isFinite(mid.dir) && mid.restY > cy,
    "dead centre on the wheel throws you at the room, not nowhere",
  );
  ok(!onStage(mid.restX, mid.restY), "even the centre throw clears the platform");
  // The power is a MEASURED value, not a taste one: above ~5 the body touched
  // the ceiling and the far wall in-hall. Pin it so a casual "make it more
  // extreme" edit has to come back through the measurements in layout.ts.
  ok(THROW_POWER > 3 && THROW_POWER <= 4.5, `throw power stays in the measured band (${THROW_POWER})`);
  // Ballistic sanity against the room: a body launched at THROW_POWER cells/s
  // must not be able to reach the 5m ceiling on the free-flight arc alone.
  // Launch is up-and-out, so the vertical component is at most the full speed.
  const vy = THROW_POWER * 2; // cells/s -> m/s
  const apex = 1 + (vy * vy) / (2 * 9.81); // from the 1m stage
  ok(apex < CEIL, `the ballistic apex (${apex.toFixed(2)}m) stays under the ${CEIL}m ceiling`);
}

// ---- wall signs + station lobby bindings + the trimmed wing (Aug 2026) -------
// Josh: floor placards are GONE ("remove the game signs"), blackjack gets a
// plaque on the wall BEHIND each table, each physical felt binds to ITS engine
// lobby, and the wing stops at 34 ("you expanded too far to the right").
{
  const { WALL_SIGNS } = await import("../../client/src/casino/layout.ts");
  ok(W === 36 && H === 22, `the Boulevard is 36 × 22 cells (found ${W} × ${H})`);
  // Four blackjack signs + the Foundry's lease over the goblin terminal
  // (Concession No. 3 — canon, Aug 2026).
  ok(WALL_SIGNS.length === 5, "five signs — one per blackjack felt + the Foundry lease");
  const lease = WALL_SIGNS.find((s) => s.text.includes("CONCESSION"));
  ok(!!lease && Math.abs(lease.at[0] - LENDER.x) < 1e-9 && Math.abs(lease.at[1] - (H - 0.06)) < 1e-9 && lease.face[1] === -1,
    "the lease plaque hangs on the south wall directly over the goblin terminal, facing the room");
  // the pit has no wall behind its felts, so each sign HANGS over its own
  // table's dealer side, facing the stools (the classic plaques' rule —
  // behind the table, readable from the seats — on a floor with no wall)
  const bjSigns = WALL_SIGNS.filter((s) => s !== lease);
  ok(
    BJ_TABLES.every((t, i) => {
      const sgn = bjSigns[i];
      const behind = (sgn.at[0] - t.x) * t.arc[0] + (sgn.at[1] - t.y) * t.arc[1] < 0;
      return sgn && behind && Math.hypot(sgn.at[0] - t.x, sgn.at[1] - t.y) < 1.5 && sgn.face[0] === t.arc[0] && sgn.face[1] === t.arc[1];
    }),
    "each felt's sign hangs over its dealer side, facing its stools",
  );
  ok(bjSigns.every((sgn) => sgn.h > 2.1 && sgn.h < CEIL - 0.5), "the hung signs clear a standing head and the ceiling");
  // no floor placards remain anywhere in the module
  const src = readFileSync(new URL("../../client/src/casino/layout-boulevard.ts", import.meta.url), "utf8");
  ok(!/PLACARDS/.test(src), "the floor-stand placards are gone from the layout");
  // station↔lobby binding: the four blackjack stations carry 0..3 in BJ_TABLES
  // (= engine) order, and sit at their own table
  const bjStations = STATIONS.filter((s) => s.game === "blackjack");
  ok(
    bjStations.length === 4 && bjStations.every((s, i) => s.lobby === i),
    "each physical felt binds to its own engine lobby, in order",
  );
  ok(
    bjStations.every((s, i) => Math.hypot(s.x - BJ_TABLES[i].x, s.y - BJ_TABLES[i].y) < 2),
    "each blackjack station stands at its own table",
  );
}

// ---- THE ROULETTE WHEEL'S 37 POCKETS ------------------------------------------
// The hall now spins the MODEL's wheel and drops a ball into the pocket the
// server rolled, and it prints the numbers itself. That only means anything
// while the wheel it paints is the wheel the engine pays: a scrambled order or
// a stray red would show a player the ball landing on a colour they didn't win.
{
  const seen = new Set(EU_ORDER);
  ok(EU_ORDER.length === 37 && seen.size === 37, `37 distinct pockets (got ${seen.size})`);
  ok(
    [...Array(37).keys()].every((n) => seen.has(n)),
    "…and they are exactly 0-36, no gaps and nothing invented",
  );
  ok(EU_RED.size === 18, `18 reds (got ${EU_RED.size})`);
  // the engine's own paytable, read as text — importing src/roulette.ts would
  // drag the server's module graph into a pure data harness
  const engine = readFileSync(new URL("../../src/roulette.ts", import.meta.url), "utf8");
  const listed = engine.match(/RED_NUMBERS\s*=\s*new Set\(\[([^\]]+)\]/);
  const engineRed = new Set((listed?.[1] ?? "").split(",").map((s) => Number(s.trim())));
  ok(
    engineRed.size === 18 && [...engineRed].every((n) => EU_RED.has(n)),
    "the wheel's reds are the ENGINE's reds (src/roulette.ts RED_NUMBERS)",
  );
  // a real single-zero wheel alternates colour the whole way round
  const alternates = EU_ORDER.slice(1).every((n, i) => EU_RED.has(n) === (i % 2 === 0));
  ok(alternates, "red and black alternate around the ring, as on a real wheel");
  // pocket angles: evenly spaced, one per pocket, no two on top of each other
  const angles = EU_ORDER.map((n) => pocketAngle(n));
  const step = (Math.PI * 2) / 37;
  ok(
    angles.every((a, i) => i === 0 || Math.abs((a - angles[i - 1]) - step) < 1e-12),
    "pocket angles are one even step apart",
  );
  ok(
    new Set(angles.map((a) => a.toFixed(9))).size === 37,
    "…and no two pockets share an angle",
  );
  // nothing may keep a private copy of the order — the hall imports this one
  const world = readFileSync(new URL("../../client/src/casino/world.ts", import.meta.url), "utf8");
  ok(/from "\.\/wheel37"/.test(world), "the hall imports the shared pocket order");
  ok(!/const EU_ORDER\s*=/.test(world), "…and defines no wheel of its own");
}

// ---- DRINK, AS ANIMATION -------------------------------------------------------
// Josh's drunk clip set. What matters here is what a body PLAYS: that every
// drunk state has a clip and a sober twin to fall back through, that only the
// states where drink shows are swapped, and that standing at the bar never
// looks like one looping pose.
{
  ok(
    Object.values(DRUNK_OF).every((d) => DRUNK_CLIPS[d]),
    "every drunk twin is a state with a clip behind it",
  );
  ok(
    Object.values(DRUNK_CLIPS).every((c) => c.file.startsWith("drunk-")),
    "…and every drunk clip file is named so the loader strips its root motion",
  );
  // the root-motion strip is keyed off that prefix — Josh's walk translates
  // 265 units of Z, which would march a body off the player it belongs to
  const world = readFileSync(new URL("../../client/src/backrooms/world.ts", import.meta.url), "utf8");
  ok(/name.startsWith\("drunk-"\)/.test(world), "the loader strips root motion from the drunk set");
  ok(
    /for \(const \[state, c\] of Object.entries\(DRUNK_CLIPS\)\)/.test(world),
    "the clip table is DERIVED from drunkclips.ts, not written out twice",
  );
  ok(!/drunkidle: \[/.test(world), "…so no hand-written drunk entry can drift from it");

  // sober is untouched, and only the five states are swapped
  ok(
    ["idle", "walk", "run", "walkleft", "crouchwalk", "jump", "swim"].every(
      (s) => drunkState(s, false, 0, 0) === s,
    ),
    "a sober body plays sober clips",
  );
  ok(drunkState("walk", true, 0, 0) === "drunkwalk", "drink swaps the walk");
  ok(drunkState("walkback", true, 0, 0) === "drunkwalkback", "…and the backpedal");
  ok(drunkState("run", true, 0, 0) === "drunkrun", "…and the run");
  ok(drunkState("runback", true, 0, 0) === "drunkrunback", "…and the backward run");
  ok(
    ["walkleft", "walkright", "runleft", "runright", "crouchwalk", "crouchidle", "jump", "swim", "tread", "sit", "sitidle"]
      .every((s) => drunkState(s, true, 0, 0) === s),
    "strafes, crouches, the jump, water and chairs stay sober — feet must match travel",
  );

  // the idle rotation
  const at = (ms, salt = 0) => drunkState("idle", true, salt, ms);
  ok(DRUNK_IDLES.every((s) => DRUNK_CLIPS[s]), "all three drunk idles are real states");
  const walk = [];
  for (let w = 0; w < 40; w++) walk.push(at(w * IDLE_SWAP_MS + 10));
  ok(new Set(walk).size === DRUNK_IDLES.length, "a standing drunk uses every idle variation");
  ok(
    walk.every((s, i) => i === 0 || s !== walk[i - 1]),
    "…never the same one twice running (a repeat IS the loop these break)",
  );
  // It changes ONCE per window, not per frame: over 20 windows, sampled every
  // 100ms, there are 20 changes and no more.
  let flips = 0;
  let prev = at(0);
  for (let t = 100; t < IDLE_SWAP_MS * 20; t += 100) {
    const v = at(t);
    if (v !== prev) flips++;
    prev = v;
  }
  ok(flips === 20, `it holds each pose for a full window (${flips} changes over 20 windows)`);
  // …and a room of drunks is not in lockstep: at any moment the bodies
  // standing around are on different idles.
  let mixedMoments = 0;
  for (let w = 0; w < 40; w++) {
    const t = w * IDLE_SWAP_MS + 10;
    const seen = new Set([0, 1, 2, 3, 7, 42, 77].map((s) => at(t, s)));
    if (seen.size > 1) mixedMoments++;
  }
  ok(mixedMoments === 40, `bodies at the same bar are never all on the same idle (${mixedMoments}/40)`);

  // ---- and you can see it from INSIDE your own head -------------------------
  // placeViewmodel PINS the head to the lens, which is right for crouching and
  // wrong for drink: it cancelled the stagger, so a drunk's own view sat
  // perfectly steady over a swaying body. The casino takes it back from
  // `vm.sway` — gated on the same threshold as the clips (a sober view must
  // stay dead still) and clamped, because the raw head travel of these clips
  // is over a metre and a metre of camera is unusable.
  const game = readFileSync(new URL("../../client/src/casino/CasinoGame.svelte", import.meta.url), "utf8");
  ok(/vm\.sway\.set\(/.test(world), "the viewmodel publishes how far the clip moved its head");
  ok(/viewmodel\.sway/.test(game), "…and the casino's lens rides it");
  ok(/drunk\.level > DRUNK_SHOW && !outCold/.test(game), "…only once drunk, and never while out cold");
  ok(/LOOK_MAX/.test(game) && /const LOOK_MAX = 0\.0\d+/.test(game), "…clamped to a few centimetres");
}

// ---- GOBLIN LENDERS (Josh, Aug 2026) ----------------------------------
// The goblin bank's terminal on the NORTH wall, LEFT of the bar and beside the
// slots (Josh's placement). Same checks the jukebox and the kiosk get on this
// wall, because the failure modes are the same ones: a machine sunk into the
// woodwork, a machine wedged against a column, a machine standing in the
// walkway, a machine in the dark, or a machine you can't reach.
{
  const atm = PLACEMENTS.find((p) => p.src === "atm");
  ok(!!atm, "the lender's terminal is placed");
  ok(atm.at[0] === LENDER.x && atm.at[1] === LENDER.y, "…at the shared LENDER point");
  // FACING IS THE MODEL'S, NOT THE CONVENTION'S. This assert used to read
  // `yawDeg === 0` and passed happily while the machine showed the room its
  // back panel (Josh: "you placed the ATM backwards") — it restated the code's
  // assumption instead of the model's actual build. Josh's ATM fronts −z, like
  // the locker, so on the NORTH wall it needs the half turn to look south.
  ok(atm.yawDeg === 0, "…screen turned into the room (this model fronts -z: on the SOUTH wall, 0 faces north)");

  // MEASURED IN WORLD SPACE, through the node matrices. The accessor bounds
  // read 100x bigger (the nodes carry a x0.01 matrix), and scaling against
  // those made an 18mm ATM — grounded, lit, and far too small to see. That is
  // Josh's "invisible" report, and this is the assert that would have caught it.
  const HALF_W = (LENDER_MODEL.w * LENDER_SCALE) / 2 / 2; // metres -> cells
  const HALF_D = (LENDER_MODEL.d * LENDER_SCALE) / 2 / 2;
  ok(Math.abs(LENDER_MODEL.h * LENDER_SCALE - 1.85) < 0.001, "the scale makes it a 1.85m machine, not a guess");
  ok(LENDER_MODEL.w * LENDER_SCALE > 0.5 && LENDER_MODEL.w * LENDER_SCALE < 1.5,
    `…a machine-sized footprint, not a crumb (${(LENDER_MODEL.w * LENDER_SCALE).toFixed(3)}m wide)`);
  ok(atm.collider[0] >= HALF_W && atm.collider[0] - HALF_W < 0.05,
    `collider width tracks the model (${atm.collider[0]} vs ${HALF_W.toFixed(3)} cells)`);
  ok(atm.collider[1] >= HALF_D && atm.collider[1] - HALF_D < 0.05,
    `collider depth tracks the model (${atm.collider[1]} vs ${HALF_D.toFixed(3)} cells)`);

  // IT STANDS ON THE FLOOR. Josh: "the atm was invisble when i first loaded
  // in" — this model's origin is MID-BODY (bounds y −582.3 → +433.6 raw), and
  // the placement builder does no auto-grounding, so flat it sat 1.06m sunk
  // in the carpet showing 0.79m of its top against a dark wall. The lift is
  // the model's own min-y, scaled; these two asserts are the bug.
  ok(!atm.h, "the terminal is NOT lifted — takeProp already drops every prop's min-y to the floor");
  ok(LENDER_LIFT === 0, "…so the lift stays zero, whatever the model's own origin does");


  // Back against the SOUTH wall, beside the locker in the services bay.
  const backGap = H - LENDER.y - HALF_D;
  ok(backGap > 0 && backGap < 0.15, `its back is against the south wall (${backGap.toFixed(3)} cells of daylight)`);
  // NOT IN A COLUMN: the wall's columns (SHELL) are 0.25 cells square
  for (const [cx, cy] of SHELL.columns.filter(([, cy]) => cy > H - 1)) {
    ok(LENDER.x + HALF_W < cx - 0.125 || LENDER.x - HALF_W > cx + 0.125, `clear of the south wall's column at x ${cx}`);
  }
  // clear of the doorway, and of the locker beside it
  ok(LENDER.x + HALF_W < DOOR.x0, "it stands clear of the entrance doors");
  const lockerP = PLACEMENTS.find((p) => p.src === "locker");
  ok(LENDER.x - HALF_W > lockerP.at[0] + lockerP.collider[0], "…and clear of the locker beside it");

  // LIT. An ATM is its own fixture — a lit screen beside a bank of slot
  // machines is the whole invitation.
  ok((atm.glow ?? 0) > 0.3, "the terminal lights itself (the fixture rule)");

  // Reachable, aimed at the machine, and you stand in the ROOM to use it.
  const st = STATIONS.find((s) => s.game === "lender");
  ok(!!st && st.aim[0] === LENDER.x, "the lender station aims at the terminal");
  ok(st.y < LENDER.y, "…and you stand in the room to use it, not in the wall");
  for (const other of STATIONS.filter((s) => s.game !== "lender")) {
    if (Math.hypot(st.x - other.x, st.y - other.y) < 0.9) {
      ok(false, `its zone collides with ${other.game}'s`);
      break;
    }
  }
  ok(true, "…and its zone doesn't sit on top of another station's");
}

// ---- THE CASINO LOCKER (Josh, Aug 2026) --------------------------------------
// The 50-slot cabinet by the entrance. Measured 1.275m wide × 1.638 tall ×
// 0.454 deep; the checks are the jukebox's: real footprint, against its wall,
// clear of the doorway, lit, reachable.
{
  const lk = PLACEMENTS.find((p) => p.src === "locker");
  ok(!!lk, "the locker is placed");
  ok(lk.at[0] === LOCKER.x && lk.at[1] === LOCKER.y, "…at the shared LOCKER point");
  ok(!lk.scale, "…unscaled — the model is already a real locker's size");
  ok(lk.yawDeg === 180, "…doors turned into the room (0 faces south; it stands on the south wall)");

  const HALF_W = 1.275 / 2 / 2; // metres → cells
  const HALF_D = 0.454 / 2 / 2;
  ok(lk.collider[0] >= HALF_W && lk.collider[0] - HALF_W < 0.05,
    `collider width tracks the model (${lk.collider[0]} vs ${HALF_W.toFixed(3)} cells)`);
  ok(lk.collider[1] >= HALF_D && lk.collider[1] - HALF_D < 0.06,
    `collider depth tracks the model (${lk.collider[1]} vs ${HALF_D.toFixed(3)} cells)`);

  // Against the south wall, WEST of the doorway (DOOR spans x 12–14) — you
  // walk in past it, and a thrown body out of the doors can't clip it.
  ok(H - LOCKER.y - HALF_D > 0 && H - LOCKER.y - HALF_D < 0.15, "its back is against the south wall");
  ok(LOCKER.x + HALF_W < DOOR.x0, "…and it stands clear of the entrance doors");

  // It is LIT — the cabinet went in dark and read as a black slab (the review
  // sweep); the fixture rule says nothing a player walks up to stands unlit.
  const lamp = PENDANTS.find((p) => Math.hypot(p.x - LOCKER.x, p.y - LOCKER.y) < 1.2);
  ok(!!lamp, "a pendant hangs over the locker (the fixture rule)");
  const atmLamp = PENDANTS.find((p) => Math.hypot(p.x - LENDER.x, p.y - LENDER.y) < 1.2);
  ok(!!atmLamp, "…and one over the goblins' terminal beside it");

  // Its station is reachable and aimed at the cabinet.
  const st = STATIONS.find((s) => s.game === "locker");
  ok(!!st && st.aim[0] === LOCKER.x, "the locker station aims at the cabinet");
  ok(st.y < LOCKER.y, "…and you stand in the room to use it, not in the wall");

  // Nothing else's collider overlaps it.
  for (const p of PLACEMENTS) {
    if (p === lk || !p.collider) continue;
    const dx = Math.abs(p.at[0] - lk.at[0]);
    const dy = Math.abs(p.at[1] - lk.at[1]);
    if (dx < p.collider[0] + lk.collider[0] && dy < p.collider[1] + lk.collider[1]) {
      ok(false, `the locker overlaps ${p.src}/${p.pick} at ${p.at}`);
    }
  }
  ok(true, "no other collider overlaps the locker");
}

// ---- THE SOUL KIOSK, backed onto the north wall (Josh, Aug 2026) -------------
// It stood 0.94m off the wall — a vending machine adrift in the walkway. The
// checks are the jukebox's and the locker's: real footprint, real wall gap.
{
  const k = PLACEMENTS.find((p) => p.src === "kiosk");
  ok(!!k, "the ticket kiosk is placed");
  ok(k.at[0] === KIOSK.x && k.at[1] === KIOSK.y, "…at the shared KIOSK point");
  ok(k.yawDeg === 180, "…screen turned south, into the room (0 faces south)");
  const S = k.scale; // 0.62 — the model is a 2.85m giant unscaled
  const HALF_W = (1.573 * S) / 2 / 2; // metres → cells
  const HALF_D = (0.981 * S) / 2 / 2;
  ok(k.collider[0] >= HALF_W && k.collider[0] - HALF_W < 0.05,
    `collider width tracks the model (${k.collider[0]} vs ${HALF_W.toFixed(3)} cells)`);
  ok(k.collider[1] >= HALF_D && k.collider[1] - HALF_D < 0.05,
    `collider depth tracks the model (${k.collider[1]} vs ${HALF_D.toFixed(3)} cells)`);
  ok(KIOSK.y - HALF_D > 0 && KIOSK.y - HALF_D < 0.15,
    `its back is against the north wall (${((KIOSK.y - HALF_D) * 200).toFixed(0)}cm of daylight)`);

  // The station camera frames the MACHINE, not the carpet it used to stand on:
  // the look-at is on the model, and you stand in the room to reach it.
  const st = STATIONS.find((s) => s.game === "kiosk");
  ok(st.aim[0] === KIOSK.x && Math.abs(st.aim[1] - KIOSK.y) < 0.01, "the kiosk station aims at the machine");
  ok(Math.abs(st.look[0] - KIOSK.x) < 0.01 && st.look[1] - KIOSK.y < 0.3,
    "…and its camera looks at the machine, not past it");
  ok(st.y > KIOSK.y + HALF_D, "…you stand in the room to use it, not in the wall");
  ok(st.cam[1] > st.look[1], "…with the camera south of what it frames");
}

// ---- THE JUKEBOX + its ceiling speakers --------------------------------------
// The machine's own footprint was measured in-hall: 0.861m wide × 1.593 tall ×
// 0.712 deep, standing at JUKEBOX with no scaling. Everything below is about
// keeping it out of the architecture and keeping the music reaching the room.
{
  const juke = PLACEMENTS.find((p) => p.src === "jukebox");
  ok(!!juke, "the jukebox is placed");
  ok(juke.at[0] === JUKEBOX.x && juke.at[1] === JUKEBOX.y, "…at the shared JUKEBOX point");
  ok(!juke.scale, "…unscaled — the model is already a real jukebox's size");
  ok(!!juke.glow, "…and lights itself (it IS its own fixture)");

  // The collider must cover the machine without becoming an invisible wall.
  const HALF_W = 0.861 / 2 / 2; // metres → cells
  const HALF_D = 0.712 / 2 / 2;
  ok(juke.collider[0] >= HALF_W && juke.collider[0] - HALF_W < 0.05,
    `collider width tracks the model (${juke.collider[0]} vs ${HALF_W.toFixed(3)} cells)`);
  ok(juke.collider[1] >= HALF_D && juke.collider[1] - HALF_D < 0.05,
    `collider depth tracks the model (${juke.collider[1]} vs ${HALF_D.toFixed(3)} cells)`);

  // Against the north wall, and CLEAR OF THE COLUMNS — the classic hall's
  // first cut stood the machine dead centre of one, sunk 22cm into the woodwork.
  ok(JUKEBOX.y - HALF_D > 0 && JUKEBOX.y - HALF_D < 0.15, "its back is against the north wall");
  for (const [cx] of SHELL.columns.filter(([, cy]) => cy < 1)) {
    ok(JUKEBOX.x - HALF_W > cx + 0.125 || JUKEBOX.x + HALF_W < cx - 0.125, `it does not stand inside the north wall's column at x ${cx}`);
  }
  // …a step west of the bar's end, so a body queuing at it never cuts the
  // counter's corner (hall.ts's "juke" spot)
  const gap = BAR.x0 - (JUKEBOX.x + HALF_W);
  ok(gap > 0.5 && gap < 2.5, `it stands just west of the bar (${(gap * 2).toFixed(2)}m of floor between)`);

  // Its station is reachable, aimed at it, and doesn't steal the kiosk's.
  const st = STATIONS.find((s) => s.game === "jukebox");
  ok(!!st && st.aim[0] === JUKEBOX.x, "the jukebox station aims at the machine");
  ok(st.y > JUKEBOX.y, "…and you stand in the room to use it, not in the wall");
  const kioskSt = STATIONS.find((s) => s.game === "kiosk");
  const dJ = Math.hypot(st.x - st.x, st.y - st.y);
  const atJuke = Math.hypot(kioskSt.x - st.x, kioskSt.y - st.y);
  ok(dJ < atJuke, "standing at the jukebox, the jukebox is the nearest station");

  // No speaker is inside a light fitting, and none is stacked on another.
  for (const [sx, sy] of SPEAKERS) {
    ok(sx > 0 && sx < W && sy > 0 && sy < H, `speaker (${sx},${sy}) is inside the hall`);
  }
  let tooClose = 0;
  for (let i = 0; i < SPEAKERS.length; i++)
    for (let j = i + 1; j < SPEAKERS.length; j++)
      if (Math.hypot(SPEAKERS[i][0] - SPEAKERS[j][0], SPEAKERS[i][1] - SPEAKERS[j][1]) < 1.5) tooClose++;
  ok(tooClose === 0, "no two ceiling speakers are on top of each other");
  const onStage = SPEAKERS.filter(
    ([sx, sy]) => sx >= STAGE.x0 && sx <= STAGE.x1 && sy >= STAGE.y0 && sy <= STAGE.y1,
  );
  ok(onStage.length === 0, "none hangs over the stage — that ceiling is the dome");

  // COVERAGE. The whole point of the speakers: the music must be audible
  // wherever a player can stand, loudest at the machine, and never so loud it
  // is the room (Josh: "make sure the sound is not incredibly loud").
  ok(musicLevelAt(JUKEBOX.x, JUKEBOX.y + 1) === 1, "the machine itself is the full near field");
  let quietest = 1;
  let where = null;
  let samples = 0;
  for (let x = 0.5; x < W; x += 0.5) {
    for (let y = 0.5; y < H; y += 0.5) {
      const lvl = musicLevelAt(x, y);
      samples++;
      if (lvl < quietest) { quietest = lvl; where = [x, y]; }
    }
  }
  ok(samples > 700, `coverage sampled across the hall (${samples} points)`);
  ok(quietest > 0.03, `nowhere on the floor is silent (quietest ${quietest.toFixed(3)} at ${where})`);
  // …and away from the machine it stays a BED, not a performance.
  const farFromJuke = musicLevelAt(30, 15);
  ok(farFromJuke < 0.5, `across the hall it's background (${farFromJuke.toFixed(3)})`);
  ok(musicLevelAt(JUKEBOX.x, JUKEBOX.y + 1) > farFromJuke * 2, "the jukebox is clearly the loudest place");
}

// GETTING UP (Josh, Oct 2026: "when sitting at any of the black jack tables and
// getting up you get stuck in between the table and the stool"): every seat in
// the hall stands you up on floor no collider overlaps, with room to walk.
{
  const { standOff, STAND_R } = await import("../../client/src/casino/standoff.ts");
  const boxes = [];
  for (const p of PLACEMENTS) {
    if (p.collider) boxes.push({ x: p.at[0], y: p.at[1], rx: p.collider[0], ry: p.collider[1] });
    for (const [dx, dy, rx, ry] of p.colliders ?? []) boxes.push({ x: p.at[0] + dx, y: p.at[1] + dy, rx, ry });
  }
  const near = (x, y) => boxes.filter((b) => Math.abs(b.x - x) < b.rx + 1.2 && Math.abs(b.y - y) < b.ry + 1.2);
  const inside = (x, y) => boxes.some((b) => Math.abs(x - b.x) < b.rx + 0.22 && Math.abs(y - b.y) < b.ry + 0.22);
  const stuckAtSeat = SEATS.filter((s) => s && inside(s.x, s.y)).length;
  const bad = [];
  let movable = 0;
  SEATS.forEach((s, i) => {
    if (!s) return;
    const p = standOff(s, near, { w: W, h: H });
    if (!p || inside(p.x, p.y)) { bad.push(i); return; }
    // and a step away from there in some direction is free too
    if ([[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]].some(([dx, dy]) => !inside(p.x + dx, p.y + dy))) movable++;
  });
  const seats = SEATS.filter(Boolean).length;
  ok(stuckAtSeat > 0, `the bug's shape is real: ${stuckAtSeat} seats sit inside a collider (that's why getting up trapped you)`);
  ok(bad.length === 0, `every seat stands you up on clear floor (${seats - bad.length}/${seats}${bad.length ? `; seats ${bad.join(", ")} found none` : ""})`);
  ok(movable === seats - bad.length, `…and from there you can step away (${movable}/${seats - bad.length})`);
  const bjSeats = BJ_TABLES.flatMap((_, t) => [0, 1, 2].flatMap((k) => [18 + t * 3 + k, 36 + t * 3 + k]));
  ok(bjSeats.every((i) => { const s = SEATS[i]; const p = standOff(s, near, { w: W, h: H }); return p && Math.hypot(p.x - s.x, p.y - s.y) <= 1.0; }),
    "at every blackjack stool you get up right behind it — no further than a cell");
  void STAND_R;
}

console.log(fails.length ? `\n${fails.length} FAILED:` : "");
for (const f of fails) console.log("  x " + f);
console.log(`\n${pass}/${pass + fails.length} casino layout asserts passed`);
process.exit(fails.length ? 1 : 0);
