// The live chat state and the WebSocket connection that keeps it in sync.
// Components read from `chat` (reactive) and call the exported actions.

import { api, getToken, ApiError, type Channel, type Message, type User } from "./api";
import { nav } from "./nav.svelte";
import { receiveWheelEvent } from "./wheel.svelte";
import { loadEmoji } from "./emoji.svelte";
import { handleDmEvent, loadConversations } from "./dm.svelte";
import { handleTradeEvent, loadTrades } from "./trade.svelte";
import { handleAuctionEvent } from "./auction.svelte";
import { handleFeedbackEvent } from "./feedback.svelte";
import { handlePitEvent } from "./bonepit.svelte";
import { handleEventEvent } from "./events.svelte";
import { handleSidebetEvent } from "./sidebet.svelte";
import { handleBjEvent } from "./blackjack.svelte";
import { handleRouletteEvent } from "./roulette.svelte";
import { handleCrapsEvent } from "./craps.svelte";
import { handleHoldemState, handleHoldemCards } from "./holdem.svelte";
import { sterlingSpeak, playSfx } from "./sfx";
import { pushAchievementToast } from "./achievements.svelte";
import { pushNotice } from "./notices.svelte";
import { onAffinityFrame } from "./affinity.svelte";
import { vip, loadVip, VIP_RANK_NAMES } from "./vip.svelte";
import { applyPandoraKey, KEY_LABEL } from "./pandora.svelte";
import { loadAbyss, applyAbyssOpened, applyAbyssClosed } from "./abyss.svelte";
import { portalChanged } from "./portal.svelte";
import type { PandoraKeyId } from "./api";
import { lender, loadLender } from "./lender.svelte";
import {
  loadPages, upsertPage, dropPage, resetPages, openPage, pages, applyPageOrder, GENERAL_PAGE_ID,
} from "./pages.svelte";
import { handleDerbyEvent } from "./derby.svelte";
import { handleLotteryWon } from "./lottery.svelte";
import { handleBoardChange } from "./soundboard.svelte";
import { handleChessEvent } from "./chessduel.svelte";
import { handleGraveEvent, handleGraveLifecycle } from "./graveyard.svelte";
import {
  applyVoiceSnapshot, applyVoiceState, applyVoiceMedia, applyVoiceMediaSnapshot,
  applyStreamViewers, applyStreamViewersSnapshot, setStreamWatchSender,
  loadVoiceConfig, setVoicePresenceSender, setVoiceMediaSender,
  setVoiceMemberLookup, attemptVoiceRejoin, voice, voiceEngaged,
  setSoundboardSender, playIncomingBoard, setVoiceSelfId, leaveVoice,
} from "./voice.svelte";
import { loadWallet, silverSend, loadTransfers } from "./wallet.svelte";
import { loadBlocks, isBlocked } from "./blocks.svelte";
import {
  setStatusSender, setEngagedProbe, announceStatus, applyStatus, applyStatusSnapshot, clearStatusFor,
} from "./status.svelte";
import { session, sessionKicked } from "./session.svelte";
import { prefs } from "./prefs.svelte";
import { roles, loadRoles, handleRolesEvent, myRoleIds, can, resetRoles } from "./roles.svelte";
import { initUpdateWatch, checkForUpdateSoon } from "./appupdate.svelte";
import { maybeNotify, excerpt } from "./notify.svelte";
import { fileAlert, ackAlerts } from "./alerts.svelte";
import { mentionsUser } from "./mentions";
import { go } from "./nav.svelte";
import { uniqById } from "./uniq";

/** A channel's live messages for something other than the open chat (the
 *  season show's chat panel): new posts, edits and deletions as they arrive.
 *  Returns the unsubscribe. */
const channelListeners = new Set<(m: Message) => void>();
export function onChannelMessage(fn: (m: Message) => void): () => void {
  channelListeners.add(fn);
  return () => channelListeners.delete(fn);
}

export const chat = $state<{
  channels: Channel[];
  members: User[];
  selectedId: number | null;
  messages: Message[]; // for the selected channel only
  online: number[];
  connected: boolean;
  /** The server closed THIS tab's socket because the account already holds
   *  its maximum (close 4008, the oldest goes). It must NOT reconnect on its
   *  own — that would evict the next tab, which would reconnect and evict the
   *  next, nine tabs chasing each other forever. It waits for a click. */
  evicted: boolean;
  typing: { userId: number; username: string; at: number }[];
  replyingTo: Message | null;
  unread: Record<number, number>; // channelId → unread count (0 entries omitted)
  /** WHERE IN THE HOUSE (Josh, Aug 2026): userId → the game zones their body
   *  is in right now ("casino" | "backrooms" | "escape", detail = backrooms
   *  level). Server-fed off the three game sockets; the roster shows it as a
   *  status line. A user can briefly hold two (the floor lingers while the
   *  escape door opens) — display picks by precedence. */
  zones: Record<number, { zone: string; detail: string | null }[]>;
  /** THE MARK (Sep 2026): userId → how deep they are with the goblins
   *  (1 MARKED · 2 GARNISHED · 3 REPOSSESSION · 4 FROZEN · 5 JAILED). Stage
   *  0 is simply absent. Server-fed (ready snapshot + lender.change) off the
   *  loans table, so a roster can never show a mark the ledger doesn't. */
  debtors: Record<number, number>;
  /** READ RECEIPTS for the OPEN channel: userId → lastReadId (everyone who
   *  sends receipts; the caller's own row is dropped). */
  readers: Record<number, number>;
  /** OLDER HISTORY for the open channel: true once the server has nothing
   *  further back (a page came back short), so the scroll-top loader stops
   *  asking. `loadingOlder` keeps one page in flight at a time. */
  olderDone: boolean;
  loadingOlder: boolean;
}>({
  readers: {},
  olderDone: false,
  loadingOlder: false,
  channels: [],
  members: [],
  selectedId: null,
  messages: [],
  online: [],
  connected: false,
  evicted: false,
  typing: [],
  replyingTo: null,
  unread: {},
  zones: {},
  debtors: {},
});

function applyDebtors(list: unknown): void {
  const next: Record<number, number> = {};
  if (Array.isArray(list)) {
    for (const d of list as { userId?: unknown; stage?: unknown }[]) {
      const id = Number(d?.userId);
      const stage = Number(d?.stage);
      if (Number.isInteger(id) && stage >= 1) next[id] = Math.min(5, stage);
    }
  }
  chat.debtors = next;
}

