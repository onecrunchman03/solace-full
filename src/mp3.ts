// HOW LONG IS THIS MP3 — read from the file's own frame headers.
//
// THE JUKEBOX advances its queue on this number, so it can't come from a
// client and it can't be a guess: get it wrong and the next record starts over
// the top of the one still playing. Both entry points (the admin upload and
// scripts/ingest-jukebox.mjs) call this one implementation — a second copy of
// a parser like this drifts.
//
// Xing/Info and VBRI frame counts are read where present (variable-bitrate
// rips, which is most of them); constant-bitrate arithmetic is the fallback.

const BITRATES: Record<number, Record<number, number[]>> = {
  // [1 = MPEG1 | 2 = MPEG2/2.5][layer 1..3], kbps, indexed by the header's 4 bits
  1: {
    1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  },
  2: {
    1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  },
};
const RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG1
  2: [22050, 24000, 16000], // MPEG2
  0: [11025, 12000, 8000], // MPEG2.5
};

/** Length of an ID3v2 tag at the head of the buffer, or 0 if there isn't one. */
function id3Size(buf: Buffer): number {
  if (buf.length < 10 || buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0;
  const size =
    ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  return 10 + size + (buf[5] & 0x10 ? 10 : 0); // + footer, if flagged
}

interface FrameHeader {
  bitrate: number;
  sampleRate: number;
  samples: number;
  frameLen: number;
  mono: boolean;
  group: 1 | 2;
}

function parseHeader(buf: Buffer, off: number): FrameHeader | null {
  if (off + 4 > buf.length) return null;
  if (buf[off] !== 0xff || (buf[off + 1] & 0xe0) !== 0xe0) return null;
  const verBits = (buf[off + 1] >> 3) & 0x03; // 0 = 2.5, 2 = 2, 3 = 1
  const layerBits = (buf[off + 1] >> 1) & 0x03; // 1 = III, 2 = II, 3 = I
  if (verBits === 1 || layerBits === 0) return null; // reserved values
  const layer = 4 - layerBits;
  const group: 1 | 2 = verBits === 3 ? 1 : 2;
  const brIdx = (buf[off + 2] >> 4) & 0x0f;
  const srIdx = (buf[off + 2] >> 2) & 0x03;
  if (brIdx === 0 || brIdx === 15 || srIdx === 3) return null;
  const bitrate = BITRATES[group][layer][brIdx] * 1000;
  const sampleRate = RATES[verBits][srIdx];
  const pad = (buf[off + 2] >> 1) & 1;
  const mono = ((buf[off + 3] >> 6) & 0x03) === 3;
  const samples = layer === 1 ? 384 : group === 1 ? 1152 : layer === 3 ? 576 : 1152;
  const frameLen =
    layer === 1
      ? Math.floor((12 * bitrate) / sampleRate + pad) * 4
      : Math.floor(((group === 1 ? 144 : layer === 3 ? 72 : 144) * bitrate) / sampleRate) + pad;
  if (!(frameLen > 4)) return null;
  return { bitrate, sampleRate, samples, frameLen, mono, group };
}

/** Duration in milliseconds, or 0 if the bytes aren't a readable MP3. */
export function mp3DurationMs(buf: Buffer): number {
  let off = id3Size(buf);
  let h: FrameHeader | null = null;
  const limit = Math.min(buf.length - 4, off + 200_000);
  for (; off < limit; off++) {
    h = parseHeader(buf, off);
    if (!h) continue;
    // Confirm against the NEXT frame, so a stray 0xFF inside embedded artwork
    // can't pass itself off as the start of the audio.
    if (parseHeader(buf, off + h.frameLen)) break;
    h = null;
  }
  if (!h) return 0;

  // Xing / Info — sits after the side-info block, whose size depends on
  // version and channel count.
  const xingOff = off + 4 + (h.group === 1 ? (h.mono ? 17 : 32) : h.mono ? 9 : 17);
  const tag = buf.subarray(xingOff, xingOff + 4).toString("latin1");
  if ((tag === "Xing" || tag === "Info") && xingOff + 12 <= buf.length) {
    const flags = buf.readUInt32BE(xingOff + 4);
    if (flags & 0x01) {
      const frames = buf.readUInt32BE(xingOff + 8);
      if (frames > 0) return Math.round((frames * h.samples * 1000) / h.sampleRate);
    }
  }
  // VBRI (Fraunhofer encoders) — always a fixed 32 bytes past the header.
  if (off + 54 <= buf.length && buf.subarray(off + 36, off + 40).toString("latin1") === "VBRI") {
    const frames = buf.readUInt32BE(off + 50);
    if (frames > 0) return Math.round((frames * h.samples * 1000) / h.sampleRate);
  }
  // Constant bitrate: however many audio bytes are left, minus an ID3v1 tail.
  const tail =
    buf.length >= 128 && buf.subarray(buf.length - 128, buf.length - 125).toString("latin1") === "TAG"
      ? 128
      : 0;
  return Math.round(((buf.length - off - tail) * 8000) / h.bitrate);
}

/** "Artist - Title.mp3" → its two halves. Only ever splits on a SPACED dash,
 *  so "blink-182 - I Miss You" is the band and the song, not "blink" and the
 *  rest. No spaced dash at all means the whole name is the title. */
export function splitTrackName(base: string): { artist: string; title: string } {
  const name = base.replace(/\.[^.]+$/, "").trim();
  for (const sep of [" - ", "- ", " -"]) {
    const i = name.indexOf(sep);
    if (i > 0) return { artist: name.slice(0, i).trim(), title: name.slice(i + sep.length).trim() };
  }
  return { artist: "", title: name };
}
