// SOLACE SURVIVORZ — THE BUNKER: the floor plan drawing's data (docs/survivorz/BUNKER.md).
//
// The rooms and doors come from the map itself (src/survivorz/bunker-map.ts, compiled to dist), so the
// drawing and the game can't disagree; only what the drawing adds lives here: the windows and the
// serving hatch (not doors), where the marks are drawn, and where the horde stands.
//
//   npm run build && node scripts/survivorz/bunker/floorplan.mjs  → docs/survivorz/bunker-floorplan.svg + .png
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { BUNKER } = require(path.join(ROOT, "dist/survivorz/bunker-map.js"));
const { doorPlacement } = require(path.join(ROOT, "dist/survivorz/facility.js"));

/** the drawing's colour for a room */
const KIND = { tunnel: "outside", vestibule: "entrance", decon: "entrance", equipment: "utility", armory: "locked", radio: "locked",
  security: "command", qm: "command", barracks: "living", "private-a": "living", "private-b": "living", common: "living",
  infirmary: "living", mess: "living", kitchen: "living" };
export const ROOMS = BUNKER.rooms.map((r) => ({
  id: r.id, name: r.id.startsWith("pass-") ? "" : r.name, ...r.rect, start: !!r.start, extra: !!r.extra,
  kind: r.kind === "corridor" && r.id !== "decon" ? "hall" : KIND[r.id] ?? "utility",
}));

/** a door on a wall: (x, y) its middle, len along the wall, v = on a vertical wall.
 *  kind: open (a steel door) · arch · keycard (the armory) · keypad (the radio room) · blast ·
 *  and the drawing's own: hatch (the kitchen's serving hatch) · glass (the security office's window) */
export const DOORS = [
  ...BUNKER.doors.map((d) => {
    const pl = doorPlacement(BUNKER, d.id);
    const kind = d.kind === "vault" ? "blast" : d.kind === "doorway" ? "arch" : d.kind === "keycard" ? (d.tier === 1 ? "keycard" : "keypad") : "open";
    return { x: pl.centre[0], y: pl.centre[2], len: kind === "blast" ? 4.4 : Math.max(1.6, pl.size[0]), v: Math.abs(pl.normal[0]) > 0.5, kind };
  }),
  { x: 37.5, y: 14, len: 2.4, kind: "glass" },
  { x: 42.5, y: 14, len: 2.4, kind: "glass" },
  { x: 73, y: 28, len: 4, kind: "hatch" },
];

/** what lies where at the start (BUNKER.md): fixed, or one of several spots picked each run */
export const MARKS = [
  { x: 44, y: 55.3, kind: "wheel", label: "Crank wheel" },
  { x: 37, y: 11.6, kind: "keycard", label: "Keycard (desk)" },
  { x: 58, y: 26.6, kind: "part", label: "Radio part?" },
  { x: 78, y: 46, kind: "part", label: "Radio part?" },
  { x: 43, y: 11.6, kind: "note", label: "Code note?" },
  { x: 58, y: 50.7, kind: "note", label: "Code note?" },
  { x: 12.6, y: 47, kind: "note", label: "Code note?" },
  { x: 56, y: 6, kind: "radio", label: "Radio set" },
];

/** where the 20 walkers stand at the start: thick at the entrance and the common room, thin in the wings */
export const HORDE = [
  { id: "tunnel", share: "dense" }, { id: "vestibule", share: "dense" }, { id: "decon", share: "dense" },
  { id: "common", share: "dense" }, { id: "hall-n", share: "some" }, { id: "hall-w", share: "some" },
  { id: "hall-e", share: "some" }, { id: "mess", share: "few" }, { id: "barracks", share: "few" },
];
