// SOLACE SURVIVORZ — HALCYON SITE 9 (SURVIVORZ.md §3), TO SCALE.
//
// Version 2 (2026-10-23): the same chain and every door rule as the first draft, laid out at real
// size on THREE FLOORS so it can be built — every room's rect is its footprint in world metres
// (x east, y = z south) and every door sits on a wall its two rooms really share
// (facility.ts layoutProblems checks both; test-facility.mjs runs it).
//   Floor 0 (y 0):   the clean face — the Vault Lobby, Residential, Medical, Security, the Labs.
//   Floor 1 (y -8):  the guts — Power & Maintenance (west), Specimen Containment (east).
//   Floor 2 (y -16): the deep — the Deep Lab and the tunnels.
// The floors meet at three shafts — the Service Stairs (stores → the generator hall), the
// Containment Stairs (security → observation) and the Freight Lift (cryo hall → the deep) — plus
// the pipe gallery's grate down into the tunnel junction.
//
// THE CHAIN (test-facility.mjs walks it). Zones are EARNED (Josh, 2026-10-22), so these are stages,
// not weeks; each zone's expectWeek is the week the design hopes a group gets there:
//   1  Vault Lobby + Residential. Tier 1 card at the security desk.
//   2  Research Labs (card 1): tier 2 card in the glass offices;
//      Medical (card 1): the ward, the morgue, the pharmacy.
//   3  Security (card 2): the vault override in the control room — and the tier 3 card, which in
//      the game is clipped to the turned security chief wandering Security (SURVIVORZ.md §3; the
//      spot here is where his round starts); Power & Maintenance (card 2, via the stores): the
//      breakers. Labs power opens the airlock run to the clean labs.
//   4  Containment (card 3): its power breaks the lockdown (the breach) and opens the specimen
//      cells; the Deep Lab (card 3 + power) — its bench is where Lazarus is made, so the cure
//      and the truth both need the deep; the tunnels through the pipe gallery's grate (a crowbar).
import type { Facility, Room, Spot } from "./facility";

const r = (id: string, name: string, zone: Room["zone"], kind: Room["kind"], floor: number,
  x: number, y: number, w: number, h: number, spots: Spot[] = [], spans?: number): Room =>
  ({ id, name, zone, kind, floor, rect: { x, y, w, h }, spots, ...(spans ? { spans } : {}) });
const loot = (id: string): Spot => ({ id, kind: "loot" });
const log = (id: string): Spot => ({ id, kind: "terminal" });
const beds = (room: string): Spot[] => [
  ...Array.from({ length: 6 }, (_, i) => ({ id: `${room}-bed-${i + 1}`, kind: "bed" as const })),
  { id: `${room}-box`, kind: "box" as const },
];

