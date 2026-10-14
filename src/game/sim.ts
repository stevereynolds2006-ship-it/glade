import {
  BEACONS,
  buildMaze,
  CX,
  CY,
  FLOOR,
  GATE,
  GLADE,
  N,
  SECTION_NAMES,
  WALL,
  type Maze,
} from "./maze";
import { THEMES } from "./themes";
import { outfitById, type OutfitId } from "./outfits";

export type Phase = "day" | "dusk" | "night" | "dawn";
export type Facing = "down" | "up" | "left" | "right";
export type Outcome = "none" | "win" | "dead";

export type Hud = {
  running: boolean;
  phase: Phase;
  night: number;
  seconds: number;
  ratio: number;
  pulse: number;
  charts: number;
  goal: number;
  shift: number;
  held: boolean;
  quiet: boolean;
  scouted: boolean;
  chance: "buy" | "kept" | "spent";
  wearing: boolean;
  outfit: string;
  theme: string;
  level: number;
  pick: number;
  exitOpen: boolean;
  banner: string;
  outcome: Outcome;
  elapsed: number;
  hint: string;
  paused: boolean;
  parked: boolean;
};

export type Runner = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  homeX: number;
  homeY: number;
  art: number;
  facing: Facing;
  moving: boolean;
};

export type Lurker = {
  x: number;
  y: number;
  nx: number;
  ny: number;
  stuck: number;
  kind: "friend" | "mimic";
  slipped: boolean;
};

const SPEED = 5.5;
const LINK_TIME = 0.8;

const AXIS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const AXIS_OPP = [1, 0, 3, 2, 5, 4];
const FACE_OF_DOWN = [2, 4, 1, 3, 5, 0];
const FACE_NAME = ["Floor", "North wall", "East wall", "South wall", "West wall", "Ceiling"];
const GRAV_BEACON_FACE = [0, 0, 1, 2, 3, 4, 5, 5];

function axisId(v: [number, number, number]) {
  for (let i = 0; i < 6; i++) {
    const a = AXIS[i];
    if (a[0] === v[0] && a[1] === v[1] && a[2] === v[2]) return i;
  }
  return 0;
}

function eastAxis(down: number, north: number) {
  const up = AXIS[AXIS_OPP[down]];
  const n = AXIS[north];
  return axisId([
    n[1] * up[2] - n[2] * up[1],
    n[2] * up[0] - n[0] * up[2],
    n[0] * up[1] - n[1] * up[0],
  ]);
}

function headingAxis(down: number, north: number, dir: number) {
  const east = eastAxis(down, north);
  return [north, east, AXIS_OPP[north], AXIS_OPP[east]][dir];
}

export class Input {
  keys = new Set<string>();
  forced = new Set<string>();
  stickX = 0;
  stickY = 0;
  dest: { x: number; y: number } | null = null;
}

const emptyHud = (): Hud => ({
  running: false,
  phase: "day",
  night: 1,
  seconds: 90,
  ratio: 1,
  pulse: 3,
  charts: 0,
  goal: 5,
  shift: 20,
  held: false,
  quiet: false,
  scouted: false,
  chance: "buy",
  wearing: false,
  outfit: "",
  theme: "Glade",
  level: 0,
  pick: 0,
  exitOpen: false,
  banner: "",
  outcome: "none",
  elapsed: 0,
  hint: "The walls shift. Chart five sections, then take the exit.",
  paused: false,
  parked: false,
});

export class GladeSim {
  readonly input = new Input();
  maze: Maze;
  x = CX + 0.5;
  y = CY + 0.5;
  facing: Facing = "down";
  moving = false;
  yaw = 0;
  speed = 0;
  camX = 0;
  camY = 0;
  shake = 0;
  hurt = 0;
  time = 0;
  rise = 1;
  door = 0;
  link = 0;
  linkAt = -1;
  runners: Runner[] = [];
  lurkers: Lurker[] = [];
  charted = Array<boolean>(8).fill(false);
  pulse = 3;
  running = false;
  phase: Phase = "day";
  phaseT = 0;
  night = 1;
  outcome: Outcome = "none";
  elapsed = 0;
  banner = "";
  bannerT = 0;
  paused = false;
  parked = false;
  hold = false;
  hidden = false;
  reduced = false;
  exitWing = 0;
  theme = 0;
  pending = 0;
  mazeHeld = false;
  quietUntil = 0;
  scouted = false;
  wearing = false;
  outfit: OutfitId | "" = "";
  twist = 0;
  cubeTurns = 0;
  gravSpin = 0;
  gravSign = 1;
  private owned = new Set<OutfitId>();
  private chanceBought = false;
  private chanceLeft = false;
  sounds: string[] = [];
  private runSeed = 18421;
  private stepClock = 0;
  private lurkerClock = 0;
  private shiftT = 0;
  private cubeClock = 0;
  private riftLock = 0;
  private gravDown = 5;
  private gravNorth = 2;
  private gravLock = 0;
  private gravMazes: Maze[] | null = null;
  private shiftN = 0;
  private shiftAnim = 0;
  private hud: Hud = emptyHud();
  private listeners = new Set<() => void>();
  private seen = new Uint32Array(63 * 63);
  private stamp = 1;
  private prev = new Int16Array(63 * 63);
  explored = new Uint8Array(63 * 63);

