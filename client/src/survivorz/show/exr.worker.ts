// SOLACE SURVIVORZ — THE SHOW: a zone's lightmaps decoded OFF the main thread.
//
// A zone's two baked lightmaps are 2048² EXRs of tens of MB each; three's EXRLoader decompresses them
// on whatever thread it runs on, and on the page's own that was a hitch of a few hundred ms every
// time the camera walked into a new zone — on a live stream. The page fetches the bytes (through the
// asset store, ../assetcache.ts, so they're kept between watches) and hands them over; only the decode
// happens here, and only the finished half-float pixels cross back (transferred, not copied).
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";

interface Job { id: number; buf: ArrayBuffer }

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, buf } = e.data;
  try {
    const parsed = new EXRLoader().parse(buf) as { data: Uint16Array | Float32Array; width: number; height: number; type: number; format: number };
    (self as unknown as Worker).postMessage({ id, ok: true, data: parsed.data, width: parsed.width, height: parsed.height, type: parsed.type, format: parsed.format }, [parsed.data.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String((err as Error)?.message ?? err) });
  }
};