/** The debtor tag's word for a stage, or null when there is nothing to show. */
export function debtLabel(userId: number): string | null {
  const s = chat.debtors[userId];
  if (!s) return null;
  return ["", "MARKED", "GARNISHED", "REPOSSESSION", "FROZEN", "IN THE CELLS"][s] ?? null;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped by every sign-out: an initRealtime() that resumes from its boot
 *  fetch under a later generation belongs to a session that is gone (a
 *  logout, or a different account) and must not write into the store or
 *  open a second socket (Sep 2026 review). */
let initGen = 0;
let started = false;

/**
 * App-level bootstrap (called once on login): load channels + members + emoji +
 * DM conversations, pick a channel, and open the shared live connection. The
 * socket stays open across all views so DMs and presence keep working when you
 * leave the Chat view. Idempotent.
 */
export async function initRealtime(): Promise<void> {
  if (started) return;
  started = true;
  const gen = ++initGen;
  let channels: Awaited<ReturnType<typeof api.channels>>;
  let users: Awaited<ReturnType<typeof api.users>>;
  try {
    [channels, users] = await Promise.all([
      api.channels(),
      api.users(),
      loadPages(),
      loadEmoji(),
      loadConversations(),
      loadTrades(),
      loadWallet(),
      loadBlocks(),
      loadAbyss(),
    ]);
  } catch (e) {
    // A mid-deploy 502 here used to strand a signed-in user in a dead,
    // empty app forever — `started` stayed latched and nothing retried
    // (Aug 2026 review). Same doctrine as bootstrap(): network failures
    // retry, only a real sign-out gives up. An explicit 401/403 IS that
    // sign-out (or the Terms gate) — retrying nine calls every 3s against
    // it forever is a loop, not resilience (Sep 2026 review).
    started = false;
    if (gen !== initGen) return;
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return;
    setTimeout(() => {
      if (getToken() && session.user && gen === initGen) void initRealtime();
    }, 3000);
    return;
  }
  if (gen !== initGen || !started) return; // signed out (or re-signed) mid-boot
  chat.channels = channels.channels;
  chat.unread = toUnreadMap(channels.unread);
  chat.members = users.users;
  if (chat.selectedId == null && chat.channels.length) {
    const home = pages.list.find((p) => p.id === pages.currentId);
    const firstText =
      (home?.defaultChannelId ? chat.channels.find((c) => c.id === home.defaultChannelId) : undefined)
      ?? chat.channels.find((c) => c.kind !== "voice" && c.pageId === pages.currentId)
      ?? chat.channels.find((c) => c.kind !== "voice");
    // A failed first history read must not abort the boot (Oct 2026 review):
    // it threw past here with `started` set, so the socket was never opened
    // and every later initRealtime() returned early — a dead tab for good.
    if (firstText) {
      try { await selectChannel(firstText.id); } catch { /* the room loads on the next click */ }
    }
    if (gen !== initGen || !started) return; // signed out (or re-signed) during that read
  }
  // After the config lands, rejoin the voice room this tab was in pre-refresh.
  void loadVoiceConfig().then(attemptVoiceRejoin);
  // Watch for newer client bundles (deploys) — see appupdate.svelte.ts.
  initUpdateWatch();
  // Entrance chimes read the joiner's public cosmetics off the roster.
  setVoiceMemberLookup((id) => chat.members.find((m) => m.id === id));
  setVoiceSelfId(session.user?.id ?? null); // lets joins play MY sound to me
  // Voice presence rides this socket; inject the sender (avoids a module cycle).
  setVoicePresenceSender((channelId) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(channelId === null ? { type: "voice.leave" } : { type: "voice.join", channelId }));
    }
  });
  setVoiceMediaSender((cam, screen) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "voice.media", cam, screen }));
    }
  });
  setStreamWatchSender((streamerId, watching) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "stream.watch", streamerId, watching }));
    }
  });
  setSoundboardSender((id) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "soundboard.play", id }));
    }
  });
  // Voice engagement (streaming, camera, recent speaking) counts as app
  // activity — a movie-night host never drifts to away.
  setEngagedProbe(voiceEngaged);
  setStatusSender((s) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "status", status: s }));
    }
  });
  connect();
}

/** JSON object keys arrive as strings; the unread map is keyed by channel id. */
function toUnreadMap(raw: Record<string, number>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(raw ?? {})) out[Number(k)] = v;
  return out;
}

export async function selectChannel(id: number, opts?: { auto?: boolean }): Promise<void> {
  chat.selectedId = id;
  chat.typing = [];
  chat.replyingTo = null;
  ui.mobileDrawer = null; // picking a channel dismisses the phone drawer
  chat.messages = [];
  chat.readers = {};
  chat.olderDone = false;
  chat.loadingOlder = false;
  olderReq++;
  liveCap = LIVE_MESSAGE_CAP;
  {
    // PAGE ROLES: the page's snapshot feeds the composer's and sidebar's
    // affordances (and the name colours) — fetched once per page.
    const pid = chat.channels.find((c) => c.id === id)?.pageId;
    if (pid != null) void loadRoles(pid);
  }
  const { messages } = await api.messages(id);
  // Staleness guard: if the user clicked another channel while this fetch
  // was in flight, a slow response must not overwrite the newer pane.
  if (chat.selectedId !== id) return;
  chat.messages = uniqById(messages);
  chat.olderDone = messages.length < HISTORY_PAGE;
  void loadReaders(id);
  // AUTOMATIC re-selection (a deleted channel, a vanished page) is not the
  // user opening anything — marking then wiped unread on a channel nobody
  // looked at, from anywhere in the app (Aug 2026 review). Only a viewed
  // pane read-marks on the auto path.
  if (opts?.auto && !viewingSelectedChannel()) return;
  // Opening a channel is explicit user intent — mark it read. (The GET above
  // is deliberately side-effect-free so background refetches can't eat unread.)
  markRead(id);
  // Walking into the channel you were mentioned in IS the acknowledgement.
  ackAlerts("mention", id);
}

/** READ RECEIPTS: who has read how far in the open channel. Best-effort;
 *  a socket frame keeps it current from here. Skipped entirely when this
 *  account has receipts off (symmetric: you don't watch if you can't be
 *  watched). */
async function loadReaders(channelId: number): Promise<void> {
  if (!prefs.readReceipts) return;
  try {
    const { readers } = await api.channelReaders(channelId);
    if (chat.selectedId !== channelId) return;
    const map: Record<number, number> = {};
    for (const r of readers) if (r.userId !== session.user?.id) map[r.userId] = r.lastReadId;
    chat.readers = map;
  } catch {
    /* best-effort */
  }
}

function clearUnread(channelId: number): void {
  if (chat.unread[channelId]) {
    const { [channelId]: _gone, ...rest } = chat.unread;
    chat.unread = rest;
  }
}

