// THE JUMBOTRON — the REAL racetrack, on the wall above the bar.
//
// Josh, twice: "cast the same racing screen you see in the 2d version", then
// "the emoji racing jumobo tron is still not accectpable, i would like you to
// put the same screen someone would see in the 2d casino." The first answer
// shared the race MATHS and redrew the board on a canvas texture — which is
// still a drawing of the 2D screen, not the 2D screen. This is the screen:
// `DerbyCourse.svelte`, the same component the hub renders, mounted into a
// CSS3DObject and transformed onto the jumbotron's plane. Same markup, same
// stylesheet, same crowd, same dust, same clock (lib/derby-run.ts), same
// sounds — faded by how far across the hall you're standing.
//
// A DOM LAYER CANNOT HIDE BEHIND WebGL — so it doesn't try to. The layer sits
// UNDER the canvas, and the screen's own quad in the 3D scene writes
// `vec4(0.0)` with blending off: it punches a genuinely transparent hole
// through the rendered frame, exactly where the board is. Everything else in
// the hall then occludes it for free, by ordinary depth testing — the stage
// wheel standing in front of the screen simply paints over the hole, because
// it is nearer. (The first cut composited the layer ON TOP and hid it when
// rays to its corners were all blocked, which meant a wheel across the middle
// of the board didn't count — Josh: "it shows over everything now".)

import * as THREE from "three";
import { jumboWarp, type JumboWarp } from "./jumbo-warp";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { mount, unmount } from "svelte";
import DerbyCourse from "../components/DerbyCourse.svelte";
import { derby } from "../lib/derby.svelte";
import { runRace, serverTime } from "../lib/derby-run";
import { callClips, CALLER_ON } from "../lib/derby-call";
import { preloadSfx } from "../lib/sfx";
import { ensureDerbyAudio } from "../lib/derby-audio";

/** Board size in CSS px. 880 is the hub's own `.course` max-width, so the
 *  track renders at exactly the size it was designed at instead of being
 *  reflowed into a shape nobody has ever looked at. */
const BOARD_W = 880;
/** 2:1 — the screen mesh is 6.4 x 3.2m, and a board taller than its screen
 *  hangs off the top of the frame. The course itself is ~410px at this width,
 *  so it sits centred with the status line above it. */
const BOARD_H = 440;
/** The physical screen (world metres) — must match the jumbo mesh in world.ts. */
const SCREEN_W = 6.4;
/** How far away it can still be heard, in cells. Past this the race is silent;
 *  it fades to nothing over the last third. */
const EARSHOT = 15;
/** How often the board's runners move while a race is on screen. The track
 *  is a DOM layer — every update is a style recalc, layout and paint of the
 *  whole course under the canvas — and 30 a second is smooth for a screen on
 *  a wall across a room. */
const RACE_FRAME_MS = 33;

