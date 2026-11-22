// THE PORTAL — the Nemaai–Tamruk game, move by move (pinned.md asks for it).
//
// A game position is not archive text, so it is generated: seeded, legal
// under scripts/portal/ishaal.mjs, slow and careful (nobody takes anything
// but the bait), and fitted to every move the archive names:
//   612  Tamruk: third stone to the second ring            (shenai t0.11)
//   660  Tamruk threatens Nemaai's fifth stone; 661 Nemaai leaves it (bait);
//   662  Tamruk takes it anyway                             (t19.30–t19.33)
//   750  Tamruk: second stone to the fourth ring           (t46.60)
//   752  Tamruk's fifth stone to the long ring, played by Nemaai for him (t72.40)
//   754  Paelu: second stone one ring further in           (t73.20)
//   757  Nemaai's last; Paelu to move, nobody has won      (t80.03)
// Move numbers are octal, as on screen. Tamruk's side moves on the even
// numbers, Nemaai's on the odd.
//
//   node scripts/portal/ishaal-game.mjs  → docs/portal/archive/ishaal-game.md

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { opening, moves, play, clone, onLong, won, alive, LONG } from "./ishaal.mjs";

const ROOT = join(import.meta.dirname, "../..");
let seed = 0x15aa1;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const o = (n) => n.toString(8);
const sideOf = (ply) => (ply % 2 === 0 ? "even" : "odd"); // even = Tamruk's side
const other = (side) => (side === "even" ? "odd" : "even");
const LAST = 0o757;

/** A careful move: takes nothing, never a fourth stone on the long ring.
 *  Leans inward a little, so the stones drift toward the long ring over years. */
function careful(stones, side) {
  const ok = moves(stones, side).filter((m) => !m.takes.length && !(m.ring === LONG && m.stone.ring !== LONG && onLong(stones, side) >= 3));
  if (!ok.length) return null;
  const w = ok.map((m) => (m.ring > m.stone.ring ? 2 : 1));
  let r = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ok.length; i++) if ((r -= w[i]) < 0) return ok[i];
  return ok[ok.length - 1];
}
const desc = (m, ply) => ({ ply, side: m.stone.side, n: m.stone.n, from: [m.stone.ring, m.stone.spoke], to: [m.ring, m.spoke], takes: m.takes.map((t) => t.n) });
function apply(stones, m, ply, log) { log.push(desc(m, ply)); play(stones, m); }

/** Free careful play over plies [from, to). */
function freePlay(stones, from, to, log) {
  for (let ply = from; ply < to; ply++) {
    const m = careful(stones, sideOf(ply));
    if (!m) return false;
    apply(stones, m, ply, log);
  }
  return true;
}

// Each step: plies of free play up to a named move, then that move (or moves)
// chosen from what is legal there. A step that can't be met is replayed from
// its start until it can.
const STEPS = [
  { at: 0o612, fit: (s, ply) => pickWhere(s, ply, (m) => m.stone.n === 3 && m.ring === 2 && m.stone.ring !== 2) },
  { at: 0o660, fit: (s, ply, log) => bait(s, ply, log) },
  // 750 needs the fifth stone already one ring short of the long ring, or 752 can't happen.
  { at: 0o750, fit: (s, ply) => stone(s, "even", 5).ring === LONG - 1 && !stone(s, "even", 5).taken ? pickWhere(s, ply, (m) => m.stone.n === 2 && m.ring === 4 && m.stone.ring === 3) : null },
  { at: 0o752, fit: (s, ply) => pickWhere(s, ply, (m) => m.stone.n === 5 && m.ring === LONG && m.stone.ring === LONG - 1) },
  { at: 0o754, fit: (s, ply) => pickWhere(s, ply, (m) => m.stone.n === 2 && m.stone.ring === 4 && m.ring === 5) },
];
const stone = (s, side, n) => s.find((x) => x.side === side && x.n === n);

function pickWhere(s, ply, test, carefulOnly = false) {
  const side = sideOf(ply);
  const ok = moves(s, side).filter((m) => !m.takes.length && test(m) && !(m.ring === LONG && m.stone.ring !== LONG && onLong(s, side) >= 3));
  if (!ok.length) return null;
  return [ok[Math.floor(rand() * ok.length)]];
}

/** 660: Tamruk sets up a take on Nemaai's fifth stone; 661: Nemaai leaves it
 *  where it is; 662: Tamruk takes it. */
