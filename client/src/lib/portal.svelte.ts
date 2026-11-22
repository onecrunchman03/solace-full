// THE PORTAL — the hall's state in the browser. Everything here is what the
// server chose to send (src/portal/hall.ts): glyph ids, and a sound, meaning
// or English only once earned. The socket's "portal.changed" refetches.
import {
  api, ApiError, type PortalOverview, type PortalRoom, type PortalRosterRow, type PortalProfile, type PortalWallCell,
  type PortalSurvey, type PortalNotationCell, type PortalIshaal, type PortalBench,
} from "./api";

const READ_KEY = "solace_portal_read";
const readRooms = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? "[]")); } catch { return new Set(); } };

/** Ids at or over this are marks of the fold school's notation, not the script. */
export const NOTATION_BASE = 100;

export type PortalPick =
  | { kind: "glyph"; id: number; x: number; y: number }
  | { kind: "word"; target: string; word: number; piece: number; gloss: string | null; glyphs: number[]; x: number; y: number };

/** What fills the middle: a room, or one of the hall's instruments. */
export type PortalPane = "room" | "survey" | "ishaal" | "bench" | "voice";

export const portal = $state<{
  loaded: boolean;
  through: boolean;
  overview: PortalOverview | null;
  pane: PortalPane;
  roomId: string;
  room: PortalRoom | null;
  roster: PortalRosterRow[];
  profile: PortalProfile | null;
  /** the claim wall, while it is open */
  wall: PortalWallCell[] | null;
  notation: PortalNotationCell[] | null;
  survey: PortalSurvey | null;
  ishaal: PortalIshaal | null;
  bench: PortalBench | null;
  /** the voice room open in the pane */
  voiceRoom: string | null;
  pick: PortalPick | null;
  /** a status sign index to flash (Tharvend refusing, without words) */
  flash: number | null;
  /** last guess result shown in the pick panel: true right, false wrong, null none */
  verdict: boolean | null;
  left: number | null;
  compose: number[];
  show: number;
  read: Set<string>;
  busy: boolean;
}>({
  loaded: false, through: false, overview: null, pane: "room", roomId: "shenai", room: null, roster: [], profile: null, wall: null, notation: null,
  survey: null, ishaal: null, bench: null, voiceRoom: null, pick: null, flash: null, verdict: null, left: null, compose: [], show: 30, read: readRooms(), busy: false,
});

const STATUS_IX = (name: string) => Math.max(0, portal.overview?.status.indexOf(name) ?? 0);
function refuse(): void { portal.flash = STATUS_IX("CAPACITY"); setTimeout(() => (portal.flash = null), 1400); }

export async function loadPortal(): Promise<void> {
  try {
    portal.overview = await api.portal();
    portal.loaded = true;
    await Promise.all([portal.pane === "room" ? openRoom(portal.roomId) : Promise.resolve(), loadRoster()]);
  } catch { /* the hall stays dark; the next open tries again */ }
}
export async function loadRoster(): Promise<void> {
  try { portal.roster = (await api.portalRoster()).roster; } catch { /* keep the old one */ }
}
function setPane(p: PortalPane): void {
  portal.pane = p;
  portal.pick = null;
  if (p !== "survey") portal.survey = null;
  if (p !== "ishaal") portal.ishaal = null;
  if (p !== "bench") portal.bench = null;
  if (p !== "voice") portal.voiceRoom = null;
}
export async function openRoom(id: string): Promise<void> {
  setPane("room");
  if (id !== portal.roomId) { portal.show = 30; portal.compose = []; }
  portal.roomId = id;
  try { portal.room = await api.portalRoom(id); } catch { portal.room = null; }
  if (!portal.read.has(id)) {
    portal.read.add(id);
    try { localStorage.setItem(READ_KEY, JSON.stringify([...portal.read])); } catch { /* private window */ }
  }
  // A ghost post is met once; the room's pip goes with it.
  const row = portal.overview?.rooms.find((r) => r.id === id);
  if (row?.ghost) row.ghost = false;
}
/** The survey: the sky instrument fills the middle pane. */
export async function openSurvey(): Promise<void> {
  try { const s = await api.portalSurvey(); setPane("survey"); portal.survey = s; } catch { /* stay where we were */ }
}
/** Chart a galaxy. Returns true if it was right. */
export async function chartGalaxy(galaxy: string, pairs: Record<string, string>): Promise<boolean | null> {
  if (portal.busy) return null;
  portal.busy = true;
  try {
    const r = await api.portalChart(galaxy, pairs);
    if (portal.survey) portal.survey.left = r.left;
    if (r.right) { await openSurvey(); if (r.cracked !== null) await loadPortal(); }
    return r.right;
  } catch (e) {
    if (e instanceof ApiError && e.code === "no_tries" && portal.survey) portal.survey.left = 0;
    refuse();
    return null;
  } finally { portal.busy = false; }
}

