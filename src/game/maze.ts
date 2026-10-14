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

export const SECTION_NAMES = [
  "Ash",
  "Vine",
  "Iron",
  "Bloom",
  "Static",
  "Hollow",
  "Cinder",
  "Glass",
] as const;

export const EXITS = [
  [3, 3],
  [35, 3],
  [35, 35],
  [3, 35],
] as const;

export type MazeProp = { x: number; y: number; kind: "tree" | "pine" | "stone" | "lamp" };

export type Maze = {
  tiles: Uint8Array;
  glow: Uint8Array;
  props: MazeProp[];
  exitX: number;
  exitY: number;
  portals: { x: number; y: number }[];
  span: number;
  beacons: [number, number][];
};

export const WIDE = 55;

let gridN = N;
let gridC = CX;
let gridBeacons: [number, number][] = BEACONS.map(([x, y]) => [x, y]);
let gridExits: [number, number][] = EXITS.map(([x, y]) => [x, y]);

const at = (x: number, y: number) => y * gridN + x;

function fit(x: number, y: number, span: number): [number, number] {
  if (span === N) return [x, y];
  const s = (span - 1) / (N - 1);
  return [
    Math.max(2, Math.min(span - 3, Math.round(x * s))),
    Math.max(2, Math.min(span - 3, Math.round(y * s))),
  ];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(x: number, y: number, s: number) {
  let n = Math.imul(x ^ s, 374761393) ^ Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return n >>> 0;
}

export function buildMaze(
  seed: number,
  exitWing: number,
  shape?: "cowl" | "mint" | "rift" | "grav" | "gear",
  span = N,
  loose = false,
  walls = 0,
): Maze {
  gridN = span;
  gridC = (span - 1) / 2;
  gridBeacons = BEACONS.map(([x, y]) => fit(x, y, span));
  gridExits = EXITS.map(([x, y]) => fit(x, y, span));
  const rand = mulberry32(seed >>> 0);
  const tiles = new Uint8Array(gridN * gridN);
  const odds: number[] = [];
  for (let i = 1; i < gridN - 3; i += 3) odds.push(i);
  const startX = odds[(rand() * odds.length) | 0];
  const startY = odds[(rand() * odds.length) | 0];
  const wide = () => walls <= 0 || rand() >= walls;
  const carveRoom = (x: number, y: number) => {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        if ((dx !== 0 || dy !== 0) && !wide()) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx > 0 && ny > 0 && nx < gridN - 1 && ny < gridN - 1) tiles[at(nx, ny)] = FLOOR;
      }
    }
  };
  const carveGap = (x: number, y: number, dx: number, dy: number) => {
    const extra = wide();
    if (dx > 0) {
      tiles[at(x + 1, y)] = FLOOR;
      tiles[at(x + 2, y)] = FLOOR;
      if (extra && y + 1 < gridN - 1) {
        tiles[at(x + 1, y + 1)] = FLOOR;
        tiles[at(x + 2, y + 1)] = FLOOR;
      }
    } else if (dx < 0) {
      tiles[at(x - 1, y)] = FLOOR;
      if (extra && y + 1 < gridN - 1) tiles[at(x - 1, y + 1)] = FLOOR;
    } else if (dy > 0) {
      tiles[at(x, y + 1)] = FLOOR;
      tiles[at(x, y + 2)] = FLOOR;
      if (extra && x + 1 < gridN - 1) {
        tiles[at(x + 1, y + 1)] = FLOOR;
        tiles[at(x + 1, y + 2)] = FLOOR;
      }
    } else {
      tiles[at(x, y - 1)] = FLOOR;
      if (extra && x + 1 < gridN - 1) tiles[at(x + 1, y - 1)] = FLOOR;
    }
  };
  carveRoom(startX, startY);
  const stack: [number, number][] = [[startX, startY]];
  const dirs = [
    [0, -3],
    [3, 0],
    [0, 3],
    [-3, 0],
  ] as const;
  const straight = 0.58;
  let last: (typeof dirs)[number] | null = null;

  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const options: (typeof dirs)[number][] = [];
    for (const d of dirs) {
      const nx = x + d[0];
      const ny = y + d[1];
      if (nx > 0 && ny > 0 && nx < gridN - 3 && ny < gridN - 3 && tiles[at(nx, ny)] === WALL) {
        options.push(d);
      }
    }
    if (!options.length) {
      stack.pop();
      last = null;
      continue;
    }
    let d = options[(rand() * options.length) | 0];
    if (last && rand() < straight) {
      const kept = options.find((option) => option[0] === last![0] && option[1] === last![1]);
      if (kept) d = kept;
    }
    last = d;
    carveGap(x, y, d[0], d[1]);
    carveRoom(x + d[0], y + d[1]);
    stack.push([x + d[0], y + d[1]]);
  }

  const punches = 12 + ((rand() * 14) | 0);
  let opened = 0;
  for (let tries = 0; tries < 500 && opened < punches; tries++) {
    const x = 1 + ((rand() * (gridN - 2)) | 0);
    const y = 1 + ((rand() * (gridN - 2)) | 0);
    if (tiles[at(x, y)] !== WALL) continue;
    const across =
      (tiles[at(x - 1, y)] === FLOOR && tiles[at(x + 1, y)] === FLOOR) ||
      (tiles[at(x, y - 1)] === FLOOR && tiles[at(x, y + 1)] === FLOOR);
    if (!across) continue;
    tiles[at(x, y)] = FLOOR;
    opened++;
  }

  const glow = new Uint8Array(gridN * gridN);
  for (let y = gridC - 4; y <= gridC + 4; y++) {
    for (let x = gridC - 4; x <= gridC + 4; x++) {
      tiles[at(x, y)] = GLADE;
      glow[at(x, y)] = 1;
    }
  }

  for (let x = gridC - 5; x <= gridC + 5; x++) {
    tiles[at(x, gridC - 5)] = WALL;
    tiles[at(x, gridC + 5)] = WALL;
  }
  for (let y = gridC - 4; y <= gridC + 4; y++) {
    tiles[at(gridC - 5, y)] = WALL;
    tiles[at(gridC + 5, y)] = WALL;
  }

  const gates: [number, number][] = [
    [gridC, gridC - 5],
    [gridC, gridC + 5],
    [gridC - 5, gridC],
    [gridC + 5, gridC],
  ];
  const stubs: [number, number][] = [
    [gridC, gridC - 6],
    [gridC, gridC + 6],
    [gridC - 6, gridC],
    [gridC + 6, gridC],
  ];
  for (const [x, y] of gates) tiles[at(x, y)] = GATE;
  for (const [x, y] of stubs) tiles[at(x, y)] = FLOOR;

  for (const [bx, by] of gridBeacons) {
    for (let y = by - 1; y <= by + 1; y++) {
      for (let x = bx - 1; x <= bx + 1; x++) {
        if (x <= 0 || y <= 0 || x >= gridN - 1 || y >= gridN - 1) continue;
        if (Math.abs(x - gridC) <= 5 && Math.abs(y - gridC) <= 5) continue;
        if (tiles[at(x, y)] === WALL) tiles[at(x, y)] = FLOOR;
        if (glow[at(x, y)] === 0) glow[at(x, y)] = 2;
      }
    }
    const stub = stubs.reduce((best, candidate) => {
      const [sx, sy] = candidate;
      const [bx0, by0] = best;
      const da = Math.abs(sx - bx) + Math.abs(sy - by);
      const db = Math.abs(bx0 - bx) + Math.abs(by0 - by);
      return da < db ? candidate : best;
    });
    if (!canReach(tiles, bx, by)) digTo(tiles, bx, by, stub[0], stub[1]);
  }

  const picked = gridExits[((exitWing % 4) + 4) % 4];
  const exit: [number, number] = [picked[0], picked[1]];
  for (let y = exit[1] - 1; y <= exit[1] + 1; y++) {
    for (let x = exit[0] - 1; x <= exit[0] + 1; x++) {
      if (x <= 0 || y <= 0 || x >= gridN - 1 || y >= gridN - 1) continue;
      if (Math.abs(x - gridC) <= 5 && Math.abs(y - gridC) <= 5) continue;
      if (tiles[at(x, y)] === WALL) tiles[at(x, y)] = FLOOR;
    }
  }
  if (!canReach(tiles, exit[0], exit[1])) {
    const stub = stubs.reduce((best, candidate) => {
      const da = Math.abs(candidate[0] - exit[0]) + Math.abs(candidate[1] - exit[1]);
      const db = Math.abs(best[0] - exit[0]) + Math.abs(best[1] - exit[1]);
      return da < db ? candidate : best;
    });
    digTo(tiles, exit[0], exit[1], stub[0], stub[1]);
  }

  const props: MazeProp[] = [];
  for (let y = 1; y < gridN - 1; y++) {
    for (let x = 1; x < gridN - 1; x++) {
      const t = tiles[at(x, y)];
      const g = glow[at(x, y)];
      if (t !== GLADE && t !== FLOOR && g !== 2) continue;
      if (Math.abs(x - gridC) <= 1 && Math.abs(y - gridC) <= 1) continue;
      if (gridBeacons.some(([bx, by]) => bx === x && by === y)) continue;
      if (x === exit[0] && y === exit[1]) continue;
      const n = mix(x, y, seed);
      const byWall =
        tiles[at(x + 1, y)] === WALL ||
        tiles[at(x - 1, y)] === WALL ||
        tiles[at(x, y + 1)] === WALL ||
        tiles[at(x, y - 1)] === WALL;
      if (t === GLADE && n % 4 === 0) props.push({ x, y, kind: "tree" });
      else if (g === 2 && n % 2 === 0) props.push({ x, y, kind: "pine" });
      else if (t === FLOOR && g === 0 && byWall && n % 9 === 0) props.push({ x, y, kind: "stone" });
      else if (t === FLOOR && g === 0 && byWall && n % 19 === 0) props.push({ x, y, kind: "lamp" });
    }
  }

  if (loose && walls < 0.2) widenHalls(tiles);
  if (shape === "cowl") sealCowl(tiles, glow, props, exit);
  if (shape === "mint") stampCoins(tiles);
  if (shape === "grav") stampGravDoors(tiles);
  if (shape === "gear") stampGear(tiles, glow, props, exit, seed, walls);
  const portals = shape === "rift" ? stampRifts(tiles) : [];

  return { tiles, glow, props, exitX: exit[0], exitY: exit[1], portals, span: gridN, beacons: gridBeacons };
}

