// SOLACE SURVIVORZ — THE SHOW: every door's leaf, registered with the effects.
//
// The baked zones are cut open where the map puts each door (doorPlacement) but carry no leaves:
// a door is drawn here. Where a zone stands a real door prop on the spot (the lab doors, the
// bulkhead, the vault) its own leaf is used; everywhere else this draft hangs a plain slab of the
// door's material in the opening, on a hinge at one jamb. Each is handed to ShowFx
// (fx/show.ts registerDoor), which shakes it, bursts it, and nails the server's planks across it;
// the open/shut swing is this file's.
//
// THE LOCK PANEL (map polish, Oct 29 2026): every door the sim can lock (kind door / sealed) carries a
// small access panel on the wall beside its latch, on both faces, whose lens is lit RED while the door is
// locked and a dim green while it isn't — the one state a viewer couldn't read off a shut door. A door set
// in a glazed front (the glass offices, the conference room, the chief's office) has no wall there, so its
// panel is an escutcheon on the leaf itself. The lens is an emissive part of the panel (the fixture law:
// no light of its own); locked and unlocked are two materials of one program, swapped, never recompiled.
// Measured against the baked shells: on every lockable door's latch side both faces are flat painted or
// panelled wall 0.096–0.123 m from the door's centre plane with nothing standing in front of the panel.
import * as THREE from "three";
import type { ShowFx, DoorNow } from "../fx";
import { doorMaterial, type Door } from "../../../../src/survivorz/facility";
import type { DoorWire } from "../../../../src/survivorz/sim/wire";
import { DOORS, LEAF_KINDS, MAP_ID, placeOf, roomAt, roomInfo, walkableAt, type SiteZone } from "./site";
import { FRAME_W, HOUSE_MATS, archHead, disposeHouseDoors, houseLeaf, houseWarm, isPair, type DoorStyle } from "./houseDoors";
import type { FacilityZones } from "./zones";

interface DoorRec {
  door: Door;
  centre: THREE.Vector3;
  normal: THREE.Vector3;
  size: [number, number];
  zones: SiteZone[];
  /** the hinge the leaf turns on (a slab of ours, or a prop's own leaf node) */
  pivot: THREE.Object3D | null;
  /** our own slab and its frame (jambs, head), built once and kept: shown when no zone's prop leaf
   *  stands in this doorway, hidden while one does or while no zone of the door is in */
  slab: { group: THREE.Group; pivot: THREE.Object3D; leaf: THREE.Object3D; rest: number; pivots?: { o: THREE.Object3D; open: number }[] } | null;
  leaf: THREE.Object3D | null;
  /** a house's outside door: the bar across its inside, shown while it is locked */
  bolt?: THREE.Object3D;
  ours: boolean;
  open: number;
  want: number;
  /** the angle the leaf rests at shut (a prop's leaf node has its own) */
  rest: number;
  /** which way it swings: into room b (the normal's side) */
  sign: number;
  state: DoorWire;
  registered: boolean;
  /** the lock panel's lenses (both faces), null for a door with no lock */
  lenses: THREE.Mesh[] | null;
  /** the wall panels per face, shown while the room on that face is in (a leaf escutcheon rides the slab) */
  panels: { group: THREE.Group; zone: SiteZone | undefined }[];
}

const MATS = {
  wood: new THREE.MeshStandardMaterial({ color: 0x6b6f66, roughness: 0.8, metalness: 0 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x7c848a, roughness: 0.45, metalness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xbfd8e0, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false, forceSinglePass: true }),
};
/** a house's doors (Glenridge Hall): dark oak, in the house's own frames */
const OAK = new THREE.MeshStandardMaterial({ color: 0x4a3120, roughness: 0.62, metalness: 0 });
const FRAME = new THREE.MeshStandardMaterial({ color: 0x3e4246, roughness: 0.55, metalness: 0.35 });
/** THE SET'S MOVING PARTS (Glenridge Hall; the zone's DYN_ nodes): the hearth stone sinks and slides back under
 *  the hearth, a crest shows once it is set in the chimneypiece, the car drives out to the gate. */