// ---- ishaal, the ring game ----
export async function openIshaal(): Promise<void> {
  try { const g = await api.portalIshaal(); if (portal.pane !== "ishaal") setPane("ishaal"); portal.ishaal = g; } catch { /* stay */ }
}
/** One ring-game action; refreshes the board. Returns the server's answer, or null on a refusal. */
export async function ishaalDo(what: string, body: Record<string, unknown> = {}) {
  if (portal.busy) return null;
  portal.busy = true;
  try {
    const r = await api.portalIshaalDo(what, body);
    await openIshaal();
    if (r.cracked != null) await loadPortal();
    return r;
  } catch { refuse(); return null; } finally { portal.busy = false; }
}

// ---- Senneth's bench ----
export async function openBench(): Promise<void> {
  try { const b = await api.portalBench(); if (portal.pane !== "bench") setPane("bench"); portal.bench = b; } catch { /* stay */ }
}

// ---- the voice rooms ----
export function openVoice(id: string): void { setPane("voice"); portal.voiceRoom = id; }

/** The claim wall: every mark, who read it and how. */
export async function openWall(): Promise<void> {
  try { const w = await api.portalWall(); portal.wall = w.wall; portal.notation = w.notation; } catch { portal.wall = null; portal.notation = null; }
}
export async function openProfile(key: string): Promise<void> {
  try { portal.profile = await api.portalProfile(key); } catch { portal.profile = null; }
}

/** The socket: something changed in the hall. */
export function portalChanged(what: string, room: string | null): void {
  if (!portal.through) return;
  if (what === "glyph") { void loadPortal(); if (portal.wall) void openWall(); if (portal.survey) void openSurvey(); return; }
  if (what === "member") void loadRoster();
  if (what === "ishaal") { if (portal.pane === "ishaal") void openIshaal(); return; }
  if (portal.pane !== "room") return;
  if (!room || room === portal.roomId) void openRoom(portal.roomId);
}

export async function guessGlyph(id: number, sound: string): Promise<void> {
  if (portal.busy) return;
  portal.busy = true;
  try {
    const r = await api.portalGuessGlyph(id, sound);
    portal.verdict = r.right; portal.left = r.left;
    if (r.right) await loadPortal();
  } catch (e) {
    if (e instanceof ApiError && e.code === "no_tries") portal.left = 0;
    refuse();
  } finally { portal.busy = false; }
}
/** Claim a notation mark: name the script glyph it stands for. */
export async function guessNotation(mark: number, glyph: number): Promise<void> {
  if (portal.busy) return;
  portal.busy = true;
  try {
    const r = await api.portalGuessNotation(mark, glyph);
    portal.verdict = r.right; portal.left = r.left;
    if (r.right) { await openRoom(portal.roomId); portal.pick = null; }
  } catch (e) {
    if (e instanceof ApiError && e.code === "no_tries") portal.left = 0;
    refuse();
  } finally { portal.busy = false; }
}
export async function guessWord(target: string, word: number, piece: number, meaning: string): Promise<void> {
  if (portal.busy) return;
  portal.busy = true;
  try {
    const r = await api.portalGuessWord(target, word, piece, meaning);
    portal.verdict = r.right; portal.left = r.left;
    if (r.right) { await openRoom(portal.roomId); if (portal.overview) portal.overview.words++; }
  } catch (e) {
    if (e instanceof ApiError && e.code === "no_tries") portal.left = 0;
    refuse();
  } finally { portal.busy = false; }
}
export async function sendPost(): Promise<void> {
  if (portal.busy || !portal.compose.length) return;
  portal.busy = true;
  try {
    await api.portalPost(portal.roomId, portal.compose);
    portal.compose = [];
    await openRoom(portal.roomId);
  } catch { refuse(); } finally { portal.busy = false; }
}
export async function react(target: string, sign: string): Promise<void> {
  try { await api.portalReact(target, sign); await openRoom(portal.roomId); } catch { refuse(); }
}
export { refuse as portalRefuse };

export function resetPortal(): void {
  portal.loaded = false; portal.through = false; portal.overview = null; portal.room = null; portal.roster = [];
  portal.profile = null; portal.wall = null; portal.notation = null; portal.survey = null; portal.ishaal = null; portal.bench = null;
  portal.voiceRoom = null; portal.pane = "room"; portal.pick = null; portal.compose = [];
}
