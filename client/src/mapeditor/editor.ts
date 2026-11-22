// THE MAP EDITOR — Admin Panel → Map editor (Josh, Sep 2026: "I would the
// editor to be available in the admin panel so I can design and redesigns
// maps … track all props I have and place them in the editor so I can choose
// placement … make sure the editor is easy to use for both you … and me").
//
// A level is a ROOM LIBRARY: hand-drawn rooms the generator arranges, the way
// DunGen builds Lethal Company's facility. This page paints those rooms — the
// text layers described in src/backrooms/tiles.ts — plus their PROPS
// from the kit (src/backrooms/kit.ts), with the same checker the generator
// uses (lintTile) running on every stroke. Work saves itself as a DRAFT on
// the server; nothing players walk changes until Publish, which the server
// refuses unless every room passes and the level keeps its rules.
//
// Plain DOM + canvas on purpose (the page is a paint program: it redraws a
// grid on every pointer move, which is a canvas's job, not a component
// tree's). MapEditor.svelte mounts it and tears it down; everything it owns
// lives inside `root` and is removed by the function mountMapEditor returns.
//
// FOR CLAUDE, reading this later: the room format is tiles.ts, each level's
// dialect pipes-tiles.ts / pools-tiles.ts, what the editor draws differently
// per level levels.ts, the prop vocabulary kit.ts, the server half
// routes/mapeditor.ts + backrooms/designs.ts.
// A new layer = an entry in LAYERS, a branch in paintAt / paletteHTML, and
// (if it draws) a pass in drawGrid.

import "./editor.css";
import { type TileDef, type Tile, type Side, SIDE_CH, encodeH, thinWall } from "../../../src/backrooms/tiles";
import { levelKit } from "./levels";
import { guideSections } from "./guide";
import { type KitPlace, type KitProp, KIT, KIT_ALL, KIT_BASE, SIGN_MAX, SHAPE_MIN, SHAPE_MAX, kitVariant, kitCovers, kitYaw, kitBlocks, kitSize } from "../../../src/backrooms/kit";
import { ceilingWithLid } from "../../../src/backrooms/ceiling";
import { type StairSpec, STAIR_STEPS_DEFAULT, STAIR_STEPS_MIN, STAIR_STEPS_MAX } from "../../../src/backrooms/stairs";
import { type Clip, cutClip, turnClip, flipClip, stampClip, clearBox } from "../../../src/backrooms/clip";
import { type MarkPlace, type MarkKind, MARKS, MARK, CREATURE_USUAL } from "../../../src/backrooms/marks";
import { api, ApiError, type MapEditorState } from "../lib/api";
import { createPreview3D } from "./preview3d";
import { SURFACES, ROOM_SOUNDS, allSurfaces, levelSurfaces, setCustomSurfaces, type SurfaceKind, type LookSpec } from "../../../src/backrooms/surfaces";
import { lobbyLookOf } from "../backrooms/world";
import { decodeMap, drawMap, type MapData, type Overlay } from "./mapview";
import { COST_BUDGET, COST_SQUARE, costOf, costLoad, heaviestPatch, levelPatchMax, squareCosts } from "../../../src/backrooms/cost";

export interface EditorHost {
  ask: (o: { title: string; body?: string; confirm?: string; danger?: boolean }) => Promise<boolean>;
  onClose: () => void;
  /** A test play has started: go and walk it. */
  onPlaytest?: (level: number) => void;
  /** Open another level in the editor (the frame remounts it). */
  onLevel?: (level: number) => void;
}

type Layer = "map" | "height" | "stair" | "rooms" | "walls" | "furn" | "props" | "doors" | "game";
type GridKey = "map" | "height" | "ceiling" | "stair" | "rooms" | "walls" | "furn";

const LAYERS: { id: Layer; label: string; help: string }[] = [
  { id: "map", label: "Floor", help: "Paint what each cell is: floor of a type, solid concrete, or not part of the room. Right-click erases." },
  { id: "height", label: "Heights", help: "" /* the level kit writes this one */ },
  { id: "stair", label: "Stairs", help: "Drag from the top of a stair to the bottom: each cell steps down one, with the arrow pointing up. Or paint arrows by hand." },
  { id: "rooms", label: "Rooms", help: "Split the tile into rooms: a wall goes between two labels unless you put an inner door there (Doors layer)." },
  { id: "walls", label: "Walls", help: "Thin walls inside a room — drywall, partitions, a maze. Click or drag along the edge between two cells to put a wall up; right-click takes it down." },
  { id: "furn", label: "Furniture", help: "The level's built-in fittings. Wall pieces find the wall behind them. Machines stamp their whole footprint (R turns it). Shift-click a piece to turn it." },
  { id: "props", label: "Props", help: "Pick a prop below and click in the room to place it. Click a placed prop to select it: drag to move · R turns 90° (Shift+R 15°) · Delete removes · [ ] change its look · PgUp/PgDn raise it · arrows nudge." },
  { id: "doors", label: "Doors", help: "Click the edge of a cell. On the room's outline it makes a doorway the generator joins through; between two rooms it makes an inner door." },
  { id: "game", label: "Game", help: "Creatures and where relics and lore drives lie. Pick one below and click in the room to place it; click a placed one to change its settings. Drag to move · Delete removes." },
];

/** The CLIPBOARD outlives the room it was copied from (paste into another
 *  room) but not the level: floor letters mean different things per level. */
let clipboard: { level: number; clip: Clip } | null = null;

const ROOM_TINT = ["#ffffff", "#ff9d5c", "#5cc8ff", "#9dff5c", "#ff5cc8", "#ffe15c", "#5cffd6", "#c89dff", "#ff5c5c", "#5c7dff"];
/** How a prop is drawn on the grid, by how it stands. */
const PROP_FILL = { solid: "rgba(255,150,90,0.55)", walk: "rgba(236,214,130,0.5)", wall: "rgba(190,150,255,0.6)", ceiling: "rgba(130,210,255,0.45)" };
const CELL_M = 2;
const STEP_M = 0.5;
const SNAPS: [number, string][] = [
  [1, "whole cells"],
  [0.5, "half cells"],
  [0.25, "quarter cells"],
  [0, "free"],
];

const TEMPLATE = `
<div class="me">
  <header>
    <button class="back" data-a="close">← Admin Panel</button>
    <h1>Map editor</h1>
    <select id="lvl" class="lvl" title="Which level to edit"><option value="0">The Lobby (Level 0)</option><option value="1">The Poolrooms</option><option value="2">Pipe Dreams</option><option value="3">The Electrical Station</option><option value="4">The Abandoned Office</option><option value="5">The Terror Hotel</option><option value="6">Lights Out</option><option value="7">Thalassophobia</option><option value="8">The Cave System</option><option value="9">The Suburbs</option></select>
    <span id="live" class="live"></span>
    <span class="grow"></span>
    <span id="savestate" class="savestate"></span>
    <button id="dropdraft" class="ghost" hidden>Discard draft</button>
    <label class="seed">seed <input id="seed" type="number" /></label>
    <button id="seeds" title="Build the level with several seeds side by side and pick the one you like">Try seeds</button>
    <button id="gen">See the whole level</button>
    <button id="hist">History</button>
    <button id="test" title="Walk the draft in the real game, alone, with its creatures">Test play</button>
    <button id="guide" title="How to make and update maps">Guide</button>
    <button id="pub" class="primary">Publish…</button>
  </header>
  <div id="status" class="statusbar">Loading…</div>
  <aside class="left">
    <input id="filter" placeholder="Find a room…" />
    <label class="chk onlybad"><input type="checkbox" id="onlybad"> only rooms with problems</label>
    <div class="tools">
      <button id="new">New room</button>
      <button id="dup">Duplicate</button>
      <button id="delete">Delete</button>
    </div>
    <div id="list"></div>
  </aside>
  <main>
    <div class="titlebar"><b id="title"></b><span class="zoom"><button data-zoom="-1" title="Zoom out (Ctrl+wheel)">−</button><span id="zoomv">fit</span><button data-zoom="1" title="Zoom in (Ctrl+wheel)">+</button><button data-zoom="0">fit</button></span></div>
    <div id="layers" class="layers"></div>
    <div id="layerhelp" class="layerhelp"></div>
    <div id="gridbox" class="gridbox"><canvas id="grid"></canvas></div>
    <div id="palette" class="palette"></div>
  </main>
  <aside class="right">
    <div id="insp"></div>
    <div class="sec">Checks</div>
    <div id="lint" class="lint"></div>
    <div class="sec">In 3D (drag to turn, scroll to zoom)</div>
    <div id="preview" class="preview"></div>
  </aside>
  <div id="mapmodal" class="modal" hidden>
    <div class="mapwrap"><canvas id="mapcv"></canvas></div>
    <div class="mapside">
      <button id="mapclose">Back to the editor (Esc)</button>
      <div id="maphover" class="maphover"></div>
      <div id="mapcmp"></div>
      <div id="mapover" class="mapover"></div>
      <div id="mapstats"></div>
      <p class="hint" id="maphint"></p>
    </div>
  </div>
  <div id="seedmodal" class="modal narrow" hidden>
    <div class="card seedcard">
      <div class="guidehead"><h2>Try seeds</h2><button id="seedclose">Close (Esc)</button></div>
      <p class="hint">The same rooms, arranged by different seeds. The first one is the seed you have now. Pick the one you like; nothing goes live until you publish.</p>
      <div id="seedgrid" class="seedgrid"></div>
      <div class="tools"><button id="seedmore">Try 6 more</button></div>
    </div>
  </div>
  <div id="histmodal" class="modal narrow" hidden>
    <div class="card">
      <h2>Versions of this level</h2>
      <p class="hint">Opening an old version copies it into your draft — nothing changes for players until you publish.</p>
      <div id="histlist"></div>
      <button id="histclose">Close</button>
    </div>
  </div>
  <div id="guidemodal" class="modal narrow" hidden>
    <div class="card guide">
      <div class="guidehead"><h2>How to use the map editor</h2><button id="guideclose">Close (Esc)</button></div>
      <div class="guidebody"><nav id="guidenav"></nav><div id="guidetext" class="guidetext"></div></div>
    </div>
  </div>
  <div id="texmodal" class="modal narrow" hidden>
    <div class="card texcard">
      <h2>Add a texture</h2>
      <p class="hint">A photo of a wall, a floor or a ceiling. It joins the list every room on every level can pick from. Use a square picture that repeats without a seam.</p>
      <label class="row col">picture <input id="texfile" type="file" accept="image/png,image/jpeg,image/webp"></label>
      <div class="texprev"><img id="teximg" alt="" hidden></div>
      <label class="row">it's a <select id="texkind"><option value="wall">wall</option><option value="floor">floor</option><option value="ceil">ceiling</option></select></label>
      <label class="row">name <input id="texname" maxlength="40" placeholder="e.g. Red brick"></label>
      <label class="row">one repeat is <input id="texsize" type="number" min="0.25" max="20" step="0.25" value="2"> metres across</label>
      <label class="chk" id="texlevelrow"><input type="checkbox" id="texlevel"> it has lines running across it (keep them level from wall to wall)</label>
      <p class="errs" id="texerr" hidden></p>
      <div class="tools"><button id="texcancel">Cancel</button><button id="texgo" class="primary">Add it</button></div>
    </div>
  </div>
  <div id="pubmodal" class="modal narrow" hidden>
    <div class="card" id="pubcard"></div>
  </div>
</div>`;