const UP = new THREE.Vector3(0, 1, 0);
const STONE = { door: "hearth-stone", node: "hearth-stone", sink: 0.16, slide: 1.0, secs: 5 };
// THE CAR stands on the gravel with its NOSE TO THE HOUSE (north, -z): measured off the packed model itself — its
// tail lamps are at z 9.86 and its grille at z 5.3 (the review of Nov 13 2026; the first cut took it for nose-east
// off a still and drove it out sideways). The porch steps and the lamp posts are in front of it, so it leaves as a
// car would: BACKS straight out, backs round with its tail swinging east until it faces west, then pulls away to
// the left, down the drive (its middle at the forecourt's foot), through the gate and out of sight beyond it.
// Checked against the walk map: the car's four corners stay on open gravel the whole way (carPath, below).
const CAR = { node: "car", back: 4, backR: 4.5, turnR: 5, via: [[3.6, 36], [5.3, 62], [6, 84]] as [number, number][], secs: 13, backShare: 0.36, blend: 5 };
/** Where the car is `k` of the way through leaving (0..1), from where it stands: [x, z, turn]. `turn` is how far it
 *  has turned about the world's up axis: with the nose at rest pointing north, a turn of `a` points it along
 *  (-sin a, -cos a) on the ground. Pure, so a script can walk it. */
export function carPath(k: number, x0: number, z0: number): [number, number, number] {
  const C = CAR, H = Math.PI / 2;
  const backLen = C.back + H * C.backR;
  if (k <= C.backShare) {
    // backing out: off the mark gently and to a stop (a smooth step), straight and then round
    const u = k / C.backShare, s = backLen * u * u * (3 - 2 * u);
    if (s <= C.back) return [x0, z0 + s, 0];
    const a = (s - C.back) / C.backR;
    return [x0 + C.backR * (1 - Math.cos(a)), z0 + C.back + C.backR * Math.sin(a), a];
  }
  // pulling away: from a stand, faster all the way
  const x1 = x0 + C.backR, z1 = z0 + C.back + C.backR;
  const pts: [number, number][] = [[x1 - C.turnR, z1 + C.turnR], ...C.via];
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const arc = H * C.turnR, u = (k - C.backShare) / (1 - C.backShare);
  const total = arc + lens.reduce((t, l) => t + l, 0), s = u * u * total;
  /** the line as drawn: the quarter turn, then the straight legs */
  const raw = (q: number): [number, number] => {
    if (q <= arc) { const a = H + Math.max(0, q) / C.turnR; return [x1 + C.turnR * Math.cos(a), z1 + C.turnR * (1 - Math.sin(a))]; }
    let r = q - arc, i = 0;
    while (i < lens.length - 1 && r > lens[i]) r -= lens[i++];
    const t = Math.min(1, r / lens[i]), p = pts[i], n = pts[i + 1];
    return [p[0] + (n[0] - p[0]) * t, p[1] + (n[1] - p[1]) * t];
  };
  // THE CORNERS ARE ROUNDED, AND THE NOSE IS ON THE LINE IT TRAVELS (the code review's D-7): the legs met at 16 and
  // 20 degrees, and the nose came round over five metres while the car was already going the new way, so it slid
  // sideways through each join. The car's place is the line averaged over `blend` metres about it (nothing at the
  // two ends, where it must be exactly on its marks), and its heading is the way that place is moving.
  const at = (q: number): [number, number] => {
    // (the window opens and shuts SMOOTHLY at the two ends: one that simply stopped growing put a kink in the
    // heading where it stopped)
    const ramp = (v: number) => { const c = Math.max(0, Math.min(1, v / C.blend)); return c * c * (3 - 2 * c); };
    const h = (C.blend / 2) * ramp(q) * ramp(total - q);
    if (h <= 1e-6) return raw(q);
    let x = 0, z = 0;
    for (let j = 0; j <= 40; j++) { const p = raw(q - h + (h * j) / 20); x += p[0]; z += p[1]; }
    return [x / 41, z / 41];
  };
  const p = at(s), a0 = at(Math.max(0, s - 0.05)), a1 = at(Math.min(total, s + 0.05));
  const to = Math.atan2(-(a1[0] - a0[0]), -(a1[1] - a0[1]));
  // (the nearest way round from south: the turn runs from a quarter to a half and then a little either side of it)
  return [p[0], p[1], Math.PI + Math.atan2(Math.sin(to - Math.PI), Math.cos(to - Math.PI))];
}
/** the four crests in the order of the zone's crest-0..3 nodes (sim/scenarios/glenridge.ts GLEN.crests) */
const CRESTS = ["vault", "library", "sitting", "cell"] as const;
const PLATE = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.5, metalness: 0.4 });
/** the lock panel's lens: locked (red, bright enough to bloom) and not (a dim green) — one program */
const LENS_LOCKED = new THREE.MeshStandardMaterial({ color: 0x3a0505, roughness: 0.3, metalness: 0, emissive: 0xff2414, emissiveIntensity: 3.2 });
const LENS_OPEN = new THREE.MeshStandardMaterial({ color: 0x06200b, roughness: 0.3, metalness: 0, emissive: 0x2cff5a, emissiveIntensity: 0.55 });
/** the wall panel: beside the latch jamb (centre this far past the opening's edge), its back on the
 *  wall's bare face (0.1 m from the centre plane; a panelled wall's face stands 0.12, so it sits 2-4 cm proud) */