export const SITE_9: Facility = {
  id: "halcyon-site-9-v2",
  start: "vault-chamber",
  zones: [
    { id: "lobby", name: "Vault Lobby", expectWeek: 1, emergencyPower: true },
    { id: "residential", name: "Residential Wing", expectWeek: 1, emergencyPower: true },
    { id: "labs", name: "Research Labs", expectWeek: 2, emergencyPower: false },
    { id: "medical", name: "Medical & Quarantine", expectWeek: 2, emergencyPower: false },
    { id: "security", name: "Security", expectWeek: 3, emergencyPower: false },
    { id: "power", name: "Power & Maintenance", expectWeek: 3, emergencyPower: true },
    { id: "containment", name: "Specimen Containment", expectWeek: 4, emergencyPower: false },
    { id: "deep", name: "The Deep Lab & Tunnels", expectWeek: 4, emergencyPower: false },
  ],
  rooms: [
    // ================= FLOOR 0 — the clean face =================
    // ---- outside: the transit tunnel the survivors ran in from ----
    r("outside", "Transit Tunnel (outside the vault)", "lobby", "exit", 0, 40, 0, 40, 8),
    // ---- 1. Vault Lobby ----
    r("vault-chamber", "Vault Chamber", "lobby", "room", 0, 50, 8, 20, 10),
    r("reception", "Reception", "lobby", "room", 0, 44, 18, 32, 14, [loot("reception-desk"), log("reception-terminal")]),
    r("security-desk", "Security Desk", "lobby", "room", 0, 76, 20, 10, 10, [{ id: "card-1", kind: "keycard", tier: 1 }, log("desk-terminal")]),
    r("decon-entry", "Decontamination Entry", "lobby", "corridor", 0, 54, 32, 12, 8),
    // ---- 2. Residential Wing ----
    r("res-corridor", "Residential Corridor", "residential", "corridor", 0, 0, 40, 60, 6),
    r("canteen", "Canteen", "residential", "room", 0, 14, 26, 18, 14, [loot("canteen-tables")]),
    r("kitchen", "Kitchen", "residential", "room", 0, 32, 28, 10, 12, [loot("kitchen-freezer"), loot("kitchen-cupboards")]),
    r("stores", "Stores", "residential", "room", 0, 32, 18, 10, 10, [loot("stores-shelves"), loot("stores-cage")]),
    r("safe-res", "Dormitory Safe Room", "residential", "safe", 0, 2, 28, 12, 12, beds("safe-res")),
    r("bunks-a", "Bunk Room A", "residential", "room", 0, 6, 46, 12, 12, [loot("bunks-a-lockers")]),
    r("bunks-b", "Bunk Room B", "residential", "room", 0, 18, 46, 12, 12, [loot("bunks-b-lockers"), log("bunks-b-tablet")]),
    r("showers", "Showers", "residential", "room", 0, 30, 46, 10, 10),
    r("rec-room", "Rec Room", "residential", "room", 0, 40, 46, 14, 12, [loot("rec-room-cabinet")]),
    r("panic-room", "Panic Room", "residential", "sealed", 0, 54, 48, 6, 8),
    // ---- 3. Research Labs ----
    r("labs-corridor", "Labs Corridor", "labs", "corridor", 0, 60, 40, 48, 6),
    r("break-room", "Labs Break Room", "labs", "room", 0, 66, 32, 20, 8, [loot("break-room-fridge")]),
    r("glass-offices", "Glass Offices", "labs", "room", 0, 86, 26, 16, 14, [{ id: "card-2", kind: "keycard", tier: 2 }, log("office-terminal-1"), log("office-terminal-2"), loot("office-desks")]),
    r("conference", "Conference Room", "labs", "room", 0, 102, 30, 12, 10, [log("conference-whiteboard")]),
    r("server-room", "Server Room", "labs", "room", 0, 108, 40, 8, 12, [log("server-terminal")]),
    r("airlock", "Airlock", "labs", "corridor", 0, 102, 46, 6, 6),
    r("decon-shower", "Decontamination Shower", "labs", "corridor", 0, 102, 52, 6, 6),
    r("suit-room", "Suit Room", "labs", "room", 0, 108, 52, 8, 12, [loot("suit-lockers")]),
    r("lab-storage", "Lab Storage", "labs", "room", 0, 116, 40, 14, 12, [loot("lab-storage-shelves")]),
    r("clean-lab-a", "Clean Lab A", "labs", "room", 0, 116, 52, 14, 14, [log("lab-a-terminal"), loot("lab-a-fridge")]),
    r("clean-lab-b", "Clean Lab B", "labs", "room", 0, 130, 52, 14, 14, [log("lab-b-notes"), loot("lab-b-cabinet")]),
    // ---- 4. Medical & Quarantine ----
    r("med-corridor", "Medical Corridor", "medical", "corridor", 0, 0, 46, 6, 24),
    r("med-hall", "Medical Hall", "medical", "corridor", 0, 0, 70, 66, 6),
    r("pharmacy", "Pharmacy", "medical", "room", 0, 6, 60, 12, 10, [loot("pharmacy-shelves"), loot("pharmacy-cage")]),
    r("exam-rooms", "Exam Rooms", "medical", "room", 0, 18, 60, 14, 10, [loot("exam-cabinets")]),
    r("med-office", "Chief Medical Officer", "medical", "room", 0, 32, 60, 12, 10, [log("cmo-terminal"), loot("cmo-desk")]),
    r("staff-lounge", "Staff Lounge", "medical", "room", 0, 44, 60, 10, 10, [loot("lounge-lockers")]),
    r("safe-med", "Medical Staff Safe Room", "medical", "safe", 0, 54, 58, 12, 12, beds("safe-med")),
    r("quarantine", "Quarantine Block", "medical", "room", 0, 6, 76, 14, 12, [log("quarantine-terminal")]),
    r("quarantine-cell", "Quarantine Cell 4", "medical", "sealed", 0, 6, 88, 6, 6),
    r("ward", "Ward", "medical", "room", 0, 20, 76, 16, 14, [loot("ward-cabinet"), loot("ward-trolley"), log("ward-chart")]),
    r("operating", "Operating Room", "medical", "room", 0, 36, 76, 10, 10, [loot("operating-cabinet")]),
    r("morgue", "Morgue", "medical", "room", 0, 46, 76, 10, 10, [log("morgue-terminal")]),
    r("cold-storage", "Cold-Storage Locker", "medical", "sealed", 0, 56, 78, 6, 6),
    // ---- 5. Security ----
    r("sec-corridor", "Security Corridor", "security", "corridor", 0, 66, 70, 40, 6),
    r("sec-lockers", "Guard Locker Room", "security", "room", 0, 66, 60, 12, 10, [loot("guard-lockers")]),
    r("interview", "Interview Room", "security", "room", 0, 78, 60, 10, 10, [log("interview-recorder")]),
    r("sec-office", "Security Chief Office", "security", "room", 0, 88, 60, 12, 10, [log("chief-terminal"), loot("chief-desk")]),
    r("control-room", "Control Room", "security", "room", 0, 66, 76, 14, 12, [{ id: "vault-override", kind: "override" }, { id: "card-3", kind: "keycard", tier: 3 }, log("control-terminal")]),
    r("armoury", "Armoury", "security", "room", 0, 80, 76, 10, 10, [loot("armoury-rack"), loot("armoury-lockers")]),
    r("camera-room", "Camera Room", "security", "room", 0, 90, 76, 10, 10, [log("camera-terminal")]),
    r("holding", "Holding Cells", "security", "room", 0, 100, 76, 12, 10),
    r("holding-cell", "Holding Cell 2", "security", "sealed", 0, 112, 78, 6, 6),

    // ================= the shafts between floors (each spans two) =================
    r("service-stairs", "Service Stairs", "power", "corridor", 0, 32, 12, 10, 6, [], 2),
    r("containment-stairs", "Containment Stairs", "containment", "corridor", 0, 100, 60, 6, 10, [], 2),
    r("freight-lift", "Freight Lift", "deep", "corridor", 1, 70, 76, 8, 8, [], 2),

    // ================= FLOOR 1 — the guts =================
    // ---- 6. Power & Maintenance ----
    r("generator-hall", "Generator Hall", "power", "room", 1, 14, 18, 30, 20, [
      { id: "breaker-labs", kind: "breaker", zone: "labs" },
      { id: "breaker-medical", kind: "breaker", zone: "medical" },
      { id: "breaker-security", kind: "breaker", zone: "security" },
      { id: "breaker-containment", kind: "breaker", zone: "containment" },
      { id: "breaker-deep", kind: "breaker", zone: "deep" },
      log("generator-log"),
    ]),
    r("catwalks", "Catwalks", "power", "corridor", 1, 2, 18, 12, 20),
    r("safe-power", "Maintenance Crew Safe Room", "power", "safe", 1, 2, 38, 12, 10, beds("safe-power")),
    r("boiler", "Boiler Room", "power", "room", 1, 14, 38, 14, 12, [loot("boiler-toolbox")]),
    r("maint-lockup", "Maintenance Lockup", "power", "sealed", 1, 28, 40, 6, 6),
    r("workshop", "Workshop", "power", "room", 1, 14, 50, 14, 10, [loot("workshop-benches")]),
    r("pipe-gallery", "Pipe Gallery", "power", "corridor", 1, 44, 18, 6, 40, [loot("pipe-gallery-crate")]),
    r("pump-room", "Pump Room", "power", "room", 1, 50, 40, 12, 10, [loot("pump-room-locker")]),
    // ---- 7. Specimen Containment ----
    r("observation", "Observation Deck", "containment", "room", 1, 84, 60, 16, 10, [log("observation-terminal")]),
    r("specimen-cells", "Specimen Cells", "containment", "room", 1, 84, 70, 16, 12, [{ id: "tissue-sample", kind: "tissue" }]),
    r("sample-storage", "Sample Storage", "containment", "room", 1, 84, 82, 12, 8, [loot("sample-fridges")]),
    r("cryo-hall", "Cryo Hall", "containment", "room", 1, 66, 58, 18, 18, [log("cryo-terminal")]),
    r("cryo-pod", "Cryo Pod 7", "containment", "sealed", 1, 60, 64, 6, 6),

    // ================= FLOOR 2 — the deep =================
    // ---- 8. The Deep Lab & Tunnels ----
    r("deep-corridor", "Deep Corridor", "deep", "corridor", 2, 52, 84, 40, 6),
    r("deep-lab", "The Deep Lab", "deep", "room", 2, 60, 90, 24, 16, [{ id: "lazarus-bench", kind: "lab-bench" }, { id: "final-file", kind: "final-file" }, log("deep-terminal")]),
    r("deep-office", "Director Office", "deep", "room", 2, 84, 90, 10, 10, [log("director-terminal")]),
    r("tunnel-junction", "Tunnel Junction", "deep", "corridor", 2, 38, 52, 14, 12),
    r("service-tunnel", "Service Tunnel", "deep", "corridor", 2, 44, 64, 8, 26),
    r("far-tunnels", "The Far Tunnels", "deep", "corridor", 2, 0, 54, 38, 8, [{ id: "tunnel-route", kind: "route-map" }]),
  ],
  doors: [
    // lobby
    { id: "vault", kind: "vault", a: "vault-chamber", b: "outside", name: "The Vault Door" },
    { id: "chamber-reception", kind: "doorway", a: "vault-chamber", b: "reception" },
    { id: "reception-desk", kind: "doorway", a: "reception", b: "security-desk" },
    { id: "reception-decon", kind: "door", a: "reception", b: "decon-entry" },
    { id: "decon-residential", kind: "doorway", a: "decon-entry", b: "res-corridor" },
    // residential
    { id: "res-bunks-a", kind: "door", a: "res-corridor", b: "bunks-a" },
    { id: "res-bunks-b", kind: "door", a: "res-corridor", b: "bunks-b" },
    { id: "res-showers", kind: "door", a: "res-corridor", b: "showers" },
    { id: "res-rec", kind: "door", a: "res-corridor", b: "rec-room" },
    { id: "res-canteen", kind: "doorway", a: "res-corridor", b: "canteen" },
    { id: "canteen-kitchen", kind: "door", a: "canteen", b: "kitchen" },
    { id: "kitchen-stores", kind: "door", a: "kitchen", b: "stores" },
    { id: "rec-panic", kind: "sealed", a: "rec-room", b: "panic-room" },
    { id: "safe-res-door", kind: "safe", a: "res-corridor", b: "safe-res", name: "Dormitory Safe Room" },
    // into the labs (stage 2)
    { id: "decon-labs", kind: "keycard", tier: 1, a: "decon-entry", b: "labs-corridor", name: "Research Labs" },
    { id: "labs-break", kind: "door", a: "labs-corridor", b: "break-room" },
    { id: "labs-offices", kind: "door", material: "glass", a: "labs-corridor", b: "glass-offices" },
    { id: "labs-conference", kind: "door", material: "glass", a: "labs-corridor", b: "conference" },
    { id: "labs-server", kind: "door", a: "labs-corridor", b: "server-room" },
    { id: "labs-airlock", kind: "power", zone: "labs", a: "labs-corridor", b: "airlock", name: "Airlock (outer)" },
    { id: "airlock-shower", kind: "power", zone: "labs", a: "airlock", b: "decon-shower", name: "Airlock (inner)" },
    { id: "shower-suits", kind: "doorway", a: "decon-shower", b: "suit-room" },
    { id: "suits-lab-a", kind: "power", zone: "labs", material: "glass", a: "suit-room", b: "clean-lab-a", name: "Clean Lab A" },
    { id: "lab-a-lab-b", kind: "doorway", a: "clean-lab-a", b: "clean-lab-b" },
    { id: "lab-a-storage", kind: "door", a: "clean-lab-a", b: "lab-storage" },
    // into medical (stage 2)
    { id: "res-medical", kind: "keycard", tier: 1, a: "res-corridor", b: "med-corridor", name: "Medical & Quarantine" },
    { id: "med-hall-link", kind: "doorway", a: "med-corridor", b: "med-hall" },
    { id: "med-pharmacy", kind: "door", a: "med-hall", b: "pharmacy" },
    { id: "med-exam", kind: "door", a: "med-hall", b: "exam-rooms" },
    { id: "med-office-door", kind: "door", a: "med-hall", b: "med-office" },
    { id: "med-lounge", kind: "door", a: "med-hall", b: "staff-lounge" },
    { id: "med-ward", kind: "door", a: "med-hall", b: "ward" },
    { id: "ward-operating", kind: "door", a: "ward", b: "operating" },
    { id: "med-morgue", kind: "door", a: "med-hall", b: "morgue" },
    { id: "morgue-cold", kind: "sealed", a: "morgue", b: "cold-storage" },
    { id: "med-quarantine", kind: "door", a: "med-hall", b: "quarantine" },
    { id: "quarantine-cell-door", kind: "sealed", a: "quarantine", b: "quarantine-cell" },
    { id: "safe-med-door", kind: "safe", findTier: 2, a: "med-hall", b: "safe-med", name: "Medical Staff Safe Room" },
    // into security (stage 3)
    { id: "medical-security", kind: "keycard", tier: 2, a: "med-hall", b: "sec-corridor", name: "Security" },
    { id: "sec-lockers-door", kind: "door", a: "sec-corridor", b: "sec-lockers" },
    { id: "sec-interview", kind: "door", a: "sec-corridor", b: "interview" },
    { id: "sec-office-door", kind: "door", a: "sec-corridor", b: "sec-office" },
    { id: "sec-control", kind: "door", a: "sec-corridor", b: "control-room" },
    { id: "sec-armoury", kind: "keycard", tier: 3, a: "sec-corridor", b: "armoury", name: "Armoury" },
    { id: "sec-cameras", kind: "door", a: "sec-corridor", b: "camera-room" },
    { id: "sec-holding", kind: "door", a: "sec-corridor", b: "holding" },
    { id: "holding-cell-door", kind: "sealed", a: "holding", b: "holding-cell" },
    // into power (stage 3), through the stores' maintenance door and down the service stairs
    { id: "stores-service", kind: "keycard", tier: 2, a: "stores", b: "service-stairs", name: "Maintenance" },
    { id: "stairs-generators", kind: "doorway", a: "service-stairs", b: "generator-hall" },
    { id: "generators-boiler", kind: "door", a: "generator-hall", b: "boiler" },
    { id: "boiler-lockup", kind: "sealed", a: "boiler", b: "maint-lockup" },
    { id: "boiler-workshop", kind: "door", a: "boiler", b: "workshop" },
    { id: "generators-catwalks", kind: "doorway", a: "generator-hall", b: "catwalks" },
    { id: "generators-pipes", kind: "doorway", a: "generator-hall", b: "pipe-gallery" },
    { id: "pipes-pump", kind: "door", a: "pipe-gallery", b: "pump-room" },
    { id: "safe-power-door", kind: "safe", findTier: 2, a: "catwalks", b: "safe-power", name: "Maintenance Crew Safe Room" },
    // into containment (stage 4), down the containment stairs
    { id: "security-containment", kind: "keycard", tier: 3, a: "sec-corridor", b: "containment-stairs", name: "Specimen Containment" },
    { id: "stairs-observation", kind: "doorway", a: "containment-stairs", b: "observation" },
    { id: "observation-cryo", kind: "power", zone: "containment", a: "observation", b: "cryo-hall", name: "Cryo Hall" },
    { id: "specimen-cell-doors", kind: "lockdown", zone: "containment", a: "observation", b: "specimen-cells", name: "Specimen Cells" },
    { id: "specimen-storage", kind: "door", a: "specimen-cells", b: "sample-storage" },
    { id: "cryo-pod-door", kind: "sealed", a: "cryo-hall", b: "cryo-pod" },
    // into the deep (stage 4): the freight lift, or the tunnels
    { id: "cryo-deep", kind: "keycard", tier: 3, a: "cryo-hall", b: "freight-lift", name: "The Deep Lab" },
    { id: "lift-deep", kind: "power", zone: "deep", a: "freight-lift", b: "deep-corridor", name: "Freight Lift (lower gate)" },
    { id: "deep-lab-door", kind: "power", zone: "deep", a: "deep-corridor", b: "deep-lab", name: "The Deep Lab" },
    { id: "deep-lab-office", kind: "door", a: "deep-lab", b: "deep-office" },
    { id: "pipes-tunnels", kind: "grate", a: "pipe-gallery", b: "tunnel-junction", name: "Maintenance Grate" },
    { id: "junction-far", kind: "doorway", a: "tunnel-junction", b: "far-tunnels" },
    { id: "junction-service", kind: "doorway", a: "tunnel-junction", b: "service-tunnel" },
    { id: "junction-deep", kind: "door", a: "service-tunnel", b: "deep-corridor" },
    // vents: nimble 7+ only
    { id: "vent-stores-labs", kind: "vent", a: "stores", b: "labs-corridor" },
    { id: "vent-ward-cameras", kind: "vent", a: "ward", b: "camera-room" },
    { id: "vent-boiler-cryo", kind: "vent", a: "boiler", b: "cryo-hall" },
  ],
};
