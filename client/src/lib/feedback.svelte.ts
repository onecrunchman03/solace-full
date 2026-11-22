// Feedback board state: everyone sees every filing; updates arrive live over
// the shared socket (`feedback.new` / `feedback.status` broadcasts).

import { api, type FeedbackItem } from "./api";

export const feedback = $state<{ items: FeedbackItem[]; loading: boolean }>({
  items: [],
  loading: true,
});

export async function loadFeedback(): Promise<void> {
  try {
    feedback.items = (await api.feedback()).items;
  } catch {
    // best-effort — a failed load must not become an unhandled rejection
  } finally {
    feedback.loading = false;
  }
}

/** Server order: open first, newest first within each group. Re-derive it
 *  locally after an upsert so live status flips regroup the same way. */
function sortItems(items: FeedbackItem[]): FeedbackItem[] {
  return items.sort((a, b) => {
    const open = Number(b.status === "open") - Number(a.status === "open");
    return open !== 0 ? open : b.id - a.id;
  });
}

/** Insert or replace one item (my own POST response, or anyone's broadcast —
 *  both can arrive for the same item; upserting by id makes that harmless). */
export function upsertFeedback(item: FeedbackItem): void {
  const rest = feedback.items.filter((f) => f.id !== item.id);
  feedback.items = sortItems([...rest, item]);
}

/** A feedback.* frame arrived over the socket. */
export function handleFeedbackEvent(msg: { type: string; item?: FeedbackItem }): void {
  if ((msg.type === "feedback.new" || msg.type === "feedback.status") && msg.item) {
    upsertFeedback(msg.item);
  }
}

export function resetFeedback(): void {
  feedback.items = [];
  feedback.loading = true;
}