const PANEL = { along: 0.17, up: 1.15, w: 0.08, h: 0.14, back: 0.095, depth: 0.045, lens: 0.024 };
/** how far our frame stands inside the opening's reveals */
const FRAME_IN = 0.04;
/** doorways whose baked cut isn't the map's size (measured in the shells, Oct 28 2026): the chief's
 *  office door is set in the glass front's own steel frame, 0.82 x 2.03 — our frame would lie on it */
const FIT: Record<string, { size: [number, number]; frame?: false; glazed?: true }> = {
  "sec-office-door": { size: [0.8, 2.01], frame: false, glazed: true },
};
const LOCKABLE = new Set<Door["kind"]>(["door", "sealed"]);

export class ShowDoors {
  readonly doors = new Map<string, DoorRec>();
  readonly root = new THREE.Group();
  private geos = new Map<string, THREE.BufferGeometry>();
  private house = MAP_ID !== "bunker";
  private zones: FacilityZones | null = null;
  /** the moving parts' state: what the server last said, and how far each has moved (0..1) */
  private props: Record<string, number> = {};
  private tmpQ = new THREE.Quaternion();
  private stoneOpen = false;
  private stoneK = 0;
  private carK = 0;

  constructor(scene: THREE.Scene, private show: ShowFx) {
    this.root.name = "doors";
    scene.add(this.root);
    for (const d of DOORS) {
      // (a house's broken windows are doors with no leaf: the boards nailed across them are the effects')
      if (!LEAF_KINDS.has(d.kind) && d.kind !== "vault" && d.kind !== "window") continue;
      const pl = placeOf(d.id);
      if (!pl || Math.abs(pl.normal[1]) > 0.5) continue;   // (a hatch in a floor: no leaf yet)
      const zones = [roomInfo(d.a)?.zone, roomInfo(d.b)?.zone].filter(Boolean) as SiteZone[];
      this.doors.set(d.id, {
        door: d, centre: new THREE.Vector3(...pl.centre), normal: new THREE.Vector3(...pl.normal), size: pl.size, zones,
        pivot: null, slab: null, leaf: null, ours: false, open: 0, want: 0, rest: 0, sign: 1,
        state: { id: d.id, open: false, locked: false, broken: false, planks: 0, reinforced: false, health: 100 }, registered: false,
        lenses: null, panels: [],
      });
    }
  }

  /** the zones changed: hang each door whose zone is in, using a prop's real leaf where one stands.
   *  (Map polish, Oct 28 2026: a door between two zones whose PROP belongs to the zone that just went —
   *  decon-labs' lab door is the lobby's — kept pointing at the freed prop and the doorway stood empty
   *  from the zone still in; and a prop taking over from our slab left the slab's frame standing in
   *  it. Now the slab and its frame are one group, shown or hidden together, and a leaf that changes
   *  takes the swing the door is at.) */
  rebuild(zones: FacilityZones): void {
    this.zones = zones;
    this.poseProps(true);
    const props = zones.doorProps();
    for (const r of this.doors.values()) {
      const inWorld = r.zones.some((z) => zones.isReady(z));
      if (r.door.kind === "window") {
        // no leaf: only somewhere for the boards to be nailed (on the room's side)
        if (inWorld && !r.registered) {
          const inside = roomInfo(r.door.a)?.outdoor ? 1 : -1;
          this.show.registerDoor(r.door.id, {
            at: r.centre.toArray() as [number, number, number], normal: r.normal.toArray() as [number, number, number], size: r.size,
            material: "wood", holdSide: inside, floorY: r.centre.y - r.size[1] / 2,
          }, nowOf(r.state));
          r.registered = true;
        }
        continue;
      }
      // a door prop standing on this door's spot
      const prop = inWorld ? props.find((p) => Math.hypot(p.position.x - r.centre.x, p.position.z - r.centre.z) < 0.8 && Math.abs(p.position.y - (r.centre.y - r.size[1] / 2)) < 1.5) : undefined;
      const leaf = prop ? findLeaf(prop) : null;
      let pivot: THREE.Object3D | null = null, dleaf: THREE.Object3D | null = null, rest = 0, sign = 1, ours = false;
      if (inWorld && leaf) {
        // a real door: its leaf node's origin is on its hinge (fx/anchors.ts), it swings about Y
        // (every leaf here swings the same way: −92°/−95° about its hinge, into the room the door's
        // normal points away from for the vault — the chamber, over the swing arc painted on its floor,
        // as the Look Test turns it (room/lobby.ts doorOpen). The draft's vault had sign −1 and swung
        // the blast door out into the transit tunnel, through the side its arc isn't on.)
        pivot = leaf; dleaf = leaf; sign = 1;
        rest = r.pivot === leaf ? r.rest : leaf.rotation.y;
      } else if (inWorld && r.door.kind !== "vault") {
        if (!r.slab) this.hang(r);
        pivot = r.slab!.pivot; dleaf = r.slab!.leaf; rest = r.slab!.rest; ours = true;
      }
      if (r.slab) r.slab.group.visible = ours;
      if (!this.house && inWorld && LOCKABLE.has(r.door.kind) && !glazed(r.door) && !r.panels.length) this.wallPanels(r);
      for (const p of r.panels) p.group.visible = !!p.zone && zones.isReady(p.zone);
      const changed = dleaf !== r.leaf;
      if (changed && r.registered) { this.show.forgetDoor(r.door.id); r.registered = false; }
      r.pivot = pivot; r.leaf = dleaf; r.rest = rest; r.sign = sign; r.ours = ours;
      if (changed && pivot) this.pose(r);
      if (!r.registered && r.leaf) {
        this.show.registerDoor(r.door.id, {
          leaf: r.leaf, at: r.centre.toArray() as [number, number, number], normal: r.normal.toArray() as [number, number, number], size: r.size,
          material: doorMaterial(r.door), holdSide: 1, floorY: r.centre.y - r.size[1] / 2,
        }, nowOf(r.state));
        r.registered = true;
      }
    }
  }