function stampGravDoors(tiles: Uint8Array) {
  const doors: [number, number, boolean][] = [
    [gridC, 2, true],
    [gridN - 3, gridC, false],
    [gridC, gridN - 3, true],
    [2, gridC, false],
  ];
  for (const [x, y, horizontal] of doors) {
    for (let k = -1; k <= 1; k++) {
      const tx = x + (horizontal ? k : 0);
      const ty = y + (horizontal ? 0 : k);
      if (tx <= 0 || ty <= 0 || tx >= gridN - 1 || ty >= gridN - 1) continue;
      if (tiles[at(tx, ty)] !== GLADE) tiles[at(tx, ty)] = FLOOR;
    }
    if (!canReach(tiles, x, y)) digTo(tiles, x, y, gridC, gridC);
  }
}

function widenHalls(tiles: Uint8Array) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  for (let y = 2; y < gridN - 2; y++) {
    for (let x = 2; x < gridN - 2; x++) {
      if (tiles[at(x, y)] !== WALL) continue;
      if (Math.abs(x - gridC) <= 5 && Math.abs(y - gridC) <= 5) continue;
      let floors = 0;
      for (const [dx, dy] of dirs) {
        if (tiles[at(x + dx, y + dy)] === FLOOR) floors += 1;
      }
      if (floors !== 1) continue;
      const beside = tiles[at(x - 1, y)] === FLOOR || tiles[at(x, y - 1)] === FLOOR;
      if (!beside) continue;
      tiles[at(x, y)] = FLOOR;
    }
  }
}

