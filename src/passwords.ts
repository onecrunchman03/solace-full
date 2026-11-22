// Password strength — beyond the complexity rules, reject passwords that are
// weak in ways complexity can't see: the most-common breach-list passwords,
// obvious keyboard/number runs, a single repeated character, and anything
// built around the account's own username. NIST 800-63B leans on length +
// breach-list screening over ever-more-baroque complexity, so this is the
// modern belt to go with the existing suspenders.

// A curated slice of the most-common leaked passwords (rockyou / HIBP top
// lists), stored as the "core" word so trivial decorations don't dodge it.
// Not exhaustive — a targeted attacker isn't the threat here; a friend
// reaching for "password" or "qwerty" is.
const COMMON = new Set([
  "password", "passw0rd", "letmein", "welcome", "admin", "administrator",
  "qwerty", "qwertyuiop", "asdfgh", "asdfghjkl", "zxcvbn", "zxcvbnm",
  "iloveyou", "monkey", "dragon", "sunshine", "princess", "football",
  "baseball", "basketball", "superman", "batman", "trustno1", "master",
  "shadow", "michael", "jennifer", "hunter", "harley", "ranger", "buster",
  "soccer", "hockey", "killer", "george", "sexy", "andrew", "charlie",
  "robert", "thomas", "hannah", "amanda", "jessica", "ashley", "michelle",
  "daniel", "starwars", "computer", "internet", "samsung", "google",
  "whatever", "qazwsx", "abc", "abcd", "abcde", "abcdef", "abcdefg",
  "letmein", "changeme", "secret", "summer", "winter", "spring", "autumn",
  "money", "love", "hello", "freedom", "ninja", "azerty", "solace",
  "flower", "cookie", "pokemon", "minecraft", "fortnite", "chocolate",
  "purple", "orange", "yellow", "silver", "golden", "diamond", "test",
  "testing", "guest", "root", "toor", "pass", "login", "user", "demo",
]);

// Digits + symbols people tack on the end. Stripping them exposes the core.
const TRIM_TAIL = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~ ]+$/;
// Leet substitutions, so "p4ssw0rd" normalizes to "password".
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

function deleet(s: string): string {
  return s.replace(/[013457@$]/g, (c) => LEET[c] ?? c);
}

/** A near-uniform keyboard walk or number run (qwerty, 123456, abcdef…). */
function isSequential(s: string): boolean {
  const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "abcdefghijklmnopqrstuvwxyz", "0123456789"];
  const low = s.toLowerCase();
  if (low.length < 6) return false;
  for (const row of rows) {
    const rev = [...row].reverse().join("");
    for (let i = 0; i + low.length <= row.length; i++) {
      if (row.slice(i, i + low.length) === low || rev.slice(i, i + low.length) === low) return true;
    }
  }
  return false;
}

/**
 * Returns a reason the password is weak, or null if it passes the extra
 * screening. Runs AFTER the complexity check (see validatePassword), so it
 * assumes the raw string already met length + character-class rules.
 */
/**
 * Returns a reason the secret is weak, or null. Screens for breach-list
 * membership, keyboard runs, near-single-character, and the username — the
 * ways a string can be low-entropy that a length/complexity rule can't see.
 * Used for BOTH passwords and the recovery secret (which is a second password
 * for takeover purposes, so it earns the same screening); `label` names the
 * field in the messages.
 */
export function weakPasswordReason(secret: string, username: string, label = "Password"): string | null {
  const low = secret.toLowerCase();

  // Built around the username → trivially guessable by anyone who knows you.
  const u = username.toLowerCase();
  if (u.length >= 3 && low.includes(u)) return `${label} can't contain your username`;

  // A single repeated character (aaaaaaaaaaaa, 111111111111!) — passes
  // complexity if decorated, but has almost no entropy. A real passphrase has
  // plenty of distinct letters, so this doesn't catch legitimate phrases.
  const uniques = new Set(low.replace(/[^a-z0-9]/g, "")).size;
  if (uniques <= 3) return `${label} is too repetitive — mix it up`;

  // The "core" is the string with its trailing decoration (digits/symbols
  // people tack on) stripped. Trim BEFORE de-leeting, or de-leet would turn the
  // trailing "1234" into letters the trim can no longer remove.
  const trimmed = low.replace(TRIM_TAIL, "");
  if (isSequential(low) || isSequential(trimmed)) {
    return "Avoid keyboard runs like qwerty or 123456";
  }

  // Screen the raw, the trimmed core, and their de-leeted forms against the
  // breach list (so "P4ssw0rd!", "Password1234!", "password" all get caught).
  const variants = [low, trimmed, deleet(low), deleet(trimmed)];
  if (variants.some((v) => COMMON.has(v))) {
    return `That ${label.toLowerCase()} is on every breach list — pick something less common`;
  }
  return null;
}
