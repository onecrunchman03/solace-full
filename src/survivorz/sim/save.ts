// SOLACE SURVIVORZ — SAVE AND RESUME (Josh, Oct 31 2026: "a deploy or crash resumes the same survivors,
// zombies and progress within seconds").
//
// The running world is a graph of plain objects — survivors and zombies that are also in `bodies`,
// knowledge with typed arrays, Sets and Maps, jobs, packs, the facility's doors — and a restored world
// must take EXACTLY the steps the original would have (the harness runs both side by side and compares
// every frame). So this is a faithful graph codec, not JSON.stringify:
//   · an object reached twice is written once and referenced (`bodies[3]` and `survivors[3]` stay ONE
//     object after a restore — the sim relies on it everywhere);
//   · Map / Set keep their insertion order, typed arrays their exact bytes, numbers their NaN / ±Infinity
//     and the sign of a zero (atan2 can tell -0 from 0), and an `undefined` member stays a member;
//   · a few module tables are referenced by name (a zombie's `k` is KINDS[kind], a survivor's `st` is
//     STATS[who]) so they come back as the tables themselves, not copies;
//   · the Rng comes back with its four words.
// Anything else — a function, a class instance nobody taught this about — THROWS with the path to it,
// so a field added to the world later can't be silently left out of the save.
import { KINDS, STATS } from "./tables";
import { Rng } from "./rng";
import { onCast } from "../cast";

const CONSTANTS = new Map<object, string>();
const BY_NAME = new Map<string, object>();
for (const [k, v] of Object.entries(KINDS)) { CONSTANTS.set(v, `KINDS.${k}`); BY_NAME.set(`KINDS.${k}`, v); }
// (again whenever the cast changes — the panel's list is live: a newcomer's stats are a table entry too, and
// an edited character's old entry still saves by name, coming back as the new one)
onCast(() => { for (const [k, v] of Object.entries(STATS)) { CONSTANTS.set(v, `STATS.${k}`); BY_NAME.set(`STATS.${k}`, v); } });

const TYPED: Record<string, new (b: ArrayBuffer) => ArrayBufferView> = {
  Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array,
};

type J = null | boolean | number | string | J[] | { [k: string]: J };

const isTyped = (x: unknown): x is ArrayBufferView & { constructor: { name: string } } => ArrayBuffer.isView(x) && !(x instanceof DataView);
const plain = (x: object): boolean => { const p = Object.getPrototypeOf(x); return p === Object.prototype || p === null; };