export function mountMapEditor(root: HTMLElement, host: EditorHost, level = 2): () => void {
  root.innerHTML = TEMPLATE;
  // everything this level draws its own way (levels.ts)
  const K = levelKit(level);
  const ZONE_COLOR = K.zoneColor;
  const GROUP_COLOR = K.pieceColor;
  const GLYPHS = K.dia.glyphs;
  const lintTile = K.lint;
  const isBlock = (k: string | undefined): boolean => !!k && !!K.blocks(k);
  const $ = <T extends HTMLElement>(q: string): T => root.querySelector(q) as T;
  const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const cleanups: (() => void)[] = [];
  const on = <K extends keyof WindowEventMap>(el: Window | HTMLElement, ev: K, fn: (e: WindowEventMap[K]) => void): void => {
    el.addEventListener(ev, fn as EventListener);
    cleanups.push(() => el.removeEventListener(ev, fn as EventListener));
  };

  // ---- state ----------------------------------------------------------------------
  let state: MapEditorState | null = null;
  let lib: TileDef[] = [];
  let seed = 0;
  /** What the server holds (the draft, or the live map when there's none). */
  let savedJson = "";
  let hasDraft = false;
  let savedAt = 0;
  let saving = false;
  let saveTimer = 0;
  let sel = 0;
  let layer: Layer = "map";
  let brush = ".";
  let doorW = 1;
  let rot = 0;
  let filter = "";
  let hover: { x: number; y: number; side: number; fx: number; fy: number } | null = null;
  let painting = false;
  let stairFrom: { x: number; y: number } | null = null;
  let lastPaint = "";
  const undo = new Map<string, string[]>();
  const redo = new Map<string, string[]>();
  let movingHistory = false;
  /** How a click paints on the cell layers: one cell at a time, a dragged
   *  rectangle, or a flood of the same-looking cells (see TOOL_LAYERS). */
  let tool: "brush" | "box" | "fill" | "select" | "measure" = "brush";
  // THE MEASURE TOOL: a line between two points, in metres (cells snap to halves)
  let measure: { a: { x: number; y: number }; b: { x: number; y: number }; live: boolean } | null = null;
  /** A spot the checks pointed at, ringed for a moment. */
  let flash: { x: number; y: number; until: number } | null = null;
  /** The room list shows only rooms with problems. */
  let onlyBad = false;
  /** How many rooms have problems (counted by the room list's last draw). */
  let badCount = 0;
  // THE SELECT TOOL: a boxed rectangle of the room (every layer at once), and
  // a FLOATING piece — lifted to move, or pasted — that follows the pointer
  let selRect: { x0: number; y0: number; x1: number; y1: number } | null = null;
  let selFrom: { x: number; y: number } | null = null;
  let floating: { clip: Clip; x: number; y: number; gx: number; gy: number; drag: boolean } | null = null;
  // THE GAME LAYER: markers (marks.ts)
  let markBrush: MarkKind | null = null;
  let markSel = -1;
  let markDrag: { ox: number; oy: number } | null = null;
  let boxFrom: { x: number; y: number; erase: boolean } | null = null;
  let current: { tile: Tile; errors: string[]; warnings: string[] } | null = null;
  let deleteArmed = false;
  let map: MapData | null = null;
  let mapHover = -1;
  let mapPick = -1;
  /** The overlay on the whole-level view, and what it needs. */
  let overlayKind: "none" | "deaths" | "explored" | "distance" | "unreach" | "weight" = "none";
  /** "Where is it used": the room whose copies the whole-level view shows. */
  let usesTile: string | null = null;
  /** The library + seed the whole-level `map` was built from (so a "where is
   *  it used" doesn't rebuild a level that hasn't changed). */
  let builtFor = "";
  let heat: { fingerprint: string; size: number; deaths: { x: number; y: number; cause: string }[]; explored: Uint8Array } | null = null;
  let builtFp = "";
  /** Comparing a version with the draft: both maps, and which one is shown. */
  let compare: { version: number; before: MapData; after: MapData; changed: Set<string>; added: Set<string>; showing: "before" | "after"; sameMap: boolean; lines: string } | null = null;
  // props
  let propBrush: { p: string; v: number } | null = null;
  let propSel = -1;
  let propDrag: { ox: number; oy: number } | null = null;
  let snap = 0.25;
  let propQuery = "";
  let propSection = "";
  let propAll = false;

  const T = (): TileDef => lib[sel];
  // the level switcher: the draft is saved first, then the frame remounts
  {
    const pickLevel = $<HTMLSelectElement>("#lvl");
    pickLevel.value = String(level);
    pickLevel.disabled = !host.onLevel;
    pickLevel.onchange = async () => {
      const next = Number(pickLevel.value);
      if (next === level || !host.onLevel) return;
      pickLevel.disabled = true;
      await saveDraft();
      if (dirty()) {
        status("The draft didn't save — stay here until it has, or your edits would be lost.");
        pickLevel.value = String(level);
        pickLevel.disabled = false;
        return;
      }
      host.onLevel(next);
    };
  }

  // ---- the server -----------------------------------------------------------------------
  function describeError(e: unknown): string {
    if (e instanceof ApiError) {
      const d = e.data as Record<string, unknown> | undefined;
      if (e.code === "rooms_have_problems") {
        const rooms = (d?.rooms as { id: string }[]) ?? [];
        return `${rooms.length} room${rooms.length > 1 ? "s" : ""} still ha${rooms.length > 1 ? "ve" : "s"} problems: ${rooms.slice(0, 4).map((r) => r.id).join(", ")}`;
      }
      if (e.code === "map_has_problems") return `The level breaks its rules: ${((d?.problems as string[]) ?? []).join("; ")}`;
      if (e.code === "players_inside") return `${d?.inside ?? "Somebody"} ${d?.inside === 1 ? "player is" : "players are"} on this level right now — publish once they've left.`;
      if (e.code === "generator_refused") return `The generator can't use this library: ${String(d?.detail ?? "")}`;
      if (e.code === "bad_library") return `That isn't a valid library: ${String(d?.detail ?? "")}`;
      return e.code;
    }
    return (e as Error).message ?? String(e);
  }

  async function load(): Promise<void> {
    try {
      state = await api.mapEditor(level);
    } catch (e) {
      status(`Couldn't open the editor: ${describeError(e)}`);
      return;
    }
    lib = (state.tiles as TileDef[]).map(norm);
    seed = state.seed;
    setCustomSurfaces(state.surfaces ?? []);
    savedJson = JSON.stringify({ lib, seed });
    hasDraft = !!state.draft;
    savedAt = state.draft?.savedAt ?? 0;
    $<HTMLInputElement>("#seed").value = String(seed);
    showLive();
    showTestButton();
    status(
      hasDraft
        ? `Your draft is open (${lib.length} rooms). Players are still on the live map until you publish.`
        : `This is the live map (${lib.length} rooms). Edits save as a draft; players see nothing until you publish.`,
    );
    refresh();
  }

  function showLive(): void {
    if (!state) return;
    const v = state.live.version;
    $("#live").innerHTML = `live: <b>${v ? `version ${v}` : "the original map"}</b>${state.inside ? ` · <span class="warn">${state.inside} inside</span>` : ""}`;
  }

  const dirty = (): boolean => JSON.stringify({ lib, seed }) !== savedJson;

  function markDirty(): void {
    // a real edit forks the history: what was undone is gone for good (an
    // undo or redo marks the draft dirty too, and must keep the redo stack)
    const cur = lib[sel];
    if (!movingHistory && cur) redo.delete(cur.id);
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void saveDraft(), 1500);
    showSaveState();
  }

  async function saveDraft(): Promise<void> {
    clearTimeout(saveTimer);
    if (!dirty() || saving) return;
    saving = true;
    showSaveState();
    const sent = JSON.stringify({ lib, seed });
    try {
      const r = await api.mapSaveDraft(level, lib, seed);
      savedJson = sent;
      hasDraft = true;
      savedAt = r.savedAt;
    } catch (e) {
      status(`The draft didn't save: ${describeError(e)}. Your edits are still here — it will try again.`);
      saveTimer = window.setTimeout(() => void saveDraft(), 5000);
    } finally {
      saving = false;
      showSaveState();
      $("#list").innerHTML = listHTML();
    }
  }

  function showSaveState(): void {
    const el = $("#savestate");
    const at = savedAt ? new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
    if (saving) el.textContent = "Saving draft…";
    else if (dirty()) el.textContent = "Unsaved changes…";
    else if (hasDraft) el.textContent = `Draft saved ${at}`;
    else el.textContent = "No draft — you're looking at the live map";
    $("#dropdraft").hidden = !hasDraft;
  }

  // ---- tile helpers -------------------------------------------------------------------
  function norm(t: TileDef): TileDef {
    const w = Math.max(1, ...t.map.map((r) => r.length));
    const pad = (rows: string[] | undefined, fill: string): string[] | undefined => rows && rows.map((r) => (r + fill.repeat(w)).slice(0, w));
    return {
      ...t,
      map: pad(t.map, " ")!,
      height: pad(t.height, "."),
      stair: pad(t.stair, "."),
      rooms: pad(t.rooms, "."),
      furn: pad(t.furn, "."),
      doors: t.doors ?? [],
    };
  }
  const dims = (t: TileDef): { w: number; h: number } => ({ w: Math.max(0, ...t.map.map((r) => r.length)), h: t.map.length });
  function layerRows(t: TileDef, key: GridKey): string[] {
    if (!t[key]) {
      const { w, h } = dims(t);
      (t as unknown as Record<string, string[]>)[key] = Array.from({ length: h }, () => ".".repeat(w));
    }
    return t[key]!;
  }
  const chAt = (t: TileDef, key: GridKey, x: number, y: number): string => (t[key]?.[y] ?? "")[x] ?? (key === "map" ? " " : ".");
  function setCh(t: TileDef, key: GridKey, x: number, y: number, ch: string): void {
    const rows = layerRows(t, key);
    const r = rows[y];
    rows[y] = r.slice(0, x) + ch + r.slice(x + 1);
  }
  function snapshot(): void {
    const t = T();
    const st = undo.get(t.id) ?? [];
    const s = JSON.stringify(t);
    if (st[st.length - 1] !== s) st.push(s);
    if (st.length > 80) st.shift();
    undo.set(t.id, st);
  }
  function doUndo(): void {
    const t = T();
    const st = undo.get(t.id);
    if (!st || !st.length) return;
    const now = JSON.stringify(t);
    const prev = st.pop()!;
    if (prev === now && !st.length) return;
    const back = prev === now ? st.pop()! : prev;
    const rs = redo.get(t.id) ?? [];
    rs.push(now);
    redo.set(t.id, rs);
    lib[sel] = JSON.parse(back);
    propSel = Math.min(propSel, (T().props?.length ?? 0) - 1);
    markSel = Math.min(markSel, (T().marks?.length ?? 0) - 1);
    selRect = null;
    movingHistory = true;
    markDirty();
    movingHistory = false;
    refresh();
  }
  function doRedo(): void {
    const t = T();
    const rs = redo.get(t.id);
    if (!rs || !rs.length) return;
    const st = undo.get(t.id) ?? [];
    st.push(JSON.stringify(t));
    undo.set(t.id, st);
    lib[sel] = JSON.parse(rs.pop()!);
    propSel = Math.min(propSel, (T().props?.length ?? 0) - 1);
    markSel = Math.min(markSel, (T().marks?.length ?? 0) - 1);
    selRect = null;
    movingHistory = true;
    markDirty();
    movingHistory = false;
    refresh();
  }
  const inTile = (t: TileDef, x: number, y: number): boolean => {
    const { w, h } = dims(t);
    return x >= 0 && y >= 0 && x < w && y < h && chAt(t, "map", x, y) !== " ";
  };
  const labAt = (t: TileDef, x: number, y: number): string => {
    const c = chAt(t, "rooms", x, y);
    return c === "." || c === " " ? "1" : c;
  };
  function lanesOf(d: [number, number, string, number]): [number, number][] {
    const s = SIDE_CH.indexOf(d[2]);
    const lx = s === 0 || s === 2 ? 1 : 0;
    return Array.from({ length: d[3] }, (_, k) => [d[0] + lx * k, d[1] + (1 - lx) * k]);
  }
  function decodeH(ch: string): number {
    if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
    if (ch >= "A" && ch <= "C") return 10 + ch.charCodeAt(0) - 65;
    if (ch >= "a" && ch <= "l") return -(1 + ch.charCodeAt(0) - 97);
    return 0;
  }
  /** The measure tool's reading: how far, how far each way, and how far up
   *  or down the floor goes between the two ends. */
  function measureText(t: TileDef, a: { x: number; y: number }, b: { x: number; y: number }): string {
    const m = (v: number): string => `${Math.round(v * 10) / 10} m`;
    const dx = Math.abs(b.x - a.x) * CELL_M;
    const dy = Math.abs(b.y - a.y) * CELL_M;
    const floorAt = (p: { x: number; y: number }): number => {
      const x = Math.min(Math.floor(p.x), dims(t).w - 1);
      const y = Math.min(Math.floor(p.y), dims(t).h - 1);
      return inTile(t, x, y) ? decodeH(chAt(t, "height", x, y)) : 0;
    };
    const up = (floorAt(b) - floorAt(a)) * STEP_M;
    const parts = [m(Math.hypot(dx, dy))];
    if (dx && dy) parts.push(`${m(dx)} × ${m(dy)}`);
    if (up) parts.push(`${m(Math.abs(up))} ${up > 0 ? "up" : "down"}`);
    return parts.join(" · ");
  }
  const typeOf = (t: TileDef, x: number, y: number): string => {
    const m = chAt(t, "map", x, y);
    return m === "#" || m === "." || m === " " ? t.type : (K.dia.zones[m] ?? t.type);
  };
  /** Metres from the floor of (x,y) to its ceiling — what a ceiling prop hangs from. */
  const headroom = (t: TileDef, x: number, y: number): number => {
    const f = decodeH(chAt(t, "height", x, y)) * STEP_M;
    const ty = typeOf(t, x, y);
    const lc = chAt(t, "ceiling", x, y);
    if (level === 1 || lc === "." || lc === " ") return K.headroom(ty, f);
    return ceilingWithLid((fm) => fm + K.headroom(ty, fm), f, decodeH(lc) * STEP_M) - f;
  };
  /** THE HEIGHTS TOOL'S CEILING (Josh, Oct 2026: "it just the ceiling when i
   *  only want to drop the floor"). "floor": a new height moves the floor
   *  ALONE — the cell holds the ceiling it had (tiles.ts `ceiling`), so a
   *  dropped floor is a sunken pit under the room's own ceiling. "both": the
   *  old way, the ceiling rides the floor. Remembered on this browser. */
  let heightMode: "floor" | "both" = (() => {
    try {
      return localStorage.getItem("solace_me_heightmode") === "both" ? "both" : "floor";
    } catch {
      return "floor";
    }
  })();

  // ---- painting -------------------------------------------------------------------------
  /** The layers the Box and Fill tools work on (Box also draws thin walls,
   *  as the rectangle's outline). */
  const TOOL_LAYERS: readonly Layer[] = ["map", "height", "rooms", "walls"];
  const FILL_LAYERS: readonly Layer[] = ["map", "height", "rooms"];
  const eraseCh = (l: Layer): string => (l === "map" ? " " : l === "height" ? "0" : ".");
  /** The floor height most of a room (one label of the Rooms layer) stands
   *  on — where its ceiling belongs. Measured once at the start of a stroke,
   *  box or fill (and remembered until the next), so painting a big area
   *  can't move the answer half way through. */
  const levelMemo = new Map<string, number>();
  function roomLevel(t: TileDef, x: number, y: number): number {
    const lab = labAt(t, x, y);
    const hit = levelMemo.get(lab);
    if (hit !== undefined) return hit;
    const { w, h } = dims(t);
    const count = new Map<number, number>();
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const m = chAt(t, "map", xx, yy);
        if (m === " " || m === "#" || labAt(t, xx, yy) !== lab) continue;
        const v = decodeH(chAt(t, "height", xx, yy));
        count.set(v, (count.get(v) ?? 0) + 1);
      }
    }
    let best = 0;
    let n = -1;
    // the most common height; a tie goes to the higher floor (a room's floor
    // is its main level, its dips are the exception)
    for (const [v, c] of count) if (c > n || (c === n && v > best)) [best, n] = [v, c];
    levelMemo.set(lab, best);
    return best;
  }
  /** Write one cell on a cell layer the way the brush does. */
  function putCell(t: TileDef, x: number, y: number, ch: string): void {
    if (layer === "map") {
      setCh(t, "map", x, y, ch);
      if (ch === " " || ch === "#") {
        if (t.furn) setCh(t, "furn", x, y, ".");
        if (t.stair) setCh(t, "stair", x, y, ".");
      }
    } else if (layer === "height") {
      if (!inTile(t, x, y)) return;
      const held = chAt(t, "ceiling", x, y);
      const heldNow = held !== "." && held !== " ";
      if (heightMode === "floor") {
        // keep the ceiling at the ROOM's own height — the floor most of the
        // room stands on — not this cell's last floor. Pinning to the cell's
        // old floor left every dip drawn before the fix with its sunk ceiling,
        // so lowering it further still read as the ceiling coming down with it
        // (Josh, Oct 2026: "im still seing … the celling also sinks down").
        // Re-painting such a dip in this mode lifts its ceiling back up.
        const pin = encodeH(roomLevel(t, x, y));
        const next = decodeH(pin) === decodeH(ch) ? "." : pin;
        if (next !== "." || t.ceiling) setCh(t, "ceiling", x, y, next);
      } else if (heldNow) {
        setCh(t, "ceiling", x, y, ".");
      }
      setCh(t, "height", x, y, ch);
      // a ceiling layer holding nothing is no layer (the library stores none)
      if (t.ceiling && t.ceiling.every((r) => /^[. ]*$/.test(r))) delete t.ceiling;
    } else if (layer === "rooms") {
      if (inTile(t, x, y)) setCh(t, layer, x, y, ch);
    }
  }
  /** The Box tool: a filled rectangle, or on the Walls layer its outline. */
  function applyBox(a: { x: number; y: number }, b: { x: number; y: number }, erase: boolean): void {
    const t = T();
    levelMemo.clear();
    const { w, h } = dims(t);
    const x0 = Math.max(0, Math.min(a.x, b.x));
    const x1 = Math.min(w - 1, Math.max(a.x, b.x));
    const y0 = Math.max(0, Math.min(a.y, b.y));
    const y1 = Math.min(h - 1, Math.max(a.y, b.y));
    if (x0 > x1 || y0 > y1) return;
    if (layer === "walls") {
      const on = !erase && brush !== ".";
      for (let x = x0; x <= x1; x++) {
        setThinWall(x, y0, 0, on);
        setThinWall(x, y1, 2, on);
      }
      for (let y = y0; y <= y1; y++) {
        setThinWall(x0, y, 3, on);
        setThinWall(x1, y, 1, on);
      }
    } else {
      const ch = erase ? eraseCh(layer) : brush;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) putCell(t, x, y, ch);
    }
    markDirty();
    refresh(false);
  }
  /** The Fill tool: every cell joined to this one that looks the same on
   *  this layer (never past the room's outline on Heights and Rooms). */
  function applyFill(x: number, y: number, erase: boolean): void {
    const t = T();
    levelMemo.clear();
    const { w, h } = dims(t);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    if (layer !== "map" && !inTile(t, x, y)) return;
    const key = layer as GridKey;
    const from = chAt(t, key, x, y);
    const ch = erase ? eraseCh(layer) : brush;
    if (from === ch) return;
    const seen = new Uint8Array(w * h);
    const st: [number, number][] = [[x, y]];
    while (st.length) {
      const [cx, cy] = st.pop()!;
      if (cx < 0 || cy < 0 || cx >= w || cy >= h || seen[cy * w + cx]) continue;
      seen[cy * w + cx] = 1;
      if (chAt(t, key, cx, cy) !== from || (layer !== "map" && !inTile(t, cx, cy))) continue;
      putCell(t, cx, cy, ch);
      st.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    markDirty();
    refresh(false);
  }

  function paintAt(x: number, y: number, side: number, shift: boolean): void {
    const t = T();
    const { w, h } = dims(t);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const key = `${layer}:${x},${y},${side}:${brush}:${shift}`;
    if (key === lastPaint) return;
    lastPaint = key;
    if (layer === "map") {
      putCell(t, x, y, brush);
    } else if (layer === "height") {
      if (!inTile(t, x, y)) return;
      putCell(t, x, y, brush);
    } else if (layer === "stair") {
      if (!inTile(t, x, y)) return;
      setCh(t, "stair", x, y, brush);
    } else if (layer === "rooms") {
      if (!inTile(t, x, y)) return;
      putCell(t, x, y, brush);
    } else if (layer === "furn") {
      if (!inTile(t, x, y)) return;
      if (shift) return turnPiece(x, y);
      const here = chAt(t, "furn", x, y);
      const g = GLYPHS[brush];
      const blobOf = (ch: string): void => {
        // clear a whole machine block, not one cell of it
        const st: [number, number][] = [[x, y]];
        const seen = new Set<string>();
        while (st.length) {
          const [cx, cy] = st.pop()!;
          if (seen.has(`${cx},${cy}`) || chAt(t, "furn", cx, cy) !== ch) continue;
          seen.add(`${cx},${cy}`);
          setCh(t, "furn", cx, cy, ".");
          st.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }
      };
      if (here !== "." && isBlock(GLYPHS[here]?.k)) blobOf(here);
      if (brush === ".") setCh(t, "furn", x, y, ".");
      else if (g && isBlock(g.k)) {
        const table = K.blocks(g.k)!;
        const fps = table.filter((m) => m.name === g.t);
        const fp = fps[rot % fps.length];
        for (let yy = y; yy < y + fp.h; yy++) for (let xx = x; xx < x + fp.w; xx++) if (inTile(t, xx, yy)) setCh(t, "furn", xx, yy, brush);
      } else setCh(t, "furn", x, y, brush);
    } else if (layer === "doors") {
      toggleDoor(x, y, side);
    } else if (layer === "walls") {
      setThinWall(x, y, side, brush !== ".");
    }
    markDirty();
    refresh(false);
  }

  function turnPiece(x: number, y: number): void {
    const t = T();
    const g = GLYPHS[chAt(t, "furn", x, y)];
    if (!g) return;
    const cycle = K.dia.axisKinds.has(g.k) ? ["", "H", "V"] : ["", "N", "E", "S", "W"];
    const face = (t.face ?? []).filter((f) => !(f[0] === x && f[1] === y));
    const cur = (t.face ?? []).find((f) => f[0] === x && f[1] === y)?.[2] ?? "";
    const next = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
    if (next) face.push([x, y, next]);
    t.face = face.length ? face : undefined;
  }

  /** A THIN wall on the edge on side `side` of (x, y): stored as the north
   *  or west flag of the cell that owns the edge ('-' N, '|' W, '+' both). */
  function setThinWall(x: number, y: number, side: number, on: boolean): void {
    const t = T();
    const [cx, cy, n] = side === 0 ? [x, y, true] : side === 2 ? [x, y + 1, true] : side === 3 ? [x, y, false] : [x + 1, y, false];
    const [ox, oy] = n ? [cx, cy - 1] : [cx - 1, cy];
    if (!inTile(t, cx, cy) || !inTile(t, ox, oy)) return;
    const cur = chAt(t, "walls", cx, cy);
    let hasN = cur === "-" || cur === "+";
    let hasW = cur === "|" || cur === "+";
    if (n) hasN = on;
    else hasW = on;
    setCh(t, "walls", cx, cy, hasN && hasW ? "+" : hasN ? "-" : hasW ? "|" : ".");
  }

  function toggleDoor(x: number, y: number, side: number): void {
    const t = T();
    const nx = x + [0, 1, 0, -1][side];
    const ny = y + [-1, 0, 1, 0][side];
    if (!inTile(t, x, y)) return;
    const edge = (d: [number, number, string, number]): boolean => d[2] === SIDE_CH[side] && lanesOf(d).some(([lx, ly]) => lx === x && ly === y);
    if (!inTile(t, nx, ny)) {
      const hit = t.doors.findIndex(edge);
      if (hit >= 0) t.doors.splice(hit, 1);
      else t.doors.push([x, y, SIDE_CH[side], doorW]);
      return;
    }
    if (labAt(t, x, y) === labAt(t, nx, ny)) {
      status("That edge is inside one room — split it into two rooms first (Rooms layer), then put the inner door on the line between them.");
      return;
    }
    const inner = t.inner ?? [];
    const back = (d: [number, number, string, number]): boolean => d[2] === SIDE_CH[(side + 2) % 4] && lanesOf(d).some(([lx, ly]) => lx === nx && ly === ny);
    const hit = inner.findIndex((d) => edge(d) || back(d));
    if (hit >= 0) inner.splice(hit, 1);
    else inner.push([x, y, SIDE_CH[side], doorW]);
    t.inner = inner.length ? inner : undefined;
  }

  /** A stair run from the drag's start to its end: each cell one step down,
   *  the arrow pointing back up the run. */
  function stairRun(a: { x: number; y: number }, b: { x: number; y: number }): void {
    const t = T();
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const along = Math.abs(dx) >= Math.abs(dy);
    const n = along ? Math.abs(dx) : Math.abs(dy);
    const sgn = Math.sign(along ? dx : dy) || 1;
    const up = along ? (sgn > 0 ? "<" : ">") : sgn > 0 ? "^" : "v";
    const h0 = decodeH(chAt(t, "height", a.x, a.y));
    for (let k = 0; k <= n; k++) {
      const x = along ? a.x + sgn * k : a.x;
      const y = along ? a.y : a.y + sgn * k;
      if (!inTile(t, x, y)) continue;
      setCh(t, "height", x, y, encodeH(h0 - k - 1 < -12 ? -12 : h0 - k - 1));
      setCh(t, "stair", x, y, up);
    }
    markDirty();
  }

  // ---- props ----------------------------------------------------------------------------
  const round2 = (v: number): number => Math.round(v * 100) / 100;
  const snapV = (v: number): number => (snap ? Math.round(v / snap) * snap : round2(v));
  const propsOf = (t: TileDef): KitPlace[] => (t.props ??= []);

  /** The topmost placed prop under a point (small ones get a fingertip's slack). */
  function propAt(t: TileDef, fx: number, fy: number): number {
    const ps = t.props ?? [];
    for (let k = ps.length - 1; k >= 0; k--) {
      const pl = ps[k];
      if (kitCovers(pl, fx, fy) || Math.hypot(pl.x - fx, pl.y - fy) < 0.22) return k;
    }
    return -1;
  }

  /** Where a new prop goes: a wall prop slides onto the nearest wall of its
   *  cell and faces into the room; a ceiling prop hangs from the ceiling;
   *  anything else stands where you clicked. */
  function placement(t: TileDef, id: string, v: number, fx: number, fy: number): KitPlace {
    const prop = KIT.get(id)!;
    const variant = prop.variants[v - 1];
    const pl: KitPlace = { p: id, x: round2(snapV(fx)), y: round2(snapV(fy)) };
    if (v !== 1) pl.v = v;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    if (prop.mount === "ceiling" && inTile(t, cx, cy)) pl.z = round2(Math.max(0, headroom(t, cx, cy) - variant.size[1]));
    if (prop.mount === "wall" && inTile(t, cx, cy)) {
      // the walls of this cell: outside the tile, solid concrete, a different
      // room, or one of the room's own thin walls
      const tile = current?.tile;
      const walls = [0, 1, 2, 3].filter((s) => {
        const nx = cx + [0, 1, 0, -1][s];
        const ny = cy + [-1, 0, 1, 0][s];
        if (!inTile(t, nx, ny) || chAt(t, "map", nx, ny) === "#" || labAt(t, nx, ny) !== labAt(t, cx, cy)) return true;
        return !!tile && tile.w === dims(t).w && tile.h === dims(t).h && thinWall(tile, cx, cy, s as Side);
      });
      if (walls.length) {
        const dist = (s: number): number => [fy - cy, cx + 1 - fx, cy + 1 - fy, fx - cx][s];
        const s = walls.sort((a, b) => dist(a) - dist(b))[0];
        const half = variant.size[2] / CELL_M / 2 + 0.02;
        // face into the room: wall N → faces south (0), E → west (90), S → north (180), W → east (270)
        pl.r = [0, 90, 180, 270][s];
        if (s === 0) pl.y = cy + half;
        if (s === 2) pl.y = cy + 1 - half;
        if (s === 1) pl.x = cx + 1 - half;
        if (s === 3) pl.x = cx + half;
        pl.x = round2(pl.x);
        pl.y = round2(pl.y);
        pl.z = round2(Math.min(1.4, Math.max(0, headroom(t, cx, cy) - variant.size[1] - 0.2)));
      }
    }
    return pl;
  }

  function editProp(k: number, f: (pl: KitPlace) => void): void {
    const t = T();
    const pl = t.props?.[k];
    if (!pl) return;
    f(pl);
    if (pl.v === 1) delete pl.v;
    if (!pl.r) delete pl.r;
    if (!pl.z) delete pl.z;
    if (pl.c === undefined || pl.c >= 100) delete pl.c;
    markDirty();
    refresh(false);
  }

  function propsKey(ev: KeyboardEvent): boolean {
    const t = T();
    if (ev.key === "Escape") {
      if (propBrush) propBrush = null;
      else propSel = -1;
      refresh();
      return true;
    }
    if (propSel < 0 || !t.props?.[propSel]) return false;
    const k = ev.key;
    const step = (snap || 0.05) * (ev.shiftKey ? 4 : 1);
    if (k === "r" || k === "R") {
      snapshot();
      editProp(propSel, (pl) => (pl.r = kitYaw((pl.r ?? 0) + (ev.shiftKey ? 15 : 90))));
    } else if (k === "Delete" || k === "Backspace") {
      snapshot();
      t.props.splice(propSel, 1);
      propSel = -1;
      markDirty();
      refresh();
    } else if (k === "[" || k === "]") {
      const n = KIT.get(t.props[propSel].p)!.variants.length;
      snapshot();
      editProp(propSel, (pl) => (pl.v = ((((pl.v ?? 1) - 1 + (k === "]" ? 1 : -1)) % n) + n) % n + 1));
      refresh();
    } else if (k === "PageUp" || k === "PageDown") {
      snapshot();
      editProp(propSel, (pl) => (pl.z = round2(Math.max(0, Math.min(12, (pl.z ?? 0) + (k === "PageUp" ? 0.05 : -0.05) * (ev.shiftKey ? 5 : 1))))));
    } else if (k.startsWith("Arrow")) {
      snapshot();
      editProp(propSel, (pl) => {
        if (k === "ArrowLeft") pl.x = round2(pl.x - step);
        if (k === "ArrowRight") pl.x = round2(pl.x + step);
        if (k === "ArrowUp") pl.y = round2(pl.y - step);
        if (k === "ArrowDown") pl.y = round2(pl.y + step);
      });
    } else if ((ev.ctrlKey || ev.metaKey) && k.toLowerCase() === "d") {
      snapshot();
      const copy = { ...t.props[propSel], x: round2(t.props[propSel].x + 0.5), y: round2(t.props[propSel].y + 0.5) };
      t.props.push(copy);
      propSel = t.props.length - 1;
      markDirty();
      refresh();
    } else return false;
    return true;
  }

  function matchesProp(p: KitProp): boolean {
    if (propSection && p.cat[0] !== propSection) return false;
    if (!propAll && !p.levels.includes(level)) return false;
    if (!propQuery) return true;
    const hay = `${p.name} ${p.id} ${p.cat.join(" ")} ${p.tags.join(" ")} ${p.theme.join(" ")} ${p.variants.map((v) => v.label).join(" ")}`.toLowerCase();
    return propQuery.split(/\s+/).every((w) => hay.includes(w));
  }

  const thumb = (file: string): string => `${KIT_BASE}thumbs/${file}.webp`;

  function propBrowserHTML(): string {
    const pool = KIT_ALL.filter((p) => propAll || p.levels.includes(level));
    const sections = [...new Set(KIT_ALL.map((p) => p.cat[0]))];
    const count = (s: string): number => pool.filter((p) => p.cat[0] === s).length;
    const shown = KIT_ALL.filter(matchesProp);
    const byShelf = new Map<string, KitProp[]>();
    for (const p of shown) byShelf.set(`${p.cat[0]} › ${p.cat[1]}`, [...(byShelf.get(`${p.cat[0]} › ${p.cat[1]}`) ?? []), p]);
    const card = (p: KitProp): string =>
      `<button class="pc${propBrush?.p === p.id ? " on" : ""}" data-prop="${p.id}" title="${esc(p.name)}${p.tags.length ? " — " + esc(p.tags.join(", ")) : ""}">
        ${p.builtin === "sign" ? `<span class="signthumb ${p.variants[0].file}">Aa</span>` : p.builtin === "shape" ? shapeThumb(p.variants[0].file) : `<img loading="lazy" src="${thumb(p.variants[0].file)}" alt="">`}
        <span class="pn">${esc(p.name)}</span>
        <small>${p.variants.length > 1 ? `${p.variants.length} looks · ` : ""}${p.mount === "floor" ? (p.solid ? "solid" : "walk-through") : `on the ${p.mount}`}${p.anim === "open" ? " · opens when someone walks up" : ""}</small>
      </button>`;
    return `
      <div class="pbtop">
        <input id="pq" placeholder="Search ${shown.length === KIT_ALL.length ? KIT_ALL.length : pool.length} props — name, type, material…" value="${esc(propQuery)}" />
        <label class="chk"><input type="checkbox" id="pall"${propAll ? " checked" : ""}> every level's props</label>
        <label class="chk">snap <select id="psnap">${SNAPS.map(([v, l]) => `<option value="${v}"${v === snap ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        ${propBrush ? `<span class="brushnote">Placing: <b>${esc(KIT.get(propBrush.p)!.name)}</b> <button id="pstop">stop (Esc)</button></span>` : ""}
      </div>
      <div class="pbcats">
        <button class="chip${propSection === "" ? " on" : ""}" data-psec="">All</button>
        ${sections
          .filter((s) => propAll || count(s))
          .map((s) => `<button class="chip${propSection === s ? " on" : ""}" data-psec="${esc(s)}">${esc(s)} <small>${count(s)}</small></button>`)
          .join("")}
      </div>
      <div class="pbgrid">
        ${
          shown.length
            ? [...byShelf].map(([shelf, ps]) => `<div class="shelf"><b>${esc(shelf)}</b><div class="cards">${ps.map(card).join("")}</div></div>`).join("")
            : `<p class="hint">Nothing matches${!propAll ? " — tick “every level's props” to search them all" : ""}.</p>`
        }
      </div>`;
  }

  // ---- the select tool ------------------------------------------------------------------
  // Box a rectangle: every layer inside it is the selection. Drag it to move
  // it (what stands on the floor goes with it; the floor stays where it was),
  // Ctrl+C / Ctrl+X / Ctrl+V copy, cut and paste — into another room too —
  // R turns it, F flips it, Delete clears what's on it, arrows nudge it.
  const rectOf = (a: { x: number; y: number }, b: { x: number; y: number }): { x0: number; y0: number; x1: number; y1: number } => {
    const { w, h } = dims(T());
    return {
      x0: Math.max(0, Math.min(a.x, b.x)),
      y0: Math.max(0, Math.min(a.y, b.y)),
      x1: Math.min(w - 1, Math.max(a.x, b.x)),
      y1: Math.min(h - 1, Math.max(a.y, b.y)),
    };
  };
  const inRect = (x: number, y: number): boolean => !!selRect && x >= selRect.x0 && y >= selRect.y0 && x <= selRect.x1 && y <= selRect.y1;
  const clipOfSel = (): Clip | null => (selRect ? cutClip(T(), selRect.x0, selRect.y0, selRect.x1, selRect.y1) : null);
  function copySel(): void {
    const c = clipOfSel();
    if (!c) return;
    clipboard = { level, clip: c };
    status(`Copied ${c.w}×${c.h} cells. Ctrl+V pastes it — in this room or another one.`);
  }
  function clearSel(all: boolean): void {
    if (!selRect) return;
    snapshot();
    clearBox(T(), selRect.x0, selRect.y0, selRect.x1, selRect.y1, all);
    markDirty();
    refresh();
  }
  function cutSel(): void {
    if (!selRect) return;
    copySel();
    clearSel(false);
  }
  /** The selection comes up off the room as a floating piece at the same spot;
   *  the floor under it stays. */
  function lift(): void {
    const r = selRect!;
    floating = { clip: cutClip(T(), r.x0, r.y0, r.x1, r.y1), x: r.x0, y: r.y0, gx: 0, gy: 0, drag: false };
    clearBox(T(), r.x0, r.y0, r.x1, r.y1, false);
  }
  /** Put the floating piece down where it is (the room grows to fit). */
  function drop(): void {
    if (!floating) return;
    const f = floating;
    floating = null;
    stampClip(T(), f.clip, f.x, f.y);
    // a piece dropped past the room's top or left edge moved the room over
    const x0 = Math.max(0, f.x);
    const y0 = Math.max(0, f.y);
    selRect = { x0, y0, x1: x0 + f.clip.w - 1, y1: y0 + f.clip.h - 1 };
    markDirty();
    refresh();
  }
  function paste(): void {
    if (!clipboard) return status("Nothing copied yet — box something with the Select tool and press Ctrl+C.");
    if (clipboard.level !== level) return status("That was copied on another level — its floors and furniture don't exist here.");
    if (floating) return;
    tool = "select";
    const c: Clip = JSON.parse(JSON.stringify(clipboard.clip));
    const gx = c.w >> 1;
    const gy = c.h >> 1;
    floating = { clip: c, x: (hover?.x ?? gx) - gx, y: (hover?.y ?? gy) - gy, gx, gy, drag: false };
    selRect = null;
    status("Move it where you want it and click to put it down · R turns · F flips · Esc cancels");
    refresh();
  }
  function turnSel(flip: boolean): void {
    if (floating) {
      floating.clip = flip ? flipClip(floating.clip) : turnClip(floating.clip);
      if (!flip) [floating.gx, floating.gy] = [floating.clip.w - 1 - floating.gy, floating.gx];
      $("#insp").innerHTML = inspectorHTML();
      drawGrid();
      return;
    }
    if (!selRect) return;
    snapshot();
    lift();
    floating!.clip = flip ? flipClip(floating!.clip) : turnClip(floating!.clip);
    drop();
  }
  function nudgeSel(dx: number, dy: number): void {
    if (floating) {
      floating.x += dx;
      floating.y += dy;
      drawGrid();
      return;
    }
    if (!selRect) return;
    snapshot();
    lift();
    floating!.x += dx;
    floating!.y += dy;
    drop();
  }
  /** The select tool's keys: true when the key was one of them. */
  function selectKey(ev: KeyboardEvent): boolean {
    const k = ev.key;
    const ctrl = ev.ctrlKey || ev.metaKey;
    if (ctrl && k.toLowerCase() === "v") return (paste(), true);
    if (tool !== "select" && !floating) return false;
    if (k === "Escape") {
      if (floating) {
        floating = null;
        status("Paste cancelled.");
      } else selRect = null;
      refresh();
      return true;
    }
    if (ctrl && k.toLowerCase() === "c") return (copySel(), true);
    if (ctrl && k.toLowerCase() === "x") return (cutSel(), true);
    if (ctrl) return false;
    if (k === "Delete" || k === "Backspace") return (clearSel(ev.shiftKey), true);
    if (k === "r" || k === "R") return (turnSel(false), true);
    if (k === "f" || k === "F") return (turnSel(true), true);
    if (k.startsWith("Arrow")) {
      nudgeSel(k === "ArrowLeft" ? -1 : k === "ArrowRight" ? 1 : 0, k === "ArrowUp" ? -1 : k === "ArrowDown" ? 1 : 0);
      return true;
    }
    return false;
  }
  function selectionHTML(): string {
    if (floating) {
      return `<div class="sec">Placing a piece (${floating.clip.w}×${floating.clip.h})</div>
        <p class="hint">Click to put it down. R turns it, F flips it, Esc cancels.</p>
        <div class="tools"><button data-sa="turn">⟳ Turn</button><button data-sa="flip">⇋ Flip</button><button data-sa="cancel">Cancel</button></div>`;
    }
    if (!selRect) {
      return `<div class="sec">Select</div><p class="hint">Drag a box over part of the room. Then drag it to move it, or use the buttons.${clipboard?.level === level ? " Ctrl+V pastes what you copied." : ""}</p>${clipboard?.level === level ? `<div class="tools"><button data-sa="paste">Paste (Ctrl+V)</button></div>` : ""}`;
    }
    const w = selRect.x1 - selRect.x0 + 1;
    const h = selRect.y1 - selRect.y0 + 1;
    return `<div class="sec">Selection (${w}×${h} cells)</div>
      <p class="hint">Drag it to move it — what stands on the floor goes with it, the floor stays. Arrow keys nudge it.</p>
      <div class="tools selbtns">
        <button data-sa="copy">Copy <small>Ctrl+C</small></button>
        <button data-sa="cut">Cut <small>Ctrl+X</small></button>
        <button data-sa="paste"${clipboard?.level === level ? "" : " disabled"}>Paste <small>Ctrl+V</small></button>
        <button data-sa="turn">⟳ Turn <small>R</small></button>
        <button data-sa="flip">⇋ Flip <small>F</small></button>
        <button data-sa="clear">Clear what's on it <small>Del</small></button>
        <button data-sa="remove" class="danger">Remove the floor too <small>Shift+Del</small></button>
      </div>`;
  }

  // ---- the game layer ------------------------------------------------------------------
  const marksOf = (t: TileDef): MarkPlace[] => (t.marks ??= []);
  function markAt(t: TileDef, fx: number, fy: number): number {
    const ms = t.marks ?? [];
    for (let k = ms.length - 1; k >= 0; k--) if (Math.hypot(ms[k].x - fx, ms[k].y - fy) < 0.42) return k;
    return -1;
  }
  function editMark(k: number, f: (m: MarkPlace) => void): void {
    const m = T().marks?.[k];
    if (!m) return;
    f(m);
    for (const key of ["n", "speed", "sight", "roam", "bite", "chance"] as const) if (m[key] === undefined || Number.isNaN(m[key])) delete m[key];
    markDirty();
    refresh(false);
  }
  /** A labelled choice for one setting of a marker. */
  function markChoice(m: MarkPlace, key: "n" | "speed" | "sight" | "roam" | "bite" | "chance", label: string, opts: [number | "", string][]): string {
    const cur = m[key] ?? "";
    return `<label class="row">${label} <select data-mf="${key}">${opts.map(([v, l]) => `<option value="${v}"${String(v) === String(cur) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  }
  function gameInspectorHTML(): string {
    const t = T();
    const ms = t.marks ?? [];
    const list = ms.length
      ? `<div class="plist">${ms.map((q, k) => `<button class="pli${k === markSel ? " on" : ""}" data-msel="${k}"><span class="mdot" style="background:${MARK.get(q.k)?.color ?? "#999"}"></span>${esc(MARK.get(q.k)?.name ?? q.k)}</button>`).join("")}</div>`
      : `<p class="hint">Nothing placed in this room yet.</p>`;
    const m = ms[markSel];
    if (!m) return `<div class="sec">In this room (${ms.length})</div>${list}<p class="hint">Pick one below, then click in the room. Click a placed one to change its settings.</p>`;
    const d = MARK.get(m.k)!;
    const chance = markChoice(m, "chance", "appears in", [["", "every copy of the room"], [75, "3 in 4 copies"], [50, "half the copies"], [25, "1 in 4 copies"], [10, "1 in 10 copies"]]);
    let fields = "";
    if (m.k === "entity") {
      fields =
        markChoice(m, "n", "how many", [["", "one"], [2, "two"], [3, "three"]]) +
        markChoice(m, "speed", "speed", [[75, "slow"], ["", "normal"], [130, "fast"], [160, "very fast"]]) +
        markChoice(m, "sight", "sees you from", [[8, "close (8 cells)"], ["", `normal (${CREATURE_USUAL.entity.sight} cells)`], [22, "far (22 cells)"], [32, "very far (32 cells)"]]) +
        markChoice(m, "roam", "wanders", [[6, "stays close (6 cells)"], ["", `nearby (${CREATURE_USUAL.entity.roam} cells)`], [30, "far (30 cells)"], [60, "all over (60 cells)"]]);
    } else if (m.k === "gator") {
      fields =
        markChoice(m, "n", "how many", [["", "one"], [2, "two"], [3, "three"]]) +
        markChoice(m, "speed", "speed", [[75, "slow"], ["", "normal"], [130, "fast"]]) +
        markChoice(m, "sight", "sees you from", [[14, "close (14 cells)"], ["", `normal (${CREATURE_USUAL.gator.sight} cells)`], [36, "far (36 cells)"]]) +
        markChoice(m, "bite", "bite", [[20, "light (5 bites kill)"], ["", "normal (3 bites kill)"], [50, "heavy (2 bites kill)"], [100, "deadly (1 bite kills)"]]);
    }
    return `<div class="sec">${esc(d.name)}</div>
      <div class="insp"><p class="hint">${esc(d.help)}</p>${fields}${chance}
      <div class="tools"><button data-mdel class="danger">Remove</button></div></div>
      <div class="sec">In this room (${ms.length})</div>${list}`;
  }
  function gamePaletteHTML(): string {
    const here = MARKS.filter((m) => m.levels.includes(level));
    return `<div class="grp"><b>Place</b>${here
      .map((m) => `<button class="pal mark${markBrush === m.k ? " on" : ""}" data-mark="${m.k}" title="${esc(m.help)}"><span class="sw" style="background:${m.color}">${m.glyph}</span>${esc(m.name)}</button>`)
      .join("")}${markBrush ? `<span class="brushnote">Placing: <b>${esc(MARK.get(markBrush)!.name)}</b> <button id="mstop">stop (Esc)</button></span>` : ""}</div>
      <div class="grp"><p class="hint">${here.map((m) => `<b>${esc(m.name)}:</b> ${esc(m.help)}`).join("<br>")}${level === 2 ? "<br>Pipe Dreams has no creatures of its own — only the ones you place." : ""}</p></div>`;
  }

  /** A shape's card picture: a small drawing of the solid. */
  function shapeThumb(file: string): string {
    const kind = file.replace(/^shape-/, "");
    const P: Record<string, string> = {
      cube: '<path d="M14 22 32 12 50 22 50 42 32 52 14 42Z" fill="#9c937f"/><path d="M14 22 32 32 50 22 32 12Z" fill="#c9bf9f"/><path d="M32 32V52L50 42V22Z" fill="#7a725f"/>',
      cylinder: '<rect x="18" y="16" width="28" height="32" fill="#9c937f"/><ellipse cx="32" cy="48" rx="14" ry="5" fill="#9c937f"/><ellipse cx="32" cy="16" rx="14" ry="5" fill="#c9bf9f"/>',
      pyramid: '<path d="M32 10 12 46 32 54Z" fill="#c9bf9f"/><path d="M32 10 32 54 52 46Z" fill="#7a725f"/>',
      cone: '<path d="M32 10 18 46A14 5 0 0 0 46 46Z" fill="#9c937f"/>',
      sphere: '<circle cx="32" cy="32" r="18" fill="#9c937f"/><circle cx="26" cy="26" r="6" fill="#c9bf9f"/>',
      pillar: '<rect x="18" y="10" width="28" height="6" fill="#c9bf9f"/><rect x="23" y="16" width="18" height="32" fill="#9c937f"/><rect x="18" y="48" width="28" height="6" fill="#c9bf9f"/>',
      "square-pillar": '<rect x="18" y="10" width="28" height="6" fill="#c9bf9f"/><rect x="22" y="16" width="20" height="32" fill="#7a725f"/><rect x="18" y="48" width="28" height="6" fill="#c9bf9f"/>',
      wedge: '<path d="M12 50 52 50 12 18Z" fill="#9c937f"/><path d="M12 18 52 50 12 50Z" fill="none" stroke="#c9bf9f" stroke-width="2"/>',
    };
    return `<span class="shapethumb"><svg viewBox="0 0 64 64">${P[kind] ?? P.cube}</svg></span>`;
  }
  /** A shape's size, surface, colour and solidity. */
  function shapeFieldsHTML(pl: KitPlace): string {
    const sz = kitSize(pl) ?? [1, 1, 1];
    const num = (f: string, val: number, label: string): string => `<label>${label} <input type="number" step="0.05" min="${SHAPE_MIN}" max="${SHAPE_MAX}" data-pf="${f}" value="${Math.round(val * 100) / 100}"></label>`;
    const group = (kind: SurfaceKind, label: string): string => {
      const all = [...levelSurfaces(kind, level), ...allSurfaces(kind).slice(SURFACES[kind].length)];
      return `<optgroup label="${label}">${all.map((q) => `<option value="${esc(q.id)}"${pl.tex === q.id ? " selected" : ""}>${esc(q.name)}</option>`).join("")}</optgroup>`;
    };
    return `<div class="nums">${num("sx", sz[0], "wide m")}${num("sy", sz[1], "tall m")}${num("sz", sz[2], "deep m")}</div>
        <label class="row">surface <select data-pf="tex"><option value=""${pl.tex ? "" : " selected"}>plain paint</option>${group("wall", "Wall textures")}${group("floor", "Floor textures")}${group("ceil", "Ceiling textures")}</select></label>
        <label class="row">colour <input type="color" data-pf="col" value="${esc(pl.col ?? "#bdb6a8")}">${pl.col ? ` <button data-pcolclear title="Back to the surface's own colour">clear</button>` : ""}</label>
        <label class="row chk"><input type="checkbox" data-pf="solid"${pl.solid === false ? "" : " checked"}> people walk around it</label>`;
  }

  /** THE COST METER for the open room: what its props cost to draw, against
   *  the busiest square on any live level today (src/backrooms/cost.ts). */
  function weightHTML(): string {
    const t = T();
    const all = costOf(t.props ?? []);
    if (!all.props) return "";
    // the room's busiest 16×16 patch: the yardstick the level's squares use
    const { w, h } = dims(t);
    const c = heaviestPatch(t.props ?? [], w, h);
    const load = costLoad(c);
    const pct = Math.round(load * 100);
    const cls = load > 1 ? "over" : load > 0.6 ? "full" : "ok";
    const where = w > COST_SQUARE || h > COST_SQUARE ? " in its busiest 16×16 patch" : "";
    return `<div class="weight ${cls}" title="100% is as heavy as the busiest 16×16 square on any live level today (${COST_BUDGET.calls} draw calls or ${(COST_BUDGET.tris / 1000).toFixed(0)}k triangles). The whole room: ${all.props} props, ${all.calls} draw calls, ${(all.tris / 1000).toFixed(1)}k triangles."><span class="wbar"><i style="width:${Math.min(100, pct)}%"></i></span><span>Weight ${pct}%${where} · ${c.calls} draw calls · ${(c.tris / 1000).toFixed(1)}k triangles${load > 1 ? " — heavier than anything live; players may stutter here" : ""}</span></div>`;
  }
  function inspectorHTML(): string {
    const t = T();
    if (tool === "select" || floating) return selectionHTML();
    if (layer === "game") return gameInspectorHTML();
    if (layer !== "props") return `<div class="sec">The room</div><div id="props">${roomFieldsHTML()}</div>`;
    const ps = t.props ?? [];
    const pl = ps[propSel];
    const list = ps.length
      ? `<div class="plist">${ps
          .map((q, k) => `<button class="pli${k === propSel ? " on" : ""}" data-psel="${k}">${esc(KIT.get(q.p)?.name ?? q.p)}${(q.v ?? 1) > 1 ? ` <small>#${q.v}</small>` : ""}</button>`)
          .join("")}</div>`
      : `<p class="hint">No props in this room yet.</p>`;
    if (!pl) {
      return `<div class="sec">Props in this room (${ps.length})</div>${weightHTML()}${list}
        <p class="hint">Pick a prop from the shelves below, then click in the room. Click a placed one to select it.</p>`;
    }
    const prop = KIT.get(pl.p);
    if (!prop) return `<div class="sec">Selected prop</div><p class="errs">"${esc(pl.p)}" isn't in the prop kit any more.</p><button data-pdel>Remove it</button>${list}`;
    const v = kitVariant(pl);
    const num = (f: string, val: number, step: number, label: string): string => `<label>${label} <input type="number" step="${step}" data-pf="${f}" value="${val}"></label>`;
    return `<div class="sec">Selected prop</div>
      <div class="insp">
        <div class="ihead">${prop.builtin === "sign" ? `<span class="signthumb ${v?.file ?? ""}">Aa</span>` : prop.builtin === "shape" ? shapeThumb(v?.file ?? prop.variants[0].file) : `<img src="${thumb(v?.file ?? prop.variants[0].file)}" alt="">`}<div><b>${esc(prop.name)}</b><small>${esc(prop.cat.join(" › "))}</small><small>${v ? `${(kitSize(pl) ?? v.size).map((q) => String(Math.round(q * 100) / 100)).join(" × ")} m ·` : ""}${prop.mount === "floor" ? (kitBlocks(pl) ? "people walk around it" : "people walk over or past it") : `hangs on the ${prop.mount}`}</small></div></div>
        ${prop.variants.length > 1 ? `<label class="row">look <select data-pf="v">${prop.variants.map((q, k) => `<option value="${k + 1}"${(pl.v ?? 1) === k + 1 ? " selected" : ""}>${esc(q.label || `#${k + 1}`)}</option>`).join("")}</select></label>` : ""}
        ${prop.builtin === "sign" ? `<label class="row col">words <input data-pf="text" maxlength="${SIGN_MAX}" value="${esc(pl.text ?? "")}" placeholder="What it says"></label>` : ""}
        <div class="nums">${num("x", pl.x, 0.25, "x")}${num("y", pl.y, 0.25, "y")}${num("z", pl.z ?? 0, 0.05, "up m")}${num("r", pl.r ?? 0, 15, "turn°")}</div>
        <div class="nums">${num("rx", pl.rx ?? 0, 15, "tip°")}${num("rz", pl.rz ?? 0, 15, "lean°")}</div>
        ${prop.builtin === "shape" ? shapeFieldsHTML(pl) : ""}
        <label class="row">appears in <select data-pf="c">${(
          [
            [100, "every copy of the room"],
            [75, "3 in 4 copies"],
            [50, "half the copies"],
            [25, "1 in 4 copies"],
            [10, "1 in 10 copies"],
          ] as [number, string][]
        )
          .map(([v, l]) => `<option value="${v}"${(pl.c ?? 100) === v ? " selected" : ""}>${l}</option>`)
          .join("")}</select></label>
        <p class="hint">Move it in the 3D view with the arrows, or here: x and y in cells, up in metres. Turn tilts it on any axis: tip leans it forward, lean leans it sideways.${prop.builtin === "shape" ? " Size stretches a shape." : ""}</p>
        <div class="tools"><button data-prot="-90">⟲ 90°</button><button data-prot="90">⟳ 90°</button><button data-pdup>Duplicate</button><button data-pdel class="danger">Remove</button></div>
      </div>
      <div class="sec">Props in this room (${ps.length})</div>${list}`;
  }

  // ---- size -----------------------------------------------------------------------------
  function resize(nw: number, nh: number): void {
    const t = T();
    nw = Math.max(1, Math.min(60, nw | 0));
    nh = Math.max(1, Math.min(60, nh | 0));
    snapshot();
    // every grid layer, the thin walls included (Oct 2026 review: a resized
    // room's walls layer kept its old size and the room failed its checks)
    for (const key of ["map", "height", "ceiling", "stair", "rooms", "furn", "walls"] as GridKey[]) {
      const rows = t[key];
      if (!rows) continue;
      (t as unknown as Record<string, string[]>)[key] = Array.from({ length: nh }, (_, y) => ((rows[y] ?? "") + ".".repeat(nw)).slice(0, nw));
    }
    if (t.marks) t.marks = t.marks.filter((q) => q.x < nw && q.y < nh);
    t.doors = t.doors.filter((d) => lanesOf(d).every(([x, y]) => x < nw && y < nh));
    if (t.inner) t.inner = t.inner.filter((d) => lanesOf(d).every(([x, y]) => x < nw && y < nh));
    if (t.props) t.props = t.props.filter((q) => q.x < nw && q.y < nh);
    markDirty();
    refresh();
  }
  function shiftTile(dx: number, dy: number): void {
    const t = T();
    snapshot();
    const { w, h } = dims(t);
    // the thin walls, the held ceiling and the markers move with the room
    // too (Oct 2026 review — they stayed behind)
    for (const key of ["map", "height", "stair", "rooms", "furn", "walls", "ceiling"] as GridKey[]) {
      const rows = t[key];
      if (!rows) continue;
      const blank = key === "map" ? " " : ".";
      (t as unknown as Record<string, string[]>)[key] = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (rows[y - dy] ?? "")[x - dx] ?? blank).join(""));
    }
    const mv = (d: [number, number, string, number]): [number, number, string, number] => [d[0] + dx, d[1] + dy, d[2], d[3]];
    t.doors = t.doors.map(mv).filter((d) => lanesOf(d).every(([x, y]) => x >= 0 && y >= 0 && x < w && y < h));
    if (t.inner) t.inner = t.inner.map(mv).filter((d) => lanesOf(d).every(([x, y]) => x >= 0 && y >= 0 && x < w && y < h));
    if (t.face) t.face = t.face.map((f) => [f[0] + dx, f[1] + dy, f[2]] as [number, number, string]);
    if (t.props) t.props = t.props.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy })).filter((q) => q.x >= 0 && q.y >= 0 && q.x < w && q.y < h);
    if (t.marks) t.marks = t.marks.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy })).filter((q) => q.x >= 0 && q.y >= 0 && q.x < w && q.y < h);
    markDirty();
    refresh();
  }

  // ---- drawing ---------------------------------------------------------------------------
  let cs = 24;
  /** 1 = the room fits the view; above that the view scrolls. */
  let zoom = 1;
  function setZoom(z: number): void {
    zoom = Math.max(1, Math.min(6, Math.round(z * 100) / 100));
    $("#zoomv").textContent = zoom === 1 ? "fit" : `${Math.round(zoom * 100)}%`;
    drawGrid();
  }
  function drawGrid(): void {
    const t = T();
    if (!t) return;
    const cv = $<HTMLCanvasElement>("#grid");
    const box = $("#gridbox");
    const { w, h } = dims(t);
    // the room fills the view: up to 80px a cell, so a small room is big enough to
    // draw on without zooming first
    const fit = Math.max(10, Math.min(80, Math.floor(Math.min((box.clientWidth - 40) / w, (box.clientHeight - 40) / h))));
    cs = Math.round(fit * zoom);
    const dpr = window.devicePixelRatio || 1;
    cv.width = (w * cs + 2) * dpr;
    cv.height = (h * cs + 2) * dpr;
    cv.style.width = `${w * cs + 2}px`;
    cv.style.height = `${h * cs + 2}px`;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 1, 1);
    ctx.clearRect(-1, -1, w * cs + 2, h * cs + 2);
    const tile = current?.tile;
    const X = (x: number): number => x * cs;
    const Y = (y: number): number => y * cs;
    const labels = [...new Set(t.map.flatMap((r, y) => [...r].map((c, x) => (c === " " ? null : labAt(t, x, y)))).filter((q): q is string => !!q))];
    // cells
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const m = chAt(t, "map", x, y);
        if (m === " ") {
          ctx.fillStyle = (x + y) % 2 ? "#15130f" : "#1a1814";
          ctx.fillRect(X(x), Y(y), cs, cs);
          continue;
        }
        ctx.fillStyle = m === "#" ? "#2c2925" : (ZONE_COLOR[typeOf(t, x, y)] ?? "#666");
        ctx.fillRect(X(x), Y(y), cs, cs);
        const hv = decodeH(chAt(t, "height", x, y));
        if (hv) {
          ctx.fillStyle = hv < 0 ? `rgba(0,0,0,${Math.min(0.55, -hv * 0.07)})` : `rgba(255,255,255,${Math.min(0.3, hv * 0.03)})`;
          ctx.fillRect(X(x), Y(y), cs, cs);
        }
        // under the water line: the pool, drawn blue, deeper the darker
        if (m !== "#" && K.wet(hv)) {
          ctx.fillStyle = `rgba(40,150,225,${Math.min(0.85, 0.35 + -hv * 0.08)})`;
          ctx.fillRect(X(x), Y(y), cs, cs);
        }
        // SCENERY: floor no door reaches — drawn in the game, never entered
        // (hatched, so a mistake is as visible as an intention)
        if (tile && tile.w === w && tile.h === h && tile.scenery[y * w + x]) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(X(x), Y(y), cs, cs);
          ctx.clip();
          ctx.strokeStyle = "rgba(255,255,255,0.28)";
          ctx.lineWidth = 1;
          for (let k = -cs; k < cs; k += 5) {
            ctx.beginPath();
            ctx.moveTo(X(x) + k, Y(y) + cs);
            ctx.lineTo(X(x) + k + cs, Y(y));
            ctx.stroke();
          }
          ctx.restore();
        }
        if (layer === "rooms") {
          ctx.fillStyle = ROOM_TINT[labels.indexOf(labAt(t, x, y)) % ROOM_TINT.length] + "33";
          ctx.fillRect(X(x), Y(y), cs, cs);
        }
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.strokeRect(X(x) + 0.5, Y(y) + 0.5, cs - 1, cs - 1);
        // a cell holding its ceiling (the Heights tool's floor-only mode)
        const held = chAt(t, "ceiling", x, y);
        if (layer === "height" && held !== "." && held !== " ") {
          ctx.fillStyle = "#5ce1ff";
          ctx.fillRect(X(x) + 1, Y(y) + 1, cs - 2, Math.max(2, cs * 0.12));
        }
        if (layer === "height" || hv) {
          ctx.fillStyle = layer === "height" ? "#fff" : "rgba(255,255,255,0.55)";
          ctx.font = `${Math.max(8, cs * 0.34)}px ui-monospace, monospace`;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          ctx.fillText(String(hv), X(x) + 2, Y(y) + 1);
        }
        const st = chAt(t, "stair", x, y);
        if ("^>v<".includes(st) && st !== ".") {
          ctx.fillStyle = "rgba(214,168,70,0.55)";
          ctx.fillRect(X(x) + 1, Y(y) + 1, cs - 2, cs - 2);
          ctx.fillStyle = "#1a1409";
          ctx.font = `bold ${cs * 0.6}px ui-sans-serif, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText({ "^": "↑", ">": "→", v: "↓", "<": "←" }[st]!, X(x) + cs / 2, Y(y) + cs / 2 + 1);
        }
        if (layer === "rooms") {
          ctx.fillStyle = "#fff";
          ctx.font = `bold ${cs * 0.42}px ui-monospace, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(labAt(t, x, y), X(x) + cs / 2, Y(y) + cs / 2);
        }
      }
    }
    // pieces, from the parsed tile (so orientation is what the generator sees)
    if (tile) {
      const fade = layer === "furn" || layer === "map" ? 1 : 0.55;
      for (const p of tile.pieces) {
        const c = GROUP_COLOR[p.k] ?? "#ccc";
        const x0 = X(p.x);
        const y0 = Y(p.y);
        ctx.globalAlpha = fade;
        if (isBlock(p.k) && (p.k === "pillar" || p.k === "spiralcore")) {
          // a round drum on its 2×2 block
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(x0 + (p.w * cs) / 2, y0 + (p.h * cs) / 2, (Math.min(p.w, p.h) * cs) / 2 - 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,0.35)";
          ctx.stroke();
        } else if (isBlock(p.k)) {
          ctx.fillStyle = c;
          ctx.fillRect(x0 + 2, y0 + 2, p.w * cs - 4, p.h * cs - 4);
          ctx.fillStyle = "#101010";
          ctx.font = `${Math.max(8, cs * 0.34)}px ui-sans-serif, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(K.blocks(p.k)![p.t].name, x0 + (p.w * cs) / 2, y0 + (p.h * cs) / 2);
        } else if (p.k === "rack") {
          ctx.fillStyle = c;
          if (p.o === 0) ctx.fillRect(x0 + 1, y0 + cs * 0.2, cs - 2, cs * 0.6);
          else ctx.fillRect(x0 + cs * 0.2, y0 + 1, cs * 0.6, cs - 2);
        } else if (K.dia.wallBacked.has(p.k)) {
          const d = p.k === "wallA" || p.k === "wallB" ? cs * 0.34 : cs * 0.22;
          ctx.fillStyle = c;
          if (p.o === 0) ctx.fillRect(x0 + 2, y0 + 1, cs - 4, d);
          else if (p.o === 2) ctx.fillRect(x0 + 2, y0 + cs - d - 1, cs - 4, d);
          else if (p.o === 3) ctx.fillRect(x0 + 1, y0 + 2, d, cs - 4);
          else ctx.fillRect(x0 + cs - d - 1, y0 + 2, d, cs - 4);
        } else if (p.k === "arch" || p.k === "portal") {
          // the span across the opening
          ctx.strokeStyle = c;
          ctx.lineWidth = p.k === "portal" ? 4 : 3;
          ctx.beginPath();
          if (p.o === 0) (ctx.moveTo(x0 - (p.k === "portal" ? cs : 0), y0 + cs / 2), ctx.lineTo(x0 + cs * (p.k === "portal" ? 2 : 1), y0 + cs / 2));
          else (ctx.moveTo(x0 + cs / 2, y0 - (p.k === "portal" ? cs : 0)), ctx.lineTo(x0 + cs / 2, y0 + cs * (p.k === "portal" ? 2 : 1)));
          ctx.stroke();
          ctx.lineWidth = 1;
        } else if (p.k === "bridge") {
          ctx.fillStyle = c;
          ctx.fillRect(x0 + 1, y0 + 1, cs - 2, cs - 2);
          ctx.strokeStyle = "rgba(0,0,0,0.35)";
          ctx.beginPath();
          if (p.o === 0) for (let k = 1; k < 4; k++) (ctx.moveTo(x0 + (cs * k) / 4, y0 + 1), ctx.lineTo(x0 + (cs * k) / 4, y0 + cs - 1));
          else for (let k = 1; k < 4; k++) (ctx.moveTo(x0 + 1, y0 + (cs * k) / 4), ctx.lineTo(x0 + cs - 1, y0 + (cs * k) / 4));
          ctx.stroke();
        } else if (p.k === "free") {
          ctx.fillStyle = c;
          if (p.o === 0) ctx.fillRect(x0 + cs * 0.12, y0 + cs * 0.3, cs * 0.76, cs * 0.4);
          else ctx.fillRect(x0 + cs * 0.3, y0 + cs * 0.12, cs * 0.4, cs * 0.76);
        } else if (p.k === "lamp" || p.k === "skylight") {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(x0 + cs / 2, y0 + cs / 2, cs * 0.16, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.k === "hatch" || p.k === "door") {
          ctx.strokeStyle = c;
          ctx.lineWidth = 3;
          ctx.strokeRect(x0 + 3, y0 + 3, cs - 6, cs - 6);
          ctx.lineWidth = 1;
        }
        ctx.globalAlpha = 1;
      }
      // glyph letters on the furniture layer (what you typed)
      if (layer === "furn") {
        ctx.font = `bold ${Math.max(8, cs * 0.36)}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const g = chAt(t, "furn", x, y);
            if (g === "." || g === " ") continue;
            if (isBlock(GLYPHS[g]?.k)) continue;
            ctx.fillStyle = "rgba(0,0,0,0.8)";
            ctx.fillText(g, X(x) + cs / 2, Y(y) + cs / 2);
          }
      }
    }
    // the room's own thin walls (drywall)
    if (tile) {
      ctx.strokeStyle = layer === "walls" ? "#fff4c0" : "#15120c";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let y = 0; y < tile.h; y++) {
        for (let x = 0; x < tile.w; x++) {
          const i = y * tile.w + x;
          if (tile.wallN[i]) (ctx.moveTo(X(x), Y(y)), ctx.lineTo(X(x + 1), Y(y)));
          if (tile.wallW[i]) (ctx.moveTo(X(x), Y(y)), ctx.lineTo(X(x), Y(y + 1)));
        }
      }
      ctx.stroke();
    }
    // walls between rooms, the outline, doors
    ctx.lineWidth = 3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!inTile(t, x, y)) continue;
        for (const s of [0, 1, 2, 3]) {
          const nx = x + [0, 1, 0, -1][s];
          const ny = y + [-1, 0, 1, 0][s];
          const outer = !inTile(t, nx, ny);
          if (!outer && labAt(t, x, y) === labAt(t, nx, ny)) continue;
          if (!outer && s > 1) continue;
          ctx.strokeStyle = outer ? "#e8e2d4" : "#cfc7b6";
          ctx.beginPath();
          if (s === 0) (ctx.moveTo(X(x), Y(y)), ctx.lineTo(X(x + 1), Y(y)));
          if (s === 2) (ctx.moveTo(X(x), Y(y + 1)), ctx.lineTo(X(x + 1), Y(y + 1)));
          if (s === 3) (ctx.moveTo(X(x), Y(y)), ctx.lineTo(X(x), Y(y + 1)));
          if (s === 1) (ctx.moveTo(X(x + 1), Y(y)), ctx.lineTo(X(x + 1), Y(y + 1)));
          ctx.stroke();
        }
      }
    }
    const drawDoor = (d: [number, number, string, number], col: string): void => {
      const s = SIDE_CH.indexOf(d[2]);
      for (const [x, y] of lanesOf(d)) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 5;
        ctx.beginPath();
        if (s === 0) (ctx.moveTo(X(x) + 2, Y(y)), ctx.lineTo(X(x + 1) - 2, Y(y)));
        if (s === 2) (ctx.moveTo(X(x) + 2, Y(y + 1)), ctx.lineTo(X(x + 1) - 2, Y(y + 1)));
        if (s === 3) (ctx.moveTo(X(x), Y(y) + 2), ctx.lineTo(X(x), Y(y + 1) - 2));
        if (s === 1) (ctx.moveTo(X(x + 1), Y(y) + 2), ctx.lineTo(X(x + 1), Y(y + 1) - 2));
        ctx.stroke();
      }
    };
    for (const d of t.doors) drawDoor(d, d[3] >= 3 ? "#3ddc84" : "#9dff5c");
    for (const d of t.inner ?? []) drawDoor(d, "#3cc8ff");
    ctx.lineWidth = 1;
    // the props: each one's real footprint, turned, with a tick on its front
    const ps = t.props ?? [];
    const propLayer = layer === "props";
    ps.forEach((pl, k) => {
      const prop = KIT.get(pl.p);
      const v = kitVariant(pl);
      if (!prop || !v) {
        ctx.fillStyle = "#ff3a3a";
        ctx.fillRect(X(pl.x) - 4, Y(pl.y) - 4, 8, 8);
        return;
      }
      const sz = kitSize(pl) ?? v.size;
      const pw = Math.max(3, (sz[0] / CELL_M) * cs);
      const pd = Math.max(3, (sz[2] / CELL_M) * cs);
      ctx.save();
      ctx.translate(X(pl.x), Y(pl.y));
      ctx.rotate(((pl.r ?? 0) * Math.PI) / 180);
      ctx.globalAlpha = propLayer ? 1 : 0.45;
      ctx.fillStyle = prop.mount === "wall" ? PROP_FILL.wall : prop.mount === "ceiling" ? PROP_FILL.ceiling : kitBlocks(pl) ? PROP_FILL.solid : PROP_FILL.walk;
      ctx.fillRect(-pw / 2, -pd / 2, pw, pd);
      ctx.strokeStyle = k === propSel && propLayer ? "#ffffff" : "rgba(20,14,8,0.8)";
      ctx.lineWidth = k === propSel && propLayer ? 2 : 1;
      if (prop.mount === "ceiling") ctx.setLineDash([3, 2]);
      ctx.strokeRect(-pw / 2, -pd / 2, pw, pd);
      ctx.setLineDash([]);
      // the front: the model faces +y before turning
      ctx.beginPath();
      ctx.moveTo(-Math.min(5, pw / 3), pd / 2);
      ctx.lineTo(0, pd / 2 + Math.min(6, cs * 0.2));
      ctx.lineTo(Math.min(5, pw / 3), pd / 2);
      ctx.fillStyle = k === propSel && propLayer ? "#ffffff" : "rgba(20,14,8,0.8)";
      ctx.fill();
      ctx.restore();
    });
    // the name of the prop under the cursor / the selected one
    if (propLayer) {
      const label = (k: number): void => {
        const pl = ps[k];
        const name = KIT.get(pl.p)?.name ?? pl.p;
        ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
        const tw = ctx.measureText(name).width;
        const lx = Math.min(Math.max(2, X(pl.x) - tw / 2 - 5), w * cs - tw - 12);
        const ly = Math.max(2, Y(pl.y) - 30);
        ctx.fillStyle = "rgba(10,8,6,0.85)";
        ctx.fillRect(lx, ly, tw + 10, 18);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(name, lx + 5, ly + 9);
      };
      const under = hover ? propAt(t, hover.fx, hover.fy) : -1;
      if (under >= 0 && under !== propSel) label(under);
      if (propSel >= 0 && ps[propSel]) label(propSel);
      // where a new prop will land
      if (propBrush && hover && under < 0) {
        const ghost = placement(t, propBrush.p, propBrush.v, hover.fx, hover.fy);
        const v = kitVariant(ghost);
        if (v) {
          ctx.save();
          ctx.translate(X(ghost.x), Y(ghost.y));
          ctx.rotate(((ghost.r ?? 0) * Math.PI) / 180);
          ctx.strokeStyle = "#ffe070";
          ctx.setLineDash([4, 3]);
          ctx.lineWidth = 2;
          ctx.strokeRect(-(v.size[0] / CELL_M) * cs / 2, -(v.size[2] / CELL_M) * cs / 2, (v.size[0] / CELL_M) * cs, (v.size[2] / CELL_M) * cs);
          ctx.restore();
        }
      }
    }
    // the game markers: a coloured disc with its letter (faint on other layers)
    (t.marks ?? []).forEach((m, k) => {
      const d = MARK.get(m.k);
      const on = layer === "game";
      ctx.globalAlpha = on ? 1 : 0.55;
      ctx.fillStyle = d?.color ?? "#999";
      ctx.beginPath();
      ctx.arc(X(m.x), Y(m.y), Math.max(6, cs * 0.34), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = on && k === markSel ? "#ffffff" : "rgba(10,8,6,0.9)";
      ctx.lineWidth = on && k === markSel ? 3 : 1.5;
      ctx.stroke();
      ctx.fillStyle = "#101010";
      ctx.font = `bold ${Math.max(8, cs * 0.36)}px ui-sans-serif, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${d?.glyph ?? "?"}${(m.n ?? 1) > 1 ? m.n : ""}`, X(m.x), Y(m.y) + 1);
      // how far a creature wanders, while it is picked
      if (on && k === markSel && m.k === "entity") {
        ctx.strokeStyle = "rgba(255,77,77,0.5)";
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(X(m.x), Y(m.y), (m.roam ?? CREATURE_USUAL.entity.roam) * cs, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    });
    // the selection, and a piece being moved or pasted
    if (selRect && !floating) {
      ctx.strokeStyle = "#5ce1ff";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(X(selRect.x0) + 1, Y(selRect.y0) + 1, (selRect.x1 - selRect.x0 + 1) * cs - 2, (selRect.y1 - selRect.y0 + 1) * cs - 2);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(92,225,255,0.08)";
      ctx.fillRect(X(selRect.x0), Y(selRect.y0), (selRect.x1 - selRect.x0 + 1) * cs, (selRect.y1 - selRect.y0 + 1) * cs);
      ctx.lineWidth = 1;
    }
    if (floating) drawClip(ctx, floating.clip, floating.x, floating.y, X, Y);
    // the problems, where they are
    const bad = new Set<string>();
    for (const e of current?.errors ?? []) for (const m of e.matchAll(/\((\d+),(\d+)\)/g)) bad.add(`${m[1]},${m[2]}`);
    ctx.strokeStyle = "#ff3a3a";
    ctx.lineWidth = 2;
    for (const k of bad) {
      const [x, y] = k.split(",").map(Number);
      if (Number.isInteger(x) && Number.isInteger(y)) ctx.strokeRect(X(x) + 1, Y(y) + 1, cs - 2, cs - 2);
    }
    // a spot the checks pointed at: a ring that fades
    if (flash) {
      const left = flash.until - performance.now();
      if (left > 0) {
        ctx.save();
        ctx.strokeStyle = "#ffe070";
        ctx.lineWidth = 3;
        ctx.globalAlpha = Math.min(1, left / 600);
        ctx.beginPath();
        ctx.arc(X(flash.x + 0.5), Y(flash.y + 0.5), cs * (0.9 + 0.25 * Math.sin(left / 90)), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else flash = null;
    }
    // THE MEASURE TOOL: the line, its ends and what it measures
    if (measure) {
      const { a, b } = measure;
      ctx.save();
      ctx.strokeStyle = "#5ce1ff";
      ctx.fillStyle = "#5ce1ff";
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(X(a.x), Y(a.y));
      ctx.lineTo(X(b.x), Y(b.y));
      ctx.stroke();
      ctx.setLineDash([]);
      for (const p of [a, b]) {
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      const text = measureText(t, a, b);
      ctx.font = "bold 13px sans-serif";
      const tw = ctx.measureText(text).width;
      const mx = Math.min(Math.max(X((a.x + b.x) / 2) - tw / 2, 2), cv.width / (window.devicePixelRatio || 1) - tw - 10);
      const my = Math.max(Y((a.y + b.y) / 2) - 12, 18);
      ctx.fillStyle = "rgba(10,12,14,0.85)";
      ctx.fillRect(mx - 5, my - 15, tw + 10, 21);
      ctx.fillStyle = "#e8fbff";
      ctx.fillText(text, mx, my);
      ctx.restore();
    }
    // hover
    if (hover && !propLayer && tool !== "select" && tool !== "measure" && !floating && layer !== "game") {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      if (layer === "walls") {
        const { x, y, side } = hover;
        ctx.beginPath();
        if (side === 0) (ctx.moveTo(X(x), Y(y)), ctx.lineTo(X(x + 1), Y(y)));
        if (side === 2) (ctx.moveTo(X(x), Y(y + 1)), ctx.lineTo(X(x + 1), Y(y + 1)));
        if (side === 3) (ctx.moveTo(X(x), Y(y)), ctx.lineTo(X(x), Y(y + 1)));
        if (side === 1) (ctx.moveTo(X(x + 1), Y(y)), ctx.lineTo(X(x + 1), Y(y + 1)));
        ctx.stroke();
      } else if (layer === "doors") {
        const { x, y, side } = hover;
        ctx.beginPath();
        if (side === 0) (ctx.moveTo(X(x), Y(y)), ctx.lineTo(X(x + doorW), Y(y)));
        if (side === 2) (ctx.moveTo(X(x), Y(y + 1)), ctx.lineTo(X(x + doorW), Y(y + 1)));
        if (side === 3) (ctx.moveTo(X(x), Y(y)), ctx.lineTo(X(x), Y(y + doorW)));
        if (side === 1) (ctx.moveTo(X(x + 1), Y(y)), ctx.lineTo(X(x + 1), Y(y + doorW)));
        ctx.stroke();
      } else if (layer === "furn" && GLYPHS[brush] && isBlock(GLYPHS[brush].k)) {
        const g = GLYPHS[brush];
        const fps = K.blocks(g.k)!.filter((m) => m.name === g.t);
        const fp = fps[rot % fps.length];
        ctx.strokeRect(X(hover.x) + 1, Y(hover.y) + 1, fp.w * cs - 2, fp.h * cs - 2);
      } else ctx.strokeRect(X(hover.x) + 1, Y(hover.y) + 1, cs - 2, cs - 2);
    }
    ctx.lineWidth = 1;
    if (boxFrom && hover) {
      ctx.strokeStyle = boxFrom.erase ? "#ff6a5a" : "#ffe070";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      const x0 = Math.min(boxFrom.x, hover.x);
      const y0 = Math.min(boxFrom.y, hover.y);
      ctx.strokeRect(X(x0) + 1, Y(y0) + 1, (Math.abs(hover.x - boxFrom.x) + 1) * cs - 2, (Math.abs(hover.y - boxFrom.y) + 1) * cs - 2);
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    }
    if (stairFrom && hover) {
      ctx.strokeStyle = "#d6a846";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(X(stairFrom.x) + cs / 2, Y(stairFrom.y) + cs / 2);
      const along = Math.abs(hover.x - stairFrom.x) >= Math.abs(hover.y - stairFrom.y);
      ctx.lineTo(X(along ? hover.x : stairFrom.x) + cs / 2, Y(along ? stairFrom.y : hover.y) + cs / 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  /** A piece of room (the clipboard's) drawn over the grid where it would land. */
  function drawClip(ctx: CanvasRenderingContext2D, c: Clip, ox: number, oy: number, X: (x: number) => number, Y: (y: number) => number): void {
    ctx.save();
    ctx.globalAlpha = 0.72;
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const m = c.map[y]?.[x] ?? " ";
        if (m === " ") continue;
        ctx.fillStyle = m === "#" ? "#2c2925" : (ZONE_COLOR[m === "." ? T().type : (K.dia.zones[m] ?? T().type)] ?? "#666");
        ctx.fillRect(X(ox + x), Y(oy + y), cs, cs);
        const g = c.furn[y]?.[x] ?? ".";
        if (g !== "." && g !== " ") {
          ctx.fillStyle = GROUP_COLOR[GLYPHS[g]?.k ?? ""] ?? "#ccc";
          ctx.fillRect(X(ox + x) + cs * 0.2, Y(oy + y) + cs * 0.2, cs * 0.6, cs * 0.6);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#15120c";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const [x, y, sd] of c.walls) {
      if (sd === "N") (ctx.moveTo(X(ox + x), Y(oy + y)), ctx.lineTo(X(ox + x + 1), Y(oy + y)));
      else (ctx.moveTo(X(ox + x), Y(oy + y)), ctx.lineTo(X(ox + x), Y(oy + y + 1)));
    }
    ctx.stroke();
    for (const p of c.props) {
      ctx.fillStyle = PROP_FILL.walk;
      ctx.fillRect(X(ox + p.x) - 4, Y(oy + p.y) - 4, 8, 8);
    }
    for (const m of c.marks) {
      ctx.fillStyle = MARK.get(m.k)?.color ?? "#999";
      ctx.beginPath();
      ctx.arc(X(ox + m.x), Y(oy + m.y), Math.max(5, cs * 0.28), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#5ce1ff";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(X(ox) + 1, Y(oy) + 1, c.w * cs - 2, c.h * cs - 2);
    ctx.restore();
  }

  // ---- panels ---------------------------------------------------------------------------
  function toolsHTML(): string {
    const cellLayer = TOOL_LAYERS.includes(layer);
    const places = layer === "props" || layer === "game" || layer === "doors";
    const list: [string, string, string][] = [
      ["brush", places ? "Place" : "Brush", places ? "place things and pick them one at a time" : "paint one cell at a time (drag for more)"],
      ...(cellLayer
        ? ([
            ["box", layer === "walls" ? "Box outline" : "Box", layer === "walls" ? "drag a rectangle: walls go up round its edge" : "drag a rectangle: every cell inside it"],
            ...(FILL_LAYERS.includes(layer) ? [["fill", "Fill", "click: every joined cell that looks the same"]] : []),
          ] as [string, string, string][])
        : []),
      ["select", "Select", "drag a box over part of the room: move it, copy it, turn it or paste it into another room"],
      ["measure", "Measure", "drag between two points: how far apart they are, and how far up or down"],
    ];
    const tip = tool === "measure" ? "Drag between two points. The line stays until you measure again or pick another tool." : cellLayer && tool !== "select" ? "Right-click with any tool erases." : "";
    return `<div class="grp toolgrp"><b>Tool</b>${list
      .map(([id, label, title]) => `<button class="pal${tool === id ? " on" : ""}" data-tool="${id}" title="${esc(title)}">${esc(label)}</button>`)
      .join("")}${tip ? `<span class="hint">${tip}</span>` : ""}</div>`;
  }
  function paletteHTML(): string {
    if (layer === "props") return toolsHTML() + propBrowserHTML();
    if (layer === "game") return toolsHTML() + gamePaletteHTML();
    return toolsHTML() + paletteBody();
  }
  function paletteBody(): string {
    const btn = (ch: string, label: string, sw: string, title = label): string =>
      `<button class="pal${brush === ch ? " on" : ""}" data-brush="${esc(ch)}" title="${esc(title)}"><span class="sw" style="background:${sw}">${esc(ch === " " ? "·" : ch)}</span>${esc(label)}</button>`;
    if (layer === "map") {
      return (
        `<div class="grp"><b>Cells</b>${btn(".", `floor (${T().type})`, ZONE_COLOR[T().type] ?? "#666")}${btn("#", "solid concrete", "#2c2925")}${btn(" ", "not part of the room", "#1a1814")}</div>` +
        `<div class="grp"><b>Floor of another type</b>${Object.entries(K.dia.zones).map(([k, v]) => btn(k, v, ZONE_COLOR[v] ?? "#666")).join("")}</div>`
      );
    }
    if (layer === "height") {
      const ceil =
        level === 1
          ? `<p class="hint">The Poolrooms keep one flat ceiling per room whatever the floor does.</p>`
          : `<div class="hmode"><button class="pal${heightMode === "floor" ? " on" : ""}" data-hmode="floor" title="Only the floor moves — the ceiling stays where it is">Floor only</button><button class="pal${heightMode === "both" ? " on" : ""}" data-hmode="both" title="The ceiling moves up and down with the floor">Floor and ceiling</button></div><p class="hint">${heightMode === "floor" ? "Only the floor moves. A cell keeping its old ceiling shows a blue bar along its top." : "The ceiling moves with the floor, so a lowered floor lowers its ceiling too."}</p>`;
      return `<div class="grp"><b>Floor height (steps of 0.5m)</b>${K.heights.map((v) => btn(encodeH(v), K.heightLabel(v), K.wet(v) ? "#2c86c8" : v < 0 ? "#2a2723" : "#8a8272")).join("")}</div><div class="grp"><b>Ceiling</b>${ceil}</div>`;
    }
    if (layer === "stair") {
      return `<div class="grp"><b>Drag a run</b><p class="hint">With “run” picked, drag from the TOP cell of the stair to the bottom: each cell steps down one from where you started.</p>${btn("run", "stair run (drag)", "#d6a846")}</div><div class="grp"><b>Or paint the way up</b>${btn("^", "up is north", "#d6a846")}${btn(">", "up is east", "#d6a846")}${btn("v", "up is south", "#d6a846")}${btn("<", "up is west", "#d6a846")}${btn(".", "no stair", "#444")}</div>`;
    }
    if (layer === "walls") {
      return `<div class="grp"><b>Thin walls</b>${btn("-", "put a wall up", "#15120c")}${btn(".", "take a wall down", "#444")}<p class="hint">Click or drag along the edge between two cells. Right-click also takes a wall down.</p></div>`;
    }
    if (layer === "rooms") {
      const labs = "123456789ABCDEF";
      return `<div class="grp"><b>Room labels</b>${[...labs].map((c, k) => btn(c, `room ${c}`, ROOM_TINT[k % ROOM_TINT.length])).join("")}</div>`;
    }
    if (layer === "furn") {
      return (
        K.dia.groups.map((g) => `<div class="grp"><b>${esc(g.name)}</b>${[...g.glyphs].map((c) => btn(c, GLYPHS[c].label, GROUP_COLOR[GLYPHS[c].k] ?? "#ccc")).join("")}</div>`).join("") +
        `<div class="grp">${btn(".", "erase", "#444")}<p class="hint">${K.level === 2 ? `Machines: <b>R</b> turns the footprint (now ${rot % 2 ? "north–south" : "east–west"}). ` : ""}Shift-click any piece to turn it by hand.</p></div>`
      );
    }
    return `<div class="grp"><b>Door width</b>${K.doorWidths.map(({ w, label }) => `<button class="pal${doorW === w ? " on" : ""}" data-doorw="${w}"><span class="sw" style="background:${w >= 3 ? "#3ddc84" : "#9dff5c"}">${w}</span>${label}</button>`).join("")}<p class="hint">Doorways only join to one of the SAME width. Green on the outline = a doorway the generator uses; blue inside = an inner door.</p></div>`;
  }

  function roomFieldsHTML(): string {
    const t = T();
    const { w, h } = dims(t);
    const sets = Array.isArray(t.set) ? t.set : [t.set];
    const opt = (v: string, cur: string): string => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(v)}</option>`;
    const labels = [...new Set(t.map.flatMap((r, y) => [...r].map((c, x) => (c === " " ? null : labAt(t, x, y)))).filter((q): q is string => !!q))];
    const kinds =
      labels.length > 1
        ? `<fieldset><legend>What each room is</legend>${labels.map((l) => `<label class="row">room ${esc(l)} <input data-rk="${esc(l)}" value="${esc(t.roomKinds?.[l] ?? t.kind)}"></label>`).join("")}</fieldset>`
        : "";
    // THE LOOK PICKER, every level: walls, floor and ceiling, each the
    // room's default unless picked (surfaces.ts). A repaint is dressing: it
    // publishes without resetting the level.
    const lookHTML = (): string => {
      // what a room wears when it picks nothing: Level 0 its TYPE's; the
      // Poolrooms their white tile; Pipe Dreams raw concrete (catwalks grate)
      const own = lobbyLookOf(t.type);
      const LEVEL_OWN: Record<number, Record<SurfaceKind, string>> = {
        1: { wall: "White pool tile", floor: "White pool tile", ceil: "White pool tile" },
        2: { wall: "Raw concrete", floor: t.type === "catwalk" ? "Rusted metal walkway" : "Concrete", ceil: "Concrete" },
        3: { wall: "Dirty white tile", floor: "Chipped epoxy", ceil: "Riveted plate" },
        4: { wall: "Beige drywall", floor: "Grey office carpet", ceil: "Drop ceiling (tiles and panels)" },
        5: { wall: "Mahogany-red wallpaper", floor: "Red carpet with a gold border", ceil: "Coffered plaster" },
        6: { wall: "Concrete (the room type's)", floor: "Concrete (wet asphalt under the water)", ceil: "Bare concrete" },
        8: { wall: "The room type's (subway tile, limestone, damp rock)", floor: "The room type's (tile, gravel, the riverbed)", ceil: "The room type's (concrete in the Station, rock in the caves)" },
        9: { wall: "The lot type's (paper inside a house; siding and fences are drawn by the game)", floor: "The lot type's (asphalt, pavement, lawn, carpet)", ceil: "None outdoors — the night sky" },
        7: { wall: "The block type's (brick facades, concrete roofs)", floor: "The block type's (asphalt streets, concrete roofs)", ceil: "None outdoors — the fog is the sky" },
      };
      const pick = (kind: SurfaceKind, label: string): string => {
        const cur = t.look?.[kind] ?? "";
        const dflt = K.level === 0 ? `${SURFACES[kind][own[kind]]?.name ?? ""} (the type's)` : `${LEVEL_OWN[K.level]?.[kind] ?? ""} (the level's)`;
        const mine = allSurfaces(kind).slice(SURFACES[kind].length);
        return `<label class="row">${label} <select data-look="${kind}"><option value=""${cur ? "" : " selected"}>${esc(dflt)}</option>${levelSurfaces(kind, K.level)
          .map((s) => `<option value="${esc(s.id)}"${cur === s.id ? " selected" : ""}>${esc(s.name)}</option>`)
          .join("")}${mine.length ? `<optgroup label="Your textures">${mine.map((s) => `<option value="${esc(s.id)}"${cur === s.id ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</optgroup>` : ""}</select></label>`;
      };
      // a labelled choice for one number of the room's style
      const choice = (key: "lights" | "flicker" | "bright", label: string, opts: [number | "", string][]): string => {
        const cur = t.look?.[key] ?? "";
        return `<label class="row">${label} <select data-look="${key}">${opts.map(([v, l]) => `<option value="${v}"${String(v) === String(cur) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
      };
      const snd = t.look?.sound ?? "";
      return `<fieldset class="looks"><legend>Look</legend>${pick("wall", "walls")}${pick("floor", "floor")}${pick("ceil", "ceiling")}
          <button class="addtex" data-a="addtex">+ Add a texture…</button>
          <p class="hint">Only the room's own ${esc(t.type)} floor wears it; a corner painted another type keeps its own.</p></fieldset>
        <fieldset class="looks"><legend>Lights</legend>
          ${choice("lights", "lights on", [["", "the usual"], [100, "all of them"], [75, "most"], [50, "half"], [25, "a few"], [0, "none"]])}
          ${choice("flicker", "flickering", [["", "the usual (1 in 40)"], [0, "none"], [5, "a few"], [20, "lots"], [60, "most"]])}
          ${choice("bright", "brightness", [[25, "very dark"], [50, "dark"], [75, "dim"], ["", "normal"], [125, "bright"], [160, "very bright"]])}
          <p class="hint">Every light is a real fixture: “none” turns them off, it doesn't take them down.</p></fieldset>
        <fieldset class="looks"><legend>Sound</legend>
          <label class="row">plays <select data-look="sound"><option value=""${snd ? "" : " selected"}>the level's own hum</option>${ROOM_SOUNDS.map((q) => `<option value="${q.id}"${snd === q.id ? " selected" : ""}>${esc(q.name)}</option>`).join("")}</select></label>
          ${snd && snd !== "silence" ? `<button data-a="hearsound">▶ Listen</button>` : ""}
          <p class="hint">Plays while somebody stands in the room. None of this resets the level.</p></fieldset>
        ${stairsHTML()}`;
    };
    // THE STAIRS' LOOK (stairs.ts): what the room's flights wear, how they're
    // cut, how wide, and rails — for every stair cell in the room
    const stairsHTML = (): string => {
      const st = t.stairs ?? {};
      const surfOpts = (kind: SurfaceKind, label: string): string => {
        const all = [...levelSurfaces(kind, level), ...allSurfaces(kind).slice(SURFACES[kind].length)];
        return `<optgroup label="${label}">${all.map((q) => `<option value="${esc(q.id)}"${st.tex === q.id ? " selected" : ""}>${esc(q.name)}</option>`).join("")}</optgroup>`;
      };
      const stepsOpts = Array.from({ length: STAIR_STEPS_MAX - STAIR_STEPS_MIN + 1 }, (_, k) => k + STAIR_STEPS_MIN)
        .map((v) => `<option value="${v}"${(st.steps ?? STAIR_STEPS_DEFAULT) === v ? " selected" : ""}>${v} a cell${v === STAIR_STEPS_DEFAULT ? " (the usual)" : ""}</option>`)
        .join("");
      const widthOpts = [100, 90, 80, 70, 60, 50, 40].map((v) => `<option value="${v}"${(st.width ?? 100) === v ? " selected" : ""}>${v === 100 ? "the whole cell" : `${v}%`}</option>`).join("");
      const has = (t.stair ?? []).some((r) => /[\^>v<]/.test(r));
      return `<fieldset class="looks"><legend>Stairs</legend>
          <label class="row">steps <select data-stair="tex"><option value=""${st.tex ? "" : " selected"}>the floor's own</option>${surfOpts("floor", "Floor textures")}${surfOpts("wall", "Wall textures")}${surfOpts("ceil", "Ceiling textures")}</select></label>
          <label class="row">colour <input type="color" data-stair="col" value="${esc(st.col ?? "#c8b88a")}">${st.col ? ` <button data-stairclear title="Back to the surface's own colour">clear</button>` : ""}</label>
          <label class="row">cut into <select data-stair="steps">${stepsOpts}</select></label>
          <label class="row">width <select data-stair="width">${widthOpts}</select></label>
          <label class="row chk"><input type="checkbox" data-stair="rail"${st.rail ? " checked" : ""}> rails along the open sides</label>
          <p class="hint">${has ? "Every stair in this room wears this. Paint stairs on the Stairs layer." : "This room has no stairs yet — paint them on the Stairs layer."}</p></fieldset>`;
    };
    return `
    <div class="usedrow"><button data-a="whereused" title="Build the level and light up every copy of this room">Where is it used?</button></div>
    ${weightHTML()}
    <label class="row">id <input data-f="id" value="${esc(t.id)}"></label>
    <label class="row">name on the map <input data-f="name" value="${esc(t.name ?? "")}" placeholder="(only for set pieces)"></label>
    <label class="row">kind <input data-f="kind" value="${esc(t.kind)}"></label>
    <label class="row">role <select data-f="role">${K.dia.roles.map((r) => opt(r, t.role)).join("")}</select></label>
    <label class="row">type <select data-f="type">${K.dia.types.map((r) => opt(r, t.type)).join("")}</select></label>
    ${lookHTML()}
    <div class="row sets">${K.setLabel} ${K.dia.sets.map((s) => `<label><input type="checkbox" data-set="${s}"${sets.includes(s) ? " checked" : ""}> ${s}</label>`).join("")}</div>
    <div class="row nums"><label>weight <input type="number" step="0.1" data-n="weight" value="${t.weight ?? ""}" placeholder="1"></label><label>min <input type="number" data-n="min" value="${t.min ?? ""}"></label><label>max <input type="number" data-n="max" value="${t.max ?? ""}"></label></div>
    <div class="row nums"><label>width <input type="number" id="tw" value="${w}"></label><label>height <input type="number" id="th" value="${h}"></label><span class="shift">move <button data-sh="-1,0">←</button><button data-sh="1,0">→</button><button data-sh="0,-1">↑</button><button data-sh="0,1">↓</button></span></div>
    ${kinds}
    <label class="row col">note <textarea data-f="note" rows="2">${esc(t.note ?? "")}</textarea></label>`;
  }

  function listHTML(): string {
    // every room with problems, checked once a draw
    const bad = new Set(lib.map((t, k) => (lintTile(t).errors.length ? k : -1)).filter((k) => k >= 0));
    badCount = bad.size;
    const byRole = new Map<string, number[]>();
    lib.forEach((t, k) => {
      if (filter && !`${t.id} ${t.name ?? ""} ${t.kind}`.toLowerCase().includes(filter)) return;
      if (onlyBad && !bad.has(k)) return;
      byRole.set(t.role, [...(byRole.get(t.role) ?? []), k]);
    });
    const order = K.roleOrder;
    return order
      .filter((r) => byRole.has(r))
      .map(
        (r) =>
          `<div class="lgrp"><b>${r}s</b>${byRole
            .get(r)!
            .map((k) => {
              const isBad = bad.has(k);
              const np = lib[k].props?.length ?? 0;
              return `<button class="li${k === sel ? " on" : ""}${isBad ? " bad" : ""}" data-sel="${k}">${esc(lib[k].id)}${np ? `<small>${np}</small>` : ""}${isBad ? " ⚠" : ""}</button>`;
            })
            .join("")}</div>`,
      )
      .join("");
  }

  let preview: ReturnType<typeof createPreview3D> | null = null;
  let previewTimer = 0;
  function refresh(full = true): void {
    if (!lib.length) return;
    sel = Math.min(sel, lib.length - 1);
    const l = lintTile(T());
    current = { tile: l.tile, errors: l.errors, warnings: l.warnings };
    drawGrid();
    // a check that names a cell can be clicked to show it
    const checkLi = (e: string): string => {
      const at = e.match(/\((\d+),(\d+)\)/);
      return at ? `<li><button class="jump" data-jump="${at[1]},${at[2]}" title="Show me where">${esc(e)}</button></li>` : `<li>${esc(e)}</li>`;
    };
    $("#lint").innerHTML =
      (l.errors.length ? `<ul class="errs">${l.errors.map(checkLi).join("")}</ul>` : `<p class="okmsg">No problems — the generator can use this room.</p>`) +
      (l.warnings.length ? `<ul class="warns">${l.warnings.map(checkLi).join("")}</ul>` : "");
    $("#list").innerHTML = listHTML();
    const others = badCount - (l.errors.length ? 1 : 0);
    if (others) $("#lint").insertAdjacentHTML("beforeend", `<p class="hint">${others} other room${others > 1 ? "s have" : " has"} problems. Tick “only rooms with problems” above the room list to find ${others > 1 ? "them" : "it"}.</p>`);
    showSaveState();
    $("#title").textContent = `${T().id}${T().name ? ` — ${T().name}` : ""}`;
    $("main").classList.toggle("propsmode", layer === "props");
    if (full) {
      $("#palette").innerHTML = paletteHTML();
      $("#insp").innerHTML = inspectorHTML();
      $("#layers").innerHTML = LAYERS.map((q) => `<button class="tab${layer === q.id ? " on" : ""}" data-layer="${q.id}">${q.label}${q.id === "props" && T().props?.length ? ` <small>${T().props!.length}</small>` : ""}${q.id === "game" && T().marks?.length ? ` <small>${T().marks!.length}</small>` : ""}</button>`).join("");
      $("#layerhelp").textContent = layer === "height" ? K.heightHelp : LAYERS.find((q) => q.id === layer)!.help;
    } else if (layer === "props" || layer === "game") {
      // keep the inspector's numbers live while dragging, without rebuilding
      // the input the cursor is in
      const focus = root.ownerDocument.activeElement as HTMLElement | null;
      if (!focus || !$("#insp").contains(focus)) $("#insp").innerHTML = inspectorHTML();
    }
    clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => preview?.show(l.errors.length && !l.tile.w ? null : l.tile, layer === "props" ? propSel : -1), 140);
  }

  function status(msg: string): void {
    $("#status").textContent = msg;
  }

  // ---- the whole level, publishing, history -------------------------------------------
  /** Build the level the editor holds now into `map`; false if it can't. */
  async function buildLevel(): Promise<boolean> {
    const broken = lib.filter((t) => lintTile(t).errors.length).map((t) => t.id);
    if (broken.length) {
      status(`Can't build the level yet: ${broken.slice(0, 4).join(", ")}${broken.length > 4 ? "…" : ""} still ha${broken.length > 1 ? "ve" : "s"} problems.`);
      return false;
    }
    status(`Building the level from ${lib.length} rooms (seed ${seed})…`);
    let j: Record<string, unknown>;
    try {
      j = await api.mapBuild(level, lib, seed);
    } catch (e) {
      status(`The level didn't build: ${describeError(e)}`);
      return false;
    }
    map = decodeMap(j);
    builtFp = String(j.fingerprint ?? "");
    builtFor = JSON.stringify({ lib, seed });
    compare = null;
    mapHover = -1;
    return true;
  }
  async function generate(): Promise<void> {
    usesTile = null;
    if (!(await buildLevel()) || !map) return;
    mapPick = map.insts.find((i) => i.tileId === T().id)?.id ?? -1;
    showMapModal();
    status(`Level built: ${(map.stats as Record<string, number>).pieces} pieces. Hover a piece to see it, click it to open that room.`);
  }
  function showMapModal(): void {
    if (!map) return;
    $("#mapmodal").hidden = false;
    const s = map.stats as Record<string, number | string>;
    // a problem about floor nobody can reach can show where it is
    const probLi = (p: string): string => (/walked to|be reached|sealed/.test(p) ? `<li><button class="jump" data-ov="unreach" title="Show me where">${esc(p)}</button></li>` : `<li>${esc(p)}</li>`);
    $("#mapstats").innerHTML = `
      ${map.problems.length ? `<ul class="errs">${map.problems.map(probLi).join("")}</ul>` : `<p class="okmsg">The level keeps every rule — it can go live.</p>`}
      ${K.statLines(s, esc)}`;
    $("#maphint").textContent = K.mapHint;
    paintMap();
  }
  /** WHERE IS IT USED: the whole-level view with every copy of this room lit. */
  async function whereUsed(): Promise<void> {
    const id = T().id;
    if (!map || compare || builtFor !== JSON.stringify({ lib, seed })) {
      if (!(await buildLevel())) return;
    }
    usesTile = id;
    mapPick = -1;
    showMapModal();
    const n = map!.insts.filter((i) => i.tileId === id).length;
    status(n ? `${id} is used ${n} time${n > 1 ? "s" : ""} in this level.` : `The generator didn't use ${id} anywhere with this seed.`);
  }
  /** The checks pointed at a cell: bring it into view and ring it. */
  function showSpot(x: number, y: number): void {
    flash = { x, y, until: performance.now() + 1800 };
    const box = $("#gridbox");
    box.scrollTo({ left: (x + 0.5) * cs - box.clientWidth / 2, top: (y + 0.5) * cs - box.clientHeight / 2, behavior: "smooth" });
    const tick = (): void => {
      if (!root.isConnected || !flash) return;
      drawGrid();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  let mapHit: ((px: number, py: number) => number) | null = null;
  function paintMap(): void {
    if (!map) return;
    let ov: Overlay = { kind: "none" };
    if (compare) ov = { kind: "changes", changed: compare.changed, added: compare.showing === "after" ? compare.added : new Set() };
    else if (usesTile) ov = { kind: "uses", tileId: usesTile };
    else if (overlayKind === "distance") ov = { kind: "distance" };
    else if (overlayKind === "unreach") ov = { kind: "unreach" };
    else if (overlayKind === "weight") {
      const w = squareCosts(map.kit, map.size);
      ov = { kind: "weight", n: w.n, square: COST_SQUARE, loads: w.costs.map(costLoad) };
    }
    else if (overlayKind === "deaths" && heat) ov = { kind: "deaths", deaths: heat.deaths };
    else if (overlayKind === "explored" && heat && heat.size === map.size) ov = { kind: "explored", explored: heat.explored };
    mapHit = drawMap($<HTMLCanvasElement>("#mapcv"), map, mapHover, mapPick, ov);
    $("#mapover").innerHTML = overlayHTML();
    $("#mapcmp").innerHTML = compareHTML();
    const inst = map.insts.find((i) => i.id === mapHover);
    $("#maphover").textContent = inst ? `${inst.tileId}${inst.name ? ` (${inst.name})` : ""}${inst.main ? (K.level === 1 ? " — on a river" : " — on the route") : ""}` : "";
  }

  /** The whole-level view's overlay buttons, and what the chosen one says. */
  function overlayHTML(): string {
    if (compare) return "";
    if (usesTile && map) {
      const n = map.insts.filter((i) => i.tileId === usesTile).length;
      return `<div class="cmpbar"><b>Where ${esc(usesTile)} is used</b><p class="hint">${
        n ? `${n} cop${n > 1 ? "ies" : "y"} in this level, in green.` : "Not used with this seed. Check its weight, its max and its sets, or try another seed."
      }</p><button data-usesend>Show all the rooms</button></div>`;
    }
    const chip = (k: typeof overlayKind, label: string, title: string): string => `<button class="chip${overlayKind === k ? " on" : ""}" data-ov="${k}" title="${esc(title)}">${label}</button>`;
    let note = "";
    if (overlayKind === "deaths" && heat) {
      const by = new Map<string, number>();
      for (const d of heat.deaths) by.set(d.cause, (by.get(d.cause) ?? 0) + 1);
      note = heat.deaths.length
        ? `${heat.deaths.length} death${heat.deaths.length === 1 ? "" : "s"} on the live map: ${[...by].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${n} to ${esc(c)}`).join(", ")}.`
        : "Nobody has died on the live map yet.";
    } else if (overlayKind === "explored" && heat) {
      let seen = 0;
      let open = 0;
      if (map && heat.size === map.size) for (let i = 0; i < map.solid.length; i++) if (!map.solid[i]) (open++, heat.explored[i] && seen++);
      note = heat.size !== map?.size ? "The live map is a different size from this one, so this can't be shown." : `Pink is floor nobody has ever seen. ${open ? Math.round((seen / open) * 100) : 0}% of it has been walked.`;
    } else if (overlayKind === "unreach") {
      let lost = 0;
      if (map?.dist) for (let i = 0; i < map.dist.length; i++) if (!map.solid[i] && !map.background[i] && map.dist[i] === 0xffff) lost++;
      note = lost ? `Pink is floor nobody can walk to from the level's door: ${lost} cell${lost > 1 ? "s" : ""}. Click a room to open it.` : "Every bit of floor can be walked to from the level's door.";
    } else if (overlayKind === "weight" && map) {
      const over = squareCosts(map.kit, map.size).costs.map(costLoad).filter((v) => v > 1).length;
      const top = costLoad(levelPatchMax(map.kit, map.size));
      const total = costOf(map.kit.map(([p, v]) => ({ p, v })));
      note = `Each square is 16×16 cells. 100% is as heavy as the busiest 16×16 patch on any live level today (${COST_BUDGET.calls} draw calls or ${(COST_BUDGET.tris / 1000).toFixed(0)}k triangles). The busiest patch anywhere here is ${Math.round(top * 100)}%.${over ? ` ${over} square${over > 1 ? "s are" : " is"} over: players may stutter there.` : top > 1 ? " Over budget where squares meet: players may stutter there." : ""} Counts the props you placed (${total.props} in all).`;
    } else if (overlayKind === "distance") {
      let far = 0;
      if (map?.dist) for (const v of map.dist) if (v !== 0xffff && v > far) far = v;
      note = `Blue is near the level's door, red is far. The farthest floor is ${far} steps away.`;
    }
    const mismatch = heat && (overlayKind === "deaths" || overlayKind === "explored") && heat.fingerprint !== builtFp ? `<p class="warns">These come from the live map. Your draft changes the map itself, so some may not line up with it.</p>` : "";
    return `<div class="ovchips">${chip("none", "Rooms", "just the map")}${chip("deaths", "Deaths", "where players died")}${chip("explored", "Nobody's been", "floor no player has ever seen")}${chip("distance", "Distance", "how far each spot is from the door")}${chip("unreach", "Can't reach", "floor nobody can walk to")}${chip("weight", "Weight", "how heavy the props are to draw, square by square")}</div>${note ? `<p class="hint">${note}</p>` : ""}${mismatch}`;
  }
  async function setOverlay(k: typeof overlayKind): Promise<void> {
    overlayKind = k;
    usesTile = null;
    if ((k === "deaths" || k === "explored") && !heat) {
      try {
        const h = await api.mapHeat(level);
        heat = { fingerprint: h.fingerprint, size: h.size, deaths: h.deaths, explored: Uint8Array.from(atob(h.explored), (c) => c.charCodeAt(0)) };
      } catch (e) {
        status(`Couldn't load what players did: ${describeError(e)}`);
        overlayKind = "none";
      }
    }
    paintMap();
  }
  function compareHTML(): string {
    if (!compare) return "";
    const name = compare.version ? `version ${compare.version}` : "the original map";
    return `<div class="cmpbar"><b>Comparing ${name} with your draft</b>
      <div class="ovchips"><button class="chip${compare.showing === "before" ? " on" : ""}" data-cmpshow="before">Before (${name})</button><button class="chip${compare.showing === "after" ? " on" : ""}" data-cmpshow="after">After (your draft)</button></div>
      <p class="hint">${compare.sameMap ? "The floor, walls and doors are the same; only dressing differs." : "The map itself is different."} Yellow rooms changed, green ones are new.</p>
      <ul class="changes">${compare.lines || "<li>Nothing changed.</li>"}</ul>
      <button data-cmpend>Stop comparing</button></div>`;
  }
  async function openCompare(version: number): Promise<void> {
    const broken = lib.filter((t) => lintTile(t).errors.length).map((t) => t.id);
    if (broken.length) return status(`Can't compare yet: ${broken.slice(0, 4).join(", ")} still ha${broken.length > 1 ? "ve" : "s"} problems.`);
    status("Building both maps…");
    try {
      const r = await api.mapCompare(level, version, lib, seed);
      const ch = r.changes;
      const names = (ids: string[]): string => ids.slice(0, 8).map(esc).join(", ") + (ids.length > 8 ? ` and ${ids.length - 8} more` : "");
      const lines = [
        ch.added.length ? `<li>New rooms: ${names(ch.added)}</li>` : "",
        ch.removed.length ? `<li>Rooms taken out: ${names(ch.removed)}</li>` : "",
        ch.reshaped.length ? `<li>Rooms redrawn: ${names(ch.reshaped)}</li>` : "",
        ch.propsAdded || ch.propsRemoved ? `<li>Props: ${ch.propsAdded} placed, ${ch.propsRemoved} taken away</li>` : "",
        ch.looksChanged.length ? `<li>New looks, lights or sounds: ${names(ch.looksChanged)}</li>` : "",
        ch.marksChanged.length ? `<li>Creatures or spots: ${names(ch.marksChanged)}</li>` : "",
      ].join("");
      compare = {
        version,
        before: decodeMap(r.before),
        after: decodeMap(r.after),
        changed: new Set([...ch.reshaped, ...ch.propsChanged, ...ch.looksChanged, ...ch.marksChanged]),
        added: new Set(ch.added),
        showing: "after",
        sameMap: r.sameMap,
        lines,
      };
      map = compare.after;
      mapHover = -1;
      mapPick = -1;
      $("#histmodal").hidden = true;
      $("#mapmodal").hidden = false;
      $("#mapstats").innerHTML = "";
      $("#maphint").textContent = "Switch between Before and After to see what moved. Click a room to open it.";
      paintMap();
      status("Comparing — Before and After are at the top right.");
    } catch (e) {
      status(`Couldn't compare: ${describeError(e)}`);
    }
  }

  // ---- TRY SEEDS: the same rooms under several seeds, side by side -----------------
  let seedRun = 0;
  const seedMaps = new Map<number, { map: MapData; fp: string; lib: string }>();
  async function openSeeds(more: boolean): Promise<void> {
    const broken = lib.filter((t) => lintTile(t).errors.length).map((t) => t.id);
    if (broken.length) {
      status(`Can't build the level yet: ${broken.slice(0, 4).join(", ")} still ha${broken.length > 1 ? "ve" : "s"} problems.`);
      return;
    }
    $("#seedmodal").hidden = false;
    const run = ++seedRun;
    const grid = $("#seedgrid");
    if (!more) grid.innerHTML = "";
    const libJson = JSON.stringify(lib);
    const picks: number[] = more ? [] : [seed];
    while (picks.length < 6) {
      const s = 10_000_000 + Math.floor(Math.random() * 89_999_999);
      if (!picks.includes(s) && !grid.querySelector(`[data-seed="${s}"]`)) picks.push(s);
    }
    for (const s of picks) {
      grid.insertAdjacentHTML(
        "beforeend",
        `<div class="seedcell${s === seed ? " now" : ""}" data-seed="${s}"><canvas></canvas><div class="sinfo"><b>seed ${s}</b>${s === seed ? " <small>(now)</small>" : ""}<span>building…</span></div></div>`,
      );
    }
    for (const s of picks) {
      if (run !== seedRun || $("#seedmodal").hidden || !root.isConnected) return;
      const cell = grid.querySelector<HTMLElement>(`[data-seed="${s}"]`);
      if (!cell) continue;
      const info = cell.querySelector(".sinfo span")!;
      try {
        const j = await api.mapBuild(level, lib, s);
        if (run !== seedRun) return;
        const m = decodeMap(j);
        seedMaps.set(s, { map: m, fp: String(j.fingerprint ?? ""), lib: libJson });
        drawMap(cell.querySelector("canvas")!, m, -1, -1);
        let far = 0;
        if (m.dist) for (const v of m.dist) if (v !== 0xffff && v > far) far = v;
        const pieces = (m.stats as Record<string, number>).pieces;
        info.innerHTML = `<i>${m.problems.length ? `<em class="bad">${m.problems.length} problem${m.problems.length > 1 ? "s" : ""}</em>` : `<em class="good">keeps every rule</em>`} · ${pieces} rooms · farthest floor ${far} steps from the door</i>${
          s === seed ? "" : `<button data-useseed="${s}">Use this seed</button>`
        }`;
        if (m.problems.length) cell.title = m.problems.join("\n");
      } catch (e) {
        info.textContent = `didn't build: ${describeError(e)}`;
      }
    }
  }
  function useSeed(s: number): void {
    seed = s;
    $<HTMLInputElement>("#seed").value = String(s);
    markDirty();
    // the whole-level view already has this one built
    const got = seedMaps.get(s);
    if (got && got.lib === JSON.stringify(lib)) {
      map = got.map;
      builtFp = got.fp;
      builtFor = JSON.stringify({ lib, seed });
      compare = null;
    }
    seedRun++;
    $("#seedmodal").hidden = true;
    status(`Seed ${s} is in your draft. “See the whole level” shows it; nothing goes live until you publish.`);
  }

  async function openPublish(): Promise<void> {
    await saveDraft();
    const card = $("#pubcard");
    $("#pubmodal").hidden = false;
    card.innerHTML = `<h2>Publish ${esc(state?.name ?? "")}</h2><p class="hint">Checking the level…</p>`;
    const broken = lib.filter((t) => lintTile(t).errors.length).map((t) => t.id);
    let problems: string[] = [];
    let stats: Record<string, unknown> = {};
    let built: Awaited<ReturnType<typeof api.mapBuild>> | null = null;
    // what the summary describes is exactly what gets published (Oct 2026
    // review: an undo while the card was open sent a different library)
    const checked = JSON.stringify({ lib, seed });
    if (!broken.length) {
      try {
        built = await api.mapBuild(level, lib, seed);
        problems = built.problems;
        stats = built.stats as Record<string, unknown>;
      } catch (e) {
        problems = [describeError(e)];
      }
    }
    try {
      state = await api.mapEditor(level);
      showLive();
    } catch {
      /* keep what we had */
    }
    const next = (state?.versions[0]?.version ?? 0) + 1;
    const keeps = !!built?.keepsMap;
    const ch = built?.changes;
    const nothing = !!ch && !built!.seedChanged && !ch.added.length && !ch.removed.length && !ch.reshaped.length && !ch.propsAdded && !ch.propsRemoved && !ch.looksChanged.length && !ch.marksChanged.length;
    const inside = built?.inside ?? state?.inside ?? 0;
    const blocked = broken.length || problems.length || nothing || (!keeps && inside > 0);
    // "a, b, c and 4 more"
    const names = (ids: string[]): string => {
      const shown = ids.slice(0, 6).map((id) => `<b>${esc(id)}</b>`).join(", ");
      return ids.length > 6 ? `${shown} and ${ids.length - 6} more` : shown;
    };
    const changeList = ch
      ? [
          ch.added.length ? `<li>New rooms: ${names(ch.added)}</li>` : "",
          ch.removed.length ? `<li>Rooms taken out: ${names(ch.removed)}</li>` : "",
          ch.doorsMoved.length ? `<li>Doorways moved in: ${names(ch.doorsMoved)}</li>` : "",
          ch.reshaped.length ? `<li>Rooms redrawn: ${names(ch.reshaped)}</li>` : "",
          built!.seedChanged ? `<li>A new seed, so the rooms are arranged differently</li>` : "",
          ch.propsAdded || ch.propsRemoved
            ? `<li>Props: ${ch.propsAdded} placed, ${ch.propsRemoved} taken away, in ${ch.propsChanged.length} room${ch.propsChanged.length === 1 ? "" : "s"}</li>`
            : "",
          ch.looksChanged.length ? `<li>New looks, lights or sounds in: ${names(ch.looksChanged)}</li>` : "",
          ch.marksChanged.length ? `<li>Creatures, relic spots or drive spots changed in: ${names(ch.marksChanged)}</li>` : "",
        ].join("")
      : "";
    card.innerHTML = `
      <h2>Publish ${esc(state?.name ?? "")} — version ${next}</h2>
      ${broken.length ? `<p class="errs">These rooms still have problems: <b>${broken.map(esc).join(", ")}</b>. Fix them first.</p>` : ""}
      ${problems.length ? `<ul class="errs">${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
      ${nothing ? `<p>Nothing has changed since the live version.</p>` : ""}
      ${!nothing && changeList ? `<h3>What changes</h3><ul class="changes">${changeList}</ul>` : ""}
      ${
        !broken.length && !problems.length && !nothing
          ? keeps
            ? `<p class="keeps">Only props, looks and game markers changed. Players keep the charted map, spray paint and everything lying on the floor, and the change shows now, even for people already down there.</p>`
            : `<p class="resets">This changes the map itself, so the charted map, spray paint and anything left lying down there start fresh.</p>`
          : ""
      }
      ${!keeps && inside > 0 && !nothing ? `<p class="errs">${inside} ${inside === 1 ? "player is" : "players are"} on this level now. It can go live once they've left.</p>` : ""}
      ${
        !blocked
          ? `<p>${K.publishLine(stats)}</p>
             <label class="row col">what changed (optional) <input id="pubnote" maxlength="200" placeholder="e.g. dressed the stores and the machine shop"></label>`
          : ""
      }
      <div class="tools"><button id="pubcancel">Back to the editor</button>${blocked ? "" : `<button id="pubgo" class="primary">Publish version ${next}</button>`}</div>`;
    $("#pubcancel").onclick = () => ($("#pubmodal").hidden = true);
    const go = root.querySelector<HTMLButtonElement>("#pubgo");
    if (go)
      go.onclick = async () => {
        const note = (root.querySelector<HTMLInputElement>("#pubnote")?.value ?? "").trim();
        const body = keeps ? "The props and looks change for everyone on this level, right away. Nothing else is touched." : "Everybody who goes down to this level after this walks the new map, and its charted map starts fresh.";
        if (!(await host.ask({ title: `Put version ${next} live?`, body, confirm: "Publish", danger: !keeps }))) return;
        if (JSON.stringify({ lib, seed }) !== checked) {
          card.insertAdjacentHTML("beforeend", `<p class="errs">The level changed while this was open. Close it and publish again so the summary is current.</p>`);
          return;
        }
        go.disabled = true;
        try {
          const sent = JSON.parse(checked) as { lib: typeof lib; seed: typeof seed };
          const r = await api.mapPublish(level, sent.lib, sent.seed, note);
          $("#pubmodal").hidden = true;
          await load();
          status(
            r.kept
              ? `Version ${r.version} is live. Updated in place; the map and everything on it stayed.`
              : `Version ${r.version} is live.${r.voided ? ` ${r.voided} disconnected run${r.voided > 1 ? "s were" : " was"} called off.` : ""}`,
          );
        } catch (e) {
          go.disabled = false;
          card.insertAdjacentHTML("beforeend", `<p class="errs">${esc(describeError(e))}</p>`);
        }
      };
  }

  async function openHistory(): Promise<void> {
    try {
      state = await api.mapEditor(level);
      showLive();
    } catch (e) {
      status(`Couldn't load the history: ${describeError(e)}`);
      return;
    }
    const when = (at: number): string => new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const rows = state.versions
      .map(
        (v) => `<div class="hrow${v.version === state!.live.version ? " live" : ""}">
          <div><b>Version ${v.version}</b>${v.version === state!.live.version ? ' <span class="tag">live</span>' : ""}<small>${when(v.publishedAt)}${v.publishedBy ? ` · ${esc(v.publishedBy)}` : ""} · ${v.rooms} rooms</small>${v.note ? `<small>“${esc(v.note)}”</small>` : ""}</div>
          <span class="hbtns"><button data-cmp="${v.version}">Compare with my draft</button><button data-rev="${v.version}">Open in the editor</button></span></div>`,
      )
      .join("");
    $("#histlist").innerHTML = `${rows}<div class="hrow${state.live.version === 0 ? " live" : ""}"><div><b>The original map</b>${state.live.version === 0 ? ' <span class="tag">live</span>' : ""}<small>built into Solace itself</small></div><span class="hbtns"><button data-cmp="0">Compare with my draft</button><button data-rev="0">Open in the editor</button></span></div>`;
    $("#histmodal").hidden = false;
  }

  async function revert(version: number): Promise<void> {
    if (hasDraft && !(await host.ask({ title: "Replace your draft?", body: `Your current draft is replaced by ${version ? `version ${version}` : "the original map"}. The live map doesn't change.`, confirm: "Replace it", danger: true }))) return;
    try {
      await api.mapRevert(level, version);
      $("#histmodal").hidden = true;
      undo.clear();
      await load();
      status(`${version ? `Version ${version}` : "The original map"} is open as your draft.`);
    } catch (e) {
      status(`Couldn't open it: ${describeError(e)}`);
    }
  }

  async function dropDraft(): Promise<void> {
    if (!(await host.ask({ title: "Discard your draft?", body: "Every change since the last publish is thrown away and the editor goes back to the live map.", confirm: "Discard", danger: true }))) return;
    try {
      clearTimeout(saveTimer);
      await api.mapDropDraft(level);
      undo.clear();
      await load();
      status("Draft discarded — this is the live map again.");
    } catch (e) {
      status(`Couldn't discard it: ${describeError(e)}`);
    }
  }

  // ---- wiring -------------------------------------------------------------------------
  function cellAt(ev: PointerEvent): { x: number; y: number; side: number; fx: number; fy: number } {
    const r = $<HTMLCanvasElement>("#grid").getBoundingClientRect();
    const fx = (ev.clientX - r.left - 1) / cs;
    const fy = (ev.clientY - r.top - 1) / cs;
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    const ux = fx - x;
    const uy = fy - y;
    const d = [uy, 1 - ux, 1 - uy, ux];
    return { x, y, side: d.indexOf(Math.min(...d)), fx, fy };
  }

  const grid = $<HTMLCanvasElement>("#grid");
  on(grid, "pointerdown", (ev) => {
    const c = cellAt(ev);
    if (tool === "measure") {
      // a right-click clears the line; a drag measures (ends snap to half cells)
      measure = ev.button === 0 ? { a: { x: Math.round(c.fx * 2) / 2, y: Math.round(c.fy * 2) / 2 }, b: { x: Math.round(c.fx * 2) / 2, y: Math.round(c.fy * 2) / 2 }, live: true } : null;
      if (measure) grid.setPointerCapture(ev.pointerId);
      drawGrid();
      return;
    }
    snapshot();
    lastPaint = "";
    levelMemo.clear();
    if (tool === "select" || floating) {
      if (floating && !floating.drag) {
        if (ev.button === 2) floating = null;
        else drop();
        refresh();
        return;
      }
      if (ev.button === 2) {
        selRect = null;
        refresh();
        return;
      }
      if (selRect && inRect(c.x, c.y)) {
        const r = selRect;
        lift();
        floating!.gx = c.x - r.x0;
        floating!.gy = c.y - r.y0;
        floating!.drag = true;
      } else {
        selFrom = { x: c.x, y: c.y };
        selRect = rectOf(selFrom, selFrom);
      }
      grid.setPointerCapture(ev.pointerId);
      refresh();
      return;
    }
    if (layer === "game") {
      const t = T();
      const hit = markAt(t, c.fx, c.fy);
      if (ev.button === 2) {
        if (hit >= 0) {
          t.marks!.splice(hit, 1);
          if (!t.marks!.length) t.marks = undefined;
          markSel = -1;
          markDirty();
        }
        refresh();
        return;
      }
      if (hit >= 0) {
        markSel = hit;
        markDrag = { ox: t.marks![hit].x - c.fx, oy: t.marks![hit].y - c.fy };
      } else if (markBrush) {
        if (!inTile(t, c.x, c.y)) {
          status("Put it on the room's floor.");
          return;
        }
        marksOf(t).push({ k: markBrush, x: c.x + 0.5, y: c.y + 0.5 });
        markSel = t.marks!.length - 1;
        markDrag = null;
        markDirty();
      } else markSel = -1;
      grid.setPointerCapture(ev.pointerId);
      refresh();
      return;
    }
    if (layer === "props") {
      const t = T();
      const hit = propAt(t, c.fx, c.fy);
      if (ev.button === 2) {
        if (hit >= 0) {
          propsOf(t).splice(hit, 1);
          propSel = -1;
          markDirty();
          refresh();
        }
        return;
      }
      if (hit >= 0) {
        propSel = hit;
        propDrag = { ox: t.props![hit].x - c.fx, oy: t.props![hit].y - c.fy };
      } else if (propBrush) {
        propsOf(t).push(placement(t, propBrush.p, propBrush.v, c.fx, c.fy));
        propSel = t.props!.length - 1;
        propDrag = null;
        markDirty();
      } else propSel = -1;
      grid.setPointerCapture(ev.pointerId);
      refresh();
      return;
    }
    if (layer === "stair" && brush === "run") {
      stairFrom = { x: c.x, y: c.y };
      grid.setPointerCapture(ev.pointerId);
      return;
    }
    if (tool === "box" && TOOL_LAYERS.includes(layer)) {
      boxFrom = { x: c.x, y: c.y, erase: ev.button === 2 };
      grid.setPointerCapture(ev.pointerId);
      drawGrid();
      return;
    }
    if (tool === "fill" && FILL_LAYERS.includes(layer)) {
      applyFill(c.x, c.y, ev.button === 2);
      return;
    }
    painting = ev.button === 0;
    if (ev.button === 2 && layer !== "doors") {
      const keep = brush;
      brush = layer === "map" ? " " : layer === "height" ? "0" : ".";
      paintAt(c.x, c.y, c.side, false);
      brush = keep;
      refresh();
      return;
    }
    paintAt(c.x, c.y, c.side, ev.shiftKey);
    if (layer === "doors" || ev.shiftKey) painting = false;
    grid.setPointerCapture(ev.pointerId);
  });
  on(grid, "pointermove", (ev) => {
    hover = cellAt(ev);
    if (measure?.live) {
      measure.b = { x: Math.round(hover.fx * 2) / 2, y: Math.round(hover.fy * 2) / 2 };
      drawGrid();
      return;
    }
    if (floating) {
      floating.x = hover.x - floating.gx;
      floating.y = hover.y - floating.gy;
      drawGrid();
      return;
    }
    if (selFrom) {
      selRect = rectOf(selFrom, hover);
      drawGrid();
      return;
    }
    if (layer === "game" && markDrag && markSel >= 0) {
      const m = T().marks?.[markSel];
      if (m) {
        // markers stand in the middle of a cell
        const nx = Math.floor(hover.fx + markDrag.ox) + 0.5;
        const ny = Math.floor(hover.fy + markDrag.oy) + 0.5;
        if ((nx !== m.x || ny !== m.y) && inTile(T(), Math.floor(nx), Math.floor(ny))) {
          m.x = nx;
          m.y = ny;
          markDirty();
          refresh(false);
          return;
        }
      }
    }
    if (layer === "props" && propDrag && propSel >= 0) {
      const t = T();
      const pl = t.props?.[propSel];
      if (pl) {
        const nx = round2(snapV(hover.fx + propDrag.ox));
        const ny = round2(snapV(hover.fy + propDrag.oy));
        if (nx !== pl.x || ny !== pl.y) {
          pl.x = nx;
          pl.y = ny;
          markDirty();
          refresh(false);
          return;
        }
      }
    }
    if (painting && layer !== "doors" && layer !== "props") paintAt(hover.x, hover.y, hover.side, false);
    else drawGrid();
  });
  on(grid, "pointerup", () => {
    if (measure?.live) {
      measure.live = false;
      return;
    }
    if (floating?.drag) {
      drop();
      return;
    }
    if (selFrom) {
      selFrom = null;
      refresh();
      return;
    }
    if (markDrag) {
      markDrag = null;
      refresh();
    }
    if (boxFrom) {
      const from = boxFrom;
      boxFrom = null;
      if (hover) applyBox(from, hover, from.erase);
      else drawGrid();
    }
    if (stairFrom && hover) {
      stairRun(stairFrom, hover);
      stairFrom = null;
      refresh(false);
    }
    if (propDrag) {
      propDrag = null;
      refresh();
    }
    painting = false;
  });
  on(grid, "pointerleave", () => {
    hover = null;
    drawGrid();
  });
  on(grid, "contextmenu", (ev) => ev.preventDefault());

  on(root, "click", (ev) => {
    const el = (ev.target as HTMLElement).closest("button") as HTMLButtonElement | null;
    if (!el || !root.contains(el)) return;
    const d = el.dataset;
    if (d.a === "close") return void close();
    if (d.a === "addtex") return void openTexture();
    if (d.a === "hearsound") return void hearSound();
    if (d.a === "whereused") return void whereUsed();
    if (d.useseed) return void useSeed(Number(d.useseed));
    if (d.jump) {
      const [jx, jy] = d.jump.split(",").map(Number);
      return void showSpot(jx, jy);
    }
    if (d.usesend !== undefined) {
      usesTile = null;
      return void paintMap();
    }
    if (d.zoom !== undefined) return void setZoom(d.zoom === "0" ? 1 : zoom * (d.zoom === "1" ? 1.25 : 0.8));
    if (d.layer) {
      layer = d.layer as Layer;
      if (tool !== "select" && tool !== "measure" && (!TOOL_LAYERS.includes(layer) || (tool === "fill" && !FILL_LAYERS.includes(layer)))) tool = "brush";
      brush = layer === "map" ? "." : layer === "height" ? "0" : layer === "stair" ? "run" : layer === "rooms" ? "1" : layer === "furn" ? (K.dia.groups[0]?.glyphs[0] ?? ".") : layer === "walls" ? "-" : ".";
      refresh();
    } else if (d.hmode) {
      heightMode = d.hmode === "both" ? "both" : "floor";
      try {
        localStorage.setItem("solace_me_heightmode", heightMode);
      } catch {
        /* a private window: it just won't be remembered */
      }
      refresh();
    } else if (d.stairclear !== undefined) {
      snapshot();
      const t = T();
      if (t.stairs) {
        delete t.stairs.col;
        if (!Object.keys(t.stairs).length) t.stairs = undefined;
      }
      markDirty();
      refresh(false);
    } else if (d.pcolclear !== undefined) {
      snapshot();
      editProp(propSel, (pl) => {
        delete pl.col;
      });
      $("#insp").innerHTML = inspectorHTML();
    } else if (d.brush !== undefined) {
      brush = d.brush;
      refresh();
    } else if (d.tool) {
      tool = d.tool as typeof tool;
      if (tool === "fill" && !FILL_LAYERS.includes(layer)) tool = "brush";
      if (tool !== "measure") measure = null;
      if (tool !== "select") {
        selRect = null;
        if (floating) floating = null;
      }
      refresh();
    } else if (d.doorw) {
      doorW = Number(d.doorw);
      refresh();
    } else if (d.sel) {
      sel = Number(d.sel);
      propSel = -1;
      measure = null;
      markSel = -1;
      selRect = null;
      // a paste carries into the room you switch to; a half-finished move doesn't
      if (floating?.drag) floating = null;
      deleteArmed = false;
      $("#delete").textContent = "Delete";
      refresh();
    } else if (d.sh) {
      const [dx, dy] = d.sh.split(",").map(Number);
      shiftTile(dx, dy);
    } else if (d.prop) {
      propBrush = propBrush?.p === d.prop ? null : { p: d.prop, v: 1 };
      status(propBrush ? `Click in the room to place a ${KIT.get(d.prop)!.name.toLowerCase()}. Esc stops.` : "");
      refresh();
    } else if (d.psec !== undefined) {
      propSection = d.psec;
      $("#palette").innerHTML = paletteHTML();
    } else if (d.psel) {
      propSel = Number(d.psel);
      refresh();
    } else if (d.prot) {
      snapshot();
      editProp(propSel, (pl) => (pl.r = kitYaw((pl.r ?? 0) + Number(d.prot))));
      refresh();
    } else if (d.pdup !== undefined) {
      propsKey(new KeyboardEvent("keydown", { key: "d", ctrlKey: true }));
    } else if (d.pdel !== undefined) {
      snapshot();
      T().props?.splice(propSel, 1);
      propSel = -1;
      markDirty();
      refresh();
    } else if (d.sa) {
      const a = d.sa;
      if (a === "copy") copySel();
      else if (a === "cut") cutSel();
      else if (a === "paste") paste();
      else if (a === "turn") turnSel(false);
      else if (a === "flip") turnSel(true);
      else if (a === "clear") clearSel(false);
      else if (a === "remove") clearSel(true);
      else if (a === "cancel") {
        floating = null;
        refresh();
      }
    } else if (d.mark) {
      markBrush = markBrush === d.mark ? null : (d.mark as MarkKind);
      if (tool === "select") tool = "brush";
      status(markBrush ? `Click in the room to place: ${MARK.get(markBrush)!.name}. Esc stops.` : "");
      refresh();
    } else if (d.msel) {
      markSel = Number(d.msel);
      refresh();
    } else if (d.mdel !== undefined) {
      snapshot();
      T().marks?.splice(markSel, 1);
      if (!T().marks?.length) T().marks = undefined;
      markSel = -1;
      markDirty();
      refresh();
    } else if (el.id === "mstop") {
      markBrush = null;
      refresh();
    } else if (d.cmp !== undefined) {
      void openCompare(Number(d.cmp));
    } else if (d.cmpshow && compare) {
      compare.showing = d.cmpshow as "before" | "after";
      map = compare.showing === "before" ? compare.before : compare.after;
      paintMap();
    } else if (d.cmpend !== undefined) {
      compare = null;
      $("#mapmodal").hidden = true;
    } else if (d.ov) {
      void setOverlay(d.ov as typeof overlayKind);
    } else if (d.rev !== undefined) {
      void revert(Number(d.rev));
    } else if (el.id === "pstop") {
      propBrush = null;
      refresh();
    }
  });
  on(root, "input", (ev) => {
    const el = ev.target as HTMLInputElement;
    if (el.id === "pq") {
      propQuery = el.value.toLowerCase().trim();
      const pos = el.selectionStart;
      $("#palette").innerHTML = paletteHTML();
      const q = $<HTMLInputElement>("#pq");
      q.focus();
      q.setSelectionRange(pos, pos);
      return;
    }
    if (el.id === "filter") {
      filter = el.value.toLowerCase();
      $("#list").innerHTML = listHTML();
      return;
    }
    if (el.id === "seed") {
      seed = Math.max(1, Math.floor(Number(el.value) || 0)) || seed;
      markDirty();
      return;
    }
    if (el.dataset.pf === "text") {
      snapshot();
      editProp(propSel, (pl) => {
        const words = el.value.slice(0, SIGN_MAX);
        if (words.trim()) pl.text = words;
        else delete pl.text;
      });
      return;
    }
    if (el.dataset.pf === "tex" || el.dataset.pf === "col" || el.dataset.pf === "solid") {
      const fld = el.dataset.pf;
      snapshot();
      editProp(propSel, (pl) => {
        if (fld === "tex") {
          if (el.value) pl.tex = el.value;
          else delete pl.tex;
        } else if (fld === "col") {
          if (/^#[0-9a-f]{6}$/i.test(el.value)) pl.col = el.value.toLowerCase();
        } else {
          if (el.checked) delete pl.solid;
          else pl.solid = false;
        }
      });
      if (fld !== "col") $("#insp").innerHTML = inspectorHTML();
      return;
    }
    if (el.dataset.mf) {
      const key = el.dataset.mf as "n" | "speed" | "sight" | "roam" | "bite" | "chance";
      snapshot();
      editMark(markSel, (m) => {
        if (el.value === "") delete m[key];
        else m[key] = Number(el.value);
      });
      return;
    }
    if (el.dataset.pf) {
      const f = el.dataset.pf;
      const v = Number(el.value);
      if (!Number.isFinite(v)) return;
      snapshot();
      editProp(propSel, (pl) => {
        if (f === "x" || f === "y") pl[f] = round2(v);
        if (f === "r") pl.r = kitYaw(v);
        if (f === "rx" || f === "rz") {
          const a = Math.round(((((v + 180) % 360) + 360) % 360 - 180) * 10) / 10;
          if (a) pl[f] = a;
          else delete pl[f];
        }
        if (f === "sx" || f === "sy" || f === "sz") pl[f] = round2(Math.max(SHAPE_MIN, Math.min(SHAPE_MAX, v)));
        if (f === "z") pl.z = round2(Math.max(0, Math.min(12, v)));
        if (f === "v") pl.v = v;
        if (f === "c") {
          if (v >= 100) delete pl.c;
          else pl.c = v;
        }
      });
      if (f === "v") $("#insp").innerHTML = inspectorHTML();
      return;
    }
    if (!$("#insp").contains(el)) return;
    const t = T();
    if (el.dataset.f) {
      const rec = t as unknown as Record<string, unknown>;
      if (el.dataset.f === "name" || el.dataset.f === "note") rec[el.dataset.f] = el.value.trim() ? el.value : undefined;
      else rec[el.dataset.f] = el.value;
      if (el.dataset.f === "id") $("#title").textContent = el.value;
    } else if (el.dataset.n) {
      (t as unknown as Record<string, unknown>)[el.dataset.n] = el.value === "" ? undefined : Number(el.value);
    } else if (el.dataset.stair) {
      snapshot();
      const key = el.dataset.stair as keyof StairSpec;
      const st: StairSpec = { ...(t.stairs ?? {}) };
      if (key === "rail") {
        if (el.checked) st.rail = true;
        else delete st.rail;
      } else if (key === "steps" || key === "width") {
        const v = Number(el.value);
        if ((key === "steps" && v === STAIR_STEPS_DEFAULT) || (key === "width" && v === 100)) delete st[key];
        else st[key] = v;
      } else if (key === "col") {
        if (/^#[0-9a-f]{6}$/i.test(el.value)) st.col = el.value.toLowerCase();
      } else if (el.value) st.tex = el.value;
      else delete st.tex;
      t.stairs = Object.keys(st).length ? st : undefined;
      if (key === "col" || key === "tex") queueMicrotask(() => ($("#insp").innerHTML = inspectorHTML()));
    } else if (el.dataset.look) {
      snapshot();
      const key = el.dataset.look as keyof LookSpec;
      const look: LookSpec = { ...(t.look ?? {}) };
      if (el.value === "") delete look[key];
      else if (key === "lights" || key === "flicker" || key === "bright") look[key] = Number(el.value);
      else (look as Record<string, string>)[key] = el.value;
      t.look = Object.keys(look).length ? look : undefined;
      // the Listen button follows the pick
      if (key === "sound") queueMicrotask(() => ($("#insp").innerHTML = inspectorHTML()));
    } else if (el.dataset.rk) {
      t.roomKinds = { ...(t.roomKinds ?? {}), [el.dataset.rk]: el.value };
    } else if (el.dataset.set) {
      const onSets = [...root.querySelectorAll<HTMLInputElement>("[data-set]")].filter((q) => q.checked).map((q) => q.dataset.set!);
      t.set = (onSets.length === 1 ? onSets[0] : onSets) as TileDef["set"];
    } else return;
    markDirty();
    refresh(false);
  });
  on(root, "change", (ev) => {
    const el = ev.target as HTMLInputElement;
    if (el.id === "onlybad") {
      onlyBad = el.checked;
      $("#list").innerHTML = listHTML();
    } else if (el.id === "tw" || el.id === "th") resize(Number($<HTMLInputElement>("#tw").value), Number($<HTMLInputElement>("#th").value));
    else if (el.id === "pall") {
      propAll = el.checked;
      propSection = "";
      $("#palette").innerHTML = paletteHTML();
    } else if (el.id === "psnap") {
      snap = Number(el.value);
      preview?.setSnap(snap * CELL_M);
    } else if ((el.tagName === "SELECT" || el.type === "checkbox") && $("#insp").contains(el) && !el.dataset.pf) refresh();
  });

  // ---- ADD A TEXTURE: a photo becomes a surface every room can wear -----------
  function openTexture(): void {
    $<HTMLInputElement>("#texfile").value = "";
    $<HTMLImageElement>("#teximg").hidden = true;
    $<HTMLInputElement>("#texname").value = "";
    $<HTMLInputElement>("#texsize").value = "2";
    $<HTMLInputElement>("#texlevel").checked = false;
    $("#texerr").hidden = true;
    $("#texmodal").hidden = false;
  }
  $<HTMLInputElement>("#texfile").onchange = () => {
    const file = $<HTMLInputElement>("#texfile").files?.[0];
    const img = $<HTMLImageElement>("#teximg");
    if (!file) return void (img.hidden = true);
    img.src = URL.createObjectURL(file);
    img.hidden = false;
    // a name from the file, if none is typed yet
    const nm = $<HTMLInputElement>("#texname");
    if (!nm.value) nm.value = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").slice(0, 40);
  };
  $<HTMLSelectElement>("#texkind").onchange = () => ($("#texlevelrow").hidden = $<HTMLSelectElement>("#texkind").value !== "wall");
  $("#texcancel").onclick = () => ($("#texmodal").hidden = true);
  $("#texgo").onclick = async () => {
    const file = $<HTMLInputElement>("#texfile").files?.[0];
    const kind = $<HTMLSelectElement>("#texkind").value as SurfaceKind;
    const name = $<HTMLInputElement>("#texname").value.trim();
    const sizeM = Number($<HTMLInputElement>("#texsize").value);
    const err = $("#texerr");
    const say = (m: string): void => {
      err.textContent = m;
      err.hidden = false;
    };
    if (!file) return say("Pick a picture first.");
    if (!name) return say("Give it a name.");
    if (!(sizeM >= 0.25 && sizeM <= 20)) return say("One repeat must be 0.25 to 20 metres across.");
    if (file.size > 8 * 1024 * 1024) return say("That picture is over 8 MB — use a smaller one.");
    const go = $<HTMLButtonElement>("#texgo");
    go.disabled = true;
    try {
      const r = await api.mapSurfaceUpload(kind, name, sizeM, kind === "wall" && $<HTMLInputElement>("#texlevel").checked, file);
      setCustomSurfaces(r.surfaces);
      // the room open now wears it straight away
      snapshot();
      const t = T();
      t.look = { ...(t.look ?? {}), [kind]: r.id };
      $("#texmodal").hidden = true;
      markDirty();
      refresh();
      status(`"${name}" added. This room wears it now; every room can pick it from its Look.`);
    } catch (e) {
      say(e instanceof ApiError && e.code === "unsupported_type" ? "That isn't a picture this can use (PNG, JPEG or WebP)." : `It didn't upload: ${describeError(e)}`);
    } finally {
      go.disabled = false;
    }
  };
  /** Play the room's sound for a few seconds (the Listen button). */
  let hearing: HTMLAudioElement | null = null;
  function hearSound(): void {
    const url = ROOM_SOUNDS.find((q) => q.id === T().look?.sound)?.url;
    hearing?.pause();
    if (!url) return;
    hearing = new Audio(url);
    hearing.volume = 0.6;
    void hearing.play().catch(() => {});
    const h = hearing;
    setTimeout(() => h.pause(), 7000);
  }
  cleanups.push(() => hearing?.pause());

  // ---- PLAY THE DRAFT -------------------------------------------------------
  async function playtest(): Promise<void> {
    if (state?.testing) {
      if (!(await host.ask({ title: "End the test?", body: "Anyone inside it is sent out, and the level plays its live map again.", confirm: "End the test" }))) return;
      try {
        await api.mapPlaytestEnd(level);
        state = await api.mapEditor(level);
        showTestButton();
        status("The test is over. The level plays its live map again.");
      } catch (e) {
        status(`Couldn't end it: ${describeError(e)}`);
      }
      return;
    }
    const broken = lib.filter((t) => lintTile(t).errors.length).map((t) => t.id);
    if (broken.length) return status(`Can't test yet: ${broken.slice(0, 4).join(", ")} still ha${broken.length > 1 ? "ve" : "s"} problems.`);
    await saveDraft();
    const ok = await host.ask({
      title: `Test-play ${state?.name ?? "this level"}?`,
      body: "You walk the draft in the real game, with its creatures, water and lights. Nobody else can enter the level while you test, and nothing you do there is kept — no death, no lost kit, no relic. It ends when you walk out or die.",
      confirm: "Test play",
    });
    if (!ok) return;
    try {
      const r = await api.mapPlaytest(level, lib, seed);
      if (r.problems.length) status(`Testing — note the level breaks its rules: ${r.problems.join("; ")}`);
      host.onPlaytest?.(level);
    } catch (e) {
      const inside = e instanceof ApiError ? (e.data as { inside?: number } | undefined)?.inside : undefined;
      status(e instanceof ApiError && e.code === "players_inside" ? `${inside ?? "Somebody"} ${inside === 1 ? "player is" : "players are"} on this level (or left a run standing) — test once it's empty.` : `Couldn't start the test: ${describeError(e)}`);
    }
  }
  function showTestButton(): void {
    $("#test").textContent = state?.testing ? "End the test" : "Test play";
  }
  $("#test").onclick = () => void playtest();

  $("#gen").onclick = () => void generate();
  $("#seeds").onclick = () => void openSeeds(false);
  $("#seedmore").onclick = () => void openSeeds(true);
  $("#seedclose").onclick = () => {
    seedRun++;
    $("#seedmodal").hidden = true;
  };
  $("#pub").onclick = () => void openPublish();
  $("#hist").onclick = () => void openHistory();
  // THE GUIDE: every section at once, a contents list to jump through it.
  // It opens by itself the first time anyone uses the editor on this browser.
  {
    const secs = guideSections(level);
    $("#guidenav").innerHTML = secs.map((g) => `<button data-g="${g.id}">${esc(g.title)}</button>`).join("");
    $("#guidetext").innerHTML = secs.map((g) => `<section id="g-${g.id}"><h3>${esc(g.title)}</h3>${g.body}</section>`).join("");
    $("#guidenav").onclick = (ev) => {
      const id = (ev.target as HTMLElement).closest<HTMLElement>("[data-g]")?.dataset.g;
      if (id) root.querySelector(`#g-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    const openGuide = (): void => {
      $("#guidemodal").hidden = false;
      $("#guidetext").scrollTop = 0;
    };
    $("#guide").onclick = openGuide;
    $("#guideclose").onclick = () => ($("#guidemodal").hidden = true);
    try {
      if (!localStorage.getItem("solace_mapeditor_guide")) {
        localStorage.setItem("solace_mapeditor_guide", "1");
        openGuide();
      }
    } catch {
      /* no storage: the button still opens it */
    }
  }
  $("#histclose").onclick = () => ($("#histmodal").hidden = true);
  $("#dropdraft").onclick = () => void dropDraft();
  $("#new").onclick = () => {
    // the id's prefix per level, checked against the same prefix (Oct 2026
    // review: Levels 7 and 9 made new-block-1 / new-lot-1 every time)
    const pre = K.level === 9 ? "new-lot-" : K.level === 7 ? "new-block-" : "new-room-";
    let n = 1;
    while (lib.some((t) => t.id === `${pre}${n}`)) n++;
    lib.push(K.level === 9 ? { id: `new-lot-${n}`, kind: "yard", set: "lot", role: "block", type: "yard", map: Array.from({ length: 8 }, () => "yyyyyyyy"), doors: [[3, 0, "N", 2], [3, 7, "S", 2], [0, 3, "W", 2], [7, 3, "E", 2]] } : K.level === 8 ? { id: `new-room-${n}`, kind: "cavern", set: "caverns", role: "block", type: "cavern", map: Array.from({ length: 8 }, () => "........"), furn: ["........", "........", "........", "...*....", "........", "........", "........", "........"], doors: [[3, 0, "N", 2], [3, 7, "S", 2], [0, 3, "W", 2], [7, 3, "E", 2]] } : K.level === 7 ? { id: `new-block-${n}`, kind: "searoof", set: "city", role: "block", type: "seacanal", map: Array.from({ length: 10 }, (_, y) => (y >= 2 && y <= 7 ? "..rrrrrr.." : "..........")), height: Array.from({ length: 10 }, (_, y) => (y >= 2 && y <= 7 ? "..111111.." : "..........")), doors: [[4, 0, "N", 2], [4, 9, "S", 2], [0, 4, "W", 2], [9, 4, "E", 2]] } : K.level === 6 ? { id: `new-room-${n}`, kind: "darkhall", set: "dark", role: "block", type: "darkhall", map: Array.from({ length: 8 }, () => "###..###"), furn: ["........", "........", "........", "...=....", "........", "........", "........", "........"], doors: [[3, 0, "N", 2], [3, 7, "S", 2]] } : K.level === 0 ? { id: `new-room-${n}`, kind: "classic", set: "any", role: "block", type: "classic", map: Array.from({ length: 10 }, () => ".........."), doors: [[4, 0, "N", 2], [4, 9, "S", 2], [0, 4, "W", 2], [9, 4, "E", 2]] } : K.level === 5 ? { id: `new-room-${n}`, kind: "corridor", set: "hall", role: "block", type: "corridor", map: Array.from({ length: 8 }, () => "###..###"), furn: ["........", "........", "........", "....*...", "........", "........", "........", "........"], doors: [[3, 0, "N", 2], [3, 7, "S", 2]] } : K.level === 4 ? { id: `new-room-${n}`, kind: "hallway", set: "any", role: "block", type: "hallway", map: Array.from({ length: 8 }, () => "........"), furn: ["........", "........", "..*.....", "........", "........", ".....*..", "........", "........"], doors: [[3, 0, "N", 2], [3, 7, "S", 2], [0, 3, "W", 2], [7, 3, "E", 2]] } : K.level === 3 ? { id: `new-room-${n}`, kind: "serviceway", set: "any", role: "block", type: "serviceway", map: Array.from({ length: 8 }, () => "........"), doors: [[3, 0, "N", 2], [3, 7, "S", 2], [0, 3, "W", 2], [7, 3, "E", 2]] } : K.level === 1 ? { id: `new-room-${n}`, kind: "baths", set: "any", role: "room", type: "baths", map: ["#######", "#.....#", "#.....#", "#.....#", "###.###"], furn: [".......", ".......", "...*...", ".......", "......."], doors: [[3, 4, "S", 1]] } : { id: `new-room-${n}`, kind: "office", set: "any", role: "room", type: "office", map: Array.from({ length: 5 }, () => "......"), furn: ["......", "......", "..*...", "......", "......"], doors: [[2, 4, "S", 1]] });
    sel = lib.length - 1;
    propSel = -1;
    markDirty();
    refresh();
  };
  $("#dup").onclick = () => {
    const t = JSON.parse(JSON.stringify(T())) as TileDef;
    let n = 2;
    while (lib.some((q) => q.id === `${t.id}-${n}`)) n++;
    t.id = `${t.id}-${n}`;
    lib.splice(sel + 1, 0, t);
    sel++;
    markDirty();
    refresh();
  };
  $("#delete").onclick = () => {
    if (!deleteArmed) {
      deleteArmed = true;
      $("#delete").textContent = `Delete ${T().id}?`;
      return;
    }
    lib.splice(sel, 1);
    // the last room deleted: point at one that exists before anything reads T()
    sel = Math.max(0, Math.min(sel, lib.length - 1));
    deleteArmed = false;
    $("#delete").textContent = "Delete";
    markDirty();
    refresh();
  };
  $("#mapclose").onclick = () => ($("#mapmodal").hidden = true);
  const mcv = $<HTMLCanvasElement>("#mapcv");
  on(mcv, "pointermove", (ev) => {
    if (!mapHit) return;
    const h = mapHit(ev.clientX, ev.clientY);
    if (h !== mapHover) {
      mapHover = h;
      paintMap();
    }
  });
  on(mcv, "click", () => {
    if (!map || mapHover < 0) return;
    const inst = map.insts.find((i) => i.id === mapHover)!;
    const k = lib.findIndex((t) => t.id === inst.tileId);
    if (k >= 0) {
      sel = k;
      propSel = -1;
      $("#mapmodal").hidden = true;
      refresh();
    }
  });
  on(window, "keydown", (ev) => {
    const target = ev.target as HTMLElement;
    // a ticked box isn't a field you type in: undo and the tools still work
    const typing = target.closest?.('input:not([type="checkbox"]):not([type="radio"]), textarea, select');
    // the app's own dialogs (the house confirm) sit outside this page
    if (!root.contains(target) && target !== document.body) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
      ev.preventDefault();
      void saveDraft();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && !typing && (ev.key.toLowerCase() === "y" || (ev.key.toLowerCase() === "z" && ev.shiftKey))) {
      ev.preventDefault();
      doRedo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z" && !typing) {
      ev.preventDefault();
      doUndo();
      return;
    }
    if (ev.key === "Escape" && (!$("#mapmodal").hidden || !$("#histmodal").hidden || !$("#pubmodal").hidden || !$("#guidemodal").hidden || !$("#texmodal").hidden || !$("#seedmodal").hidden)) {
      if (!$("#seedmodal").hidden) seedRun++;
      $("#mapmodal").hidden = $("#histmodal").hidden = $("#pubmodal").hidden = $("#guidemodal").hidden = $("#texmodal").hidden = $("#seedmodal").hidden = true;
      return;
    }
    if (typing) return;
    if (ev.key === "Escape" && measure) {
      measure = null;
      drawGrid();
      return;
    }
    if (selectKey(ev)) {
      ev.preventDefault();
      return;
    }
    if (layer === "game") {
      if (ev.key === "Escape") {
        if (markBrush) markBrush = null;
        else markSel = -1;
        refresh();
        ev.preventDefault();
        return;
      }
      if ((ev.key === "Delete" || ev.key === "Backspace") && markSel >= 0 && T().marks?.[markSel]) {
        snapshot();
        T().marks!.splice(markSel, 1);
        if (!T().marks!.length) T().marks = undefined;
        markSel = -1;
        markDirty();
        refresh();
        ev.preventDefault();
        return;
      }
    }
    if (layer === "props" && propsKey(ev)) {
      ev.preventDefault();
      return;
    }
    if (ev.key.toLowerCase() === "r" && layer === "furn") {
      rot++;
      refresh();
    }
  });
  on(window, "resize", () => drawGrid());
  on($("#gridbox"), "wheel", (ev) => {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    setZoom(zoom * (ev.deltaY < 0 ? 1.15 : 1 / 1.15));
  });
  const ro = new ResizeObserver(() => drawGrid());
  ro.observe($("#gridbox"));
  cleanups.push(() => ro.disconnect());

  function close(): void {
    void saveDraft();
    host.onClose();
  }

  preview = createPreview3D($("#preview"), {
    // a prop clicked in 3D is picked, as if clicked on the grid
    onPick: (k) => {
      if (!T().props?.[k]) return;
      if (layer !== "props") layer = "props";
      if (tool === "select") tool = "brush";
      propSel = k;
      refresh();
    },
    // the move handle: slid along an axis, lifted, or turned
    onMove: (k, to) => {
      snapshot();
      editProp(k, (pl) => {
        pl.x = to.x;
        pl.y = to.y;
        pl.z = Math.min(12, to.z);
        pl.r = kitYaw(to.r);
        if (to.rx) pl.rx = to.rx;
        else delete pl.rx;
        if (to.rz) pl.rz = to.rz;
        else delete pl.rz;
        if (to.size) [pl.sx, pl.sy, pl.sz] = to.size;
      });
      refresh();
    },
  });
  preview.setSnap(snap * CELL_M);
  void load();

  return () => {
    // leaving saves what's pending (a navigation away is not a discard)
    if (dirty()) void saveDraft();
    clearTimeout(saveTimer);
    clearTimeout(previewTimer);
    for (const c of cleanups) c();
    preview?.dispose();
    root.innerHTML = "";
  };
}
