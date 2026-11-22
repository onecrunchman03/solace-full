// Whether the embedded backrooms game is currently mounted (someone is
// inside a door). Read by the auto-update watcher: a silent app reload
// mid-run would yank a player out of the yellow. Plain module state — tiny
// on purpose so importing it from main-chunk code costs nothing.
export const brGame = { active: false };
