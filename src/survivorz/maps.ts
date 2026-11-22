// SOLACE SURVIVORZ — THE MAPS A RUN CAN BE STARTED ON (Josh, Nov 3 2026: "a level selector in the panel
// so that as we make new maps in the future with objectives etc i can just swap the stream to that map
// and run it"). Admin Panel → Survivorz → Show lists these; the start lever names one, and the
// broadcast keeps it beside the run (through a restart and a reset) and reports it in its status.
//
// A NEW MAP is an entry here plus the map's own pieces the simulation reads, as one MapDef under the same id
// (sim/mapdef.ts: its rooms and doors, its start rooms and objective spots, where the dead stand and come from)
// and its baked set. A SimWorld is made on a map by that id (SimOptions.map) — the panel, the levers, the stream
// button, the broadcast and the save all carry it.
import { mapDef } from "./sim/mapdef";
import { OBJ } from "./sim/goals";

export interface ShowMap {
  id: string;
  name: string;
  /** one line for the picker */
  blurb: string;
  /** what the survivors must do, in the order the show counts them */
  objectives: string[];
  /** how long a run lasts, minutes (the hour on the overlay's clock) */
  minutes: number;
  /** how many survivors it can start with: one per start room, never two in one */
  maxCast: number;
  /** a map still being built: listed, but a run can't start on it */
  building?: boolean;
  /** WHERE THEY ARE, as any survivor on this map could tell it — the AI is told this, beside their sheet. A MAP
   *  OWNS IT (Nov 5 2026: a character no longer carries an "outside/inside" of its own). No secret of the map
   *  goes here: what they find out arrives as FACTS. */
  world: string;
}

export const SHOW_MAPS: readonly ShowMap[] = [
  {
    id: "bunker",
    name: "Civil Defence Shelter 14",
    blurb: "A 1960s bunker, refitted. Woken by the alarm in the night; the dead are already inside.",
    objectives: ["Crank the blast door shut", "Clear the bunker", "Fix the radio", "Make the call"],
    minutes: Math.round(OBJ.showMs / 60_000),
    maxCast: mapDef("bunker").startRooms.length,
    world: `WHERE YOU ARE. The dead are walking: a sickness took the city in weeks, and the bitten die and get back up. You found your way down into Civil Defence Shelter 14 on your own in the last few weeks, a 1960s fallout shelter under the city, refitted with white panels and LED lights, and you've been holed up here since. There are a few others down here; you've barely spoken to them, if at all. Tonight an alarm woke you: the blast door at the entrance has given way and the dead are already inside. You have what you went to sleep with, and whatever you can find.`,
  },
  // GLENRIDGE HALL (docs/survivorz/GLENRIDGE.md): the house and its grounds are built, baked and walked, and the
  // simulation plays its objectives (sim/scenarios/glenridge.ts; scripts/survivorz/glenridge/test-show.mjs), and
  // the show page draws it (GLENRIDGE.md, S4): a run can be started on it.
  {
    id: "glenridge",
    name: "Glenridge Hall",
    blurb: "A 1929 Tudor mansion on a storm night, lamps lit, the front door open. The dead are in the grounds.",
    objectives: ["Survive until the clock runs out"],
    minutes: Math.round(OBJ.showMs / 60_000),
    maxCast: mapDef("glenridge").startRooms.length,
    world: "WHERE YOU ARE. The dead are walking: a sickness took the city in weeks, and the bitten die and get back up. You got out on foot and have kept to the back roads since, moving at night. Tonight a storm caught you in the woods north of the city, and there were lights through the trees: Glenridge Hall, a great Tudor house of the 1920s standing in its own grounds, every lamp lit and its front door wide open. You don't know whose house it is, or who lit the lamps. You don't know the others coming up the drive either: strangers, soaked through like you. The dead are in the grounds, and the rain hides how many. Nobody is coming for you: all there is to do is live through the night.",
  },
];

export const DEFAULT_MAP = SHOW_MAPS[0].id;
export const mapById = (id: string | null | undefined): ShowMap | undefined => SHOW_MAPS.find((m) => m.id === id);