  constructor() {
    this.exitWing = this.runSeed % 4;
    this.maze = buildMaze(this.runSeed, this.exitWing, this.cowlShape(), this.boardSpan(), this.looseHalls(), this.wallGrow());
    this.camX = worldX(this.x, this.y);
    this.camY = worldY(this.x, this.y);
    this.placeRunners();
    this.publish();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getHud() {
    return this.hud;
  }

  pickLevel(index: number) {
    if (this.running && this.outcome === "none" && !this.parked) return;
    const n = THEMES.length;
    const next = ((index % n) + n) % n;
    if (this.parked) {
      this.pending = next;
      this.publish();
      return;
    }
    this.theme = next;
    this.pending = next;
    if (!this.running) {
      this.exitWing = this.theme % 4;
      this.maze = buildMaze(4100 + this.theme * 97, this.exitWing, this.cowlShape(), this.boardSpan(), this.looseHalls(), this.wallGrow());
      this.explored.fill(0);
      this.x = this.cx() + 0.5;
      this.y = this.cy() + 0.5;
      this.camX = worldX(this.x, this.y);
      this.camY = worldY(this.x, this.y);
    }
    this.publish();
  }

  startRun() {
    if (this.parked) this.theme = this.pending;
    this.parked = false;
    this.runSeed = (this.runSeed * 17 + 29) >>> 0 || 18421;
    this.exitWing = this.runSeed % 4;
    this.maze = buildMaze(this.runSeed, this.exitWing, this.cowlShape(), this.boardSpan(), this.looseHalls(), this.wallGrow());
    this.x = this.cx() + 0.5;
    this.y = this.cy() + 0.5;
    this.facing = "down";
    this.charted = Array<boolean>(8).fill(false);
    this.pulse = 3;
    this.running = true;
    this.phase = "day";
    this.phaseT = 0;
    this.night = 1;
    this.outcome = "none";
    this.elapsed = 0;
    this.rise = 1;
    this.door = 0;
    this.link = 0;
    this.linkAt = -1;
    this.lurkers = [];
    this.shiftT = 0;
    this.twist = 0;
    this.cubeClock = 0;
    this.cubeTurns = 0;
    this.riftLock = 0;
    this.gravDown = 5;
    this.gravNorth = 2;
    this.gravSpin = 0;
    this.gravLock = 0;
    if (THEMES[this.theme]?.style === "grav") {
      this.buildGrav(this.runSeed);
      this.loadGravFace();
    }
    this.shiftN = this.theme;
    this.mazeHeld = false;
    this.quietUntil = 0;
    this.scouted = false;
    this.chanceBought = false;
    this.chanceLeft = false;
    this.explored.fill(0);
    this.shiftAnim = 0;
    this.shake = 0;
    this.hurt = 0;
    this.paused = false;
    this.parked = false;
    this.placeRunners();
    this.input.dest = null;
    this.banner =
      this.theme >= 12
        ? `${THEMES[this.theme].name}. Corrupted Friends are already walking the halls.`
        : this.theme > 0
          ? `${THEMES[this.theme].name}. They wake when you chart the first beacon.`
          : "The doors are open. Take your time.";
    this.bannerT = 2.4;
    this.sounds.push("dawn");
    this.publish();
  }

  togglePause() {
    if (!this.running || this.outcome !== "none") return;
    this.paused = !this.paused;
    if (this.paused) this.speed = 0;
    this.publish();
  }

  pause() {
    if (!this.running || this.outcome !== "none" || this.paused) return;
    this.paused = true;
    this.speed = 0;
    this.moving = false;
    this.publish();
  }

  quitToMenu() {
    if (this.running && this.outcome === "none") {
      this.pending = this.theme;
      this.parked = true;
      this.running = false;
      this.paused = false;
      this.speed = 0;
      this.moving = false;
      this.input.dest = null;
      this.input.stickX = 0;
      this.input.stickY = 0;
      this.input.keys.clear();
      this.publish();
      return;
    }
    this.parked = false;
    this.running = false;
    this.paused = false;
    this.outcome = "none";
    this.lurkers = [];
    this.banner = "";
    this.bannerT = 0;
    this.speed = 0;
    this.moving = false;
    this.input.dest = null;
    this.input.stickX = 0;
    this.input.stickY = 0;
    this.input.keys.clear();
    this.exitWing = this.theme % 4;
    this.maze = buildMaze(4100 + this.theme * 97, this.exitWing, this.cowlShape(), this.boardSpan(), this.looseHalls(), this.wallGrow());
    this.explored.fill(0);
    this.x = this.cx() + 0.5;
    this.y = this.cy() + 0.5;
    this.camX = worldX(this.x, this.y);
    this.camY = worldY(this.x, this.y);
    this.publish();
  }

  resumeRun() {
    if (!this.parked) return;
    this.parked = false;
    this.pending = this.theme;
    this.running = true;
    this.paused = false;
    this.speed = 0;
    this.moving = false;
    this.publish();
  }

  step(dt: number) {
    this.time += dt;
    if (this.hurt > 0) this.hurt = Math.max(0, this.hurt - dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 18);
    if (this.shiftAnim > 0) this.shiftAnim = Math.max(0, this.shiftAnim - dt);
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner = "";
    }

    if (!this.running) {
      if (this.parked) {
        this.speed = 0;
        this.moving = false;
        this.follow(dt, this.x, this.y);
        this.publish();
        return;
      }
      const loop = this.time % 9;
      this.rise = this.reduced ? 1 : loop < 3.4 ? smooth(loop / 3.4) : 1;
      this.door = 0;
      this.wander(dt, false);
      this.speed = 0;
      this.follow(dt, this.cx() + 0.5, this.cy() + 0.5);
      this.publish();
      return;
    }

    if (this.paused || this.hold || this.hidden || this.outcome !== "none") {
      this.speed = 0;
      this.moving = false;
      this.follow(dt, this.x, this.y);
      this.publish();
      return;
    }

    if (this.gravSpin > 0) {
      this.gravSpin = Math.max(0, this.gravSpin - dt / 0.45);
      this.speed = 0;
      this.moving = false;
      this.follow(dt, this.x, this.y);
      this.publish();
      return;
    }

    this.elapsed += dt;
    this.phaseT += dt;
    this.shiftT += dt;
    const dur = this.phaseDur();
    if (this.phaseT >= dur) this.advance();
    if (this.shiftT >= this.shiftEvery() && !this.mazeHeld && this.twist <= 0) this.shiftMaze();
    if (this.cubeLevel()) {
      if (this.twist > 0) {
        this.twist = Math.min(1, this.twist + dt / 0.8);
        if (this.twist >= 1) this.commitTwist();
        this.speed = 0;
        this.moving = false;
        const [vx, vy] = this.cubePoint(this.x, this.y, this.twist >= 1 ? 0 : this.twist);
        this.follow(dt, vx, vy);
        this.publish();
        return;
      }
      this.cubeClock += dt;
      if (this.cubeClock >= 8 && !this.mazeHeld) {
        this.twist = 0.001;
        this.banner = "The Cube turns. Hold your path.";
        this.bannerT = 1.6;
        this.sounds.push("door");
      }
    }

    const axis = this.readAxis();
    const mag = Math.hypot(axis.x, axis.y);
    if (mag > 0.04) {
      this.input.dest = null;
      this.yaw = Math.atan2(-axis.x, -axis.y);
      this.facing = facingFrom(axis.x, axis.y);
      const inv = Math.SQRT1_2;
      const wx = (axis.x + axis.y) * inv;
      const wy = (-axis.x + axis.y) * inv;
      const beforeX = this.x;
      const beforeY = this.y;
      this.tryMove(wx * SPEED * dt, wy * SPEED * dt);
      this.speed = Math.hypot(this.x - beforeX, this.y - beforeY) / dt;
      this.moving = this.speed > 0.2;
      this.stepClock += dt;
      if (this.moving && this.stepClock > 0.32) {
        this.stepClock = 0;
        this.sounds.push("step");
      }
    } else if (this.input.dest) {
      const dx = this.input.dest.x - this.x;
      const dy = this.input.dest.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.18) {
        this.input.dest = null;
        this.moving = false;
        this.speed = 0;
      } else {
        const nx = dx / dist;
        const ny = dy / dist;
        const ax = (nx - ny) * Math.SQRT1_2;
        const ay = (nx + ny) * Math.SQRT1_2;
        this.yaw = Math.atan2(-ax, -ay);
        this.facing = facingFrom(ax, ay);
        const beforeX = this.x;
        const beforeY = this.y;
        this.tryMove(nx * SPEED * dt, ny * SPEED * dt);
        this.speed = Math.hypot(this.x - beforeX, this.y - beforeY) / dt;
        this.moving = this.speed > 0.2;
      }
    } else {
      this.moving = false;
      this.speed = 0;
    }
    this.unstick();
    this.warp(dt);