/** Is the selected channel actually on the user's screen right now? Read-marking
 *  must never fire from another view, a hidden tab, or while the page picker
 *  covers the message pane (Chat swaps MessageView out entirely then). */
function viewingSelectedChannel(): boolean {
  return nav.view === "chat" && !pages.browsing && document.visibilityState === "visible";
}

// Server read-marks are throttled per channel (leading + trailing edge) so a
// busy conversation doesn't turn every incoming message into an HTTP write
// from every viewer. The local badge always clears instantly; the server
// cursor upserts to MAX(id), so the trailing post covers a whole burst.
const READ_THROTTLE_MS = 5_000;
const lastReadPost = new Map<number, number>();
const pendingRead = new Map<number, ReturnType<typeof setTimeout>>();

function markRead(channelId: number, throttled = false): void {
  clearUnread(channelId);
  const now = Date.now();
  const since = now - (lastReadPost.get(channelId) ?? 0);
  if (throttled && since < READ_THROTTLE_MS) {
    if (!pendingRead.has(channelId)) {
      pendingRead.set(
        channelId,
        setTimeout(() => {
          pendingRead.delete(channelId);
          // Re-check the gate at FIRE time: the user may have switched
          // channel, view, or tab since this was armed — posting anyway
          // advanced the server cursor past messages nobody saw (Aug 2026
          // review). Skipping is safe: the next real view re-marks.
          if (chat.selectedId !== channelId || !viewingSelectedChannel()) return;
          lastReadPost.set(channelId, Date.now());
          void api.markChannelRead(channelId).catch(() => {});
        }, READ_THROTTLE_MS - since),
      );
    }
    return;
  }
  lastReadPost.set(channelId, now);
  void api.markChannelRead(channelId).catch(() => {});
}

export async function sendMessage(text: string, attachmentIds?: number[]): Promise<void> {
  const id = chat.selectedId;
  const body = text.trim();
  if (id == null || (!body && !attachmentIds?.length)) return;
  const replyToId = chat.replyingTo?.id;
  // The socket will also deliver this to us; addOrUpdateMessage de-dupes by id.
  const { message } = await api.postMessage(id, body, replyToId, attachmentIds);
  addOrUpdateMessage(message);
  chat.replyingTo = null; // only clear once the send succeeds
}

export async function editMessage(id: number, body: string): Promise<void> {
  const { message } = await api.editMessage(id, body);
  addOrUpdateMessage(message);
}

export async function deleteMessage(id: number): Promise<void> {
  const { message } = await api.deleteMessage(id);
  addOrUpdateMessage(message);
}

/** Toggle my reaction on a message; the server tells us the resulting state. */
export async function reactToMessage(messageId: number, code: string): Promise<void> {
  const myId = session.user?.id;
  if (myId == null) return;
  try {
    const { added } = await api.reactToMessage(messageId, code);
    setReaction(messageId, code, myId, added);
  } catch {
    /* ignore — e.g. we no longer own that emoji */
  }
}

export function startReply(m: Message): void {
  chat.replyingTo = m;
}
export function cancelReply(): void {
  chat.replyingTo = null;
}

export async function createChannel(
  name: string,
  parentId?: number,
  kind: "text" | "voice" = "text",
  pageId?: number,
): Promise<void> {
  const { channel } = await api.createChannel(name.trim(), undefined, parentId, kind, pageId);
  addOrUpdateChannel(channel);
  if (channel.kind !== "voice") await selectChannel(channel.id);
}

/** Rename / set topic / lock a channel (owner or admin). */
export async function saveChannel(
  id: number,
  fields: { name?: string; topic?: string | null; locked?: boolean; makeDefault?: boolean },
): Promise<void> {
  const { channel } = await api.updateChannel(id, fields);
  addOrUpdateChannel(channel);
}

/** Replace a locked channel's post allow-list. */
export async function saveChannelAllow(id: number, userIds: number[]): Promise<void> {
  const { channel } = await api.setChannelAllow(id, userIds);
  addOrUpdateChannel(channel);
}

/** Delete a channel (and any sub-channels). Prunes locally; realtime confirms. */
export async function deleteChannelById(id: number): Promise<void> {
  await api.deleteChannel(id);
  removeChannelLocally(id);
}

/** Apply a new sibling order (admin only). The server echoes the full list. */
export async function reorderSiblings(ids: number[]): Promise<void> {
  const { channels } = await api.reorderChannels(ids);
  chat.channels = channels;
}

/** Can the current user post in this channel? (Mirror of the server rule.) */
export function canIPost(channel: Channel): boolean {
  const u = session.user;
  if (!u || u.disabled) return false;
  const manager = pages.list.find((p) => p.id === channel.pageId)?.role === "manager";
  if (u.isAdmin || manager) return true;
  // PAGE ROLES: the page's `post` permission first, then the lock — the
  // creator, the allow-list (the per-person override) or a post role.
  if (!can(channel.pageId, "post")) return false;
  if (!channel.locked) return true;
  if (channel.createdBy === u.id) return true;
  if (channel.postAllow?.includes(u.id)) return true;
  const mine = myRoleIds(channel.pageId);
  return (channel.postRoles ?? []).some((id) => mine.includes(id));
}

/** Can the current user manage (rename/lock/delete) this channel? */
export function canIManage(channel: Channel): boolean {
  const u = session.user;
  if (!u) return false;
  if (u.isAdmin || channel.createdBy === u.id) return true;
  if (pages.list.find((p) => p.id === channel.pageId)?.role === "manager") return true;
  // Only a LOADED snapshot may grant it — the optimistic "unknown = yes"
  // would put a gear on every channel of a page we haven't opened.
  const snap = roles.byPage[channel.pageId];
  return !!snap && (snap.mine === "all" || snap.mine.includes("manage_channels"));
}

/** Can the current user add channels to this page? */
export function canICreate(pageId: number): boolean {
  return !!session.user && !session.user.disabled && can(pageId, "create_channels");
}

/** PAGE ROLES: may I still see this channel? (A channel.update that just
 *  GATED it reaches the whole page; the shut-out drop it here.) */
function mayISee(channel: Channel): boolean {
  const u = session.user;
  if (!u) return false;
  const view = channel.viewRoles ?? [];
  if (!view.length || u.isAdmin || channel.createdBy === u.id) return true;
  if (pages.list.find((p) => p.id === channel.pageId)?.role === "manager") return true;
  const mine = myRoleIds(channel.pageId);
  return view.some((id) => mine.includes(id));
}

