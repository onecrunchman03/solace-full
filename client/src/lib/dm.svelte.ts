// Direct-message state + actions. Messages arrive over the shared WebSocket
// (dispatched here from chat.svelte.ts's socket handler) but are delivered only
// to the two participants — realtime is recipient-scoped for DMs.

import { api, type DmConversation, type DmMessage } from "./api";
import { session } from "./session.svelte";
import { maybeNotify, excerpt } from "./notify.svelte";
import { fileAlert, ackAlerts } from "./alerts.svelte";
import { go, nav } from "./nav.svelte";
import { uniqById } from "./uniq";

export const dm = $state<{
  conversations: DmConversation[];
  openId: number | null;
  messages: DmMessage[];
  loading: boolean;
  replyingTo: DmMessage | null;
  /** READ RECEIPTS: the other side's cursor per conversation (null = they
   *  don't send them). */
  theirRead: Record<number, number | null>;
  /** One of the house's three writing a reply, per conversation (src/npc).
   *  Members don't send DM typing; only the bots do, while the model works. */
  typing: Record<number, { name: string; at: number }>;
  /** OLDER HISTORY for the open thread: true once a page came back short. */
  olderDone: boolean;
  loadingOlder: boolean;
}>({ conversations: [], openId: null, messages: [], loading: false, replyingTo: null, theirRead: {}, typing: {}, olderDone: false, loadingOlder: false });

/** The server's default page — a shorter page is the start of the thread. */
const HISTORY_PAGE = 50;
/** Bumped on every thread switch so a late page can't clear the next one's flag. */
let olderReq = 0;

export function startReplyDm(m: DmMessage): void {
  dm.replyingTo = m;
}
export function cancelReplyDm(): void {
  dm.replyingTo = null;
}

export async function loadConversations(): Promise<void> {
  try {
    dm.conversations = (await api.dmConversations()).conversations;
  } catch {
    /* best-effort */
  }
}

/** Wipe DM state (on logout). */
export function resetDm(): void {
  dm.conversations = [];
  dm.openId = null;
  dm.messages = [];
  dm.replyingTo = null;
  dm.typing = {};
}

/** Open (creating if needed) a conversation with a user; returns its id. */
export async function openDmWith(userId: number): Promise<number | null> {
  try {
    const { conversation } = await api.startDm(userId);
    upsertConversation(conversation);
    await openConversation(conversation.id);
    return conversation.id;
  } catch {
    return null;
  }
}

/** Open a conversation by id: load its messages and mark it read. */
export async function openConversation(convId: number): Promise<void> {
  dm.openId = convId;
  dm.loading = true;
  dm.messages = [];
  dm.replyingTo = null;
  dm.olderDone = false;
  dm.loadingOlder = false;
  olderReq++;
  ackAlerts("dm", convId); // opening the thread clears its dot
  try {
    const { messages, theirLastReadId } = await api.dmMessages(convId); // GET also marks read server-side
    if (dm.openId !== convId) return; // user opened another thread mid-fetch
    dm.messages = uniqById(messages);
    dm.olderDone = messages.length < HISTORY_PAGE;
    dm.theirRead = { ...dm.theirRead, [convId]: theirLastReadId ?? null };
    markReadLocal(convId);
  } catch {
    /* ignore */
  } finally {
    if (dm.openId === convId) dm.loading = false;
  }
}

/** Page one step further back in the open thread (the scroll-top loader).
 *  Prepends; the view keeps the reader's place. Returns how many arrived. */
export async function loadOlderDm(): Promise<number> {
  const convId = dm.openId;
  const first = dm.messages[0];
  if (convId == null || !first || dm.olderDone || dm.loadingOlder) return 0;
  const req = ++olderReq;
  dm.loadingOlder = true;
  try {
    const { messages } = await api.dmMessages(convId, first.id);
    if (dm.openId !== convId || dm.messages[0]?.id !== first.id) return 0;
    if (messages.length < HISTORY_PAGE) dm.olderDone = true;
    const have = new Set(dm.messages.map((m) => m.id));
    const fresh = uniqById(messages).filter((m) => !have.has(m.id));
    if (fresh.length) dm.messages.unshift(...fresh);
    return fresh.length;
  } catch {
    return 0;
  } finally {
    if (req === olderReq) dm.loadingOlder = false;
  }
}

export function closeConversation(): void {
  dm.openId = null;
  dm.messages = [];
}

export async function sendDm(text: string, attachmentIds?: number[]): Promise<void> {
  const convId = dm.openId;
  const body = text.trim();
  if (convId == null || (!body && !attachmentIds?.length)) return;
  const replyToId = dm.replyingTo?.id;
  const { message } = await api.sendDm(convId, body, replyToId, attachmentIds); // socket echo de-dupes by id
  addOrUpdateDm(message);
  dm.replyingTo = null; // only clear once the send succeeds
}

export async function editDm(id: number, body: string): Promise<void> {
  const { message } = await api.editDm(id, body);
  addOrUpdateDm(message);
}

export async function deleteDm(id: number): Promise<void> {
  const { message } = await api.deleteDm(id);
  addOrUpdateDm(message);
}

