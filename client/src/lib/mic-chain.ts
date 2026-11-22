// The mic processing chain, wrapped as ONE LiveKit TrackProcessor (a track
// takes a single processor, so everything composes here):
//
//   mic → [RNNoise worklet, if neural NS is on] → gate+gain worklet → out
//
// - GAIN: input volume, 0.5–3× — "make me louder" without touching Windows.
// - GATE: mic sensitivity — below the RMS threshold the mic fades to silence
//   (fast attack, slow release so word tails aren't clipped). 0 = always open.
// Both parameters update LIVE via AudioParams — no track restart needed.
//
// Replaces the old rnnoise.ts single-purpose processor (same wasm, same
// worklet, now one node in this chain).

import type { Track } from "livekit-client";
import type { AudioProcessorOptions, TrackProcessor } from "livekit-client";
import { loadRnnoise, RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import rnnoiseWorkletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";

let wasmPromise: Promise<ArrayBuffer> | null = null;
const rnnoiseLoaded = new WeakSet<AudioContext>();
const gateLoaded = new WeakSet<AudioContext>();

// The gate worklet, inlined (no asset file). Tuned against the "first word
// sounds muffled" complaint: speech onset OPENS THE GATE INSTANTLY (no attack
// ramp to chew the first syllable), a PEAK trigger catches plosives a block
// before RMS does, and a ~300ms HOLD keeps it fully open across inter-word
// gaps before the gentle release fade begins.
const GATE_WORKLET = `
class SolaceGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "threshold", defaultValue: 0, minValue: 0, maxValue: 0.5 },
      { name: "gain", defaultValue: 1, minValue: 0, maxValue: 4 },
    ];
  }
  constructor() { super(); this.open = 1; this.hold = 0; }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!inp.length || !out.length) return true;
    const th = params.threshold[0], g = params.gain[0];
    const ch0 = inp[0];
    let sum = 0, peak = 0;
    for (let i = 0; i < ch0.length; i++) {
      const v = ch0[i];
      sum += v * v;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
    const rms = Math.sqrt(sum / ch0.length);
    const voiced = th <= 0 || rms > th || peak > th * 1.8;
    if (voiced) {
      this.open = 1;      // instant attack — never dull the first word
      this.hold = 110;    // ~300ms of 128-sample blocks at 48kHz
    } else if (this.hold > 0) {
      this.hold--;        // linger fully open between words
    } else {
      this.open += (0 - this.open) * 0.012; // ~250ms tail fade
    }
    const k = this.open * g;
    for (let c = 0; c < out.length; c++) {
      const ic = inp[c] ?? ch0, oc = out[c];
      for (let i = 0; i < oc.length; i++) oc[i] = ic[i] * k;
    }
    return true;
  }
}
registerProcessor("solace-gate", SolaceGate);
`;
let gateUrl: string | null = null;

export class MicChainProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = "micchain";
  processedTrack?: MediaStreamTrack;

  private ctx?: AudioContext;
  private ownsCtx = false;
  private src?: MediaStreamAudioSourceNode;
  private rnnoise?: RnnoiseWorkletNode;
  private gate?: AudioWorkletNode;
  private dst?: MediaStreamAudioDestinationNode;

  constructor(
    private opts: { rnnoise: boolean; gain: number; threshold: number },
  ) {}

  /** Live parameter updates — no restart, no glitch. */
  setGain(v: number): void {
    this.opts.gain = v;
    this.gate?.parameters.get("gain")?.setValueAtTime(v, this.ctx?.currentTime ?? 0);
  }
  setThreshold(v: number): void {
    this.opts.threshold = v;
    this.gate?.parameters.get("threshold")?.setValueAtTime(v, this.ctx?.currentTime ?? 0);
  }

  async init(o: AudioProcessorOptions): Promise<void> {
    await this.setup(o);
  }
  async restart(o: AudioProcessorOptions): Promise<void> {
    await this.teardown();
    await this.setup(o);
  }
  async destroy(): Promise<void> {
    await this.teardown();
  }

  private async setup(o: AudioProcessorOptions): Promise<void> {
    // RNNoise is trained at 48kHz; the gate doesn't care. Share LiveKit's
    // context when it matches, else run our own.
    let ctx = o.audioContext;
    if (!ctx || ctx.sampleRate !== 48000) {
      ctx = new AudioContext({ sampleRate: 48000 });
      this.ownsCtx = true;
    }
    if (!gateUrl) {
      gateUrl = URL.createObjectURL(new Blob([GATE_WORKLET], { type: "application/javascript" }));
    }
    if (!gateLoaded.has(ctx)) {
      await ctx.audioWorklet.addModule(gateUrl);
      gateLoaded.add(ctx);
    }
    if (this.opts.rnnoise) {
      wasmPromise ??= loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl });
      if (!rnnoiseLoaded.has(ctx)) {
        await ctx.audioWorklet.addModule(rnnoiseWorkletUrl);
        rnnoiseLoaded.add(ctx);
      }
    }
    if (ctx.state === "suspended") await ctx.resume();

    this.src = ctx.createMediaStreamSource(new MediaStream([o.track]));
    this.gate = new AudioWorkletNode(ctx, "solace-gate", {
      parameterData: { threshold: this.opts.threshold, gain: this.opts.gain },
    });
    this.dst = ctx.createMediaStreamDestination();
    if (this.opts.rnnoise) {
      const wasmBinary = await wasmPromise!;
      // slice(): the worklet transfers its buffer — keep the cached original.
      this.rnnoise = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: wasmBinary.slice(0) });
      this.src.connect(this.rnnoise);
      this.rnnoise.connect(this.gate);
    } else {
      this.src.connect(this.gate);
    }
    this.gate.connect(this.dst);
    this.ctx = ctx;
    this.processedTrack = this.dst.stream.getAudioTracks()[0];
  }

  private async teardown(): Promise<void> {
    try {
      this.src?.disconnect();
      this.rnnoise?.disconnect();
      this.rnnoise?.destroy();
      this.gate?.disconnect();
    } catch {
      /* already down */
    }
    if (this.ownsCtx && this.ctx) {
      try {
        await this.ctx.close();
      } catch {}
    }
    this.src = this.rnnoise = undefined;
    this.gate = undefined;
    this.dst = undefined;
    this.ctx = undefined;
    this.ownsCtx = false;
    this.processedTrack = undefined;
  }
}