function bait(s, ply) {
  const tries = moves(s, "even").filter((m) => !m.takes.length).sort(() => rand() - 0.5);
  for (const t of tries) {
    const s1 = clone(s); const t1 = moves(s1, "even").find((m) => m.stone.n === t.stone.n && m.ring === t.ring && m.spoke === t.spoke);
    play(s1, t1);
    const threat = (st) => moves(st, "even").some((m) => m.takes.some((x) => x.side === "odd" && x.n === 5));
    if (!threat(s1)) continue;
    const replies = moves(s1, "odd").filter((m) => !m.takes.length && m.stone.n !== 5).sort(() => rand() - 0.5);
    for (const r of replies) {
      const s2 = clone(s1); const r2 = moves(s2, "odd").find((m) => m.stone.n === r.stone.n && m.ring === r.ring && m.spoke === r.spoke);
      play(s2, r2);
      if (!threat(s2)) continue;
      return [t, r, "take5"];
    }
  }
  return null;
}

function run() {
  let stones = opening(), log = [], ply = 1;
  for (const step of STEPS) {
    let done = false;
    for (let attempt = 0; attempt < 20000 && !done; attempt++) {
      const s = clone(stones), l = [...log];
      if (!freePlay(s, ply, step.at, l)) continue;
      const picked = step.fit(s, step.at, l);
      if (!picked) continue;
      let p = step.at;
      for (const m0 of picked) {
        if (m0 === "take5") {
          const take = moves(s, "even").find((m) => m.takes.some((x) => x.side === "odd" && x.n === 5));
          apply(s, take, p++, l);
          continue;
        }
        const m = moves(s, m0.stone.side).find((x) => x.stone.n === m0.stone.n && x.ring === m0.ring && x.spoke === m0.spoke);
        apply(s, m, p++, l);
      }
      stones = s; log = l; ply = p; done = true;
    }
    if (!done) throw new Error(`could not fit move ${o(step.at)}`);
  }
  // 755–757, then Paelu to move with nobody winning.
  for (let attempt = 0; attempt < 20000; attempt++) {
    const s = clone(stones), l = [...log];
    if (!freePlay(s, ply, LAST + 1, l)) continue;
    if (won(s, "even") || won(s, "odd")) continue;
    // Paelu's move 760 must not be able to win it: the game that cannot be finished.
    if (onLong(s, "even") >= 3 && moves(s, "even").some((m) => m.ring === LONG && m.stone.ring !== LONG)) continue;
    if (moves(s, "even").some((m) => alive(s, "odd").length - m.takes.length <= 2)) continue;
    return { stones: s, log: l };
  }
  throw new Error("could not finish the game");
}

const { stones, log } = run();
const who = (e) => (e.side === "odd" ? "Nemaai" : e.ply >= 0o753 ? "Paelu" : e.ply === 0o752 ? "Nemaai, for Tamruk" : "Tamruk");
const pt = ([r, s]) => `${o(r)}.${s}`;
let out = `# Ishaal — the Nemaai–Tamruk game (GENERATED by scripts/portal/ishaal-game.mjs; do not hand-edit)\n\n`;
out += `Every move of the game the hall kept, in their numerals. A point is ring.spoke: rings 1–10 from the edge in (10 is the long ring), spokes 0–7. Tamruk's side holds the even spokes at the start, Nemaai's the odd. Stones are numbered 1–4 on the edge, 5–10 on the second ring, in spoke order.\n\n`;
out += `The board stands at move 757. Paelu is to move. Nobody has won.\n\n`;
out += `Tamruk's side: ${alive(stones, "even").length.toString(8)} stones, ${onLong(stones, "even")} on the long ring. Nemaai's side: ${alive(stones, "odd").length.toString(8)} stones, ${onLong(stones, "odd")} on the long ring.\n\n`;
out += "```\n" + log.map((e) => `${o(e.ply).padStart(3)}  ${who(e).padEnd(18)} stone ${o(e.n)}  ${pt(e.from)} → ${pt(e.to)}${e.takes.length ? `  takes ${e.takes.map(o).join(",")}` : ""}`).join("\n") + "\n```\n";
writeFileSync(join(ROOT, "docs/portal/archive/ishaal-game.md"), out);
console.log(`ishaal: ${o(log.length)} moves; even side ${alive(stones, "even").length} stones (${onLong(stones, "even")} long), odd side ${alive(stones, "odd").length} (${onLong(stones, "odd")} long)`);
