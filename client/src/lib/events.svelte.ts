// Game nights: the house calendar. Public — list changes broadcast to all;
// the T-minus-15 reminder rides event.remind and respects the notification pref.

import { api, type HouseEvent } from "./api";
import { maybeNotify } from "./notify.svelte";
import { fileAlert } from "./alerts.svelte";

export const events = $state<{ list: HouseEvent[]; loading: boolean }>({
  list: [],
  loading: true,
});

export async function loadEvents(): Promise<void> {
  try {
    events.list = (await api.events()).events;
  } catch {
    // best-effort — a failed load must not become an unhandled rejection
  } finally {
    events.loading = false;
  }
}

export function handleEventEvent(msg: { type: string; events?: HouseEvent[]; title?: string; at?: number }): void {
  if (msg.type === "event.change" && msg.events) {
    events.list = msg.events;
  } else if (msg.type === "event.remind" && msg.title && msg.at) {
    const mins = Math.max(1, Math.round((msg.at - Date.now()) / 60_000));
    const title = `🗓️ ${msg.title} starts in ~${mins} min`;
    // Game Nights left the casino hub (Aug 2026) — the reminder just brings
    // the window forward; there is no view to land on any more.
    maybeNotify({
      title,
      body: "The house is gathering. Don't be the empty seat.",
      tag: `event-${msg.at}`,
    });
    fileAlert({ kind: "event", title, body: "The house is gathering.", ref: msg.at });
  }
}

export function resetEvents(): void {
  events.list = [];
  events.loading = true;
}
