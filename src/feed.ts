import type { WheelFeedItem } from "./types";

// A small in-memory ring buffer of recent notable wheel outcomes, so a client
// that just connected can render some history instead of an empty feed. The
// live stream itself goes out over the WebSocket; this is only the backfill.

const MAX = 40;
const recent: WheelFeedItem[] = [];

export function pushFeed(item: WheelFeedItem): void {
  recent.unshift(item);
  if (recent.length > MAX) recent.length = MAX;
}

export function recentFeed(): WheelFeedItem[] {
  return recent.slice();
}
