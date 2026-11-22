// THE OPERATOR MAP MARKERS — one drawing for both maps (the lobby's plan and
// the in-game FIELD MAP), drawn from the server's OPERATOR VIEW
// (BrService.operatorView), which is the same shape on every level. Josh, Oct
// 2026: "as the admin i am able to fly in every map and see all monster,
// relics, objectives, and hard drives". Before this the overlay only knew
// Level 0's door and key, so the Poolrooms and Pipe Dreams showed relics and
// Entities and nothing else.
//
// The server attaches the view to admins only; nothing here is a secret the
// client is trusted to keep. Drive TEXT and relic identity beyond the name
// are still never sent.
import type { OperatorView } from "./gamenet";

export const OP_COLORS = {
  monster: "#ff3b22",
  relic: "#ffd965",
  drive: "#78beff",
  objective: "#ff9a3d",
  done: "#7CFF9E",
  body: "#d6c8ff",
} as const;

const MONSTER_NAME: Record<string, string> = { entity: "ENTITY", stalker: "STALKER", shy: "SHY GUY", gator: "ALLIGATOR", bleeder: "THE BLEEDER", grabber: "THE GRABBER", temp: "THE TEMP", moths: "THE DEATHMOTHS", listener: "THE LISTENER", deep: "THE THING BELOW", burrower: "THE BURROWER", watch: "THE NEIGHBORHOOD WATCH" };

/** Is an objective in a finished state (open, used, in)? Drawn green. */
const done = (state: string): boolean => state === "open" || state === "used" || state === "in" || state === "on";

/** Draw every marker. `S` is pixels per cell; `small` is the field map's
 *  tighter type. */
export function drawOperator(ctx: CanvasRenderingContext2D, v: OperatorView, S: number, small = false): void {
  const r = small ? 4 : 5;
  const font = (w: number) => `${w} ${small ? 9 : 10}px system-ui, sans-serif`;
  const label = (text: string, color: string, x: number, y: number) => {
    ctx.fillStyle = color;
    ctx.fillText(text, x * S + r + 4, y * S + 3);
  };

  ctx.font = font(700);
  for (const rl of v.relics) {
    ctx.fillStyle = OP_COLORS.relic;
    ctx.beginPath();
    ctx.arc(rl.x * S, rl.y * S, r, 0, Math.PI * 2);
    ctx.fill();
    label(rl.name, "#ffe9a8", rl.x, rl.y);
  }
  // Lore drives still out there — recovered ones leave this list forever.
  for (const d of v.drives) {
    ctx.fillStyle = OP_COLORS.drive;
    ctx.fillRect(d.x * S - r + 1, d.y * S - r + 1, 2 * r - 2, 2 * r - 2);
    label(`drive ${d.id}`, "#bcdcff", d.x, d.y);
  }
  // Bodies: recovery runs are part of the game. A body carrying the way on
  // (a key or a fuse) is ringed.
  for (const b of v.bodies ?? []) {
    ctx.strokeStyle = OP_COLORS.body;
    ctx.lineWidth = 2;
    const x = b.x * S;
    const y = b.y * S;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r);
    ctx.lineTo(x - r, y + r);
    ctx.stroke();
    if (b.carriesObjective) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    label(`${b.name}'s body (${b.items})`, OP_COLORS.body, b.x, b.y);
  }
  // Objectives: keys, doors, the hatch, fuses, the fuse box, the keycard — a carried key or
  // fuse is drawn where its carrier stands, one on a body where the body
  // lies (the server's view says which).
  ctx.font = font(800);
  for (const o of v.objectives) {
    const finished = done(o.state);
    const color = finished ? OP_COLORS.done : OP_COLORS.objective;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    if (o.kind === "key" || o.kind === "fuse" || o.kind === "keycard" || o.kind === "boilerkey" || o.kind === "handwheel" || o.kind === "helmet" || o.kind === "rope" || o.kind === "housekey") {
      ctx.beginPath();
      ctx.arc(o.x * S, o.y * S, r + 1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeRect(o.x * S - r - 1, o.y * S - r - 1, 2 * r + 2, 2 * r + 2);
    }
    label(`${o.label} — ${o.state}`, color, o.x, o.y);
  }
  // Monsters last, on top.
  for (const m of v.monsters) {
    ctx.fillStyle = OP_COLORS.monster;
    ctx.beginPath();
    ctx.arc(m.x * S, m.y * S, r + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 60, 30, 0.6)";
    ctx.beginPath();
    ctx.arc(m.x * S, m.y * S, r + 5, 0, Math.PI * 2);
    ctx.stroke();
    const name = MONSTER_NAME[m.kind] ?? m.kind.toUpperCase();
    label(m.mode === "chase" ? `${name} — HUNTING` : name, "#ff8c78", m.x, m.y);
  }
}

/** The legend's counts. */
export function operatorCounts(v: OperatorView): { monsters: number; relics: number; drives: number; objectives: number; bodies: number } {
  return { monsters: v.monsters.length, relics: v.relics.length, drives: v.drives.length, objectives: v.objectives.length, bodies: (v.bodies ?? []).length };
}
