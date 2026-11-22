// THE PORTAL — read docs/portal/archive/lexicon.md into word → meaning.
// Two table shapes: vertical (| Eshai | Meaning | | Eshai | Meaning |) and
// horizontal (a header row of words over a row of meanings — the pronouns,
// the postpositions). Plus the linking words' prose line and the numbers.

const HEADS = /^(eshai|meaning|piece|makes|example|word|sign|particle|force)$/i;

export function parseLexicon(text) {
  const lex = new Map();
  const add = (w, m) => {
    const word = w.replace(/\*/g, "").replace(/\(.*?\)/g, "").replace(/[.?!]+$/, "").trim();
    const meaning = m.replace(/\*\*\(.*?\)\*\*/g, "").replace(/\*/g, "").trim();
    if (!word || !meaning || /\s/.test(word.replace(/^[a-z'-]+ [a-z'-]+$/i, "x")) || /[A-Z]/.test(word[0]) && word.length < 2) return;
    lex.set(word, lex.has(word) ? `${lex.get(word)}; ${meaning}` : meaning);
  };
  const rows = text.split(/^## Names in the archive\b/m)[0].split("\n");
  for (let r = 0; r < rows.length; r++) {
    if (!rows[r].startsWith("|")) continue;
    const cells = rows[r].split("|").slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^-*$/.test(c))) continue;
    const prevIsTable = rows[r - 1]?.startsWith("|");
    const sep = rows[r + 1]?.startsWith("|") && /^\|[\s|-]+\|$/.test(rows[r + 1]);
    if (!prevIsTable && sep && !cells.some((c) => HEADS.test(c))) {
      const means = rows[r + 2]?.split("|").slice(1, -1).map((c) => c.trim()) ?? [];
      cells.forEach((w, i) => means[i] && add(w, means[i]));
      r += 2; continue;
    }
    for (let i = 0; i + 1 < cells.length; i += 3) {
      const [w, m] = [cells[i], cells[i + 1]];
      if (!w || !m || /^-+$/.test(w) || HEADS.test(w)) continue;
      add(w, m);
    }
  }
  for (const m of text.matchAll(/\*([a-z]+)\* ([a-z ]+?)(?= ·|\s*\(|\.\s*$)/gm)) add(m[1], m[2]);
  ["nul zero", "en one", "dai two", "tir three", "kaav four", "pem five", "sul six", "hev seven", "en-nul eight"]
    .forEach((s) => { const [w, ...m] = s.split(" "); add(w, m.join(" ")); });
  return lex;
}
