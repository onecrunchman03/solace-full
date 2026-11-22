import type { Store } from "./db/store";

/** `:code:` chat-emoji token. Only real catalog codes are treated as emoji. */
export const EMOJI_TOKEN = /:([a-zA-Z0-9_-]{1,32}):/g;

/**
 * The real-emoji `:code:` tokens in `body` that `userId` does not own. Posting
 * (and reacting) with collectible emoji is owned-only, so a non-empty result
 * means the message must be rejected. Shared by channel + DM posting.
 */
export function unownedEmoji(store: Store, userId: number, body: string): string[] {
  const bad: string[] = [];
  const seen = new Set<string>();
  EMOJI_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EMOJI_TOKEN.exec(body))) {
    const code = m[1];
    if (seen.has(code)) continue;
    seen.add(code);
    if (store.getEmoji(code) && !store.ownsEmoji(userId, code)) bad.push(code);
  }
  return bad;
}