function stampRifts(tiles: Uint8Array) {
  const zones = (
    [
      [2, 2, 14, 14],
      [24, 2, 36, 14],
      [2, 24, 36, 36],
      [24, 24, 36, 36],
    ] as [number, number, number, number][]
  ).map(([x0, y0, x1, y1]) => {
    const a = fit(x0, y0, gridN);
    const b = fit(x1, y1, gridN);
    return [a[0], a[1], b[0], b[1]] as [number, number, number, number];
  });
  const portals: { x: number; y: number }[] = [];
  for (const [x0, y0, x1, y1] of zones) {
    let pick: { x: number; y: number } | null = null;
    for (let y = y0; y <= y1 && !pick; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (tiles[at(x, y)] !== FLOOR) continue;
        if (Math.abs(x - gridC) <= 6 && Math.abs(y - gridC) <= 6) continue;
        pick = { x, y };
        break;
      }
    }
    if (pick) portals.push(pick);
  }
  if (portals.length % 2 === 1) portals.pop();
  return portals;
}

const COIN = [
  "...#####...",
  "..#.....#..",
  ".#.#####.#.",
  "#.#.....#.#",
  "#.#.#.#.#.#",
  "#.#.....#.#",
  "#.#.#####.#",
  ".#.......#.",
  "..#.....#..",
  "...#####...",
  ".....#.....",
];