    this.chart(dt);
    this.wander(dt, true);
    if (this.phase !== "dawn" && this.lionsAwake()) {
      if (this.lurkers.length === 0) this.spawnLurkers();
      this.hunt(dt);
    } else if (!this.lionsAwake()) {
      this.lurkers = [];
    }
    this.sting();
    this.checkWin();
    this.markExplored();
    this.follow(dt, this.x, this.y);
    this.publish();
  }

  drainSounds() {
    if (!this.sounds.length) return [];
    const out = this.sounds;
    this.sounds = [];
    return out;
  }

  gatesOpen() {
    return this.phase === "day" || this.phase === "dusk";
  }

  exitOpen() {
    return this.charted.filter(Boolean).length >= this.chartsNeeded();
  }

  private chartsNeeded() {
    return 5;
  }

  private fadeCharts() {
    if (this.exitOpen()) return 0;
    const on = this.charted.flatMap((lit, index) => (lit ? [index] : []));
    const drop = Math.ceil(on.length / 2);
    for (let i = 0; i < drop; i++) this.charted[on[on.length - 1 - i]] = false;
    return drop;
  }

  private shiftEvery() {
    return 20;
  }

  private lionsAwake() {
    return this.theme >= 12 || this.charted.some(Boolean);
  }

  private phaseDur() {
    if (this.phase === "day") return Math.max(150, 210 - this.theme * 2 - (this.night - 1));
    if (this.phase === "dusk") return Math.max(40, 56 - Math.floor(this.theme / 3));
    if (this.phase === "night") return 22 + Math.floor(this.theme * 0.6);
    return 3.4;
  }

  private advance() {
    this.phaseT = 0;
    if (this.phase === "day") {
      this.phase = "dusk";
      this.banner = "Dusk. Get home.";
      this.bannerT = 2.2;
      this.sounds.push("dusk");
    } else if (this.phase === "dusk") {
      this.phase = "night";
      this.door = 1;
      const home = this.tileAt(Math.floor(this.x), Math.floor(this.y)) === GLADE;
      this.banner = home
        ? "The coin is up. You are safe until day."
        : "Night. They hunt harder.";
      this.bannerT = 2.4;
      this.sounds.push("night");
      this.sounds.push("door");
      this.shoveOffGate();
      this.spawnLurkers();
      this.shake = 6;
    } else if (this.phase === "night") {
      this.phase = "dawn";
      this.night += 1;
      this.rise = 0;
      this.lurkers = [];
      this.x = this.cx() + 0.5;
      this.y = this.cy() + 0.5;
      this.input.dest = null;
      this.banner = "Sunrise pulls every runner home.";
      this.bannerT = 2.4;
      this.sounds.push("dawn");
    } else {
      this.phase = "day";
      this.rise = 1;
      this.door = 0;
      this.lurkers = [];
      const lost = this.fadeCharts();
      if (this.lionsAwake()) this.spawnLurkers();
      this.banner = lost
        ? `Day. ${lost} chart${lost === 1 ? "" : "s"} went dark.`
        : "Day. The coin is gone. You can run again.";
      this.bannerT = 2.4;
      this.sounds.push("door");
    }
    this.publish();
  }

  private cowlShape(): "cowl" | "mint" | "rift" | "grav" | "gear" | undefined {
    const style = THEMES[this.theme]?.style;
    if (style === "cowl" || style === "mint" || style === "rift" || style === "grav" || style === "gear") return style;
    return undefined;
  }

  private warp(dt: number) {
    const style = THEMES[this.theme]?.style;
    if (style === "well") this.wellPull(dt);
    if (style === "rift") this.riftHop(dt);
    if (style === "grav") this.gravDoor(dt);
  }

  private buildGrav(seed: number) {
    this.gravMazes = [0, 1, 2, 3, 4, 5].map((i) =>
      buildMaze((seed + i * 97 + 11) >>> 0, (this.exitWing + i) % 4, "grav", this.boardSpan(), this.looseHalls(), this.wallGrow()),
    );
  }

  private loadGravFace() {
    const mazes = this.gravMazes;
    if (!mazes) return;
    const face = FACE_OF_DOWN[this.gravDown];
    const src = mazes[face];
    this.maze = {
      tiles: src.tiles,
      glow: src.glow,
      props: src.props,
      exitX: face === 0 ? src.exitX : -20,
      exitY: face === 0 ? src.exitY : -20,
      portals: src.portals,
      span: src.span,
      beacons: src.beacons,
    };
  }

  private gravDoor(dt: number) {
    if (this.gravLock > 0) {
      this.gravLock = Math.max(0, this.gravLock - dt);
      return;
    }
    const tx = Math.floor(this.x);
    const ty = Math.floor(this.y);
    let dir = -1;
    if (ty <= 2 && Math.abs(tx - this.cx()) <= 1) dir = 0;
    else if (tx >= this.n() - 3 && Math.abs(ty - this.cy()) <= 1) dir = 1;
    else if (ty >= this.n() - 3 && Math.abs(tx - this.cx()) <= 1) dir = 2;
    else if (tx <= 2 && Math.abs(ty - this.cy()) <= 1) dir = 3;
    if (dir < 0) return;
    const heading = headingAxis(this.gravDown, this.gravNorth, dir);
    const nextDown = heading;
    const nextNorth = AXIS_OPP[this.gravDown];
    if (nextNorth === nextDown || nextNorth === AXIS_OPP[nextDown]) return;
    this.gravDown = nextDown;
    this.gravNorth = nextNorth;
    this.loadGravFace();
    const spot = [
      { x: this.cx() + 0.5, y: this.n() - 6.5 },
      { x: 6.5, y: this.cy() + 0.5 },
      { x: this.cx() + 0.5, y: 6.5 },
      { x: this.n() - 6.5, y: this.cy() + 0.5 },
    ][dir];
    this.x = spot.x;
    this.y = spot.y;
    this.input.dest = null;
    this.gravLock = 0.9;
    this.gravSpin = 1;
    this.gravSign = dir === 1 || dir === 2 ? 1 : -1;
    const face = FACE_OF_DOWN[this.gravDown];
    const name = FACE_NAME[face];
    this.banner =
      face === 5
        ? "Gravity turns. You are on the ceiling. The old floor is a wall."
        : face === 0
          ? "Gravity turns. You are on the floor again. The exit is here."
          : `Gravity turns. This side is the ${name.toLowerCase()}.`;
    this.bannerT = 2.4;
    this.sounds.push("door");
    this.shake = 5;
    this.lurkers = [];
    if (this.lionsAwake()) this.spawnLurkers();
    this.unstick();
  }

  private wellPull(dt: number) {
    if (this.tileAt(Math.floor(this.x), Math.floor(this.y)) === GLADE) return;
    const dx = this.cx() + 0.5 - this.x;
    const dy = this.cy() + 0.5 - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.35) return;
    const night = this.phase === "night";
    const dir = night ? -1 : 1;
    const strength = night ? 2.6 : 1.85;
    this.tryMove((dx / dist) * dir * strength * dt, (dy / dist) * dir * strength * dt);
  }

  private riftHop(dt: number) {
    if (this.riftLock > 0) {
      this.riftLock = Math.max(0, this.riftLock - dt);
      return;
    }
    const portals = this.maze.portals ?? [];
    if (!portals || portals.length < 2) return;
    for (let i = 0; i < portals.length; i++) {
      const pad = portals[i];
      if (Math.hypot(this.x - (pad.x + 0.5), this.y - (pad.y + 0.5)) > 0.46) continue;
      const pair = i % 2 === 0 ? i + 1 : i - 1;
      const dest = portals[pair];
      if (!dest) return;
      this.x = dest.x + 0.5;
      this.y = dest.y + 0.5;
      this.input.dest = null;
      this.riftLock = 0.9;
      this.shake = 0.45;
      this.banner = "The rift spits you out.";
      this.bannerT = 1.2;
      this.sounds.push("door");
      return;
    }
  }

  private cubeLevel() {
    return THEMES[this.theme]?.style === "cube";
  }

  private cubePoint(x: number, y: number, p: number): [number, number] {
    if (p <= 0) return [x, y];
    return [x + (y - x) * p, y + (this.n() - x - y) * p];
  }

  private commitTwist() {
    const tiles = this.maze.tiles;
    const glow = this.maze.glow;
    const nextTiles = new Uint8Array(tiles.length);
    const nextGlow = new Uint8Array(glow.length);
    const nextSeen = new Uint8Array(this.explored.length);
    for (let y = 0; y < this.n(); y++) {
      for (let x = 0; x < this.n(); x++) {
        const nx = y;
        const ny = this.n() - 1 - x;
        const at = ny * this.n() + nx;
        const from = y * this.n() + x;
        nextTiles[at] = tiles[from];
        nextGlow[at] = glow[from];
        nextSeen[at] = this.explored[from];
      }
    }
    tiles.set(nextTiles);
    glow.set(nextGlow);
    this.explored.set(nextSeen);
    for (const prop of this.maze.props) {
      const nx = prop.y;
      const ny = this.n() - 1 - prop.x;
      prop.x = nx;
      prop.y = ny;
    }
    const exitX = this.maze.exitY;
    const exitY = this.n() - 1 - this.maze.exitX;
    this.maze.exitX = exitX;
    this.maze.exitY = exitY;
    this.pinBeacons();
    const turn = { down: "right", right: "up", up: "left", left: "down" } as const;
    const [px, py] = this.cubePoint(this.x, this.y, 1);
    this.x = px;
    this.y = py;
    this.facing = turn[this.facing];
    for (const lurker of this.lurkers) {
      const [lx, ly] = this.cubePoint(lurker.x, lurker.y, 1);
      const [nx, ny] = this.cubePoint(lurker.nx, lurker.ny, 1);
      lurker.x = lx;
      lurker.y = ly;
      lurker.nx = nx;
      lurker.ny = ny;
      lurker.stuck = 0;
    }
    for (const runner of this.runners) {
      const [rx, ry] = this.cubePoint(runner.x, runner.y, 1);
      const [hx, hy] = this.cubePoint(runner.homeX, runner.homeY, 1);
      runner.x = rx;
      runner.y = ry;
      runner.homeX = hx;
      runner.homeY = hy;
      runner.tx = Math.floor(rx);
      runner.ty = Math.floor(ry);
      runner.facing = turn[runner.facing];
    }
    this.twist = 0;
    this.cubeTurns = (this.cubeTurns + 1) % 24;
    this.cubeClock = 0;
    this.unstick();
    for (const lurker of this.lurkers) this.parkLurker(lurker);
  }

  private pinBeacons() {
    const n = this.n();
    for (let i = 0; i < n * n; i++) {
      if (this.maze.glow[i] === 2) this.maze.glow[i] = 0;
    }
    for (const [bx, by] of this.maze.beacons) {
      this.openBeaconPad(bx, by);
      if (!this.beaconReachable(bx, by)) this.cutBeacon(bx, by);
      this.openBeaconPad(bx, by);
    }
  }

  private openBeaconPad(bx: number, by: number) {
    const n = this.n();
    const cx = this.cx();
    const cy = this.cy();
    for (let y = by - 1; y <= by + 1; y++) {
      for (let x = bx - 1; x <= bx + 1; x++) {
        if (x <= 0 || y <= 0 || x >= n - 1 || y >= n - 1) continue;
        if (Math.abs(x - cx) <= 5 && Math.abs(y - cy) <= 5) continue;
        const i = y * n + x;
        const tile = this.maze.tiles[i];
        if (tile === WALL || tile === GATE) this.maze.tiles[i] = FLOOR;
        this.maze.glow[i] = 2;
      }
    }
  }

  private beaconReachable(tx: number, ty: number) {
    const n = this.n();
    const seen = new Uint8Array(n * n);
    const sx = Math.floor(this.cx());
    const sy = Math.floor(this.cy());
    const queue: [number, number][] = [[sx, sy]];
    seen[sy * n + sx] = 1;
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
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const id = ny * n + nx;
        if (seen[id] || this.maze.tiles[id] === WALL) continue;
        seen[id] = 1;
        queue.push([nx, ny]);
      }
    }
    return false;
  }

  private cutBeacon(bx: number, by: number) {
    const n = this.n();
    const cx = Math.floor(this.cx());
    const cy = Math.floor(this.cy());
    let x = bx;
    let y = by;
    for (let steps = 0; steps < n * 4 && (x !== cx || y !== cy); steps++) {
      if (Math.abs(cx - x) >= Math.abs(cy - y)) x += Math.sign(cx - x);
      else y += Math.sign(cy - y);
      if (x <= 0 || y <= 0 || x >= n - 1 || y >= n - 1) break;
      if (Math.abs(x - cx) <= 5 && Math.abs(y - cy) <= 5) continue;
      const i = y * n + x;
      const tile = this.maze.tiles[i];
      if (tile === GATE || tile === GLADE) continue;
      this.maze.tiles[i] = FLOOR;
    }
  }

  private shiftMaze() {
    if (THEMES[this.theme]?.style === "grav") {
      this.shiftT = 0;
      this.shiftN += 1;
      this.gravDown = 5;
      this.gravNorth = 2;
      this.gravSpin = 0;
      this.buildGrav(this.runSeed ^ this.shiftN);
      this.loadGravFace();
      this.x = this.cx() + 0.5;
      this.y = this.cy() + 0.5;
      this.input.dest = null;
      this.lurkers = [];
      this.explored.fill(this.scouted ? 1 : 0);
      this.placeRunners();
      this.shiftAnim = this.reduced ? 0 : 0.7;
      this.shake = 8;
      this.banner = "The cube refolds. You are back on the floor.";
      this.bannerT = 2.2;
      this.sounds.push("door");
      return;
    }
    this.shiftT = 0;
    this.twist = 0;
    this.shiftN += 1;
    const mixed =
      (Math.imul(this.runSeed ^ Math.imul(this.shiftN, 0x9e3779b9), 0x7feb352d) ^
        Math.imul(this.night * 0x846ca68b + this.shiftN, 0xc2b2ae35) ^
        Math.imul(Math.floor(this.x * 13) + Math.floor(this.y * 29), 0x27bb2ee6)) >>>
      0;
    let wing = mixed % 4;
    if (wing === this.exitWing % 4) wing = (wing + 1 + (mixed % 3)) % 4;
    this.exitWing = wing;
    this.maze = buildMaze(mixed, this.exitWing, this.cowlShape(), this.boardSpan(), this.looseHalls(), this.wallGrow());
    this.explored.fill(this.scouted ? 1 : 0);
    this.input.dest = null;
    const spot = this.nearestOpen(this.x, this.y, true);
    this.x = spot.x;
    this.y = spot.y;
    for (const lurker of this.lurkers) this.parkLurker(lurker);
    this.placeRunners();
    this.shiftAnim = this.reduced ? 0 : 0.7;
    this.shake = 8;
    this.banner = "The walls shift.";
    this.bannerT = 2.2;
    this.sounds.push("door");
  }

  private nearestOpen(x: number, y: number, player: boolean) {
    const open = (px: number, py: number) => {
      const tx = Math.floor(px);
      const ty = Math.floor(py);
      if (tx < 1 || ty < 1 || tx >= this.n() - 1 || ty >= this.n() - 1) return false;
      const tile = this.tileAt(tx, ty);
      if (player) {
        if (tile === WALL) return false;
        if (tile === GATE && !this.gatesOpen()) return false;
        return !this.playerBlocked(px, py);
      }
      return tile === FLOOR;
    };
    if (open(x, y)) return { x, y };
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    for (let r = 1; r < 20; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const px = cx + dx + 0.5;
          const py = cy + dy + 0.5;
          if (open(px, py)) return { x: px, y: py };
        }
      }
    }
    return { x: this.cx() + 0.5, y: this.cy() + 0.5 };
  }

  private readAxis() {
    let x = this.input.stickX;
    let y = this.input.stickY;
    const down = (code: string) => this.input.keys.has(code) || this.input.forced.has(code);
    if (down("KeyA") || down("ArrowLeft")) x -= 1;
    if (down("KeyD") || down("ArrowRight")) x += 1;
    if (down("KeyW") || down("ArrowUp")) y -= 1;
    if (down("KeyS") || down("ArrowDown")) y += 1;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    return { x, y };
  }

  private n() {
    return this.maze.span || 39;
  }

  private cx() {
    return (this.n() - 1) / 2;
  }

  private cy() {
    return this.cx();
  }

  private beacon(index: number) {
    return this.maze.beacons?.[index] ?? BEACONS[index];
  }

  private boardSpan() {
    return this.theme >= CUBE_LEVEL ? 55 : 39;
  }

  private wallGrow() {
    if (this.theme < 3) return 0;
    const span = Math.max(1, THEMES.length - 3);
    return Math.min(1, (this.theme - 2) / span);
  }

  private looseHalls() {
    return true;
  }

  private tileAt(tx: number, ty: number) {
    if (tx < 0 || ty < 0 || tx >= this.n() || ty >= this.n()) return WALL;
    return this.maze.tiles[ty * this.n() + tx];
  }

  private blocked(px: number, py: number) {
    const r = 0.16;
    const samples = [
      [0, 0],
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ];
    for (const [ox, oy] of samples) {
      const tx = Math.floor(px + ox);
      const ty = Math.floor(py + oy);
      if (this.solid(tx, ty)) return true;
    }
    return false;
  }

  private playerBlocked(px: number, py: number) {
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    if (this.solid(cx, cy)) return true;
    const r = 0.12;
    const probes: [number, number][] = [
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ];
    for (const [ox, oy] of probes) {
      const sx = px + ox;
      const sy = py + oy;
      const tx = Math.floor(sx);
      const ty = Math.floor(sy);
      if (tx === cx && ty === cy) continue;
      if (!this.solid(tx, ty)) continue;
      const fx = sx - tx;
      const fy = sy - ty;
      const edge = 0.16;
      const corner = (fx < edge || fx > 1 - edge) && (fy < edge || fy > 1 - edge);
      if (corner) {
        const nx = fx < 0.5 ? tx - 1 : tx + 1;
        const ny = fy < 0.5 ? ty - 1 : ty + 1;
        if (!this.solid(nx, ty) && !this.solid(tx, ny)) continue;
      }
      return true;
    }
    return false;
  }

  private solid(tx: number, ty: number) {
    const t = this.tileAt(tx, ty);
    if (t === WALL) return true;
    if (t === GATE && !this.gatesOpen()) return true;
    if (tx === this.maze.exitX && ty === this.maze.exitY && !this.exitOpen()) return true;
    return false;
  }

  private tryMove(dx: number, dy: number) {
    const x0 = this.x;
    const y0 = this.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      this.slideAxis(dx, 0);
      this.slideAxis(0, dy);
    } else {
      this.slideAxis(0, dy);
      this.slideAxis(dx, 0);
    }
    const want = Math.hypot(dx, dy);
    if (want < 1e-6) return;
    const moved = Math.hypot(this.x - x0, this.y - y0);
    const remain = want - moved;
    if (remain < want * 0.55) return;
    const px = -dy / want;
    const py = dx / want;
    const sx = this.x;
    const sy = this.y;
    this.slideAxis(px * remain, py * remain);
    if (Math.hypot(this.x - sx, this.y - sy) < 0.02) {
      this.x = sx;
      this.y = sy;
      this.slideAxis(-px * remain, -py * remain);
    }
  }

  private slideAxis(dx: number, dy: number) {
    let left = Math.hypot(dx, dy);
    if (left < 1e-8) return;
    const sx = dx / left;
    const sy = dy / left;
    while (left > 1e-4) {
      const hop = Math.min(0.05, left);
      const nx = this.x + sx * hop;
      const ny = this.y + sy * hop;
      if (this.playerBlocked(nx, ny)) return;
      this.x = nx;
      this.y = ny;
      left -= hop;
    }
  }

  private unstick() {
    if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) {
      this.x = this.cx() + 0.5;
      this.y = this.cy() + 0.5;
      return;
    }
    if (this.solid(Math.floor(this.x), Math.floor(this.y))) {
      const spot = this.nearestOpen(this.x, this.y, true);
      this.x = spot.x;
      this.y = spot.y;
    }
  }

  private chart(dt: number) {
    let on = -1;
    for (let i = 0; i < 8; i++) {
      if (this.charted[i]) continue;
      const [bx, by] = this.beacon(i);
      if (Math.hypot(this.x - (bx + 0.5), this.y - (by + 0.5)) >= 0.72) continue;
      if (THEMES[this.theme]?.style === "grav" && GRAV_BEACON_FACE[i] !== FACE_OF_DOWN[this.gravDown]) {
        this.banner = `That light lives on the ${FACE_NAME[GRAV_BEACON_FACE[i]].toLowerCase()}.`;
        this.bannerT = 1.5;
        continue;
      }
      on = i;
      break;
    }
    this.linkAt = on;
    if (on < 0) {
      this.link = Math.max(0, this.link - dt * 2.5);
      return;
    }
    this.link += dt / LINK_TIME;
    if (this.link >= 1) {
      const first = !this.charted.some(Boolean);
      this.charted[on] = true;
      this.link = 0;
      this.banner = `${SECTION_NAMES[on]} charted.`;
      this.bannerT = 2.2;
      this.sounds.push("chart");
      if (first) {
        this.spawnLurkers();
        this.banner = `${SECTION_NAMES[on]} charted. Two corrupted Friends woke in the halls.`;
        this.bannerT = 2.8;
        this.sounds.push("night");
      }
      if (this.exitOpen()) {
        this.banner = "The exit is burning. Run.";
        this.sounds.push("exit");
      }
    }
  }

  grantFlare() {
    if (!this.running || this.outcome !== "none") return;
    this.pulse = Math.min(5, this.pulse + 1);
    for (const lurker of this.lurkers) {
      const dx = lurker.x - this.x;
      const dy = lurker.y - this.y;
      const dist = Math.hypot(dx, dy) || 1;
      const spot = this.nearestOpen(lurker.x + (dx / dist) * 8, lurker.y + (dy / dist) * 8, false);
      lurker.x = spot.x;
      lurker.y = spot.y;
      lurker.nx = spot.x;
      lurker.ny = spot.y;
    }
    this.shake = 4;
    this.banner = "Flare. They fall back.";
    this.bannerT = 2.4;
    this.sounds.push("chart");
    this.publish();
  }

  holdMaze() {
    if (!this.running || this.outcome !== "none" || this.mazeHeld) return;
    this.mazeHeld = true;
    this.banner = "This maze is yours. The walls stay.";
    this.bannerT = 2.6;
    this.sounds.push("chart");
    this.publish();
  }

  grantOutfit(id: OutfitId) {
    const item = outfitById(id);
    if (!item || (this.owned.has(id) && this.outfit === id)) return;
    this.owned.add(id);
    this.outfit = id;
    this.wearing = true;
    this.banner = `${item.name} is on.`;
    this.bannerT = 2.2;
    this.sounds.push("chart");
    this.publish();
  }

  wear(id: OutfitId) {
    if (!this.owned.has(id)) return;
    this.outfit = id;
    this.wearing = true;
    this.banner = `${outfitById(id)?.name ?? "Mask"} is on.`;
    this.bannerT = 1.6;
    this.publish();
  }

  grantQuiet() {
    if (!this.running || this.outcome !== "none" || this.night < this.quietUntil) return;
    this.quietUntil = this.night + 1;
    this.lurkerClock = 0;
    this.banner = "Quiet. They lost you until day.";
    this.bannerT = 2.6;
    this.sounds.push("chart");
    this.publish();
  }

  grantScout() {
    if (!this.running || this.outcome !== "none" || this.scouted) return;
    this.scouted = true;
    this.explored.fill(1);
    this.banner = "The halls are charted. You can see the exit.";
    this.bannerT = 2.6;
    this.sounds.push("chart");
    this.publish();
  }

  grantChance() {
    if (!this.running || this.outcome !== "none" || this.chanceBought) return;
    this.chanceBought = true;
    this.chanceLeft = true;
    this.banner = "One second chance. The Glade will take you back.";
    this.bannerT = 2.6;
    this.sounds.push("chart");
    this.publish();
  }

  say(text: string) {
    this.banner = text;
    this.bannerT = 2.4;
    this.publish();
  }

  private checkWin() {
    if (!this.exitOpen()) return;
    if (THEMES[this.theme]?.style === "grav" && FACE_OF_DOWN[this.gravDown] !== 0) return;
    const dx = this.x - (this.maze.exitX + 0.5);
    const dy = this.y - (this.maze.exitY + 0.5);
    if (Math.hypot(dx, dy) < 0.55) {
      this.outcome = "win";
      this.banner = "You made the exit.";
      this.sounds.push("win");
      this.speed = 0;
    }
  }

  private sting() {
    if (!this.lurkers.length || this.phase === "dawn" || this.outcome !== "none") return;
    if (this.tileAt(Math.floor(this.x), Math.floor(this.y)) === GLADE) return;
    for (const lurker of this.lurkers) {
      if (Math.hypot(lurker.x - this.x, lurker.y - this.y) < 0.9) {
        if (this.chanceLeft) {
          this.chanceLeft = false;
          this.x = this.cx() + 0.5;
          this.y = this.cy() + 0.5;
              this.input.dest = null;
          this.speed = 0;
          this.moving = false;
          this.shake = 8;
          this.banner = "The Glade pulled you back. That was the only chance.";
          this.bannerT = 2.8;
          this.sounds.push("dawn");
          for (const other of this.lurkers) {
            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const dist = Math.hypot(dx, dy) || 1;
            const spot = this.nearestOpen(other.x + (dx / dist) * 8, other.y + (dy / dist) * 8, false);
            other.x = spot.x;
            other.y = spot.y;
            other.nx = spot.x;
            other.ny = spot.y;
          }
          break;
        }
        this.outcome = "dead";
        this.pulse = 0;
        this.speed = 0;
        this.moving = false;
        this.shake = 12;
        this.banner = lurker.kind === "mimic" ? "The mimic got you." : "A corrupted Friend got you.";
        this.bannerT = 3;
        this.sounds.push("dead");
        break;
      }
    }
  }

  private spawnLurkers() {
    const spots: [number, number][] = [];
    for (let y = 1; y < this.n() - 1; y++) {
      for (let x = 1; x < this.n() - 1; x++) {
        if (this.tileAt(x, y) !== FLOOR) continue;
        if (Math.hypot(x + 0.5 - this.x, y + 0.5 - this.y) < Math.max(8, 15 - this.theme * 0.2)) continue;
        if (Math.max(Math.abs(x - this.cx()), Math.abs(y - this.cy())) < 7) continue;
        spots.push([x + 0.5, y + 0.5]);
      }
    }
    const count = this.theme < 8 ? 2 : 3;
    this.lurkers = [];
    for (let i = 0; i < count && spots.length; i++) {
      const pick = (Math.imul(this.night + i * 13, 1103515245) >>> 0) % spots.length;
      const [lx, ly] = spots.splice(pick, 1)[0];
      this.lurkers.push({ x: lx, y: ly, nx: lx, ny: ly, stuck: 0, kind: "friend", slipped: false });
    }
    if (!spots.length || !this.lurkers.length) return;
    const [mx, my] = spots[(Math.imul(this.night + 3, 1103515245) >>> 0) % spots.length];
    this.lurkers.push({ x: mx, y: my, nx: mx, ny: my, stuck: 0, kind: "mimic", slipped: false });
  }

  private hunt(dt: number) {
    this.lurkerClock -= dt;
    const hunting = this.phase === "night";
    const quiet = this.night < this.quietUntil;
    const retarget = this.lurkerClock <= 0;
    if (retarget) this.lurkerClock = hunting && !quiet ? Math.max(0.22, 0.4 - this.theme * 0.006) : 0.6;
    const nightSpeed = 2.85 + this.theme * 0.1;
    const daySpeed = 1.05 + this.theme * 0.04;
    const speed = quiet ? 1.1 + this.theme * 0.05 : hunting ? nightSpeed : daySpeed;
    const [qx, qy] = this.quarry();
    for (const lurker of this.lurkers) {
      const near = Math.hypot(lurker.x - this.x, lurker.y - this.y);
      if (lurker.kind === "mimic" && !lurker.slipped && near < 2.6) {
        lurker.slipped = true;
        this.banner = "A Friend's face slips.";
        this.bannerT = 2.2;
      }
      const pace = lurker.kind === "mimic" ? (lurker.slipped ? 4.6 : 2.2) : speed;
      if (!this.lurkerTile(Math.floor(lurker.x), Math.floor(lurker.y)) || this.blocked(lurker.x, lurker.y)) {
        this.parkLurker(lurker);
      }
      if (retarget) {
        const next = quiet ? null : this.nextTile(lurker.x, lurker.y, qx, qy);
        if (next) {
          lurker.nx = next[0] + 0.5;
          lurker.ny = next[1] + 0.5;
        } else {
          const tx = Math.floor(lurker.x);
          const ty = Math.floor(lurker.y);
          const opts: [number, number][] = [];
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            if (this.lurkerTile(tx + dx, ty + dy)) opts.push([tx + dx, ty + dy]);
          }
          if (opts.length) {
            const pick = opts[Math.floor(this.time * 3 + lurker.x) % opts.length];
            lurker.nx = pick[0] + 0.5;
            lurker.ny = pick[1] + 0.5;
          }
        }
      }
      const dx = lurker.nx - lurker.x;
      const dy = lurker.ny - lurker.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.08) continue;
      const step = Math.min(dist, pace * dt);
      const ox = lurker.x;
      const oy = lurker.y;
      lurker.x += (dx / dist) * step;
      lurker.y += (dy / dist) * step;
      const tile = this.tileAt(Math.floor(lurker.x), Math.floor(lurker.y));
      const gateShut = tile === GATE && !this.gatesOpen();
      if (tile === GLADE || tile === WALL || gateShut || this.blocked(lurker.x, lurker.y)) {
        lurker.x = ox;
        lurker.y = oy;
        lurker.stuck += 1;
        const tx = Math.floor(lurker.x);
        const ty = Math.floor(lurker.y);
        if (lurker.stuck >= 3 || !this.lurkerTile(tx, ty)) {
          this.parkLurker(lurker);
          continue;
        }
        lurker.x = tx + 0.5;
        lurker.y = ty + 0.5;
        const opts: [number, number][] = [];
        for (const [sx, sy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          if (this.lurkerTile(tx + sx, ty + sy)) opts.push([tx + sx, ty + sy]);
        }
        if (opts.length) {
          const pick = opts[lurker.stuck % opts.length];
          lurker.nx = pick[0] + 0.5;
          lurker.ny = pick[1] + 0.5;
        } else {
          lurker.nx = lurker.x;
          lurker.ny = lurker.y;
        }
      } else {
        lurker.stuck = 0;
      }
    }
  }

  private parkLurker(lurker: Lurker) {
    const around = [
      [lurker.x, lurker.y],
      [lurker.x + 3, lurker.y],
      [lurker.x - 3, lurker.y],
      [lurker.x, lurker.y + 3],
      [lurker.x, lurker.y - 3],
    ];
    for (const [px, py] of around) {
      const spot = this.nearestOpen(px, py, false);
      const tx = Math.floor(spot.x);
      const ty = Math.floor(spot.y);
      if (this.tileAt(tx, ty) !== FLOOR) continue;
      lurker.x = tx + 0.5;
      lurker.y = ty + 0.5;
      lurker.nx = lurker.x;
      lurker.ny = lurker.y;
      lurker.stuck = 0;
      return;
    }
    lurker.stuck = 0;
  }

  private markExplored() {
    const tx = Math.floor(this.x);
    const ty = Math.floor(this.y);
    for (let y = ty - 1; y <= ty + 1; y++) {
      for (let x = tx - 1; x <= tx + 1; x++) {
        if (x < 0 || y < 0 || x >= this.n() || y >= this.n()) continue;
        this.explored[y * this.n() + x] = 1;
      }
    }
  }

  private quarry(): [number, number] {
    if (this.tileAt(Math.floor(this.x), Math.floor(this.y)) !== GLADE) return [this.x, this.y];
    const doors: [number, number][] = [
      [this.cx(), this.cy() - 6],
      [this.cx(), this.cy() + 6],
      [this.cx() - 6, this.cy()],
      [this.cx() + 6, this.cy()],
    ];
    let best = doors[0];
    let bestD = Infinity;
    for (const door of doors) {
      const d = Math.hypot(door[0] + 0.5 - this.x, door[1] + 0.5 - this.y);
      if (d < bestD) {
        best = door;
        bestD = d;
      }
    }
    return [best[0] + 0.5, best[1] + 0.5];
  }

  private nextTile(x: number, y: number, gx: number, gy: number): [number, number] | null {
    const sx = Math.floor(x);
    const sy = Math.floor(y);
    const tx = Math.floor(gx);
    const ty = Math.floor(gy);
    if (sx === tx && sy === ty) return null;
    this.stamp++;
    if (this.stamp >= 0xffffffff) {
      this.seen.fill(0);
      this.stamp = 1;
    }
    const stamp = this.stamp;
    const qx = [sx];
    const qy = [sy];
    this.seen[sy * this.n() + sx] = stamp;
    this.prev[sy * this.n() + sx] = -1;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (let head = 0; head < qx.length && head < this.n() * this.n(); head++) {
      const cx = qx[head];
      const cy = qy[head];
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= this.n() || ny >= this.n()) continue;
        const id = ny * this.n() + nx;
        if (this.seen[id] === stamp) continue;
        if (!this.lurkerTile(nx, ny)) continue;
        this.seen[id] = stamp;
        this.prev[id] = cy * this.n() + cx;
        if (nx === tx && ny === ty) {
          let cur = id;
          let parent = this.prev[cur];
          let guard = 0;
          while (parent !== -1 && parent !== sy * this.n() + sx && guard++ < this.n() * this.n()) {
            cur = parent;
            parent = this.prev[cur];
          }
          return [cur % this.n(), Math.floor(cur / this.n())];
        }
        qx.push(nx);
        qy.push(ny);
      }
    }
    return null;
  }

  private lurkerTile(tx: number, ty: number) {
    const t = this.tileAt(tx, ty);
    if (t === FLOOR) return !(tx === this.maze.exitX && ty === this.maze.exitY && !this.exitOpen());
    if (t === GLADE) return false;
    if (t === GATE) return this.gatesOpen();
    return false;
  }

  private shoveOffGate() {
    const tx = Math.floor(this.x);
    const ty = Math.floor(this.y);
    if (this.tileAt(tx, ty) !== GATE) return;
    const inside = Math.abs(this.x - (this.cx() + 0.5)) + Math.abs(this.y - (this.cy() + 0.5));
    if (inside < 6) {
      this.x = this.cx() + 0.5;
      this.y = this.cy() + 0.5;
      return;
    }
    if (tx === this.cx()) this.y += this.y < this.cy() ? -0.8 : 0.8;
    else this.x += this.x < this.cx() ? -0.8 : 0.8;
  }

  private placeRunners() {
    const spots = [
      [this.cx() - 2.2, this.cy() + 1.4, 0],
      [this.cx() + 1.8, this.cy() - 1.6, 1],
      [this.cx() + 2.4, this.cy() + 2.1, 2],
      [this.cx() - 1.4, this.cy() - 2.2, 0],
      [this.cx() + 0.4, this.cy() + 2.6, 1],
    ];
    this.runners = spots.map(([x, y, art]) => ({
      x,
      y,
      tx: x,
      ty: y,
      homeX: this.cx() + 0.5,
      homeY: this.cy() + 0.5,
      art,
      facing: "down" as Facing,
      moving: false,
    }));
  }

  private wander(dt: number, flee: boolean) {
    const threat = flee && this.lurkers.length > 0 && this.phase !== "day";
    for (const runner of this.runners) {
      if (threat) {
        runner.tx = this.cx() + 0.5;
        runner.ty = this.cy() + 0.5;
      } else if (Math.hypot(runner.tx - runner.x, runner.ty - runner.y) < 0.2) {
        const ang = (this.time * 1.7 + runner.art * 2.3) % (Math.PI * 2);
        runner.tx = this.cx() + 0.5 + Math.cos(ang + runner.art) * 2.4;
        runner.ty = this.cy() + 0.5 + Math.sin(ang * 1.3 + runner.art) * 2.2;
      }
      const dx = runner.tx - runner.x;
      const dy = runner.ty - runner.y;
      const dist = Math.hypot(dx, dy) || 1;
      const step = Math.min(dist, 1.5 * dt);
      runner.x += (dx / dist) * step;
      runner.y += (dy / dist) * step;
      runner.moving = step > 0.002;
      const ax = (dx - dy) * Math.SQRT1_2;
      const ay = (dx + dy) * Math.SQRT1_2;
      if (runner.moving) runner.facing = facingFrom(ax, ay);
    }
  }

  private follow(dt: number, x: number, y: number) {
    const tx = worldX(x, y);
    const ty = worldY(x, y);
    const k = 1 - Math.exp(-7 * dt);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    if (this.phase === "dawn" && !this.reduced) {
      this.rise = smooth(this.phaseT / 3.4);
    } else if (this.shiftAnim > 0 && !this.reduced) {
      this.rise = smooth(1 - this.shiftAnim / 0.7);
    } else if (this.running && this.phase !== "dawn") {
      this.rise = 1;
    }
  }

  private publish() {
    if (this.theme >= THEMES.length) this.theme = 0;
    if (this.pending >= THEMES.length) this.pending = this.theme;
    const dur = this.running ? this.phaseDur() : 1;
    const left = this.running ? Math.max(0, dur - this.phaseT) : dur;
    const charts = this.charted.filter(Boolean).length;
    const hint = !this.running
      ? "The walls shift. Chart five sections, then take the exit."
      : THEMES[this.theme].dark
        ? "Space. The walls glow. Stars are under the glass."
        : this.phase === "day"
        ? charts > 0 || this.theme >= 12
          ? "A corrupted Friend is hunting you. If it catches you, the run ends. The Glade is safe."
          : "Doors are open. Chart a beacon and something wakes."
        : this.phase === "dusk"
          ? "Doors are closing. The Glade is the only safe ground."
          : this.phase === "night"
            ? this.tileAt(Math.floor(this.x), Math.floor(this.y)) === GLADE
              ? "The coin holds. Stay in the center until day."
              : "Corrupted Friends are hunting. Only the center coin is safe."
            : "The maze is rebuilding.";
    const next: Hud = {
      running: this.running,
      phase: this.phase,
      night: this.night,
      seconds: Math.ceil(left),
      ratio: Math.round((left / dur) * 100) / 100,
      pulse: this.pulse,
      charts,
      goal: this.chartsNeeded(),
      shift: this.mazeHeld ? 0 : Math.max(0, Math.ceil(this.shiftEvery() - this.shiftT)),
      held: this.mazeHeld,
      quiet: this.night < this.quietUntil,
      scouted: this.scouted,
      chance: this.chanceLeft ? "kept" : this.chanceBought ? "spent" : "buy",
      wearing: this.wearing,
      outfit: this.owned.size ? [...this.owned].join(",") + (this.outfit ? `:${this.outfit}` : "") : "",
      theme:
        THEMES[this.theme]?.style === "grav"
          ? `Grav · ${FACE_NAME[FACE_OF_DOWN[this.gravDown]]}`
          : THEMES[this.theme].name,
      level: this.theme,
      pick: this.parked ? this.pending : this.theme,
      exitOpen: charts >= this.chartsNeeded(),
      banner: this.banner,
      outcome: this.outcome,
      elapsed: Math.floor(this.elapsed),
      hint,
      paused: this.paused,
      parked: this.parked,
    };
    const prev = this.hud;
    if (
      prev.running === next.running &&
      prev.phase === next.phase &&
      prev.night === next.night &&
      prev.seconds === next.seconds &&
      prev.ratio === next.ratio &&
      prev.pulse === next.pulse &&
      prev.charts === next.charts &&
      prev.goal === next.goal &&
      prev.shift === next.shift &&
      prev.held === next.held &&
      prev.quiet === next.quiet &&
      prev.scouted === next.scouted &&
      prev.chance === next.chance &&
      prev.wearing === next.wearing &&
      prev.outfit === next.outfit &&
      prev.theme === next.theme &&
      prev.level === next.level &&
      prev.pick === next.pick &&
      prev.exitOpen === next.exitOpen &&
      prev.banner === next.banner &&
      prev.outcome === next.outcome &&
      prev.elapsed === next.elapsed &&
      prev.hint === next.hint &&
      prev.paused === next.paused &&
      prev.parked === next.parked
    ) {
      return;
    }
    this.hud = next;
    for (const fn of this.listeners) fn();
  }
}