  /** A plain slab in the opening, hinged at one jamb, swinging into room b, in a frame. The baked
   *  shell cuts each doorway with its REVEALS exactly at the opening's edges (measured: every cut
   *  doorway, within a centimetre), so a frame whose faces lay on them z-fought them; the frame stands
   *  FRAME_IN inside the opening and 1 cm proud of both wall faces (it covers the wall's whole 0.2 m
   *  depth — the reveal a door between two zones lacks while the other zone isn't in), and the leaf is
   *  sized to the frame. */
  private hang(r: DoorRec): void {
    if (this.house) { this.hangHouse(r); return; }
    const fit = FIT[r.door.id];
    const [w, h] = fit?.size ?? r.size;
    // (a house's doorways have their own frames in the shell: only the leaf is hung)
    const inset = fit?.frame === false || this.house ? 0 : FRAME_IN;
    const lw = w - 2 * inset - 0.012, lh = h - inset - 0.03;
    const geo = this.box(lw, lh, 0.05, lw / 2);
    const mat = this.house && doorMaterial(r.door) === "wood" ? OAK : MATS[doorMaterial(r.door)];
    const group = new THREE.Group();
    group.name = `door:${r.door.id}`;
    const pivot = new THREE.Group();
    // the leaf's local x runs across the opening, z along the door's normal
    const yaw = Math.atan2(r.normal.x, r.normal.z);
    const across = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const bottom = r.centre.y - r.size[1] / 2;
    pivot.position.copy(r.centre).addScaledVector(across, -w / 2 + inset + 0.006);
    pivot.position.y = bottom + 0.02 + lh / 2;
    pivot.rotation.y = yaw;
    const leaf = new THREE.Mesh(geo, mat);
    leaf.castShadow = true;
    pivot.add(leaf);
    if (!this.house && LOCKABLE.has(r.door.kind) && glazed(r.door)) {
      // on the leaf by the latch edge, both faces: an escutcheon with its lens
      const plate = this.box(0.045, 0.11, 0.012), lens = this.box(0.018, 0.018, 0.005);
      r.lenses = [];
      for (const face of [1, -1]) {
        const p = new THREE.Mesh(plate, PLATE), l = new THREE.Mesh(lens, LENS_OPEN);
        p.position.set(lw - 0.07, -lh / 2 + 1.05, face * (0.025 + 0.006));
        l.position.set(lw - 0.07, -lh / 2 + 1.075, face * (0.025 + 0.012 + 0.0025));
        leaf.add(p, l);
        r.lenses.push(l);
      }
      this.showLock(r);
    }
    group.add(pivot);
    if (inset > 0) {
      // the jambs and head: their inside faces FRAME_IN inside the reveals, the rest in the wall
      const depth = 0.22, t = inset + 0.01;
      const jamGeo = this.box(t, h, depth);
      const jam = new THREE.Mesh(jamGeo, FRAME), jam2 = new THREE.Mesh(jamGeo, FRAME);
      const head = new THREE.Mesh(this.box(w + 0.02, t, depth), FRAME);
      jam.position.copy(r.centre).addScaledVector(across, -w / 2 + inset - t / 2); jam.position.y = bottom + h / 2;
      jam2.position.copy(r.centre).addScaledVector(across, w / 2 - inset + t / 2); jam2.position.y = bottom + h / 2;
      head.position.copy(r.centre); head.position.y = bottom + h - inset + t / 2;
      for (const m of [jam, jam2, head]) { m.rotation.y = yaw; group.add(m); }
    }
    this.root.add(group);
    r.slab = { group, pivot, leaf, rest: yaw };
  }

