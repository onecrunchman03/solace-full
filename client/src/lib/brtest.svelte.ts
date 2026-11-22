// PLAY THE DRAFT: the map editor starts a test run of a level and hands over
// to the Backrooms hub, which opens that level's loadout straight away. One
// small shared note between the two views.
export const brTest = $state<{ level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | null }>({ level: null });