/** Dispatch an incoming `dm.*` socket frame (called from chat.svelte.ts). */
export function handleDmEvent(msg: any): void {
  if (msg.type === "dm.read") {
    // The other side read up to lastReadId. Only ever sent to the two
    // participants, and only by accounts that send receipts.
    if (typeof msg.conversationId === "number" && msg.userId !== session.user?.id) {
      dm.theirRead = { ...dm.theirRead, [msg.conversationId]: msg.lastReadId };
    }
    return;
  }
  if (msg.type === "dm.typing") {
    if (typeof msg.conversationId === "number") {
      dm.typing = { ...dm.typing, [msg.conversationId]: { name: String(msg.username ?? ""), at: Date.now() } };
    }
    return;
  }
  const m: DmMessage | undefined = msg.message;
  if (!m) return;
  switch (msg.type) {
    case "dm.message":
      // The reply has landed — whoever was "writing" has finished.
      if (dm.typing[m.conversationId] && m.senderId !== session.user?.id) {
        const { [m.conversationId]: _done, ...rest } = dm.typing;
        dm.typing = rest;
      }
      if (m.conversationId === dm.openId) {
        addOrUpdateDm(m);
        // Mark read ONLY when the thread is actually on screen — the same
        // rule as channels. A conversation left open while you're parked in
        // Emoji Rumble (or a hidden tab) must keep its unread badge, here
        // and on your other devices.
        if (viewingConversation(m.conversationId)) {
          void markConversationRead(m.conversationId);
        }
      }
      touchConversation(m);
      // Native ping for an incoming DM when I'm not looking.
      if (m.senderId !== session.user?.id) {
        const conv = dm.conversations.find((c) => c.id === m.conversationId);
        const title = `💬 ${conv?.otherUser.displayName ?? "New message"}`;
        maybeNotify({
          title,
          body: excerpt(m.body),
          tag: `dm-${m.conversationId}`,
          onclick: () => {
            go("dms");
            void openConversation(m.conversationId);
          },
        });
        // A DM you never saw keeps its dot until you open the thread.
        if (!viewingConversation(m.conversationId)) {
          fileAlert({ kind: "dm", title, body: excerpt(m.body, 90), ref: m.conversationId });
        }
      }
      break;
    case "dm.message.update":
    case "dm.message.delete":
      if (m.conversationId === dm.openId) addOrUpdateDm(m);
      refreshPreview(m);
      break;
  }
}

// ---- internals ----

/** The thread is actually on the user's screen right now (the channels rule:
 *  read-marking must never fire from another view or a hidden tab). */
function viewingConversation(convId: number): boolean {
  return dm.openId === convId && nav.view === "dms" && document.visibilityState === "visible";
}

// Coming back to a hidden tab reads the open thread (the channel rule, Oct
// 2026 review — a DM that landed while hidden kept its badge forever).
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    const id = dm.openId;
    if (id == null || !viewingConversation(id)) return;
    if (!dm.conversations.find((c) => c.id === id)?.unread) return;
    ackAlerts("dm", id);
    void markConversationRead(id);
  });
}

async function markConversationRead(convId: number): Promise<void> {
  try {
    await api.markDmRead(convId);
  } catch {
    /* ignore */
  }
  markReadLocal(convId);
}

function addOrUpdateDm(m: DmMessage): void {
  if (m.conversationId !== dm.openId) return;
  const i = dm.messages.findIndex((x) => x.id === m.id);
  if (i >= 0) dm.messages[i] = m;
  else dm.messages.push(m); // deep $state — an in-place append, not a copy
}

function upsertConversation(c: DmConversation): void {
  const i = dm.conversations.findIndex((x) => x.id === c.id);
  if (i >= 0) dm.conversations[i] = c;
  else dm.conversations = [c, ...dm.conversations];
}

function markReadLocal(convId: number): void {
  const i = dm.conversations.findIndex((c) => c.id === convId);
  if (i >= 0) dm.conversations[i] = { ...dm.conversations[i], unread: 0 };
}

/** A new message arrived: refresh the conversation's preview, unread, and order. */
function touchConversation(m: DmMessage): void {
  const i = dm.conversations.findIndex((c) => c.id === m.conversationId);
  if (i < 0) {
    void loadConversations(); // first contact — pull in the new conversation
    return;
  }
  const c = dm.conversations[i];
  const mine = m.senderId === session.user?.id;
  const viewing = viewingConversation(m.conversationId);
  const unread = viewing ? 0 : mine ? c.unread : c.unread + 1;
  const updated = { ...c, lastMessage: m, unread };
  dm.conversations = [updated, ...dm.conversations.filter((x) => x.id !== c.id)];
}

/** Keep the list preview in sync when the last message is edited/deleted. */
function refreshPreview(m: DmMessage): void {
  const i = dm.conversations.findIndex((c) => c.id === m.conversationId);
  if (i < 0) return;
  const c = dm.conversations[i];
  if (c.lastMessage?.id === m.id) dm.conversations[i] = { ...c, lastMessage: m };
}
