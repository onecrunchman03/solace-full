// Emoji data for chat. A code→emoji lookup renders any emoji that appears in a
// message or reaction; the owned inventory drives the pickers (posting AND
// reacting are "collectibles you own" only, by decision).

import { api, type Emoji, type EmojiLite } from "./api";

export const emoji = $state<{
  catalog: Record<string, EmojiLite>;
  owned: Emoji[];
  loaded: boolean;
}>({ catalog: {}, owned: [], loaded: false });

export async function loadEmoji(): Promise<void> {
  try {
    const [cat, inv] = await Promise.all([api.catalog(), api.inventory()]);
    const map: Record<string, EmojiLite> = {};
    for (const list of Object.values(cat.catalog)) for (const e of list) map[e.code] = e;
    emoji.catalog = map;
    emoji.owned = inv.emoji;
    emoji.loaded = true;
  } catch {
    /* best-effort — chat still works, emoji just render as :code: text */
  }
}

/** Refresh the owned inventory (e.g. after winning emoji on the wheel). */
export async function refreshOwned(): Promise<void> {
  try {
    emoji.owned = (await api.inventory()).emoji;
  } catch {
    /* ignore */
  }
}

/** Logout hygiene: the owned inventory is account data — the next login must
 *  not inherit it (pickers/reactions would offer another user's collection
 *  until the refetch lands). The catalog stays; it's server-global. */
export function resetEmoji(): void {
  emoji.owned = [];
}

export function lookupEmoji(code: string): EmojiLite | undefined {
  return emoji.catalog[code];
}

export type Segment =
  | { type: "text"; value: string }
  | { type: "emoji"; code: string; file: string; name: string };

const TOKEN = /:([a-zA-Z0-9_-]{1,32}):/g;

/** Split a message body into text and (known) emoji segments. Unknown codes stay text. */
export function parseMessage(body: string): Segment[] {
  const segs: Segment[] = [];
  let last = 0;
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(body))) {
    const e = emoji.catalog[m[1]];
    if (!e) continue; // unknown code → leave it as literal text
    if (m.index > last) segs.push({ type: "text", value: body.slice(last, m.index) });
    segs.push({ type: "emoji", code: m[1], file: e.file, name: e.name });
    last = TOKEN.lastIndex;
  }
  if (last < body.length) segs.push({ type: "text", value: body.slice(last) });
  return segs;
}

export type Scale = "jumbo" | "large" | "medium" | "inline";

/** Emoji-only messages render bigger: 1 → jumbo, 2–4 → large, 5+ → medium. */
export function emojiScale(segs: Segment[]): Scale {
  const emo = segs.filter((s) => s.type === "emoji");
  if (!emo.length) return "inline";
  const text = segs.reduce((acc, s) => acc + (s.type === "text" ? s.value : ""), "").trim();
  if (text) return "inline"; // mixed with text → inline size
  return emo.length === 1 ? "jumbo" : emo.length <= 4 ? "large" : "medium";
}