export function sendTyping(): void {
  if (ws && ws.readyState === WebSocket.OPEN && chat.selectedId != null) {
    ws.send(JSON.stringify({ type: "typing", channelId: chat.selectedId }));
  }
}

export function disconnectChat(): void {
  resetRoles();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectMisses = 0;
  if (ws) {
    // Detach the handlers BEFORE closing: the old socket's onclose fired
    // after this teardown and re-armed a reconnect timer — a login landing
    // inside that window opened a second socket while the first still
    // dispatched, double-counting every broadcast (Aug 2026 review).
    ws.onclose = null;
    ws.onmessage = null;
    ws.onopen = null;
    ws.onerror = null; // a CONNECTING socket fires error on close — it must not close the NEXT one
    ws.close();
  }
  ws = null;
  started = false;
  initGen++; // any boot fetch still in flight belongs to the old session
  hadConnection = false; // the next login's first open is a first open, not a reconnect
  // THE STORE IS THE OLD ACCOUNT'S UNTIL IT ISN'T (Sep 2026 review): the
  // next sign-in on this tab used to mount Chat on the previous account's
  // open channel — its messages and read receipts — until the socket opened
  // and a "reconnect" resync replaced them. A shared browser is exactly
  // where that shows a private page's room to somebody else.
  chat.selectedId = null;
  chat.messages = [];
  chat.unread = {};
  chat.online = [];
  chat.typing = [];
  chat.connected = false;
  chat.evicted = false;
  for (const t of pendingRead.values()) clearTimeout(t);
  pendingRead.clear();
  lastReadPost.clear();
  chat.zones = {}; // the next ready frame rebuilds the who-is-where picture
  chat.debtors = {};
  resetPages(); // the next account may not be in the same pages at all
}

export function selectedChannel(): Channel | undefined {
  return chat.channels.find((c) => c.id === chat.selectedId);
}

/** Where to land when the selected channel vanishes: a text channel on the
 *  page being VIEWED first, any text channel second — picking from the global
 *  list put the pane on another page's channel while the sidebar showed this
 *  one's rail (it only ever worked because #general is usually row one). */
function fallbackChannelId(): number | null {
  return (
    chat.channels.find((c) => c.pageId === pages.currentId && c.kind !== "voice")?.id ??
    chat.channels.find((c) => c.kind !== "voice")?.id ??
    null
  );
}

/** Walk into a page: show it, and move the message pane to one of ITS
 *  channels. Without this the old page's conversation stays on screen behind
 *  the new page's (possibly empty) rail, which reads as the switch not
 *  having worked. A page with no text channels yet clears the pane. */
export async function switchToPage(pageId: number): Promise<void> {
  openPage(pageId);
  const current = chat.channels.find((c) => c.id === chat.selectedId);
  if (current && current.pageId === pageId) return;
  // The page's NOMINATED landing channel wins; otherwise the first text one.
  const page = pages.list.find((p) => p.id === pageId);
  const preferred = page?.defaultChannelId
    ? chat.channels.find((c) => c.id === page.defaultChannelId && c.pageId === pageId)
    : undefined;
  const first = preferred ?? chat.channels.find((c) => c.pageId === pageId && c.kind !== "voice");
  if (first) await selectChannel(first.id);
  else {
    chat.selectedId = null;
    chat.messages = [];
    chat.replyingTo = null;
  }
}

// Shared chat UI state: which channel's settings modal is open (sidebar + channel
// header both open it), and whether the right-hand roster is collapsed (remembered).
export const ui = $state<{
  manageChannelId: number | null;
  rosterCollapsed: boolean;
  /** Phone-width slide-over panel: the channel list or the member roster.
   *  Desktop ignores this entirely (the panels are always in the grid). */
  mobileDrawer: "channels" | "members" | null;
  /** The message-search overlay (also opened by the "search" keybind). */
  searchOpen: boolean;
  /** Which PAGE's settings modal is open (name, description, icon, members). */
  pageSettingsId: number | null;
}>({
  manageChannelId: null,
  rosterCollapsed: localStorage.getItem("solace_roster_collapsed") === "1",
  mobileDrawer: null,
  searchOpen: false,
  pageSettingsId: null,
});
export function manageChannel(id: number | null): void {
  ui.manageChannelId = id;
}
export function openDrawer(which: "channels" | "members"): void {
  ui.mobileDrawer = ui.mobileDrawer === which ? null : which;
  // The drawer always shows the FULL roster — a slim collapsed rail inside
  // a slide-over would be pointless.
  if (which === "members") ui.rosterCollapsed = false;
}
export function closeDrawer(): void {
  ui.mobileDrawer = null;
}
export function toggleRoster(): void {
  ui.rosterCollapsed = !ui.rosterCollapsed;
  localStorage.setItem("solace_roster_collapsed", ui.rosterCollapsed ? "1" : "0");
}

/** The Chat view just came on screen — ack the open channel if it was unread
 *  (e.g. messages arrived while the user was over in Emoji Rumble). */
export function ackSelectedChannel(): void {
  const id = chat.selectedId;
  if (id != null && chat.unread[id] && viewingSelectedChannel()) markRead(id);
}

// Coming back to a hidden tab counts as reading the channel that's on screen —
// but only if the Chat view is the one on screen.
document.addEventListener("visibilitychange", () => {
  const id = chat.selectedId;
  if (id != null && chat.unread[id] && viewingSelectedChannel()) {
    markRead(id);
  }
});

/** Remove a channel (and its sub-channels) from local state, re-selecting if needed. */
function removeChannelLocally(id: number): void {
  const gone = new Set<number>([id, ...chat.channels.filter((c) => c.parentId === id).map((c) => c.id)]);
  chat.channels = chat.channels.filter((c) => !gone.has(c.id));
  if (chat.selectedId != null && gone.has(chat.selectedId)) {
    // Stay on the page you were on (Oct 2026 review — it jumped pages).
    const next = fallbackChannelId();
    if (next != null) void selectChannel(next, { auto: true });
    else {
      chat.selectedId = null;
      chat.messages = [];
    }
  }
}

// ---- internal helpers ----

/** How many messages the open channel keeps LIVE in memory. A tab left open
 *  on a busy room used to grow forever, and every append spread the whole
 *  array (a re-render of every row's date math). Scrolling up still pages
 *  older history in from the server as before; this only bounds the tail.
 *  Well above the deepest scroll anyone reaches with the unread rules. */
export const LIVE_MESSAGE_CAP = 600;
/** The server's default page — a page shorter than this is the beginning. */
const HISTORY_PAGE = 50;
/** The cap in force for the open channel. Paging older history raises it by
 *  what was loaded, so a reader deep in the past never has the page they're
 *  reading trimmed out from under them by a live message. */
