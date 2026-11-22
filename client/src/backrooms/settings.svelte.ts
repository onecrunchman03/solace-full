// THE BACKROOMS' OWN SETTINGS — deliberately separate from Solace's prefs
// (Josh's rule: "no bleed between the two"). Nothing here PATCHes /api/me;
// it all lives in localStorage under one key, per machine, like every other
// device-shaped setting. That means a hazmat run keeps its own mic, its own
// volumes and its own keybinds no matter what the chat app is set to — and
// they reload on the next session.
//
// Device ids are per-machine by nature; volumes and keybinds are too (a
// second PC gets its own comfortable setup). If Josh ever wants these to
// follow the account, the shape below is what would move into prefs.voice.

const KEY = "solace_br_settings";

/** Every rebindable player action (ESC/pause is fixed — it's the escape
 *  hatch out of pointer lock and must never be bound away). */
export const BR_ACTIONS = [
  { id: "forward", label: "Walk forward", def: "KeyW" },
  { id: "back", label: "Walk back", def: "KeyS" },
  { id: "left", label: "Strafe left", def: "KeyA" },
  { id: "right", label: "Strafe right", def: "KeyD" },
  { id: "sprint", label: "Sprint (hold)", def: "ShiftLeft" },
  { id: "jump", label: "Jump", def: "Space" },
  { id: "crouch", label: "Crouch (hold)", def: "KeyC" },
  { id: "interact", label: "Interact / pick up", def: "KeyE" },
  { id: "drop", label: "Drop held item", def: "KeyG" },
  { id: "emote", label: "Emote wheel (hold)", def: "KeyB" },
  { id: "map", label: "Field map", def: "KeyM" },
  { id: "mic", label: "Mute / unmute mic", def: "KeyN" },
  { id: "talk", label: "Walkie: talk (hold)", def: "KeyV" },
  { id: "chanDown", label: "Walkie: channel down", def: "Comma" },
  { id: "chanUp", label: "Walkie: channel up", def: "Period" },
] as const;

export type BrAction = (typeof BR_ACTIONS)[number]["id"];

/** Graphics quality tiers — what each one buys is defined in BackroomsGame's
 *  GFX table (bloom, the atmosphere filter, flashlight shadow resolution,
 *  MSAA). "high" is today's look plus real anti-aliasing. */
export const GFX_PRESETS = ["low", "medium", "high", "ultra"] as const;
export type GfxPreset = (typeof GFX_PRESETS)[number];

export interface BrSettings {
  /** Empty string = the browser/OS default device. */
  inputDevice: string;
  outputDevice: string;
  /** Mic input gain, 0.5–3× (the main app's mic-chain range). */
  micGain: number;
  /** Gate threshold — 0 keeps the mic always open. */
  micSensitivity: number;
  /** Neural noise suppression (RNNoise), off by default: the yellow is
   *  quiet, and a run is long. */
  neuralNS: boolean;
  /** World sounds (bed, footsteps, gear, the entity), 0–1.5. */
  outputVolume: number;
  /** Other players' voices, 0–1.5. */
  voiceVolume: number;
  /** Graphics quality preset (see GFX in BackroomsGame). */
  gfxPreset: GfxPreset;
  /** Internal render resolution as a fraction of native. 0 = AUTO — a
   *  governor in the frame loop eases it down/up (0.5–1.0) to hold 60fps.
   *  Manual values run 0.5 (performance) to 2.0 (supersampling). */
  renderScale: number;
  /** Look speed, 0.2–3×. 1 is the pace the game shipped with. */
  mouseSensitivity: number;
  /** Ask the browser for RAW mouse deltas (Chromium's `unadjustedMovement`),
   *  bypassing the OS pointer-acceleration curve. On by default: acceleration
   *  is what makes a fast flick over-rotate. Off for anyone who actually
   *  wants their desktop curve. */
  rawMouse: boolean;
  /** Invert the vertical axis. */
  invertY: boolean;
  /** Blood on deaths (Aug 2026). The ragdoll itself always plays — this
   *  gates only the red: burst, wall smears, the pool under a body. */
  gore: boolean;
  keys: Record<BrAction, string>;
}

