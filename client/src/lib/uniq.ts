/** A keyed {#each} throws on a repeated id (each_key_duplicate — six hits in
 *  prod's error table). Nothing in the app's own writers repeats one, but a
 *  satellite's history answer is hostile input, so every fetched page is
 *  deduped before it reaches a list. */
export function uniqById<T extends { id: string | number }>(xs: T[]): T[] {
  // The id type is deliberately BOTH: messages key on a number, the wheel's
  // live feed on a string ("win:1234"). Pinning this to number is what kept
  // the feed — the list that was actually throwing in prod — from being able
  // to use it at all.
  const seen = new Set<string | number>();
  return xs.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}
