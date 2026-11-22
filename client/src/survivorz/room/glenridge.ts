// SOLACE SURVIVORZ — GLENRIDGE HALL in the look test (docs/survivorz/GLENRIDGE.md, "The game side").
// The house is four baked zones (scripts/survivorz/glenridge/game-export.py): the ground floor, the upper floor,
// the basement and the outside. They are in the LOOK TEST only: the show still plays the bunker. A zone here has
// no props, fixtures or cast of its own yet (its furniture and lamps are in its GLB); what it carries is where to
// stand to look at it. Coordinates are the page's: x east, y up, z south (the build's y, negated).
import type { Layout, Shot } from "./lobby";
import LAY from "./glenridge-layout.json";      // the lamps and room outlines, written by scripts/survivorz/glenridge/build.py

type Lay = Record<string, { fixtures: Layout["fixtures"]; roomPolys: Record<string, number[][]> }>;
const zone = (id: string, shots: Record<string, Shot>): Layout => ({
  props: [], fixtures: (LAY as unknown as Lay)[id].fixtures, roomPolys: (LAY as unknown as Lay)[id].roomPolys, decals: [], cast: [], roomRects: {}, kit: {}, shots,
  catcher: { at: [0, -900], size: [1, 1] },      // no shadow spots here: the catcher stands out of the way
});

export const GLEN_ZONES = {
  "glen-ground": { label: "Glenridge Hall, ground floor", area: "roomglenground", layout: zone("glen-ground", {
    hall: { at: [0, 1.2, -3.9], look: [0, 1.95, -13.5], label: "Great room" },
    gallery: { at: [9.6, 1.5, -1.25], look: [-7, 1.55, -1.6], label: "Long gallery" },
    stair: { at: [-2.5, 1.55, 0.6], look: [-6.6, 2.1, 3.6], label: "Stair hall" },
    library: { at: [-7.6, 1.5, -6.1], look: [-15, 1.4, -6.1], label: "Library" },
    dining: { at: [10.1, 1.55, -3.6], look: [9.4, 1.2, -9], label: "Dining room" },
    kitchen: { at: [17.83, 1.55, 6.33], look: [26.03, 1.15, 5.63], label: "Kitchen" },
  }) },
  "glen-upper": { label: "Glenridge Hall, upper floor", area: "roomglenupper", layout: zone("glen-upper", {
    gallery: { at: [9.0, 5.0, -1.5], look: [-7, 4.9, -1.5], label: "Upper gallery" },
    twin: { at: [10.8, 4.95, -3.5], look: [8.2, 4.4, -10.8], label: "Twin bedroom" },
    stefan: { at: [-24.4, 5.15, -5.4], look: [-17, 4.7, -9.1], label: "Stefan's bedroom" },
  }) },
  "glen-basement": { label: "Glenridge Hall, basement", area: "roomglenbasement", layout: zone("glen-basement", {
    furnace: { at: [21.5, -1.5, 10.15], look: [22, -2, 3.86], label: "Furnace room" },
    cell: { at: [25.53, -1.5, 8.67], look: [27.58, -1.9, 6.62], label: "The cell" },
  }) },
  "glen-outside": { label: "Glenridge Hall, outside", area: "roomglenoutside", layout: zone("glen-outside", {
    front: { at: [6, 1.6, 30], look: [0, 4, 0], label: "The front" },
    west: { at: [-45, -1.55, -8.6], look: [-26, 3, -9.4], label: "West garden steps" },
  }) },
} as const;