function smooth(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function facingFrom(ax: number, ay: number): Facing {
  if (Math.abs(ax) > Math.abs(ay)) return ax > 0 ? "right" : "left";
  return ay > 0 ? "down" : "up";
}

export const ISO_A = 0.8660254038;
export const ISO_B = 0.42;
export const SCALE = 36;

export function worldX(x: number, y: number) {
  return SCALE * ISO_A * (x - y);
}

export function worldY(x: number, y: number) {
  return SCALE * ISO_B * (x + y);
}

const CUBE_LEVEL = Math.max(0, THEMES.findIndex((theme) => theme.style === "cube"));

export function viewZoom(w: number, h: number, attract: boolean, _themeIndex = 0) {
  const z = Math.min(w / 300, h / 420);
  const clamped = Math.max(0.9, Math.min(z, 1.7));
  const pull = 0.62;
  return (attract ? clamped * 0.84 : clamped) * pull;
}

export function screenToWorld(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  zoom: number,
  camX: number,
  camY: number,
) {
  const x = clientX - rect.left - rect.width / 2;
  const y = clientY - rect.top - rect.height * 0.56;
  const sx = x / zoom + camX;
  const sy = y / zoom + camY;
  const a = sx / (SCALE * ISO_A);
  const b = sy / (SCALE * ISO_B);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
