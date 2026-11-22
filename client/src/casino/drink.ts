// THE BAR — bottles, drinking, and being drunk on the casino floor.
//
// Josh, Aug 2026: buy alcohol from Sterling, hold it, left-click to drink, get
// progressively drunker (double vision, wobble), have other people's voices
// smear, and pass out on the carpet at the top of the meter.
//
// WHERE THE MONEY IS: buying a drink burns silver through Sterling's counter
// (`POST /api/shop/drink`, one guarded transaction like every other counter).
// The BOTTLE after that is client state on purpose — it is worth nothing to
// anyone, can't be traded, and its only effect is on your own eyes and ears.
// Duplicating one would buy you a headache, so it gets no server table; the
// cost of that choice is honest and small: log out mid-bottle and you left it
// at the bar.

/** What Sterling pours. `kick` is how much of the meter one bottle fills. */
export interface Drink {
  id: string;
  name: string;
  /** The prop in props.glb this bottle is modelled on. */
  prop: string;
  price: number;
  kick: number;
  blurb: string;
}

export const DRINKS: Drink[] = [
  { id: "beer", name: "House Lager", prop: "beer01", price: 20, kick: 16, blurb: "cold, cheap, honest" },
  { id: "wine", name: "Table Red", prop: "wine01", price: 40, kick: 27, blurb: "the barman won't name the vintage" },
  { id: "whisky", name: "Well Whisky", prop: "whisky", price: 60, kick: 41, blurb: "goes down like a dropped chair" },
  { id: "champagne", name: "House Champagne", prop: "champagne", price: 75, kick: 34, blurb: "for a night that went well" },
];

export const drinkById = (id: string): Drink | undefined => DRINKS.find((d) => d.id === id);

/** Meter maximum. At MAX you go down. */
export const DRUNK_MAX = 100;
/** Where it starts to SHOW — above this the body swaps to the drunk walk and
 *  the drunk idle, and the HUD stops calling you merry. One number so the
 *  label, the wire flag and the animation can never disagree. */
export const DRUNK_SHOW = 45;
/** Sober-up rate while upright, meter points per second. ~1.7 min from full
 *  (Josh, Aug 2026: "make the sobering a little faster" — 0.45 left you
 *  swimming for nearly four minutes off one round). Long enough that a big
 *  night means something, short enough that nobody is stuck being useless. */
const SOBER_RATE = 0.95;
/** …and after you've been peeled off the floor. Josh: "regardless of how drunk
 *  they are the meter will tick down at a decent rate so players don't stay
 *  drunk for super long periods." */
const HANGOVER_RATE = 3.4;
/** How long you're out. */
export const BLACKOUT_MS = 60_000;
/** How long the hangover's fast sober-up lasts after you come round. */
const HANGOVER_MS = 45_000;

export interface DrunkState {
  /** 0..DRUNK_MAX. */
  level: number;
  /** Out cold until this timestamp (0 = upright). */
  outUntil: number;
  /** Sobering fast until this timestamp — the post-blackout grace. */
  hangoverUntil: number;
}

export const freshDrunk = (): DrunkState => ({ level: 0, outUntil: 0, hangoverUntil: 0 });

/** Advance the meter. Returns true on the frame you PASS OUT, so the caller can
 *  throw the ragdoll and black the screen exactly once. */
export function tickDrunk(d: DrunkState, dt: number, now: number): boolean {
  if (d.outUntil > now) {
    // Out cold: the body is metabolising at the hangover rate already, which
    // is why you wake up drunk but not as drunk.
    d.level = Math.max(0, d.level - HANGOVER_RATE * dt);
    return false;
  }
  if (d.outUntil && d.outUntil <= now) {
    // just came round
    d.outUntil = 0;
    d.hangoverUntil = now + HANGOVER_MS;
  }
  const rate = d.hangoverUntil > now ? HANGOVER_RATE : SOBER_RATE;
  d.level = Math.max(0, d.level - rate * dt);
  return false;
}

