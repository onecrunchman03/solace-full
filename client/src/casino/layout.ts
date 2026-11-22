// THE FLOOR — THE BOULEVARD (layout-boulevard.ts, 36 × 22, Classic Vegas),
// pure data in the vocabulary of layout-kit.ts. Every reader imports from
// HERE. The classic hall it replaced (31 × 13) was retired in Oct 2026 —
// Josh: "i like the new casino i dont care for the old one anymore" — and
// lives in git history before that.
//
// Node 24 strips this file's types, so the harnesses import it directly.

export * from "./layout-boulevard.ts";

export {
  type Placement, type Station, type Seat, type BjTable, type WallSign, type WallFixture, type HallShell,
  BJ_SCALE, bjStool, bjStoolLong, LENDER_MODEL, LENDER_SCALE, LENDER_LIFT, THROW_REACH, THROW_POWER,
} from "./layout-kit.ts";