let liveCap = LIVE_MESSAGE_CAP;
/** Bumped on every channel switch, so a page landing late can't clear the
 *  NEXT channel's in-flight flag. */
let olderReq = 0;

function addOrUpdateMessage(m: Message): void {
  if (m.channelId !== chat.selectedId) return; // we only hold the open channel
  const idx = chat.messages.findIndex((x) => x.id === m.id);
  if (idx >= 0) { chat.messages[idx] = m; return; }
  chat.messages.push(m); // $state arrays are deeply reactive — no spread needed
  if (chat.messages.length > liveCap) {
    chat.messages.splice(0, chat.messages.length - liveCap);
    chat.olderDone = false; // the head we dropped can be paged back in
  }
}

/** Page one step further back in the open channel (the scroll-top loader).
 *  Prepends; the view keeps the reader's place. Returns how many arrived. */
export async function loadOlder(): Promise<number> {
  const id = chat.selectedId;
  const first = chat.messages[0];
  if (id == null || !first || chat.olderDone || chat.loadingOlder) return 0;
  const gen = initGen;
  const req = ++olderReq;
  chat.loadingOlder = true;
  try {
    const { messages } = await api.messages(id, first.id);
    if (gen !== initGen || chat.selectedId !== id || chat.messages[0]?.id !== first.id) return 0;
    if (messages.length < HISTORY_PAGE) chat.olderDone = true;
    const have = new Set(chat.messages.map((m) => m.id));
    const fresh = uniqById(messages).filter((m) => !have.has(m.id));
    if (fresh.length) {
      chat.messages.unshift(...fresh);
      liveCap = Math.max(liveCap, chat.messages.length + LIVE_MESSAGE_CAP);
    }
    return fresh.length;
  } catch {
    return 0; // offline or a satellite down — the next scroll tries again
  } finally {
    if (req === olderReq) chat.loadingOlder = false;
  }
}

/** Update unread bookkeeping for a NEW live message. My own messages never
 *  count; only a message landing in the channel the user is actually LOOKING
 *  at (chat view, visible tab) is read — being parked on another view with
 *  the tab visible must still badge. */
function trackUnread(m: Message): void {
  if (m.userId === session.user?.id) return;
  if (m.channelId === chat.selectedId && viewingSelectedChannel()) {
    markRead(m.channelId, true); // throttled — busy rooms don't POST per message
    return;
  }
  chat.unread = { ...chat.unread, [m.channelId]: (chat.unread[m.channelId] ?? 0) + 1 };
}

/** Idempotently add/remove a user's reaction on a message (matches server state). */
function setReaction(messageId: number, code: string, userId: number, present: boolean): void {
  const idx = chat.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return;
  const msg = chat.messages[idx];
  let reactions = msg.reactions.map((r) => ({ code: r.code, userIds: [...r.userIds] }));
  let entry = reactions.find((r) => r.code === code);
  if (present) {
    if (!entry) {
      entry = { code, userIds: [] };
      reactions.push(entry);
    }
    if (!entry.userIds.includes(userId)) entry.userIds.push(userId);
  } else if (entry) {
    entry.userIds = entry.userIds.filter((id) => id !== userId);
    reactions = reactions.filter((r) => r.userIds.length > 0);
  }
  chat.messages[idx] = { ...msg, reactions };
}

function addOrUpdateChannel(c: Channel): void {
  const idx = chat.channels.findIndex((x) => x.id === c.id);
  if (idx >= 0) chat.channels[idx] = c;
  else chat.channels = [...chat.channels, c];
}

/** Apply a live profile change (name/avatar) to the roster and, if it's me, the session. */
function applyUserUpdate(u: User): void {
  const idx = chat.members.findIndex((m) => m.id === u.id);
  if (idx >= 0) chat.members[idx] = { ...chat.members[idx], ...u };
  else chat.members = [...chat.members, u];
  if (session.user && session.user.id === u.id) {
    session.user = { ...session.user, ...u };
  }
}

let hadConnection = false;

/** After an outage, refetch what the socket may have missed: the channel list +
 *  unread counts, the roster, the open channel's tail, and DM conversations.
 *  Deliberately does NOT mark anything read — a reconnect in a hidden tab must
 *  not eat the unread state for messages the user never saw. Only if the user
 *  is actively looking at the open channel does the cursor advance. */
async function resyncAfterReconnect(): Promise<void> {
  // The login generation (Oct 2026 review): a slow resync landing after a
  // sign-out must not write the old account's rooms into the new session.
  const gen = initGen;
  try {
    // loadPages rides along: a page created, deleted, renamed, or a
    // membership change while the socket was down arrives as fire-and-forget
    // frames nobody replays — without this, a deleted page's card lingered
    // in the picker until logout.
    const [channels, users] = await Promise.all([api.channels(), api.users(), loadConversations(), loadPages()]);
    if (gen !== initGen) return;
    chat.channels = channels.channels;
    chat.unread = toUnreadMap(channels.unread);
    chat.members = users.users;
    // A reconnect often means the server restarted — i.e. a deploy just
    // happened. See if a newer client bundle is waiting.
    checkForUpdateSoon();
    // The selected channel may have been deleted (or its page closed to us)
    // during the outage — its fetch would 404 into the catch below and leave
    // stale messages on screen. Fall back the same way the live events do.
    if (chat.selectedId != null && !chat.channels.some((c) => c.id === chat.selectedId)) {
      const next = fallbackChannelId();
      if (next != null) void selectChannel(next, { auto: true });
      else {
        chat.selectedId = null;
        chat.messages = [];
      }
    } else if (chat.selectedId != null) {
      const id = chat.selectedId;
      const { messages } = await api.messages(id);
      if (gen === initGen && chat.selectedId === id) {
        chat.messages = uniqById(messages);
        chat.olderDone = messages.length < HISTORY_PAGE;
        liveCap = LIVE_MESSAGE_CAP;
        if (viewingSelectedChannel()) markRead(id);
      }
    }
  } catch {
    /* still offline or mid-restart — the next reconnect tries again */
  }
}