function stampCoins(tiles: Uint8Array) {
  const spots: [number, number][] = [
    [2, 2],
    [26, 2],
    [2, 26],
    [26, 26],
  ].map(([x, y]) => fit(x, y, gridN));
  for (const [ox, oy] of spots) {
    for (let y = 0; y < COIN.length; y++) {
      const row = COIN[y];
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== "#") continue;
        const tx = ox + x;
        const ty = oy + y;
        if (tx <= 0 || ty <= 0 || tx >= gridN - 1 || ty >= gridN - 1) continue;
        if (Math.abs(tx - gridC) <= 6 && Math.abs(ty - gridC) <= 6) continue;
        if (tiles[at(tx, ty)] === GATE || tiles[at(tx, ty)] === GLADE) continue;
        if (gridBeacons.some(([bx, by]) => Math.max(Math.abs(tx - bx), Math.abs(ty - by)) <= 1)) continue;
        tiles[at(tx, ty)] = WALL;
      }
    }
  }
  for (const [bx, by] of gridBeacons) {
    if (!canReach(tiles, bx, by)) digTo(tiles, bx, by, gridC, gridC);
  }
}

export function inGear(x: number, y: number, span = N) {
  const c = (span - 1) / 2;
  const dx = x + 0.5 - c;
  const dy = y + 0.5 - c;
  const dist = Math.hypot(dx, dy);
  const radius = span * 0.44;
  if (dist <= radius) return true;
  if (dist > radius + 2.4) return false;
  const ang = Math.atan2(dy, dx);
  const tooth = ((ang / (Math.PI * 2)) * 26 + 26) % 1;
  return tooth < 0.42;
}

function stampGear(tiles: Uint8Array, glow: Uint8Array, props: MazeProp[], exit: [number, number], seed: number, walls = 0) {
  const radius = gridN * 0.44;
  const turn = ((seed % 628) / 100);
  const step = 0.85 + (seed % 5) * 0.18;
  const period = 3.6 + ((seed >>> 6) % 3) * 0.4;
  const gaps = 2 + (seed % 2);
  for (let y = 0; y < gridN; y++) {
    for (let x = 0; x < gridN; x++) {
      if (Math.max(Math.abs(x - gridC), Math.abs(y - gridC)) <= 5) continue;
      const dx = x + 0.5 - gridC;
      const dy = y + 0.5 - gridC;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) {
        tiles[at(x, y)] = WALL;
        glow[at(x, y)] = 0;
        continue;
      }
      const from = dist - 6.4;
      if (from < 1.2) {
        if (tiles[at(x, y)] !== GATE) tiles[at(x, y)] = FLOOR;
        continue;
      }
      const phase = from % period;
      const ring = Math.floor(from / period);
      const ang = Math.atan2(dy, dx);
      let open = phase > period * (0.18 + walls * 0.24);
      const turned = Math.atan2(Math.sin(ang - ring * step - turn), Math.cos(ang - ring * step - turn));
      const slot = (turned + Math.PI) / (Math.PI * 2);
      const mark = (slot * gaps) % 1;
      if (!open && (mark < 0.18 || mark > 0.82)) open = true;
      const blocked = (seed >>> (ring % 12)) & 1;
      if (open && blocked) {
        const block = Math.atan2(Math.sin(ang * (2 + (seed % 3)) + ring + turn), Math.cos(ang * (2 + (seed % 3)) + ring + turn));
        if (Math.abs(block) < 0.2 && phase > period * 0.45 && phase < period * 0.85) open = false;
      }
      if (tiles[at(x, y)] === GATE || tiles[at(x, y)] === GLADE) continue;
      tiles[at(x, y)] = open ? FLOOR : WALL;
      if (!open) glow[at(x, y)] = 0;
    }
  }
  for (const [x, y] of [
    [gridC, gridC - 6],
    [gridC, gridC + 6],
    [gridC - 6, gridC],
    [gridC + 6, gridC],
  ] as [number, number][]) {
    if (tiles[at(x, y)] === WALL) tiles[at(x, y)] = FLOOR;
  }
  const park = (point: [number, number]) => {
    let x = point[0];
    let y = point[1];
    for (let n = 0; n < 30; n++) {
      const dx = x + 0.5 - gridC;
      const dy = y + 0.5 - gridC;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < radius - 1.2 && x > 0 && y > 0 && x < gridN && y < gridN && tiles[at(x, y)] !== WALL) break;
      const scale = Math.max(0.15, (dist - 1.15) / dist);
      x = Math.max(2, Math.min(gridN - 3, Math.round(gridC - 0.5 + dx * scale)));
      y = Math.max(2, Math.min(gridN - 3, Math.round(gridC - 0.5 + dy * scale)));
    }
    point[0] = x;
    point[1] = y;
    for (let yy = y - 1; yy <= y + 1; yy++) {
      for (let xx = x - 1; xx <= x + 1; xx++) {
        if (xx <= 0 || yy <= 0 || xx >= gridN - 1 || yy >= gridN - 1) continue;
        if (Math.max(Math.abs(xx - gridC), Math.abs(yy - gridC)) <= 5) continue;
        if (tiles[at(xx, yy)] === WALL) tiles[at(xx, yy)] = FLOOR;
      }
    }
    if (!canReach(tiles, x, y)) digTo(tiles, x, y, gridC, gridC);
  };
  for (const beacon of gridBeacons) park(beacon);
  park(exit);
  for (let i = props.length - 1; i >= 0; i--) {
    const prop = props[i];
    if (!inGear(prop.x, prop.y, gridN) || tiles[at(prop.x, prop.y)] === WALL) props.splice(i, 1);
  }
}

