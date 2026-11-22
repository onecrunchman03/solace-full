// THE HALL, AS THE SERVER KNOWS IT: its size (floor.ts clamps every body to
// it) and where a body walks in. It mirrors client/src/casino/layout.ts,
// which the server can't import (it is outside the server's build).
//
// One hall: THE BOULEVARD (36 × 22, Classic Vegas). The AI regulars' walking
// graph, spots and seats lived here until they were removed (Nov 2026); git
// history has them.
//
// Units are the floor's cells (2 m), x east, y south — layout.ts's.

export const HALL_W = 36;
export const HALL_H = 22;
export const ENTRANCE = { x: 18, y: 20.2 };