  /** A HOUSE'S DOOR (Glenridge Hall): the leaf its style asks for (show/houseDoors.ts), one or a pair, inside the
   *  frame the build left in the shell; hinged on the side and swinging the way the floor allows. A French door the
   *  show never opens still gets its leaves: the shell has only the frame. */
  private hangHouse(r: DoorRec): void {
    const style = (r.door.style ?? "panel") as DoorStyle;
    const [w, h] = r.size, fw = FRAME_W[style];
    const rise = style === "arch" ? Math.min(r.door.rise ?? 0, h - 1.2) : 0;
    const yaw = Math.atan2(r.normal.x, r.normal.z);
    const across = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    // THE OPENING AS BUILT (door-fit.mjs measures every door's jambs, head and floor off the zone files): the leaf
    // hangs in that, not in the plan's rectangle. Seven leaves did not fit the plan's — one 13 cm into a wall, a
    // slot over the garage doors, one with its foot in a step (the review, Nov 13 2026). No measure: the plan's,
    // less the frame.
    const fit = r.door.fit;
    const mid = fit ? r.centre.clone().addScaledVector(across, fit.shift) : r.centre;
    const bottom = fit ? fit.sill : r.centre.y - h / 2;
    const total = fit ? fit.w - 0.012 : w - 2 * fw - 0.008;
    // (an arch's measured head is the underside of its transom: the leaf stops there, the fixed head is above)
    const lh = fit ? fit.top - fit.sill - 0.015 : h - rise - fw - 0.015;
    const pair = isPair(style, w), lw = pair ? total / 2 - 0.002 : total;
    const { side, hinge } = this.swingOf(r, lw, pair, across, mid, total, bottom);
    const group = new THREE.Group(), swing = new THREE.Group();
    group.name = `door:${r.door.id}`;
    // (the leaves' parent stands at the door's middle: the effects shake a struck door about its own origin, and a
    // parent left at the world's origin swung the garage pair 8 cm sideways at every blow)
    swing.position.copy(r.centre);
    const pivots: { o: THREE.Object3D; open: number }[] = [];
    for (const hs of (pair ? [-1, 1] : [hinge]) as (1 | -1)[]) {
      const pivot = new THREE.Group();
      pivot.position.copy(mid).sub(r.centre).addScaledVector(across, hs * (total / 2));
      pivot.position.y = bottom + 0.012 + lh / 2 - r.centre.y;
      pivot.rotation.y = yaw;
      // (the leaf runs from its hinge toward the middle of the opening)
      pivot.add(houseLeaf(style, lw, lh, hs === -1 ? 1 : -1));
      swing.add(pivot);
      // a leaf hinged at -across turns by a NEGATIVE angle to swing toward the normal's side; at +across, positive
      // (86 degrees: a leaf is 5 cm thick about its hinge line, and at a full right angle its back sank into the jamb)
      pivots.push({ o: pivot, open: side * hs * THREE.MathUtils.degToRad(style === "steel" ? 96 : 86) });
    }
    // A BOLT, on a door to the grounds: an iron bar across the inside of the leaf, drawn only while the server says
    // the door is locked (a bolted door looked like any shut one). It rides the leaf.
    const ra = roomInfo(r.door.a), rb = roomInfo(r.door.b);
    if (style !== "french" && (!!ra?.outdoor) !== (!!rb?.outdoor)) {
      const inner = rb?.outdoor ? -1 : 1;          // (+normal is toward room b)
      const dir = pivots.length && (pair ? -1 : hinge) === -1 ? 1 : -1;
      const bar = new THREE.Mesh(this.box(Math.min(0.46, lw * 0.5), 0.07, 0.045), HOUSE_MATS.iron);
      bar.position.set(dir * (lw - Math.min(0.46, lw * 0.5) / 2 + 0.04), -lh / 2 + 1.05, inner * 0.05);
      bar.visible = false;
      pivots[0].o.add(bar);
      r.bolt = bar;
    }
    group.add(swing);
    if (rise > 0) {
      const head = archHead(w - 0.02, rise - 0.01);
      // (over the middle of the opening AS BUILT, like the leaf under it: it hung from the plan's middle, a
      // millimetre off today and as far off as the plan is the day an arch is rebuilt: the code review's D-9. Its
      // height stays the plan's: the measured head is the UNDERSIDE of the transom, and this sits on top of it.)
      head.position.copy(mid); head.position.y = r.centre.y + h / 2 - rise;
      head.rotation.y = yaw;
      group.add(head);
    }
    this.root.add(group);
    r.slab = { group, pivot: pivots[0].o, leaf: swing, rest: yaw, pivots };
  }

