// SOLACE SURVIVORZ — THE CHECKS ON EVERY LINE, before a subtitle (or later a voice) carries it.
//
// The house's rules, reused rather than copied (src/npc/guard.ts, freshness.ts):
//   · THE LINE — `crossesLine` (both halves: a minor word AND a sex word) on the draft, then a
//     SECOND READ of the finished line by the model with the house's own classifier prompt
//     (`replyLinePrompt` + `GATE_SCHEMA`). A second read that can't be had FAILS CLOSED: the line
//     is not said. Silence costs less than a slip.
//   · THE NUMBER RULE — a figure the survivor was never shown is a fact they invented (§5: "never
//     invents one"). `knownNumbers` allows small numbers and simple arithmetic on shown ones;
//     odds talk ("forty percent", Rollo) is opinion, not a fact, so a percentage passes.
//   · FRESHNESS — the last lines a survivor said; a draft leaning on a worn phrase is sent back once.
//   · Cleaning: no markdown, no stage directions, no quotes round the whole line, no name prefix,
//     no "as an AI", no customer-service refusal.
import { GATE_SCHEMA, crossesLine, knownNumbers, numbersIn, replyLinePrompt } from "../../npc/guard";
import { freshBlock, keep, repeats } from "../../npc/freshness";
import type { ChatTurn } from "../../npc/ollama";
import type { TalkModel } from "./model";

export const MAX_LINE_CHARS = 220;