/** Encode a graph of plain data (see the header) to a JSON string. */
export function encodeGraph(root: unknown): string {
  // pass 1: count how many times each object is reached (an object reached once needs no id)
  const seen = new Map<object, number>();
  const count = (x: unknown): void => {
    if (x === null || typeof x !== "object") return;
    if (CONSTANTS.has(x)) return;
    const n = seen.get(x);
    seen.set(x, (n ?? 0) + 1);
    if (n !== undefined) return;
    if (Array.isArray(x)) { for (const v of x) count(v); return; }
    if (x instanceof Map) { for (const [k, v] of x) { count(k); count(v); } return; }
    if (x instanceof Set) { for (const v of x) count(v); return; }
    if (isTyped(x) || x instanceof Rng) return;
    for (const v of Object.values(x)) count(v);
  };
  count(root);
  const ids = new Map<object, number>();
  let next = 0;
  const enc = (x: unknown, path: string): J => {
    if (x === undefined) return { $u: 1 };
    if (x === null || typeof x === "boolean" || typeof x === "string") return x;
    if (typeof x === "number") {
      if (Number.isNaN(x)) return { $n: "NaN" };
      if (x === Infinity) return { $n: "Inf" };
      if (x === -Infinity) return { $n: "-Inf" };
      if (x === 0 && 1 / x < 0) return { $n: "-0" };
      return x;
    }
    if (typeof x !== "object") throw new Error(`save: can't keep a ${typeof x} at ${path}`);
    const c = CONSTANTS.get(x);
    if (c) return { $c: c };
    const id = ids.get(x);
    if (id !== undefined) return { $r: id };
    const tag = (o: { [k: string]: J }): { [k: string]: J } => {
      if ((seen.get(x) ?? 0) > 1) { const n = next++; ids.set(x, n); return { $id: n, ...o }; }
      return o;
    };
    if (Array.isArray(x)) {
      const multi = (seen.get(x) ?? 0) > 1;
      let n = -1;
      if (multi) { n = next++; ids.set(x, n); }
      const out: J[] = [];
      for (let i = 0; i < x.length; i++) out.push(i in x ? enc(x[i], `${path}[${i}]`) : { $h: 1 });
      return multi ? { $id: n, $a: out } : out;
    }
    if (x instanceof Map) {
      const o = tag({});
      const e: J[] = [];
      o.$m = e;
      let i = 0;
      for (const [k, v] of x) { e.push([enc(k, `${path}.key${i}`), enc(v, `${path}<${String(k)}>`)]); i++; }
      return o;
    }
    if (x instanceof Set) {
      const o = tag({});
      const e: J[] = [];
      o.$s = e;
      let i = 0;
      for (const v of x) e.push(enc(v, `${path}{${i++}}`));
      return o;
    }
    if (x instanceof Rng) return tag({ $rng: x.getState() });
    if (isTyped(x)) {
      const name = x.constructor.name;
      if (!TYPED[name]) throw new Error(`save: unknown typed array ${name} at ${path}`);
      if (x.byteOffset !== 0 || x.byteLength !== x.buffer.byteLength) throw new Error(`save: a typed array view at ${path}`);
      return tag({ $t: name, b: Buffer.from(x.buffer as ArrayBuffer).toString("base64") });
    }
    if (!plain(x)) throw new Error(`save: can't keep a ${(x as object).constructor?.name ?? "class"} instance at ${path}`);
    const o = tag({});
    for (const k of Object.keys(x)) {
      if (k.startsWith("$")) throw new Error(`save: key "${k}" at ${path} looks like the codec's own`);
      o[k] = enc((x as Record<string, unknown>)[k], `${path}.${k}`);
    }
    return o;
  };
  return JSON.stringify(enc(root, "world"));
}

/** Decode what encodeGraph wrote: the same graph, references and all. */
export function decodeGraph(text: string): unknown {
  const ids = new Map<number, unknown>();
  const dec = (j: J): unknown => {
    if (j === null || typeof j !== "object") return j;
    if (Array.isArray(j)) return decArr(j, []);
    const o = j as { [k: string]: J };
    if ("$u" in o) return undefined;
    if ("$n" in o) return o.$n === "NaN" ? NaN : o.$n === "Inf" ? Infinity : o.$n === "-Inf" ? -Infinity : -0;
    if ("$r" in o) { if (!ids.has(o.$r as number)) throw new Error(`save: dangling reference ${o.$r}`); return ids.get(o.$r as number); }
    if ("$c" in o) { const c = BY_NAME.get(o.$c as string); if (!c) throw new Error(`save: unknown table ${o.$c}`); return c; }
    const id = typeof o.$id === "number" ? o.$id : -1;
    const reg = <T>(v: T): T => { if (id >= 0) ids.set(id, v); return v; };
    if ("$a" in o) return decArr(o.$a as J[], reg([] as unknown[]));
    if ("$m" in o) { const m = reg(new Map()); for (const [k, v] of o.$m as J[][]) m.set(dec(k), dec(v)); return m; }
    if ("$s" in o) { const s = reg(new Set()); for (const v of o.$s as J[]) s.add(dec(v)); return s; }
    if ("$rng" in o) { const r = reg(new Rng(0)); r.setState(o.$rng as number[]); return r; }
    if ("$t" in o) {
      const C = TYPED[o.$t as string];
      if (!C) throw new Error(`save: unknown typed array ${o.$t}`);
      const b = Buffer.from(o.b as string, "base64");
      const ab = new ArrayBuffer(b.length);
      new Uint8Array(ab).set(b);
      return reg(new C(ab));
    }
    const out = reg({} as Record<string, unknown>);
    for (const k of Object.keys(o)) { if (k === "$id") continue; out[k] = dec(o[k]); }
    return out;
  };
  const decArr = (src: J[], out: unknown[]): unknown[] => {
    out.length = src.length;
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      if (v !== null && typeof v === "object" && !Array.isArray(v) && "$h" in v) continue;   // a hole stays a hole
      out[i] = dec(v);
    }
    return out;
  };
  return dec(JSON.parse(text) as J);
}
