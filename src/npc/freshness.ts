// FRESHNESS — the floor regulars stop repeating themselves (Josh, Oct 2026).
//
// Each line a regular says is fine on its own; ten in a row are a broken
// record ("sweetheart" four times, the Siege of Tau-9 three). This keeps the
// last few things each one said and finds what they've been leaning on —
// pet names, names of things, words that keep coming back — so the prompt can
// show it to them and a draft that reuses it can be sent back once.
//
// Pure: no imports, no clock. brain.ts keeps the per-regular lists.

/** How many of their own lines a regular is shown, and how many are kept. */
export const FRESH_SHOWN = 6;
export const FRESH_KEPT = 12;

/** Pet names and forms of address — worn out after two uses. */
const ADDRESS = [
  "sweetheart", "sweetie", "darling", "darlin", "honey", "hon", "babe", "baby", "sugar", "doll", "toots",
  "love", "son", "kid", "pal", "buddy", "bud", "chief", "champ", "sport", "boss", "bro", "brother", "brah",
  "my man", "my friend", "friend", "civilian", "sailor", "princess", "handsome", "gorgeous", "cupcake",
  "big shot", "hotshot", "my guy", "dude", "fella", "mister", "missy", "sunshine", "cutie", "killer",
];

const STOP = new Set(("the a an and or but if then so of to in on at for with from by as is are was were be been it its it's " +
  "this that these those you your you're i i'm me my we our they them their he she him her his not no yes just like " +
  "what when where who why how all any some one two can could would should will won't don't do does did got get " +
  "have has had there here about into out up down over again more most very really still even than too only well " +
  "gonna wanna gotta ya yeah oh hey huh whaddaya ain't let let's know think see say said tell come go going back " +
  "right now time good thing things night tonight people somebody something nothing everybody").split(/\s+/));

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' -]/g, " ").replace(/\s+/g, " ").trim();

function hasPhrase(text: string, phrase: string): boolean {
  return new RegExp(`(^|[^a-z0-9'])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9']|$)`).test(text);
}

/** Capitalised names in a line ("Tau-9", "Siege of Tau-9", "Saturn Follies"),
 *  skipping the first word of each sentence (capitalised anyway). */
function properNames(line: string): string[] {
  const out: string[] = [];
  for (const sentence of line.split(/[.!?]+\s*/)) {
    const words = sentence.trim().split(/\s+/).slice(1);
    for (const w of words) {
      const t = w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9-]+$/g, "");
      if ((t.length >= 3 || /^[A-Z]{2}$/.test(t)) && /^[A-Z]/.test(t) && !/^(I|I'm|I'll|I've|I'd|OK)$/.test(t)) out.push(t.toLowerCase());
    }
  }
  return out;
}

/** What a regular has been leaning on, given their recent lines (oldest
 *  first): pet names used twice, names used twice, ordinary words used three
 *  times. `skip` is words never to flag (the listener's own name). */
export function overused(lines: string[], skip: string[] = []): string[] {
  // Names and pet names over everything kept (a story told at line 3 and
  // line 9 is a story told twice); ordinary words over the last 8.
  const recent = lines.slice(-FRESH_KEPT);
  const lately = lines.slice(-8);
  const skipSet = new Set(skip.map((s) => s.toLowerCase()).filter(Boolean));
  const count = (pred: (line: string) => boolean) => recent.filter(pred).length;
  const out: string[] = [];
  for (const a of ADDRESS) {
    if (skipSet.has(a)) continue;
    if (count((l) => hasPhrase(norm(l), a)) >= 2) out.push(a);
  }
  const names = new Map<string, number>();
  const words = new Map<string, number>();
  for (const l of recent) for (const n of new Set(properNames(l))) names.set(n, (names.get(n) ?? 0) + 1);
  for (const l of lately) {
    for (const w of new Set(norm(l).split(" "))) {
      if (w.length >= 5 && !STOP.has(w) && !/^\d/.test(w)) words.set(w, (words.get(w) ?? 0) + 1);
    }
  }
  for (const [n, k] of names) if (k >= 2 && !skipSet.has(n) && !out.includes(n)) out.push(n);
  for (const [w, k] of words) if (k >= 3 && !skipSet.has(w) && !out.includes(w) && !ADDRESS.includes(w)) out.push(w);
  return out.slice(0, 12);
}

/** Does a draft lean on something worn out, or open the way a recent line
 *  did? Returns what it repeated, or null when it's fresh. */
export function repeats(draft: string, lines: string[], skip: string[] = []): string | null {
  const d = norm(draft);
  if (petNameDue(lines, skip) && ADDRESS.some((a) => !skip.map((x) => x.toLowerCase()).includes(a) && hasPhrase(d, a))) return "a pet name";
  for (const term of overused(lines, skip)) if (hasPhrase(d, term)) return term;
  const opener = (s: string) => norm(s).split(" ").slice(0, 3).join(" ");
  const o = opener(draft);
  if (o.split(" ").length === 3 && lines.slice(-FRESH_SHOWN).some((l) => opener(l) === o)) return `"${o}…"`;
  return null;
}

/** Two of their last three lines carried a pet name (ANY pet name — a
 *  different one every line is still a pet name every line): the next line
 *  goes without. */
export function petNameDue(lines: string[], skip: string[] = []): boolean {
  const own = new Set(skip.map((x) => x.toLowerCase()));
  return lines.slice(-3).filter((l) => ADDRESS.some((a) => !own.has(a) && hasPhrase(norm(l), a))).length >= 2;
}

/** The block a regular is shown before speaking. Empty until they've said
 *  something. */
export function freshBlock(lines: string[], skip: string[] = []): string {
  const shown = lines.slice(-FRESH_SHOWN);
  if (!shown.length) return "";
  const worn = overused(lines, skip);
  return [
    `WHAT YOU'VE SAID LATELY (your own words, oldest first) — don't repeat yourself, don't reuse a joke, a story or an opening:`,
    ...shown.map((l) => `- ${l}`),
    petNameDue(lines, skip) ? "You've used a pet name in most of your last few lines — no pet name this time; use their name or nothing." : "",
    worn.length ? `WORN OUT — you've been leaning on these; don't use any of them now: ${worn.map((w) => `"${w}"`).join(", ")}.` : "",
  ].filter(Boolean).join("\n");
}

/** Keep a line in a regular's list. */
export function keep(lines: string[], text: string): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  return t ? [...lines, t].slice(-FRESH_KEPT) : lines;
}