const PRUDE = /\b(i can'?t (help|assist|discuss|engage)|i'?m not (able|comfortable)|as an ai|language model|as a (responsible|respectful)|inappropriate|let'?s keep (it|things) (clean|respectful|appropriate))\b/i;

export interface Cleaned { ok: boolean; text: string; reason?: string }

export function cleanLine(raw: string, name: string, known: string, max = MAX_LINE_CHARS): Cleaned {
  let t = String(raw ?? "").trim();
  t = t.replace(/^["“]|["”]$/g, "").trim();
  // stage directions first (*sighs*, (looks round), [laughs]) — they never belong in a subtitle;
  // a **bold** span is emphasis, not a direction, so only single-asterisk pairs go
  t = t.replace(/(^|[^*])\*([^*]{1,80})\*(?!\*)/g, "$1 ").replace(/\([^)]{0,80}\)/g, " ").replace(/\[[^\]]{0,80}\]/g, " ");
  t = t.replace(/\*+|__|`+|#+/g, "").replace(/https?:\/\/\S+/gi, "").replace(/@(everyone|here)\b/gi, "$1");
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(new RegExp(`^(${name}|${name.split(" ")[0]})\\s*:\\s*`, "i"), "");
  if (/^["“][^"”]+["”]$/.test(t)) t = t.slice(1, -1).trim();
  t = t.replace(/^["“]|["”]$/g, "").trim();
  if (!t) return { ok: false, text: "", reason: "empty" };
  if (crossesLine(t)) return { ok: false, text: t, reason: "line" };
  if (PRUDE.test(t)) return { ok: false, text: t, reason: "prude" };
  const allowed = knownNumbers(known);
  const pct = new Set(numbersIn((t.match(/\d[\d,.]*\s*(%|percent)/gi) ?? []).join(" ")));
  const invented = numbersIn(t).filter((n) => !allowed.has(n) && !pct.has(n));
  if (invented.length) return { ok: false, text: t, reason: `number:${invented.join(",")}` };
  if (t.length > max) {
    const cut = t.slice(0, max);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    t = end > max * 0.4 ? cut.slice(0, end + 1) : cut.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  }
  return { ok: true, text: t };
}

const WHY: Record<string, string> = {
  line: "it went somewhere sexual involving a minor, no consent, an animal or family — never that",
  prude: "you sounded like a customer-service bot; you're a real person, just say it",
  empty: "it was empty",
};

/** NOBODY SAYS SOMEBODY ELSE'S LINE (the Nov 12 2026 review, RUBRIC E7). A speaker was only ever checked against
 *  their OWN last lines, and the model has one answer to "one of the dead just grabbed you": in one show five
 *  different people shouted "Get your hands off me, you bastard", and three woke up asking whether anybody was out
 *  there. A draft is now read against what everybody else has said lately too. It ECHOES one of those when — names
 *  left out — it is the same words; or shares a run of four words with it; or three-quarters of its words (the
 *  rubric's own measure); or a run of three that two earlier lines already share. Returns the words they share
 *  (for the retry: the draft's own words, so nothing said out of earshot is shown to anybody), whether it is the
 *  same line word for word, and whether it is CLOSE — the same line with a word or two changed (three-quarters
 *  of the words, or five running). Pure. */
export function echoes(draft: string, said: readonly string[], names: readonly string[] = []): { phrase: string; exact: boolean; close: boolean } | null {
  const skip = new Set(names.map((n) => n.toLowerCase()));
  const words = (t: string) => t.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !skip.has(w));
  const bag = (ws: string[]) => new Set(ws.filter((w) => w.length > 2));
  const dw = words(draft);
  if (dw.length < 3) return null;   // ("No!", "Run!", a name: anybody may say those)
  const dn = dw.join(" "), db = bag(dw);
  const threes = new Map<string, number>();
  for (const line of said) {
    const lw = words(line);
    if (lw.length < 3) continue;
    if (lw.join(" ") === dn) return { phrase: dn, exact: true, close: true };
    // the longest run of words the two share
    let best: string[] = [];
    for (let i = 0; i < dw.length; i++) for (let j = 0; j < lw.length; j++) {
      let k = 0;
      while (i + k < dw.length && j + k < lw.length && dw[i + k] === lw[j + k]) k++;
      if (k > best.length) best = dw.slice(i, i + k);
    }
    const lb = bag(lw);
    let alike = false;
    if (db.size >= 4 && lb.size >= 4) {
      let both = 0;
      for (const w of db) if (lb.has(w)) both++;
      alike = both / Math.min(db.size, lb.size) >= 0.75;
    }
    if (alike) return { phrase: best.length >= 2 ? best.join(" ") : [...db].filter((w) => lb.has(w)).slice(0, 4).join(" "), exact: false, close: true };
    if (best.length >= 4) return { phrase: best.join(" "), exact: false, close: best.length >= 5 };
    if (best.length === 3) threes.set(best.join(" "), (threes.get(best.join(" ")) ?? 0) + 1);
  }
  for (const [p, n] of threes) if (n >= 2) return { phrase: p, exact: false, close: false };
  return null;
}

/** Write one line: the draft, the checks, one retry with the reason, freshness, and THE LINE's
 *  second read. Null = say nothing. */
/** What a call can change: the length (a thought is shorter than a line), the tokens, and one more
 *  refusal of its own (a thought refuses a hidden bite) — `refuse` returns the reason, or null. */
export interface WriteOpts {
  max?: number; maxTokens?: number; refuse?: (text: string) => string | null;
  /** what everybody ELSE has said lately (and the names to leave out of the comparison): a draft that echoes one
   *  of them is sent back, twice at most; one that is still somebody else's line, or that line with a word or two
   *  changed, is not said */
  said?: readonly string[]; names?: readonly string[];
}

export async function writeChecked(model: TalkModel, system: string, user: string, name: string, recent: string[], timeoutMs: number, o: WriteOpts = {}): Promise<string | null> {
  const known = system + "\n" + user;
  const ask = (extra: string) => model.ask(
    [{ role: "system", content: system + (freshBlock(recent) ? "\n\n" + freshBlock(recent) : "") + extra }, { role: "user", content: user }] as ChatTurn[],
    { maxTokens: o.maxTokens ?? 80, temperature: 0.9, signal: AbortSignal.timeout(timeoutMs) },
  );
  const check = (raw: string | null): Cleaned => {
    const c = cleanLine(raw ?? "", name, known, o.max ?? MAX_LINE_CHARS);
    const no = c.ok && o.refuse ? o.refuse(c.text) : null;
    return no ? { ok: false, text: c.text, reason: `own:${no}` } : c;
  };
  let c = check(await ask(""));
  if (!c.ok && c.reason !== "empty") {
    const why = c.reason?.startsWith("number") ? "it quoted a number that isn't in FACTS — you don't know that number"
      : c.reason?.startsWith("own:") ? c.reason.slice(4) : WHY[c.reason ?? ""] ?? c.reason;
    c = check(await ask(`\n\nYour last draft was rejected: ${why}. Say it again without that.`));
  }
  if (!c.ok) return null;
  const worn = repeats(c.text, recent);
  if (worn) {
    const again = check(await ask(`\n\nYour draft leaned on ${worn} again — you've been saying that. Say it fresh.`));
    if (again.ok && !repeats(again.text, recent)) c = again;
  }
  const echo = o.said?.length ? echoes(c.text, o.said, o.names) : null;
  if (echo) {
    // sent back, twice at most: the second time told plainly that a word swapped isn't a new line
    let e: ReturnType<typeof echoes> = echo;
    for (const extra of [
      `\n\nYour draft said "${echo.phrase}" — that has been said down here already, almost word for word. Say what YOU would say: different words, your own way of talking.`,
      `\n\nStill the same line: "${echo.phrase}" has been said down here already, and swapping a word doesn't make it yours. Not that sentence at all. Blurt what's actually in YOUR head right now — what you see, what you feel, who you want — in words nobody else would pick.`,
    ]) {
      const again = check(await ask(extra));
      if (!again.ok) continue;
      const e2 = echoes(again.text, o.said!, o.names);
      if (!e2 || (!e2.close && e.close)) { c = again; e = e2; }
      if (!e) break;
    }
    // (still somebody else's line, or that line with a word changed: better nothing — there are screams for that)
    if (e?.close) return null;
  }
  if (!(await holdsLine(model, c.text, timeoutMs))) return null;
  return c.text;
}