/** Take a pull. Returns true if this drink put you on the floor. */
export function applyDrink(d: DrunkState, kick: number, now: number): boolean {
  d.level = Math.min(DRUNK_MAX, d.level + kick);
  if (d.level >= DRUNK_MAX && !d.outUntil) {
    d.outUntil = now + BLACKOUT_MS;
    return true;
  }
  return false;
}

/** 0..1 — how far gone, for the visuals. */
export const drunkK = (d: DrunkState): number => Math.min(1, d.level / DRUNK_MAX);

/**
 * The double-vision pass. The scene renders into a target, then a fullscreen
 * quad samples it TWICE with a slowly drifting offset and mixes — which is
 * what "seeing two of everything" actually is, rather than a blur pretending
 * to be one. Sober it never runs at all: the caller renders straight to the
 * canvas, so nobody pays for a post pass they can't see.
 */
export const DRUNK_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const DRUNK_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform float uK;      // 0..1 drunkenness
  uniform float uTime;   // seconds
  uniform float uDark;   // 0..1 blackout
  // 1 = this is the LAST pass, so it owes the sRGB encode. Slorp (Aug 2026)
  // can run a second pass after this one, and two encodes is a washed-out
  // room — whoever writes the canvas does it, exactly once.
  uniform float uEncode;
  void main() {
    // The ghost image drifts on two slow, unequal sines — a fixed offset reads
    // as a printing error, a moving one reads as eyes that won't converge.
    float amp = 0.016 * uK;
    vec2 off = vec2(sin(uTime * 0.7) * amp, cos(uTime * 0.53) * amp * 0.6);
    // …and the whole frame swims a little.
    vec2 sway = vec2(sin(uTime * 0.31) * 0.004 * uK, cos(uTime * 0.27) * 0.004 * uK);
    vec2 uv = vUv + sway;
    vec4 a = texture2D(tDiffuse, uv);
    // THE JUMBOTRON'S HOLE. The screen above the bar is real DOM behind the
    // canvas, showing through a transparent rectangle the hall punches in the
    // frame. This pass would fill that hole back in with ghost light, so where
    // the frame is transparent it stays exactly transparent — zero rgb too,
    // since the canvas composites premultiplied and colour with no alpha would
    // glow over the board.
    if (a.a < 0.01) { gl_FragColor = vec4(0.0); return; }
    vec4 b = texture2D(tDiffuse, uv + off);
    vec4 c = texture2D(tDiffuse, uv - off * 0.75);
    // ADDITIVE, never an average: the sober image keeps all of its light and
    // the ghosts are laid on top. The second one only shows up late.
    vec4 col = a;
    col.rgb += b.rgb * (0.60 * uK);
    col.rgb += c.rgb * max(0.0, uK - 0.45) * 0.9;
    // DRUNK DOES NOT GO DARK (Josh, Aug 2026). The first cut pulled a dimming
    // tunnel in from the edges, which just made the room hard to see; drink
    // makes lights BLOOM, not fade. So the edges lift and warm instead, and
    // the only thing that darkens is uDark — being unconscious.
    float r = distance(vUv, vec2(0.5));
    col.rgb += uK * 0.12 * smoothstep(0.30, 0.95, r) * col.rgb;
    col.rgb = mix(col.rgb, col.rgb * vec3(1.10, 1.02, 0.92) + uK * 0.03, uK * 0.75);
    // …and a frank exposure lift, so a drunk room is never dimmer than a
    // sober one (Josh, twice: "the room is still too dark after drinking").
    col.rgb *= 1.0 + 0.18 * uK;
    col.rgb *= 1.0 - uDark;
    // THE ENCODE. A ShaderMaterial writes gl_FragColor straight to the
    // framebuffer — three only injects the colour-space conversion into its
    // OWN materials — so the pass must apply the sRGB transfer itself. Skip it
    // and every mid-tone lands at roughly a fifth of its brightness, which is
    // the "room is too dark after drinking" bug.
    vec3 low = col.rgb * 12.92;
    vec3 high = 1.055 * pow(max(col.rgb, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    vec3 enc = mix(low, high, step(vec3(0.0031308), col.rgb));
    col.rgb = mix(col.rgb, enc, uEncode);
    gl_FragColor = col;
  }
`;
