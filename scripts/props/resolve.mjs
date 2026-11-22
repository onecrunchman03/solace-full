// Resolves a curated piece ref ("source:slug") to an extracted inventory key.
// A ref matches a key that is `source__slug` or `source__<file>__slug`.
export function makeResolver(inv) {
  const bySrc = new Map();
  for (const e of inv) {
    if (!bySrc.has(e.source)) bySrc.set(e.source, []);
    bySrc.get(e.source).push(e);
  }
  return (ref) => {
    const [src, slug] = ref.split(":");
    const list = bySrc.get(src) ?? [];
    const hits = list.filter((e) => e.key === `${src}__${slug}` || e.key.endsWith(`__${slug}`));
    return hits.length === 1 ? hits[0] : hits.length > 1 ? hits.find((e) => e.key === `${src}__${slug}`) ?? null : null;
  };
}