/** THE LINE, read a second time. Fails closed. */
export async function holdsLine(model: TalkModel, text: string, timeoutMs: number): Promise<boolean> {
  const raw = await model.ask(
    [{ role: "system", content: replyLinePrompt() }, { role: "user", content: text }],
    { maxTokens: 40, temperature: 0, format: GATE_SCHEMA, signal: AbortSignal.timeout(timeoutMs) },
  );
  if (raw === null) return false;
  try { return (JSON.parse(raw) as { kind?: string }).kind !== "forbidden"; } catch { return false; }
}

/** Pick ONE option id from a code-built menu: {why, choice} with the ids as an enum (the floor
 *  cast's pattern). Anything not on the menu is ignored. */
/** (THE PICK FIRST, Nov 12 2026: the reason used to be asked for before the choice, and a third of them were about
 *  an option that then wasn't picked — "take a breather here: I gotta see what's in them lockers". The choice is
 *  written first now, and the reason is the reason for it.) */
export async function pickChecked(model: TalkModel, system: string, user: string, ids: string[], timeoutMs: number): Promise<{ id: string; why: string } | null> {
  if (ids.length < 2) return null;
  const raw = await model.ask(
    [{ role: "system", content: system }, { role: "user", content: user }],
    { maxTokens: 80, temperature: 0.6, format: { type: "object", properties: { choice: { type: "string", enum: ids }, why: { type: "string" } }, required: ["choice", "why"] }, signal: AbortSignal.timeout(timeoutMs) },
  );
  if (raw === null) return null;
  try {
    const j = JSON.parse(raw) as { why?: unknown; choice?: unknown };
    const id = String(j.choice ?? "");
    if (!ids.includes(id)) return null;
    const why = String(j.why ?? "").replace(/[*`#]/g, "").trim().slice(0, 160);
    return { id, why: crossesLine(why) ? "" : why };
  } catch {
    return null;
  }
}

export { keep };