export interface Jumbotron {
  /** Called every frame with the live camera, after the WebGL draw. */
  render(camera: THREE.Camera, listenX: number, listenY: number, warp: JumboWarp): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

export function buildJumbotron(
  holder: HTMLElement,
  scene: THREE.Scene,
  /** World position + facing of the screen: the mesh's own transform. */
  at: THREE.Vector3,
): Jumbotron {
  const layer = new CSS3DRenderer();
  layer.setSize(holder.clientWidth || window.innerWidth, holder.clientHeight || window.innerHeight);
  const el = layer.domElement;
  el.style.position = "absolute";
  el.style.inset = "0";
  // BEHIND the canvas: the frame's punched hole is what lets it through, and
  // that is what makes furniture in front of the screen occlude it properly.
  // -1 rather than 0, and the canvas is left alone: a negative z-index paints
  // above the holder's own background and below its in-flow content, which is
  // the one slot in the stack that is under the canvas without being under the
  // room. (Raising the CANVAS instead buried every HUD element beneath it.)
  el.style.zIndex = "-1";
  el.style.pointerEvents = "none";
  holder.appendChild(el);

  const board = document.createElement("div");
  board.style.width = `${BOARD_W}px`;
  board.style.height = `${BOARD_H}px`;
  board.style.background = "#0c0f14";
  board.style.display = "flex";
  board.style.flexDirection = "column";
  board.style.justifyContent = "center";
  board.style.gap = "8px";
  board.style.padding = "10px 14px";
  board.style.boxSizing = "border-box";
  board.style.font = "700 20px system-ui, sans-serif";
  board.style.color = "#e8c33c";
  board.style.textAlign = "center";
  board.style.overflow = "hidden";

  const line = document.createElement("div");
  line.textContent = "EMOJI RACING";
  board.appendChild(line);
  const track = document.createElement("div");
  board.appendChild(track);

  // The racetrack itself — the hub's component, live.
  const props = $state<{
    st: (typeof derby)["state"];
    progress: number[];
    racing: boolean;
    showResult: boolean;
    boulderDown: boolean;
    lite: boolean;
  }>({ st: null, progress: [], racing: false, showResult: false, boulderDown: false, lite: true });
  const course = mount(DerbyCourse, { target: track, props });
  /** "3…" / "GO!" while the gates hold — the hub prints this in its status
   *  line, so the board does too. Not a course prop: the track itself has no
   *  countdown, in either place. */
  let countdownText = "";

  const obj = new CSS3DObject(board);
  obj.position.copy(at);
  // CSS3D works in pixels; scale the board onto the physical screen.
  obj.scale.setScalar(SCREEN_W / BOARD_W);
  const css = new THREE.Scene();
  css.add(obj);

  // The warp tracker's scratch + last written transform (the layer is a DOM
  // node; rewriting an identical transform string every frame is free work).
  const PROJ = new THREE.Vector3();
  let lastTransform = "";
  let lastLine = "";
  let layerW = holder.clientWidth || window.innerWidth;
  let layerH = holder.clientHeight || window.innerHeight;
  // The scale pivots about the viewport centre, where the fisheye and the
  // breathing zoom actually pivot.
  el.style.transformOrigin = "50% 50%";

  // ---- ONLY WHEN SOMEBODY CAN SEE IT (Oct 2026) -----------------------------
  // Josh: "ever since we included rollo in the casino the performance has
  // gotten noticeably worse … on my mac its basically un playable". Rollo
  // bets most races, so the board went from mostly idle to racing nearly all
  // the time — and the board is a DOM layer whose race (runners, crowd, dust)
  // costs a style/layout/paint every frame. Measured on a 4x-throttled CPU:
  // 59 fps with the board idle, 25-30 with races running back to back, even
  // with the board behind you. Out of view it is now not drawn at all
  // (display: none, no props, no CSS3D pass); in view it moves 30 times a
  // second. The race clock and its sound keep running either way.
  const frustum = new THREE.Frustum();
  const viewProj = new THREE.Matrix4();
  let shown = true;
  let lastFrameAt = 0;
  let pending: { progress: number[]; boulderDown: boolean } | null = null;
  const apply = (f: { progress: number[]; boulderDown: boolean }): void => {
    props.progress = f.progress;
    props.boulderDown = f.boulderDown;
  };

  // ---- the race, run exactly as the hub runs it ----------------------------
  /** The race this screen is running, as round:seed — a server restart resets
   *  the round number, so the round alone could skip a race (Derby v2). */
  let raceKey = "";
  let stop: (() => void) | null = null;
  let listen = { x: 12, y: 6 };
  /** Distance fade — a jumbotron is loud, but not from the far wall. */
  const volume = (): number => {
    const d = Math.hypot(listen.x - at.x / 2, listen.y - at.z / 2);
    return d >= EARSHOT ? 0 : Math.min(1, (EARSHOT - d) / (EARSHOT * 0.34));
  };

  // ---- THE HOLE -----------------------------------------------------------
  // The screen's quad, drawn into the 3D scene writing vec4(0.0) with blending
  // OFF: it stamps a transparent rectangle through the rendered frame wherever
  // the screen is actually visible. It still writes DEPTH, so it takes part in
  // ordinary occlusion — anything nearer (the stage wheel, a pillar, a body)
  // paints over the hole and hides the board behind it, per pixel, for free.
  const punch = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN_W, SCREEN_W / 2),
    new THREE.ShaderMaterial({
      vertexShader: "void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: "void main(){gl_FragColor=vec4(0.0);}",
      blending: THREE.NoBlending, // write the alpha through, don't mix with it
    }),
  );
  punch.position.copy(at);
  punch.renderOrder = -1; // before the room's transparent dressing
  scene.add(punch);

  const render: Jumbotron["render"] = (camera, lx, ly, warp) => {
    listen = { x: lx, y: ly };
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProj);
    const inView = frustum.intersectsObject(punch);
    if (inView !== shown) {
      shown = inView;
      el.style.display = inView ? "" : "none";
      if (inView && pending) apply(pending);
    }
    const dk = warp.drunk;
    // The board is DOM, so the drunk post-pass cannot reach it — without this
    // the one thing in a swimming room that stays razor sharp is the screen.
    // A blur is not the pass, but it is the same idea and it costs nothing.
    const blur = dk > 0.02 ? `blur(${(dk * 1.7).toFixed(2)}px)` : "";
    if (el.style.filter !== blur) el.style.filter = blur;
    // THE SCREEN STAYS ON ITS WALL. The passes have just moved the hole this
    // board shows through; move the board the same way or it reads as part of
    // the player's head rather than part of the room (Josh, Aug 2026). The
    // displacement is sampled at the board's OWN projected position, because
    // the bend is a field, not a constant — a screen at the edge of vision
    // swims differently from one dead ahead.
    const anyWarp =
      warp.drunk > 0.001 || warp.bend > 0.001 || warp.fear > 0.001 || warp.gas > 0.001 || warp.ego > 0.001;
    if (anyWarp || lastTransform !== "") {
      let tf = "";
      if (anyWarp) {
        PROJ.copy(at).project(camera);
        const ux = PROJ.x * 0.5 + 0.5;
        const uy = 0.5 - PROJ.y * 0.5; // NDC is y-up, uv here is y-down
        const { dx, dy, scale } = jumboWarp(warp, ux, uy);
        const w = layerW || 1;
        const h = layerH || 1;
        // −offset: sampling further along the frame shows content that has
        // moved the other way. Scale is radial about the viewport centre,
        // which is exactly where the fisheye and the breathing zoom pivot.
        const px = (-dx * w).toFixed(2);
        const py = (-dy * h).toFixed(2);
        tf = `translate(${px}px, ${py}px) scale(${scale.toFixed(4)})`;
      }
      if (tf !== lastTransform) {
        lastTransform = tf;
        el.style.transform = tf;
      }
    }
    const s = derby.state;

    // status line + which board is showing. CHANGE-GATED (Aug 2026 perf
    // review): setting textContent replaces the Text node even when the
    // string is identical, dirtying this composited DOM layer's layout every
    // frame — and this ran unconditionally at 60Hz.
    let lineText: string;
    if (!s || s.phase === "idle" || !s.racers.length) {
      lineText = "EMOJI RACING · TICKETS AT THE KIOSK";
    } else if (s.phase === "betting") {
      const left = s.endsAt ? Math.max(0, Math.ceil((s.endsAt - serverTime()) / 1000)) : 0;
      const pool = Object.values(s.pools ?? {}).reduce((a, b) => a + b, 0);
      lineText = `POST TIME IN ${left}s · POOL ${pool.toLocaleString()}`;
    } else if ((s.phase === "racing" || s.phase === "settled") && !derby.revealed) {
      lineText = countdownText || "THEY'RE OFF!";
    } else {
      const w = s.racers.find((r) => r.key === s.winner);
      lineText = w ? `🏆 ${w.name.toUpperCase()} TAKES IT` : "RACE RESULT";
    }
    if (lineText !== lastLine) {
      lastLine = lineText;
      line.textContent = lineText;
    }
    props.st = s ?? null;
    props.racing = !!s && (s.phase === "racing" || s.phase === "settled") && !derby.revealed;
    props.showResult = !!s && s.winner !== null && derby.revealed;

    // a new race: run it, with sound — the caller's lines are loaded the moment
    // the screen exists (below), because a clip still loading when its line
    // comes up is dropped, and a race is eleven seconds
    // A screen that arrives mid-race (or in the settled lull) joins the SAME
    // race where it stands, on the shared clock.
    const key = s && s.winner && s.seed ? `${s.round}:${s.seed}` : "";
    if (s && (s.phase === "racing" || s.phase === "settled") && key && key !== raceKey) {
      raceKey = key;
      stop?.();
      props.boulderDown = false;
      if (volume() > 0) ensureDerbyAudio();
      stop = runRace(s, {
        volume,
        stillLive: () => derby.state?.phase === "racing" || derby.state?.phase === "settled",
        onFrame: (f) => {
          countdownText = f.countdown === null ? "" : f.countdown > 0 ? `${f.countdown}…` : "GO!";
          pending = { progress: f.progress, boulderDown: f.boulderDown };
          const t = performance.now();
          // the boulder's fall is an event, not a position: never sit on it
          if (shown && (t - lastFrameAt >= RACE_FRAME_MS || f.boulderDown !== props.boulderDown)) {
            lastFrameAt = t;
            apply(pending);
          }
        },
      });
    }
    // Only when there's something to clear: a fresh [] every idle frame was a
    // new proxy each time, re-rendering the whole course at 60Hz (v2 review).
    if (s && s.phase === "idle" && props.progress.length) props.progress = [];
    if (s && s.phase === "idle") pending = null;

    if (shown) layer.render(css, camera);
  };

  // THE CALLER, warm before the first race (a line not yet decoded is skipped)
  if (CALLER_ON) preloadSfx(callClips());

  return {
    render,
    resize: (w, h) => {
      layerW = w;
      layerH = h;
      layer.setSize(w, h);
    },
    dispose: () => {
      stop?.();
      scene.remove(punch);
      punch.geometry.dispose();
      (punch.material as THREE.Material).dispose();
      void unmount(course);
      el.remove();
    },
  };
}