  /** WHICH WAY A HOUSE DOOR OPENS: onto clear floor (the page's own walk map: a cell with a room is floor), into a
   *  room rather than a hall or the grounds, and back against a wall where there is one beside the jamb. */
  private swingOf(r: DoorRec, lw: number, pair: boolean, across: THREE.Vector3, mid: THREE.Vector3, total: number, bottom: number): { side: 1 | -1; hinge: 1 | -1 } {
    const fy = bottom + 0.5, n = r.normal, half = total / 2;
    // (OPEN FLOOR, cell by cell: the walk map knows walls and furniture. A point merely inside a room's outline
    // said "floor" for every choice — 58 doors of 59 scored all four alike, and a leaf opened through a potted
    // plant. The review, Nov 13 2026.)
    const floor = (x: number, z: number) => walkableAt(x, fy, z);
    let best = { side: 1 as 1 | -1, hinge: -1 as 1 | -1 }, bs = -1e9;
    for (const side of [1, -1] as const) for (const hinge of (pair ? [-1] : [-1, 1]) as (1 | -1)[]) {
      let free = 0, tot = 0, wall = 0;
      for (const hs of pair ? [-1, 1] : [hinge]) {
        const hx = mid.x + across.x * hs * half, hz = mid.z + across.z * hs * half;
        // where the leaf stands open, and where it passes half way round
        for (let d = 0.45; d <= lw + 0.01; d += 0.2) {
          tot += 2;
          if (floor(hx + n.x * side * d, hz + n.z * side * d)) free++;
          const k = d * 0.7071;
          if (floor(hx + (n.x * side - across.x * hs) * k, hz + (n.z * side - across.z * hs) * k)) free++;
        }
        if (!floor(hx + across.x * hs * 0.45 + n.x * side * lw * 0.6, hz + across.z * hs * 0.45 + n.z * side * lw * 0.6)) wall++;
      }
      const room = roomInfo(side > 0 ? r.door.b : r.door.a), from = roomInfo(side > 0 ? r.door.a : r.door.b);
      // (never up into a room whose floor is a step higher: the foot of the leaf would be in the step)
      // (the LEAF's foot, not the other room's floor: every outside door has the house's floor at its sill and the
      // grounds half a metre down, so this sent all six of them swinging out into the rain: the code review's D-3)
      const step = room && from && room.fy > bottom + 0.05 ? -4 : 0;
      const into = (!room || room.outdoor ? -2 : room.room.kind === "corridor" ? 0 : 0.6) + step;
      const score = (free === tot ? 3 : 2.4 * (free / tot)) + wall * 0.8 + into;
      if (score > bs) { bs = score; best = { side, hinge }; }
    }
    return best;
  }

  /** The lock panels on the wall beside the latch jamb (the side away from the hinge), one on each face. */
  private wallPanels(r: DoorRec): void {
    const yaw = Math.atan2(r.normal.x, r.normal.z);
    const across = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const bottom = r.centre.y - r.size[1] / 2;
    const plate = this.box(PANEL.w, PANEL.h, PANEL.depth), lens = this.box(PANEL.lens, PANEL.lens, 0.006);
    r.lenses = [];
    for (const face of [1, -1]) {
      const room = face > 0 ? r.door.b : r.door.a;
      const group = new THREE.Group();
      group.name = `lock:${r.door.id}:${room}`;
      group.position.copy(r.centre).addScaledVector(across, r.size[0] / 2 + PANEL.along);
      group.position.y = bottom + PANEL.up;
      group.rotation.y = yaw;
      const p = new THREE.Mesh(plate, PLATE), l = new THREE.Mesh(lens, LENS_OPEN);
      p.position.z = face * (PANEL.back + PANEL.depth / 2);
      l.position.set(0, PANEL.h * 0.22, face * (PANEL.back + PANEL.depth + 0.003));
      group.add(p, l);
      this.root.add(group);
      r.panels.push({ group, zone: roomInfo(room)?.zone });
      r.lenses.push(l);
    }
    this.showLock(r);
  }