export function inCowl(x: number, y: number, span = N) {
  const cx = (span - 1) / 2;
  const scale = span / N;
  const nx = (x - cx) / (18 * scale);
  const ny = (y - cx) / (17 * scale);
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  if (ax < 0.22 && ay < 0.92) return true;
  if (ax < 0.16 && ny < -0.55 && ny > -1.05) return true;
  const wing = 0.78 * Math.pow(Math.max(0, 1 - ax), 0.55) - 0.08;
  if (ax <= 1.02 && ay < wing && ay < 0.72) return true;
  const s = (span - 1) / (N - 1);
  for (const [bx, by] of BEACONS) {
    const px = Math.round(bx * s);
    const py = Math.round(by * s);
    if (Math.max(Math.abs(x - px), Math.abs(y - py)) <= 1) return true;
  }
  return false;
}

function sealCowl(
  tiles: Uint8Array,
  glow: Uint8Array,
  props: MazeProp[],
  exit: [number, number],
) {
  for (let y = 0; y < gridN; y++) {
    for (let x = 0; x < gridN; x++) {
      if (inCowl(x, y, gridN)) continue;
      tiles[at(x, y)] = WALL;
      glow[at(x, y)] = 0;
    }
  }
  for (let i = props.length - 1; i >= 0; i--) {
    if (!inCowl(props[i].x, props[i].y, gridN)) props.splice(i, 1);
  }
  const tips: [number, number][] = [
    [2, gridC],
    [gridN - 3, gridC],
    [gridC, 3],
    [gridC, gridN - 4],
  ];
  const tip = tips[((exit[0] + exit[1]) % 4 + 4) % 4];
  exit[0] = tip[0];
  exit[1] = tip[1];
  for (const [bx, by] of [...gridBeacons, tip]) {
    for (let y = by - 1; y <= by + 1; y++) {
      for (let x = bx - 1; x <= bx + 1; x++) {
        if (x <= 0 || y <= 0 || x >= gridN - 1 || y >= gridN - 1) continue;
        if (Math.abs(x - gridC) <= 5 && Math.abs(y - gridC) <= 5) continue;
        if (tiles[at(x, y)] === WALL) tiles[at(x, y)] = FLOOR;
        if (glow[at(x, y)] === 0 && gridBeacons.some(([px, py]) => px === bx && py === by)) glow[at(x, y)] = 2;
      }
    }
    if (!canReach(tiles, bx, by)) digTo(tiles, bx, by, gridC, gridC);
  }
}

function canReach(tiles: Uint8Array, tx: number, ty: number) {
  const seen = new Uint8Array(gridN * gridN);
  const queue: [number, number][] = [[gridC, gridC]];
  seen[at(gridC, gridC)] = 1;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    if (x === tx && y === ty) return true;
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= gridN || ny >= gridN || seen[at(nx, ny)]) continue;
      if (tiles[at(nx, ny)] === WALL) continue;
      seen[at(nx, ny)] = 1;
      queue.push([nx, ny]);
    }
  }
  return false;
}

function digTo(tiles: Uint8Array, x0: number, y0: number, x1: number, y1: number) {
  let x = x0;
  let y = y0;
  for (let steps = 0; steps < gridN * 4 && (x !== x1 || y !== y1); steps++) {
    if (Math.abs(x1 - x) >= Math.abs(y1 - y)) x += Math.sign(x1 - x);
    else y += Math.sign(y1 - y);
    if (x <= 0 || y <= 0 || x >= gridN - 1 || y >= gridN - 1) break;
    if (Math.abs(x - gridC) <= 5 && Math.abs(y - gridC) <= 5) continue;
    const t = tiles[at(x, y)];
    if (t === GATE || t === GLADE) continue;
    tiles[at(x, y)] = FLOOR;
  }
}
