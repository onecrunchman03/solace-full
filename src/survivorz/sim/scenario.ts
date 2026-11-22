// SOLACE SURVIVORZ — A MAP'S OWN OBJECTIVES (Nov 2026, the second map's stage 2).
//
// The bunker's objectives (the crank, the radio, the call) are written into goals.ts, world.ts and survivor.ts,
// and stay there. A map that is not the bunker brings its objectives as a SCENARIO: what work there is to offer a
// survivor, what a pair of hands on a thing does each second, what a search of the map's own spots turns up, when
// the show ends, and the rows the overlay draws. The world and the survivors call it at a handful of places
// (`w.scn?.…`); with no scenario (the bunker) none of them runs and nothing changes.
//
// A scenario keeps its run's state in `w.sc`: plain data, saved and resumed with the world.
import type { Job, SimWorld, Survivor } from "./world";
import type { Goals } from "./wire";
import { GLENRIDGE_SCENARIO } from "./scenarios/glenridge";

export type AddJob = (score: number, label: string, job: Omit<Job, "since" | "phase" | "until"> & { until?: number }, id?: string) => void;
/** what the job menu has already worked out about the one choosing */
export interface MenuHelp { dist(cell: number): number; danger(room: number): number; fighter: boolean; armed: boolean }

export interface Scenario {
  id: string;
  /** a room that is not the place they are holding (the grounds, an open porch): not swept, not run to from indoors */
  outside?(w: SimWorld, room: number): boolean;
  /** a fresh run's state (becomes `w.sc`) */
  init(w: SimWorld): unknown;
  /** once the cast and the dead are placed: what they know at the start, anybody the map itself places */
  setup(w: SimWorld): void;
  /** the map's own work, added to a survivor's job menu */
  menu(w: SimWorld, s: Survivor, add: AddJob, h: MenuHelp): void;
  /** may this "task" job still be done? */
  legal(w: SimWorld, s: Survivor, j: Job): boolean;
  /** a "task" job has walked to its spot: hands on */
  start(w: SimWorld, s: Survivor): void;
  /** a second of hands-on is up: keep at it, or stop */
  keep(w: SimWorld, s: Survivor): void;
  /** a search of `spot` is finished: true if the scenario dealt with it (its own spots), false for ordinary loot */
  search(w: SimWorld, s: Survivor, spot: string): boolean;
  /** once a second: the work under every pair of hands, and whatever runs on the clock */
  second(w: SimWorld): void;
  /** once a second, after the work: the ends */
  tick(w: SimWorld): void;
  /** the overlay's view of the objectives */
  goals(w: SimWorld): Goals;
  /** what this survivor knows of the objectives, in plain words, for the talk layer's FACTS */
  facts(w: SimWorld, s: Survivor): string[];
  /** is it dark in this room (night out of doors, a blackout)? */
  dark(w: SimWorld, room: number): boolean;
  /** is the place shut against the dead (the bunker's "sealed")? */
  secured(w: SimWorld): boolean;
  /** a task worth running to */
  urgent(j: Job): boolean;
  /** how far along the task under this survivor's hands is, 0..1 (the bar on the screen of whoever walks the map
   *  by hand: sim/player.ts) */
  progress?(w: SimWorld, s: Survivor): number;
  /** the word the page is given for one of the map's own jobs (the wire's `why`: the cast card names the work and
   *  the body works to suit); absent = the job's kind */
  why?(j: Job): string;
}

const ALL: Record<string, Scenario> = { glenridge: GLENRIDGE_SCENARIO };

/** the scenario of that id, or null (the bunker has none) */
export function scenarioFor(id: string | undefined | null): Scenario | null {
  return (id && ALL[id]) || null;
}