  /** the lens says what the server says: lit red while locked */
  private showLock(r: DoorRec): void {
    if (r.bolt) r.bolt.visible = r.state.locked && !r.state.broken && !r.state.open;
    if (!r.lenses) return;
    const m = r.state.locked && !r.state.broken ? LENS_LOCKED : LENS_OPEN;
    for (const l of r.lenses) l.material = m;
  }

  /** a box, shared by every door that has one the same size (shifted +x by `dx`: a leaf on its hinge) */
  private box(w: number, h: number, d: number, dx = 0): THREE.BufferGeometry {
    const key = `${w.toFixed(3)}x${h.toFixed(3)}x${d.toFixed(3)}+${dx.toFixed(3)}`;
    let g = this.geos.get(key);
    if (!g) { g = new THREE.BoxGeometry(w, h, d).translate(dx, 0, 0); this.geos.set(key, g); }
    return g;
  }

  /** set a leaf to the swing its door is at (a leaf just handed over arrives shut) */
  private pose(r: DoorRec): void {
    if (!r.pivot) return;
    const ease = r.open * r.open * (3 - 2 * r.open);
    if (r.ours && r.slab?.pivots) { for (const p of r.slab.pivots) p.o.rotation.y = r.slab.rest + p.open * ease; return; }
    r.pivot.rotation.y = r.rest + r.sign * -THREE.MathUtils.degToRad(r.door.kind === "vault" ? 95 : 92) * ease;
  }

  /** a scrap with every door material on it, for the scene to compile ahead (a door hung when its
   *  zone arrives must not build its program on the frame it's first seen) */
  warmScrap(): THREE.Group {
    const g = new THREE.Group(), box = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    for (const m of [...Object.values(MATS), OAK, FRAME, PLATE, LENS_LOCKED, LENS_OPEN]) { const mesh = new THREE.Mesh(box, m); mesh.castShadow = true; g.add(mesh); }
    if (this.house) for (const mesh of houseWarm()) { mesh.castShadow = true; g.add(mesh); }
    return g;
  }

  /** the server's word on a door (a snapshot) */
  setState(w: DoorWire): void {
    if (w.id === STONE.door) { this.stoneOpen = w.open; this.stoneK = w.open ? 1 : 0; this.poseProps(true); }
    const r = this.doors.get(w.id);
    if (!r) return;
    r.state = { ...w };
    r.want = w.open && !w.broken ? 1 : 0;
    this.showLock(r);
    if (r.registered) this.show.apply(w.id, nowOf(r.state));
  }

  /** an event on a door: what it leaves the door as (DoorNow for ShowFx), and its swing */
  afterEvent(id: string, ev: Record<string, unknown>): DoorNow {
    const r = this.doors.get(id);
    const now: DoorNow = {};
    if (id === STONE.door && ev.event === "secret.open") this.stoneOpen = true;
    if (!r) return now;
    const s = r.state;
    switch (ev.event) {
      // (opening unlocks it: doors.ts open()) — THE BUNKER adds the dead pushing a door open, the armory's card and
      // the radio room's keypad; and the blast door cranked shut for good
      case "door.open": case "vault.open": case "door.pushed": case "door.keycard": case "keypad.ok": s.open = true; s.locked = false; break;
      case "door.close": case "vault.shut": case "door.sealed": s.open = false; break;
      case "door.broken": s.broken = true; s.planks = 0; s.locked = false; break;
      case "door.lock": s.locked = true; break;
      // (the bolt shot: a door that was already shut sends no "close", so the bar was not drawn until the next
      // snapshot: the code review's D-1)
      case "door.bolted": s.open = false; s.locked = true; break;
    }
    if (typeof ev.locked === "boolean") s.locked = ev.locked;
    if (typeof ev.planks === "number") s.planks = ev.planks;
    if (typeof ev.reinforced === "boolean") s.reinforced = ev.reinforced;
    if (typeof ev.health === "number") s.health = ev.health;
    r.want = s.open && !s.broken ? 1 : 0;
    this.showLock(r);
    return nowOf(s);
  }

  /** the material and kind the sound wants for a door's cue */
  cueFields(id: string): { material?: string; kind?: string; at?: [number, number, number] } {
    const r = this.doors.get(id);
    if (r) return { material: doorMaterial(r.door), kind: r.door.kind, at: r.centre.toArray() as [number, number, number] };
    const d = DOORS.find((x) => x.id === id);
    const pl = placeOf(id);
    return d ? { material: doorMaterial(d), kind: d.kind, at: pl?.centre } : {};
  }