function defaults(): BrSettings {
  const keys = {} as Record<BrAction, string>;
  for (const a of BR_ACTIONS) keys[a.id] = a.def;
  return {
    inputDevice: "",
    outputDevice: "",
    micGain: 1,
    micSensitivity: 0,
    neuralNS: false,
    outputVolume: 1,
    voiceVolume: 1,
    gfxPreset: "high",
    renderScale: 0, // Auto
    mouseSensitivity: 1,
    rawMouse: true,
    invertY: false,
    gore: true,
    keys,
  };
}

function load(): BrSettings {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<BrSettings>;
    const num = (v: unknown, lo: number, hi: number, fb: number): number =>
      typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fb;
    // Merge field by field: a stale/garbage key can never break a boot, and
    // a NEW action added to BR_ACTIONS inherits its default automatically.
    const keys = { ...base.keys };
    if (saved.keys && typeof saved.keys === "object") {
      for (const a of BR_ACTIONS) {
        const k = (saved.keys as Record<string, unknown>)[a.id];
        if (typeof k === "string" && k) keys[a.id] = k;
      }
    }
    return {
      inputDevice: typeof saved.inputDevice === "string" ? saved.inputDevice : base.inputDevice,
      outputDevice: typeof saved.outputDevice === "string" ? saved.outputDevice : base.outputDevice,
      micGain: num(saved.micGain, 0.5, 3, base.micGain),
      micSensitivity: num(saved.micSensitivity, 0, 0.2, base.micSensitivity),
      neuralNS: typeof saved.neuralNS === "boolean" ? saved.neuralNS : base.neuralNS,
      outputVolume: num(saved.outputVolume, 0, 1.5, base.outputVolume),
      voiceVolume: num(saved.voiceVolume, 0, 1.5, base.voiceVolume),
      gfxPreset: GFX_PRESETS.includes(saved.gfxPreset as GfxPreset) ? (saved.gfxPreset as GfxPreset) : base.gfxPreset,
      // 0 means Auto; anything else clamps into the manual 0.5–2 range.
      renderScale: saved.renderScale === 0 ? 0 : num(saved.renderScale, 0.5, 2, base.renderScale),
      mouseSensitivity: num(saved.mouseSensitivity, 0.2, 3, base.mouseSensitivity),
      rawMouse: typeof saved.rawMouse === "boolean" ? saved.rawMouse : base.rawMouse,
      invertY: typeof saved.invertY === "boolean" ? saved.invertY : base.invertY,
      gore: typeof saved.gore === "boolean" ? saved.gore : base.gore,
      keys,
    };
  } catch {
    return base;
  }
}

export const brSettings = $state<BrSettings>(load());

export function saveBrSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(brSettings));
  } catch {
    /* private mode / full quota — the session still works, it just forgets */
  }
}

export function resetBrKeys(): void {
  for (const a of BR_ACTIONS) brSettings.keys[a.id] = a.def;
  saveBrSettings();
}

/** Rebind an action, clearing whatever else held that key (two actions on
 *  one key means one of them silently never fires). */
export function bindBrKey(action: BrAction, code: string): void {
  for (const a of BR_ACTIONS) {
    if (a.id !== action && brSettings.keys[a.id] === code) brSettings.keys[a.id] = "";
  }
  brSettings.keys[action] = code;
  saveBrSettings();
}

/** Human label for a KeyboardEvent.code (the capture UI + the pause list). */
export function keyLabel(code: string): string {
  if (!code) return "—";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  if (code.startsWith("Arrow")) return `${code.slice(5)} arrow`;
  const named: Record<string, string> = {
    Space: "Space",
    ShiftLeft: "L Shift",
    ShiftRight: "R Shift",
    ControlLeft: "L Ctrl",
    ControlRight: "R Ctrl",
    AltLeft: "L Alt",
    AltRight: "R Alt",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Semicolon: ";",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    Tab: "Tab",
    CapsLock: "Caps",
    Enter: "Enter",
    Backspace: "Backspace",
  };
  return named[code] ?? code;
}
