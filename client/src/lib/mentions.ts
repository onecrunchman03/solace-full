// @mentions: pure text helpers. Mentions are plain "@username" text on the
// wire (no schema, no server parsing) — the client renders known usernames
// as chips and decides notification-worthiness locally against the roster.

export interface MentionPiece {
  type: "text" | "mention";
  value: string; // for mentions, the username WITHOUT the @
}

// The lookbehind keeps the @ off the tail of a word: "bob@example.com" must
// not ping a user named "example.com" (the composer's autocomplete already
// required a boundary; the render/notify side matched anywhere).
const MENTION_RE = /(?<![a-zA-Z0-9._-])@([a-zA-Z0-9._-]{3,32})/g;

/** Split a text run into text/mention pieces. Only usernames in `valid`
 *  become mentions — a stray "@nobody" stays plain text. */
export function splitMentions(text: string, valid: Set<string>): MentionPiece[] {
  const out: MentionPiece[] = [];
  let last = 0;
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(text))) {
    if (!valid.has(m[1].toLowerCase())) continue;
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    out.push({ type: "mention", value: m[1] });
    last = MENTION_RE.lastIndex;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

/** Does this message body mention `username`? */
export function mentionsUser(body: string, username: string | undefined): boolean {
  if (!username) return false;
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(body))) {
    if (m[1].toLowerCase() === username.toLowerCase()) return true;
  }
  return false;
}
