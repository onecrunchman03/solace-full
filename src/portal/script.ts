// THE PORTAL — the Eshai script on the server: text → glyph tokens, and
// each word's pieces → the dictionary roots a reader must know.
//
// The archive is stored in our romanisation (docs/portal/eshai). The wire
// never carries it: a post goes out as glyph ids and separators, and the
// sound of a glyph is sent only once the community has cracked it.

import { GLYPH_ID } from "./glyph-ids";

/** Separator tokens, below the glyph ids (0–33). */
export const SEP = { GAP: -1, SEAM: -2, CLITIC: -3, STOP: -4, PAUSE: -5, PARA: -6 } as const;
const MULTI = new Set(["aa", "ee", "ai", "kh", "sh", "th", "vh", "ng"]);

export interface Tokenized {
  tokens: number[];
  /** every word, in order, as its pieces (split at ' and -), romanised */
  words: string[][];
}

/** Our spelling → the script's: uu is u, ah before a consonant is aa. */
export const normalise = (s: string) => s.toLowerCase().replace(/uu/g, "u").replace(/ah(?![aeiou])/g, "aa");

export function tokenize(text: string): Tokenized {
  const s = normalise(text).replace(/\r/g, "");
  const tokens: number[] = [];
  const words: string[][] = [];
  let word: string[] = [], piece = "";
  const endPiece = () => { if (piece) { word.push(piece); piece = ""; } };
  const endWord = () => { endPiece(); if (word.length) { words.push(word); word = []; } };
  const sep = (t: number) => { if (tokens.length && tokens[tokens.length - 1] === t) return; tokens.push(t); };
  for (let i = 0; i < s.length;) {
    const two = s.slice(i, i + 2), ch = s[i];
    if (MULTI.has(two)) { tokens.push(GLYPH_ID[two]); piece += two; i += 2; continue; }
    if (ch in GLYPH_ID && /[a-z0-7]/.test(ch)) { tokens.push(GLYPH_ID[ch]); piece += ch; i += 1; continue; }
    if (ch === "'") { endPiece(); sep(SEP.SEAM); }
    else if (ch === "-") { endPiece(); sep(SEP.CLITIC); }
    else if (ch === "\n" && s[i + 1] === "\n") { endWord(); sep(SEP.PARA); i += 2; continue; }
    else if (/\s/.test(ch)) { endWord(); if (tokens.length && tokens[tokens.length - 1] >= 0) sep(SEP.GAP); }
    else if (".!?—".includes(ch)) { endWord(); sep(SEP.STOP); }
    else if (",;:".includes(ch)) { endWord(); sep(SEP.PAUSE); }
    i += 1; // quotes, brackets and anything else are not drawn
  }
  endWord();
  return { tokens, words };
}

/** What a reader must know to read a piece. */
export interface PieceInfo {
  kind: "word" | "name" | "number" | "unknown";
  /** dictionary roots this piece is built on (empty for names and numbers) */
  roots: string[];
}

const SUFFIXES = ["maar", "eth", "sil", "mir", "ith", "en", "na", "ai", "nu", "ir", "un"];
/** Suffixes that are grammar, known with the root; the rest are roots of their own. */
const GRAMMAR = new Set(["eth", "en", "na", "un"]);

export class Dictionary {
  readonly meaning = new Map<string, string>();
  private names = new Set<string>();
  constructor(lexicon: { word: string; meaning: string }[], names: string[]) {
    for (const { word, meaning } of lexicon) this.meaning.set(normalise(word), meaning);
    for (const n of names) for (const p of n.split(/\s+/)) this.names.add(normalise(p));
  }
  addNames(names: Iterable<string>): void { for (const n of names) for (const p of n.split(/[\s'-]+/)) if (p) this.names.add(normalise(p)); }

  piece(p: string): PieceInfo {
    if (/^[0-7]+$/.test(p)) return { kind: "number", roots: [] };
    if (this.meaning.has(p)) return { kind: "word", roots: [p] };
    if (this.names.has(p)) return { kind: "name", roots: [] };
    const roots = this.strip(p, 0);
    return roots ? { kind: "word", roots } : { kind: "unknown", roots: [] };
  }
  private strip(p: string, depth: number): string[] | null {
    if (this.meaning.has(p)) return [p];
    if (depth >= 2) return null;
    for (const s of SUFFIXES) {
      if (!p.endsWith(s) || p.length <= s.length + 1) continue;
      const base = this.strip(p.slice(0, -s.length), depth + 1);
      if (base) return GRAMMAR.has(s) || !this.meaning.has(s) ? base : [...base, s];
    }
    for (const s of ["sil", "mir"]) {
      if (!p.startsWith(s) || p.length <= s.length + 1) continue;
      const base = this.strip(p.slice(s.length), depth + 1);
      if (base) return [s, ...base];
    }
    return null;
  }
  /** The meaning to show for a piece, built from its roots. */
  gloss(p: string): string | null {
    const info = this.piece(p);
    if (info.kind !== "word") return null;
    return info.roots.map((r) => this.meaning.get(r)!.split(";")[0].trim()).join(" + ");
  }
}

/** Does a reader's guess match a dictionary meaning? Generous on purpose —
 *  the daily ration is what stops guessing, not the matcher: any one sense,
 *  brackets ignored, small words ignored, plurals and tenses folded, and the
 *  guess's words all inside the sense (or the sense's inside the guess). */
const STOPWORDS = new Set(["it", "the", "a", "an", "to", "is", "of", "be", "one"]);
const stem = (w: string) => w.replace(/(ies)$/, "y").replace(/(ing|ed|es|s)$/, "") || w;
const content = (s: string) => s.split(" ").filter((w) => w && !STOPWORDS.has(w)).map(stem);
export function meaningMatches(guess: string, meaning: string): boolean {
  const norm = (x: string) => x.toLowerCase().replace(/(.*?)/g, " ").replace(/["'.!?]/g, "").replace(/s+/g, " ").trim();
  const g = norm(guess);
  if (!g) return false;
  const gw = content(g);
  return meaning.split(/[;,]/).map(norm).filter(Boolean).some((sense) => {
    if (sense === g) return true;
    const sw = content(sense);
    if (!gw.length || !sw.length) return sense.replace(/^to /, "") === g.replace(/^to /, "");
    return gw.every((w) => sw.includes(w)) || sw.every((w) => gw.includes(w));
  });
}
