// THE PORTAL — Tharvend files a newcomer. Their name, written by SOUND in a
// script that has never heard it: our letters mapped to the nearest of the
// Eshai's 26 sounds. It is the reader's first crib (they know how their own
// name sounds), so it must be deterministic and must read like an attempt.

const RULES: [RegExp, string][] = [
  [/ng/g, "ŋ"], // keep "ng" one sound before g becomes k
  [/ph/g, "p"], [/ch/g, "sh"], [/ck/g, "k"], [/qu/g, "kw"], [/x/g, "ks"], [/c(?=[eiy])/g, "s"], [/c/g, "k"], [/q/g, "k"],
  [/b/g, "p"], [/f/g, "p"], [/g/g, "k"], [/j/g, "y"], [/z/g, "s"],
  [/oo/g, "u"], [/ea/g, "ee"], [/ie/g, "ee"], [/ou/g, "u"], [/ay|ey/g, "ai"],
  [/y(?![aeiou])/g, "i"],
  [/ŋ/g, "ng"],
];

/** A username → romanised Eshai (word breaks at . _ - and digits kept as numerals). */
export function transliterate(username: string): string {
  const parts = username.toLowerCase().split(/[._-]+/).filter(Boolean);
  return parts.map((p) => {
    let s = p.replace(/[89]/g, (d) => (d === "8" ? "10" : "11")); // their numerals have no 8 or 9
    for (const [re, to] of RULES) s = s.replace(re, to);
    s = s.replace(/([^aeiou0-7])\1+/g, "$1").replace(/[^a-z0-7]/g, "");
    return s || "a";
  }).join(" ");
}
