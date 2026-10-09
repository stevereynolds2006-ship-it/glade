export const N = 39;
export const CX = 19;
export const CY = 19;

export const WALL = 0;
export const FLOOR = 1;
export const GLADE = 2;
export const GATE = 3;

export const BEACONS = [
  [19, 5],
  [33, 19],
  [19, 33],
  [5, 19],
  [7, 7],
  [31, 7],
  [31, 31],
  [7, 31],
] as const;

export function buildMaze() {
  return "see local game";
}