  placement(id: string): { at: [number, number, number]; normal: [number, number, number]; size: [number, number] } | null {
    const r = this.doors.get(id);
    if (r) return { at: r.centre.toArray() as [number, number, number], normal: r.normal.toArray() as [number, number, number], size: r.size };
    const pl = placeOf(id);
    return pl ? { at: pl.centre, normal: pl.normal, size: pl.size } : null;
  }

  /** THE SERVER'S WORD ON THE MOVING PARTS (the snapshot's goals.props, and the events that change them):
   *  `crests` set in the chimneypiece, `away` once the car has gone. `now` = as it stands (a snapshot: no animation). */
  setProps(p: Record<string, number> | undefined, now = false): void {
    if (!p) return;
    this.props = { ...this.props, ...p };
    if (now) this.carK = this.props.away ? 1 : 0;
    this.poseProps(true);
  }

  /** put each moving part where it is (the nodes arrive with their zone; their rest pose is kept on them) */
  private poseProps(force = false): void {
    const z = this.zones;
    if (!z || !this.house) return;
    const rest = (o: THREE.Object3D) => (o.userData.rest ??= { p: o.position.clone(), r: o.rotation.y }) as { p: THREE.Vector3; r: number };
    // (the crest that was set, in its own niche: by name where the server says which, by count from an older one)
    const named = CRESTS.some((c) => this.props[`crest:${c}`] !== undefined);
    for (let i = 0; i < 4; i++) { const c = z.dyn(`crest-${i}`); if (c) c.visible = named ? !!this.props[`crest:${CRESTS[i]}`] : i < (this.props.crests ?? 0); }
    const stone = z.dyn(STONE.node);
    if (stone && (force || this.stoneK > 0)) {
      const b = rest(stone), k = this.stoneK;
      // down first, then back under the hearth (north: -z)
      const sink = Math.min(1, k / 0.3), slide = Math.max(0, (k - 0.3) / 0.7), e = slide * slide * (3 - 2 * slide);
      stone.position.set(b.p.x, b.p.y - STONE.sink * sink, b.p.z - STONE.slide * e);
    }
    const car = z.dyn(CAR.node);
    if (car && (force || this.carK > 0)) {
      const b = rest(car), k = this.carK;
      const q0 = (car.userData.restQ ??= car.quaternion.clone()) as THREE.Quaternion;
      const [x, z, turn] = carPath(k, b.p.x, b.p.z);
      car.position.set(x, b.p.y, z);
      car.quaternion.copy(q0).premultiply(this.tmpQ.setFromAxisAngle(UP, turn));
      car.visible = k < 1;
    }
  }

  /** every frame: the leaves swing toward open or shut */
  update(dt: number): void {
    if (this.house) {
      const sk = this.stoneOpen ? Math.min(1, this.stoneK + dt / STONE.secs) : 0, ck = this.props.away ? Math.min(1, this.carK + dt / CAR.secs) : 0;
      if (sk !== this.stoneK || ck !== this.carK) { this.stoneK = sk; this.carK = ck; this.poseProps(); }
    }
    for (const r of this.doors.values()) {
      if (!r.pivot || r.open === r.want) continue;
      const step = dt * (r.door.kind === "vault" ? 0.25 : 1.6);
      r.open = r.want > r.open ? Math.min(r.want, r.open + step) : Math.max(r.want, r.open - step);
      this.pose(r);
    }
  }

  dispose(): void {
    for (const id of this.doors.keys()) this.show.forgetDoor(id);
    this.root.removeFromParent();
    for (const g of this.geos.values()) g.dispose();
    if (this.house) disposeHouseDoors();
  }
}

/** a door set in a glazed front: no wall beside it, so its lock panel rides the leaf */
function glazed(d: Door): boolean { return doorMaterial(d) === "glass" || !!FIT[d.id]?.glazed; }

function nowOf(s: DoorWire): DoorNow {
  return { open: s.open, broken: s.broken, planks: s.planks, reinforced: s.reinforced };
}

/** a door prop's leaf node: the vault's, a lab door's (the first leaf; a double's left) */
function findLeaf(prop: THREE.Object3D): THREE.Object3D | null {
  let leaf: THREE.Object3D | null = null;
  prop.traverse((o) => {
    if (leaf || /-mesh$/.test(o.name)) return;
    if (/^Vault_leaf$|_leaf_|_left_|^bulkhead-door$/.test(o.name)) leaf = o;
  });
  return leaf;
}