function connect(): void {
  const token = getToken();
  if (!token) return;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`);
  ws.onopen = () => {
    reconnectMisses = 0;
    chat.connected = true;
    chat.evicted = false;
    if (hadConnection) void resyncAfterReconnect();
    hadConnection = true;
    // Re-announce voice presence: the server clears it when a socket dies,
    // and a refresh-rejoin may finish connecting LiveKit before this socket
    // opens (its voice.join frame would have been dropped).
    if (voice.channelId != null) {
      ws?.send(JSON.stringify({ type: "voice.join", channelId: voice.channelId }));
      // Re-announce camera/screen badges too — the server wiped them with the
      // presence entry when the old socket died, but LiveKit kept publishing.
      if (voice.camOn || voice.screenOn) {
        ws?.send(JSON.stringify({ type: "voice.media", cam: voice.camOn, screen: voice.screenOn }));
      }
      // Re-announce which streams I'm watching (the server dropped my watch
      // entries with the dead socket).
      for (const streamerId of voice.watching) {
        ws?.send(JSON.stringify({ type: "stream.watch", streamerId, watching: true }));
      }
    }
    // Re-announce status (the server clears it with presence on socket death).
    announceStatus(true);
  };
  ws.onclose = (e) => {
    chat.connected = false;
    if (e.code === 4003) {
      // The server kicked this session (ban / suspension / scrub / revoked
      // device / password reset) — the token no longer resolves, so
      // reconnecting would 401-loop forever with a stale "logged in" UI. A
      // wake or a cell session still has a screen; anything else signs out.
      void sessionKicked();
      return;
    }
    if (e.code === 4008) {
      // Too many tabs on this account; this one was the oldest. Sit quiet
      // until the person asks for it back (App shows the pill).
      chat.evicted = true;
      return;
    }
    scheduleReconnect();
  };
  ws.onerror = () => ws?.close();
  ws.onmessage = (e) => {
    try {
      handleEvent(JSON.parse(e.data));
    } catch {
      /* ignore malformed frames */
    }
  };
}

/** The evicted tab's way back in: one deliberate reconnect (which evicts
 *  whichever tab is now the oldest — the person chose this one). */
export function reclaimSocket(): void {
  if (!chat.evicted) return;
  chat.evicted = false;
  connect();
}

// A socket that dies while its SESSION died too (a password changed on
// another device, a revoked session, a Terms bump) never gets the 4003: the
// upgrade is refused with a bare 401, which a browser reports as a drop. The
// tab retried every 1.5s forever under a signed-in screen (Oct 2026 review).
// So: back off, and after a couple of misses ask the API whether the session
// still stands — a 401/403 there is the kick the socket never delivered.
let reconnectMisses = 0;
function scheduleReconnect(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectMisses++;
  const wait = Math.min(1500 * 2 ** Math.max(0, reconnectMisses - 1), 30_000);
  reconnectTimer = setTimeout(() => {
    if (reconnectMisses >= 3) {
      void api.me().then(
        () => connect(),
        (e) => {
          // terms_required is caught by api.ts, which raises the Terms gate.
          if (e instanceof ApiError && e.status === 401) void sessionKicked();
          else if (!(e instanceof ApiError && e.status === 403)) connect();
        },
      );
    } else {
      connect();
    }
  }, wait);
}

function handleEvent(msg: any): void {
  // DM + trade frames are recipient-scoped; hand them to their modules.
  if (typeof msg.type === "string" && msg.type.startsWith("dm.")) {
    handleDmEvent(msg);
    return;
  }
  if (typeof msg.type === "string" && msg.type.startsWith("trade.")) {
    handleTradeEvent(msg);
    return;
  }
  if (typeof msg.type === "string" && msg.type.startsWith("auction.")) {
    handleAuctionEvent(msg);
    return;
  }
  if (typeof msg.type === "string" && msg.type.startsWith("feedback.")) {
    handleFeedbackEvent(msg);
    return;
  }
  if (typeof msg.type === "string" && msg.type.startsWith("pit.")) {
    handlePitEvent(msg);
    return;
  }
  if (typeof msg.type === "string" && msg.type.startsWith("event.")) {
    handleEventEvent(msg);
    return;
  }
  if (typeof msg.type === "string" && msg.type.startsWith("sidebet.")) {
    handleSidebetEvent(msg);
    return;
  }
  if (typeof msg.type === "string" && msg.type.startsWith("bj.")) {
    handleBjEvent(msg);
    return;
  }
  if (msg.type === "roulette.state") {
    handleRouletteEvent(msg.state);
    return;
  }
  if (msg.type === "craps.state") {
    handleCrapsEvent(msg.state);
    return;
  }
  if (msg.type === "holdem.state") {
    handleHoldemState(msg.lobby);
    return;
  }
  if (msg.type === "holdem.cards") {
    handleHoldemCards({ tableId: msg.tableId, handId: msg.handId, cards: msg.cards });
    return;
  }
  if (msg.type === "derby.state") {
    handleDerbyEvent(msg.state);
    return;
  }
  if (msg.type === "lottery.won") {
    handleLotteryWon(msg);
    if (msg.winner) sterlingSpeak("lottery");
    return;
  }
  if (typeof msg.type === "string" && msg.type.startsWith("chess.")) {
    handleChessEvent(msg);
    return;
  }
  if (msg.type === "grave.respect" || msg.type === "grave.tribute") {
    handleGraveEvent(msg);
    return;
  }
  if (msg.type === "grave.raised" || msg.type === "grave.sealed") {
    handleGraveLifecycle(msg);
    return;
  }
  switch (msg.type) {
    case "ready":
      // A free self-resync: profile edits made while this socket was down
      // (another device, an admin action) land here instead of waiting for
      // the next user.update broadcast.
      if (msg.you && session.user && msg.you.id === session.user.id) {
        session.user = { ...session.user, ...msg.you };
      }
      chat.online = msg.online ?? [];
      applyVoiceSnapshot(msg.voice ?? {});
      applyVoiceMediaSnapshot(msg.voiceMedia ?? {});
      applyStreamViewersSnapshot(msg.streamViewers ?? {});
      applyStatusSnapshot(msg.statuses ?? {});
      {
        const zs: Record<number, { zone: string; detail: string | null }[]> = {};
        for (const z of msg.zones ?? []) (zs[z.userId] ??= []).push({ zone: z.zone, detail: z.detail ?? null });
        chat.zones = zs;
      }
      applyDebtors(msg.debtors);
      break;
    case "status":
      applyStatus(msg.userId, msg.status);
      break;
    case "lender.change":
      // The goblins' books moved: the mark follows, and a kiosk that is
      // actually ON SCREEN re-reads its cells/pot/shelf. Gated on the casino
      // view — `lender.loaded` stays true for the whole session once the hub
      // has been opened, and the frame fires on every chip and plea, so an
      // ungated refetch was a fan-out hit on /api/lender from every client
      // that had ever visited the floor (review finding, Sep 2026).
      applyDebtors(msg.debtors);
      if (lender.loaded && nav.view === "rumble") void loadLender();
      break;
    case "npc.affinity":
      // THE AFFINITY METER crossed a tier — yours, to you alone.
      onAffinityFrame(msg);
      break;
    case "lender.notice":
      // Something the goblins did to you (or a friend did for you), as a
      // card — and a system notification if you're not looking.
      pushNotice({
        title: String(msg.title ?? ""),
        body: String(msg.body ?? ""),
        tone: msg.kind === "visit" ? "grim" : msg.kind === "gift" || msg.kind === "bail" ? "kind" : "plain",
        icon: msg.kind === "visit" ? "🧾" : msg.kind === "bail" ? "🔓" : msg.kind === "gift" ? "🤝" : "🪙",
      });
      maybeNotify({ title: String(msg.title ?? ""), body: String(msg.body ?? ""), tag: "lender" });
      if (lender.loaded) void loadLender();
      void loadWallet();
      break;
    case "wallet.transfer": {
      // THE WALLET: silver came in (a card, and a notification if you're
      // away), or your own send landed on another tab.
      const me = session.user?.id;
      if (msg.toId === me) {
        const amt = Number(msg.amount ?? 0).toLocaleString("en-US");
        const title = "Silver received";
        const body = `${String(msg.fromName ?? "Someone")} sent you ${amt} silver${msg.note ? `: “${String(msg.note)}”` : "."}`;
        pushNotice({ title, body, tone: "kind", icon: "🪙" });
        maybeNotify({ title, body, tag: "wallet" });
      }
      void loadWallet();
      if (silverSend.loaded) void loadTransfers();
      break;
    }
    case "zone.state": {
      const list = (chat.zones[msg.userId] ?? []).filter((z) => z.zone !== msg.zone);
      if (msg.on) list.push({ zone: msg.zone, detail: msg.detail ?? null });
      if (list.length) chat.zones[msg.userId] = list;
      else delete chat.zones[msg.userId];
      break;
    }
    case "voice.state":
      applyVoiceState(msg.userId, msg.channelId);
      break;
    case "voice.kick":
      // You no-clipped into the Backrooms — the game owns your ears now.
      // (The server already cleared the room presence; this hangs up LiveKit.)
      if (voice.channelId != null) void leaveVoice();
      break;
    case "voice.media":
      applyVoiceMedia(msg.userId, msg.cam === true, msg.screen === true);
      break;
    case "stream.viewers":
      applyStreamViewers(msg.streamerId, msg.viewers ?? [], msg.watcherId, msg.watching, session.user?.id);
      break;
    case "soundboard.play":
      playIncomingBoard(msg.file);
      break;
    case "soundboard.change":
      handleBoardChange();
      break;
    case "message":
      addOrUpdateMessage(msg.message);
      trackUnread(msg.message);
      for (const fn of channelListeners) fn(msg.message);
      // Sterling ANNOUNCES his specials out loud — the pre-generated voice
      // line matched by the announcement's keywords (soundboard-volume gated).
      if (msg.message.author?.isBot && /@everyone\b/.test(msg.message.body)) {
        const b = msg.message.body.toUpperCase();
        const kind =
          b.includes("FLASH SALE") ? "special-flashsale" :
          b.includes("SPIN") ? "special-spindrop" :
          b.includes("RAKE") ? "special-rakefree" :
          b.includes("LOTTERY") || b.includes("SWEETEN") ? "special-potsweet" :
          b.includes("DOUBLE") ? "special-doublestats" : null;
        if (kind) sterlingSpeak(kind);
      }
      // A native ping when someone @mentions me and I'm not looking.
      // (Never for blocked users — their messages are collapsed anyway.)
      if (
        msg.message.author?.id !== session.user?.id &&
        !isBlocked(msg.message.userId) &&
        (mentionsUser(msg.message.body, session.user?.username) ||
          // @everyone rings only from the house (Sterling) or an admin.
          // …or anyone the server stamped as allowed to (a role holder).
          ((msg.message.author?.isBot || msg.message.author?.isAdmin || !!msg.message.everyone) && /@everyone\b/.test(msg.message.body)))
      ) {
        const chName = chat.channels.find((c) => c.id === msg.message.channelId)?.name ?? "chat";
        const title = `${msg.message.author?.displayName ?? "Someone"} mentioned you in #${chName}`;
        maybeNotify({
          title,
          body: excerpt(msg.message.body),
          tag: `mention-${msg.message.channelId}`,
          onclick: () => {
            go("chat");
            void selectChannel(msg.message.channelId);
          },
        });
        // …and file it, so the red dot survives a notification nobody saw.
        fileAlert({
          kind: "mention",
          title,
          body: excerpt(msg.message.body, 90),
          ref: msg.message.channelId,
        });
      }
      break;
    case "message.update":
    case "message.delete":
      // Known drift: deleting a counted-unread message doesn't decrement the
      // local badge (the client has no read cursor to know if it counted).
      // Self-corrects on the next channels fetch — the server excludes
      // tombstones.
      addOrUpdateMessage(msg.message);
      for (const fn of channelListeners) fn(msg.message);
      break;
    case "message.react":
      setReaction(msg.messageId, msg.code, msg.userId, msg.added);
      break;
    case "read.cursor":
      if (msg.channelId === chat.selectedId && msg.userId !== session.user?.id && prefs.readReceipts) {
        chat.readers = { ...chat.readers, [msg.userId]: msg.lastReadId };
      }
      break;
    case "presence":
      if (msg.event === "online") {
        if (!chat.online.includes(msg.userId)) chat.online = [...chat.online, msg.userId];
      } else {
        chat.online = chat.online.filter((id) => id !== msg.userId);
        clearStatusFor(msg.userId);
      }
      break;
    case "channel.create":
    case "channel.update":
      if (!mayISee(msg.channel)) {
        // Gated away from us: treat it as deleted.
        chat.channels = chat.channels.filter((c) => c.id !== msg.channel.id);
        if (chat.selectedId === msg.channel.id) {
          const next = fallbackChannelId();
          if (next != null) void selectChannel(next, { auto: true });
        }
        break;
      }
      addOrUpdateChannel(msg.channel);
      break;
    case "page.roles":
      handleRolesEvent(msg);
      break;
    case "channels.reorder":
      chat.channels = msg.channels;
      break;
    case "channel.delete":
      chat.channels = chat.channels.filter((c) => c.id !== msg.channelId);
      if (chat.selectedId === msg.channelId) {
        const next = fallbackChannelId();
        if (next != null) void selectChannel(next, { auto: true });
        else {
          chat.selectedId = null;
          chat.messages = [];
        }
      }
      break;
    case "page.change": {
      const prev = pages.list.find((p) => p.id === msg.page.id);
      // Only ADMINS keep sight of every page — a moderator holds a hidden
      // page only as its member (Sep 2026 scoping).
      const iAmStaff = !!session.user && session.user.isAdmin;
      // ROLE LOST on a non-public page: its channels stop being ours whether
      // or not the CARD survives — a member removed from a *discoverable*
      // request page keeps the card (it's public knowledge) but must lose
      // the rooms, or they sit in a dead channel where every post 404s. The
      // card itself is dropped only when the page turned fully invisible.
      // Staff keep sight of everything.
      const lost = (prev?.role ?? null) !== null && msg.page.role === null && !msg.page.isPublic && !iAmStaff;
      const invisible = msg.page.role === null && !msg.page.isPublic && !msg.page.discoverable && !iAmStaff;
      if (lost || invisible) {
        chat.channels = chat.channels.filter((c) => c.pageId !== msg.page.id);
        if (invisible) dropPage(msg.page.id);
        else {
          upsertPage(msg.page);
          if (pages.currentId === msg.page.id) pages.currentId = GENERAL_PAGE_ID;
        }
        if (chat.selectedId != null && !chat.channels.some((c) => c.id === chat.selectedId)) {
          const next = fallbackChannelId();
          if (next != null) void selectChannel(next, { auto: true });
          else {
            chat.selectedId = null;
            chat.messages = [];
          }
        }
        break;
      }
      upsertPage(msg.page);
      // ROLE GAINED on a non-public page (a knock approved, or staff added
      // us): our channel list was fetched before we could see inside, so the
      // page would open EMPTY until a manual reload. Pull the fresh list —
      // and MERGE it, don't clobber: a wholesale assignment landing after a
      // teardown elsewhere would resurrect channels we just lost.
      const gained = (prev?.role ?? null) === null && msg.page.role !== null;
      if (gained && !msg.page.isPublic) {
        void api.channels().then((r) => {
          if (!pages.list.some((p) => p.id === msg.page.id && p.role !== null)) return; // lost it meanwhile
          const have = new Set(chat.channels.map((c) => c.id));
          const fresh = r.channels.filter((c) => c.pageId === msg.page.id && !have.has(c.id));
          if (fresh.length) chat.channels = [...chat.channels, ...fresh];
          chat.unread = { ...chat.unread, ...toUnreadMap(r.unread) };
        }).catch(() => {});
      }
      break;
    }
    case "pages.reorder":
      applyPageOrder(msg.ids);
      break;
    case "page.gone":
      // Deleted, or we were removed from it. Its channels go with it — the
      // server won't send them again, and leaving them on screen would give
      // a sidebar full of rooms that 404 on click.
      chat.channels = chat.channels.filter((c) => c.pageId !== msg.pageId);
      dropPage(msg.pageId);
      if (chat.selectedId != null && !chat.channels.some((c) => c.id === chat.selectedId)) {
        const next = fallbackChannelId();
        if (next != null) void selectChannel(next, { auto: true });
        else {
          chat.selectedId = null;
          chat.messages = [];
        }
      }
      break;
    case "user.update":
      applyUserUpdate(msg.user);
      break;
    case "vip.fanfare":
      // THE HERALD's bells for a Tier-4 arrival — everyone online hears them
      // (the line itself is Sterling's ordinary #general message).
      playSfx("lottery-win", 0.45);
      break;
    case "pandora.key": {
      // PANDORA'S BOX: a key of mine landed (the server targets the earner).
      const key = String(msg.key) as PandoraKeyId;
      pushNotice({
        title: `${KEY_LABEL[key] ?? "A key"} is yours`,
        body: "It's waiting for you at Pandora's Box, under THE HUB. Sterling left a note.",
        tone: "kind",
        icon: "🗝",
      }, 14000);
      applyPandoraKey();
      break;
    }
    case "pandora.opened": {
      // THE OPENING — everyone online hears it (Sterling's line is the
      // ordinary #general message; this is the bells and the card).
      playSfx("lottery-win", 0.6);
      const who = String(msg.name ?? "Somebody");
      const chose = msg.choiceName ? `They chose: ${String(msg.choiceName)}.` : "They left hope in the box.";
      pushNotice({
        title: msg.first ? `${who} opened PANDORA'S BOX` : `${who} opened Pandora's Box`,
        body: `${chose} The ledger has a new line.`,
        tone: "kind",
        icon: "✨",
      }, 16000);
      applyPandoraKey();
      // If that was me and I reached for the Stone, it's in my inventory now.
      if (session.user && Number(msg.userId) === session.user.id) void loadAbyss();
      break;
    }
    case "portal.changed": {
      // THE PORTAL: the hall changed (a post, a sign, a member, a cracked mark).
      portalChanged(String(msg.what ?? ""), msg.room ? String(msg.room) : null);
      break;
    }
    case "abyss.closed": {
      // The stone was taken back: the Portal closes now, not on reload.
      applyAbyssClosed();
      break;
    }
    case "abyss.opened": {
      // THE STONE OF THE ABYSS: the phrase was said (here or in another tab)
      // and THE PORTAL is on the rail from now on.
      applyAbyssOpened();
      pushNotice({
        title: "The Portal is open",
        body: "A new section waits at the foot of THE HUB.",
        tone: "kind",
        icon: "◎",
      }, 12000);
      break;
    }
    case "vip.rank": {
      // THE VIP ROOM: the rope lifts (the server targets the earner only).
      const rank = Number(msg.rank) || 0;
      if (session.user) session.user = { ...session.user, vipTier: rank };
      pushNotice({
        title: `The rope lifts — ${VIP_RANK_NAMES[rank] ?? "VIP"}`,
        body: `Tier ${rank}. The VIP Room behind Sterling's counter is open to you.`,
        tone: "kind",
        icon: "✦",
      });
      if (vip.loaded) void loadVip();
      break;
    }
    case "achievement":
      // Your own badge, toasted (the server targets the earner only).
      pushAchievementToast({
        id: String(msg.id),
        name: String(msg.name),
        desc: String(msg.desc ?? ""),
        tier: (msg.tier as "bronze" | "silver" | "gold" | "mythic") ?? "bronze",
        rewardItem: (msg.rewardItem as string | null) ?? null,
      });
      break;
    case "wheel.event":
      receiveWheelEvent(msg.item);
      // Sterling eulogizes every death, out loud.
      if (msg.item?.kind === "death") sterlingSpeak("death");
      break;
    case "typing":
      if (msg.channelId === chat.selectedId) {
        chat.typing = [
          ...chat.typing.filter((t) => t.userId !== msg.userId),
          { userId: msg.userId, username: msg.username, at: Date.now() },
        ];
      }
      break;
  }
}
