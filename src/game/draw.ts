import { BEACONS, CX, CY, GATE, GLADE, N, WALL, inCowl, inGear, type MazeProp } from "./maze";
import { drawFrame, spriteFrame } from "@rarefriends/friendsdk";
import type { Baked } from "./friends";
import { THEMES, type Theme } from "./themes";
import { outfitById } from "./outfits";
import {
  GladeSim,
  viewZoom,
  worldX,
  worldY,
  type Facing,
} from "./sim";

let board = N;
let boardC = CX;

export type DrawAssets = {
  player: Baked | null;
  roster: Baked[];
  tree: CanvasImageSource | null;
};

const GROUND = 12;
const WALL_H = 32;
let theme: Theme = THEMES[0];

function pickTheme(index: number) {
  const n = THEMES.length;
  theme = THEMES[((index % n) + n) % n];
}

export function drawWorld(
  canvas: HTMLCanvasElement,
  sim: GladeSim,
  assets: DrawAssets,
) {
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW < 2 || cssH < 2) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const bw = Math.round(cssW * dpr);
  const bh = Math.round(cssH * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  pickTheme(sim.theme);
  board = sim.maze.span || N;
  boardC = (board - 1) / 2;
  glyphTime = sim.time;
  const zoom = viewZoom(cssW, cssH, !sim.running, sim.theme);
  const mag = sim.reduced ? 0 : sim.shake;
  const shakeX = Math.sin(sim.time * 47) * mag;
  const shakeY = Math.cos(sim.time * 41) * mag;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = theme.void;
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.setTransform(
    zoom * dpr,
    0,
    0,
    zoom * dpr,
    (cssW / 2 + shakeX) * dpr,
    (cssH * 0.56 + shakeY) * dpr,
  );
  if (theme.style === "grav" && sim.gravSpin > 0) ctx.rotate(sim.gravSpin * (Math.PI / 2) * sim.gravSign);
  ctx.lineJoin = "miter";
  ctx.imageSmoothingEnabled = false;

  let camX = sim.camX;
  let camY = sim.camY;
  const hx = cssW / (2 * zoom) + 160;
  const hy = cssH / (2 * zoom) + 200;
  const open = sim.gatesOpen();
  const tiles = sim.maze.tiles;
  const glow = sim.maze.glow;

  for (let sum = 0; sum <= (board - 1) * 2; sum++) {
    const x0 = Math.max(0, sum - (board - 1));
    const x1 = Math.min(sum, board - 1);
    for (let tx = x0; tx <= x1; tx++) {
      const ty = sum - tx;
      const sx = worldX(tx + 0.5, ty + 0.5) - camX;
      const sy = worldY(tx + 0.5, ty + 0.5) - camY;
      if (Math.abs(sx) > hx || Math.abs(sy) > hy) continue;
      const t = tiles[ty * board + tx];
      drawTile(ctx, sim, tx, ty, t, glow[ty * board + tx], open, camX, camY);
      for (const prop of sim.maze.props) {
        if (prop.x === tx && prop.y === ty) {
          const [px, py] = theme.style === "cube" ? cubePoint(prop.x + 0.5, prop.y + 0.5, sim.twist) : [prop.x + 0.5, prop.y + 0.5];
          drawProp(ctx, { ...prop, x: px - 0.5, y: py - 0.5 }, sim, assets, camX, camY);
        }
      }
      const marks = sim.maze.beacons?.length ? sim.maze.beacons : BEACONS;
      for (let i = 0; i < marks.length; i++) {
        const [bx, by] = marks[i];
        if (bx === tx && by === ty) drawBeacon(ctx, sim, i, camX, camY);
      }
      if (sim.maze.exitX === tx && sim.maze.exitY === ty) drawExit(ctx, sim, camX, camY);
      if (theme.style === "grav" && isGravDoor(tx, ty)) drawGravDoor(ctx, tx, ty, camX, camY);
      if (theme.style === "rift") {
        const portals = sim.maze.portals ?? [];
        for (let i = 0; i < portals.length; i++) {
          const pad = portals[i];
          if (pad.x === tx && pad.y === ty) drawRiftPad(ctx, tx, ty, i, sim.time, camX, camY);
        }
      }
      for (const runner of sim.runners) {
        if (Math.floor(runner.x) === tx && Math.floor(runner.y) === ty) {
          const art = assets.roster[runner.art % Math.max(1, assets.roster.length)];
          const [rx, ry] = theme.style === "cube" ? cubePoint(runner.x, runner.y, sim.twist) : [runner.x, runner.y];
          if (art) blit(ctx, frameOf(art, runner.facing, runner.moving, sim.time + runner.art), rx, ry, camX, camY);
        }
      }
      if (sim.lurkers.length) {
        for (const lurker of sim.lurkers) {
          if (Math.floor(lurker.x) === tx && Math.floor(lurker.y) === ty) {
            const [lx, ly] = theme.style === "cube" ? cubePoint(lurker.x, lurker.y, sim.twist) : [lurker.x, lurker.y];
            safeDraw(() =>
              drawLurker(
                ctx,
                lx,
                ly,
                sim.time,
                camX,
                camY,
                lurker.nx - lurker.x,
                lurker.ny - lurker.y,
                assets,
                lurker.kind === "mimic" && !lurker.slipped,
              ),
            );
          }
        }
      }
      if (tx === boardC && ty === boardC && fireLit(sim)) safeDraw(() => drawCoin(ctx, sim.time, camX, camY));
      if (Math.floor(sim.x) === tx && Math.floor(sim.y) === ty) {
        safeDraw(() => drawPlayer(ctx, sim, assets, camX, camY));
      }
    }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (theme.style === "ice") drawSnow(ctx, cssW, cssH, sim.time, sim.reduced);
  if (theme.style === "cowl") drawBats(ctx, cssW, cssH, sim.time, sim.reduced);
  if (theme.style === "code") drawCodeRain(ctx, cssW, cssH, sim.time, sim.reduced);
  if (theme.style === "well") drawWell(ctx, cssW, cssH, sim.time);
  if (theme.style === "ash") drawAsh(ctx, cssW, cssH, sim.time, sim.reduced);
  if (theme.style === "gear") drawGearSky(ctx, cssW, cssH, sim.time, sim.reduced);
  if (sim.hurt > 0.8) {
    ctx.fillStyle = "rgba(244,244,244,0.18)";
    ctx.fillRect(0, 0, cssW, cssH);
  }
}

export function drawMap(canvas: HTMLCanvasElement, sim: GladeSim) {
  board = sim.maze.span || N;
  boardC = (board - 1) / 2;
  const cell = 3;
  const size = board * cell;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const bw = Math.round(size * dpr);
  if (canvas.width !== bw) {
    canvas.width = bw;
    canvas.height = bw;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  pickTheme(sim.theme);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = theme.void;
  ctx.fillRect(0, 0, size, size);
  const open = sim.gatesOpen();
  const home = fireLit(sim);
  for (let y = 0; y < board; y++) {
    for (let x = 0; x < board; x++) {
      const t = sim.maze.tiles[y * board + x];
      if (theme.style === "gear" && t === WALL && !inGear(x, y, board)) {
        ctx.fillStyle = theme.void;
        ctx.fillRect(x * cell, y * cell, cell, cell);
        continue;
      }
      const seen = sim.explored[y * board + x] === 1;
      if (t === WALL) ctx.fillStyle = seen ? (theme.style === "cube" ? sticker(x, y, sim.cubeTurns) : theme.wallLeft) : "#101010";
      else if (t === GATE && !open) ctx.fillStyle = theme.signal;
      else if (t === GLADE) ctx.fillStyle = theme.glade;
      else if (sim.maze.glow[y * board + x] === 2) ctx.fillStyle = theme.beacon;
      else ctx.fillStyle = theme.style === "cube" && seen ? sticker(x, y, sim.cubeTurns) : seen ? theme.wallRightAlt : theme.floor;
      ctx.fillRect(x * cell, y * cell, cell, cell);
      if (t !== WALL && ((x * 3 + y * 5) & 7) === 0) {
        ctx.fillStyle = theme.edge;
        ctx.fillRect(x * cell + 1, y * cell + 1, 1, 1);
      }
    }
  }
  for (const prop of sim.maze.props) {
    ctx.fillStyle = prop.kind === "lamp" ? theme.signal : theme.pine;
    ctx.fillRect(prop.x * cell + 1, prop.y * cell + 1, 1, 1);
  }
  (sim.maze.beacons?.length ? sim.maze.beacons : BEACONS).forEach(([x, y], i) => {
    ctx.fillStyle = sim.charted[i] ? theme.ink : theme.signal;
    ctx.fillRect(x * cell, y * cell, cell, cell);
  });
  ctx.fillStyle = sim.exitOpen() ? theme.signal : theme.edge;
  ctx.fillRect(sim.maze.exitX * cell, sim.maze.exitY * cell, cell, cell);
  if (home) {
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(boardC * cell, boardC * cell, cell, cell);
  }
  if (sim.lurkers.length) {
    ctx.fillStyle = theme.signal;
    for (const lurker of sim.lurkers) {
      ctx.fillRect(Math.floor(lurker.x) * cell, Math.floor(lurker.y) * cell, cell, cell);
    }
  }
  ctx.fillStyle = theme.ink;
  ctx.fillRect(Math.floor(sim.x) * cell, Math.floor(sim.y) * cell, cell, cell);
}

function safeDraw(draw: () => void) {
  ctxSave(draw);
}

function ctxSave(draw: () => void) {
  try {
    draw();
  } catch {
    /* a sprite must not take the maze down with it */
  }
}

function proj(x: number, y: number, lift: number, camX: number, camY: number): [number, number] {
  return [worldX(x, y) - camX, worldY(x, y) - lift - camY];
}

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function topAt(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  lift: number,
  camX: number,
  camY: number,
  inset = 0,
) {
  poly(ctx, [
    proj(tx + inset, ty + inset, lift, camX, camY),
    proj(tx + 1 - inset, ty + inset, lift, camX, camY),
    proj(tx + 1 - inset, ty + 1 - inset, lift, camX, camY),
    proj(tx + inset, ty + 1 - inset, lift, camX, camY),
  ]);
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  sim: GladeSim,
  tx: number,
  ty: number,
  t: number,
  glow: number,
  open: boolean,
  camX: number,
  camY: number,
) {
  const closedGate = t === GATE && !open;
  const isWall = t === WALL || closedGate;
  if (theme.style === "cowl" && isWall && !inCowl(tx, ty, board)) return;
  if (theme.style === "gear" && isWall && !inGear(tx, ty, board)) return;
  const spin = theme.style === "cube" ? sim.twist : 0;
  const [gx, gy] = spin > 0 ? cubeOrigin(tx, ty, spin) : [tx, ty];
  const hop = spin > 0 ? Math.sin(spin * Math.PI) * 18 : 0;
  const cube = theme.style === "cube";
  if (isWall) {
    const dist = Math.max(Math.abs(tx + 0.5 - boardC), Math.abs(ty + 0.5 - boardC));
    const local = sim.rise >= 1 ? 1 : smooth(sim.rise * 1.45 - dist * 0.045);
    const scale = theme.style === "hedge" || theme.style === "mint" ? 0.72 : 1;
    const topLift = GROUND + WALL_H * scale * local * (closedGate ? 0.72 : 1) + hop;
    if (topLift > 2) {
      drawWallBody(ctx, gx, gy, topLift, camX, camY, closedGate);
      topAt(ctx, gx, gy, topLift, camX, camY, cube ? 0.08 : 0);
      ctx.fillStyle = cube
        ? sticker(tx, ty, sim.cubeTurns)
        : closedGate
          ? theme.signal
          : theme.style === "hedge" || theme.style === "mint"
            ? theme.pineAlt
            : theme.style === "circuit"
              ? "#16161f"
              : theme.wallTop;
      if (theme.style === "code" && !closedGate) ctx.fillStyle = "#04140c";
      ctx.fill();
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = theme.dark ? theme.signal : theme.style === "circuit" || theme.style === "code" ? theme.signal : theme.void;
      if (theme.dark) {
        ctx.save();
        ctx.shadowColor = theme.signal;
        ctx.shadowBlur = sim.reduced ? 0 : 14;
        ctx.stroke();
        ctx.restore();
      } else ctx.stroke();
      if (theme.style === "gear" && !closedGate && (tx + ty) % 3 === 0) {
        const [gx0, gy0] = proj(gx + 0.5, gy + 0.5, topLift + 1, camX, camY);
        const spin = sim.time * ((tx + ty) % 2 === 0 ? 0.7 : -0.7);
        ctx.fillStyle = (tx + ty) % 2 === 0 ? "#f0d090" : "#a07840";
        drawGear(ctx, gx0, gy0, 10, 8, spin);
      }
    }
    return;
  }

  const blockedExit =
    tx === sim.maze.exitX && ty === sim.maze.exitY && !sim.exitOpen() && sim.running;
  if (theme.dark) {
    drawGlass(ctx, tx, ty, camX, camY, tx === sim.maze.exitX && ty === sim.maze.exitY);
    return;
  }
  topAt(ctx, gx, gy, GROUND + hop, camX, camY, cube ? 0.08 : 0);
  ctx.fillStyle = cube
    ? t === GLADE
      ? theme.glade
      : glow === 2
        ? theme.beacon
        : sticker(tx, ty, sim.cubeTurns)
    : glow === 1
      ? theme.glade
      : glow === 2
        ? theme.beacon
        : theme.floor;
  ctx.fill();
  if (glow === 1) {
    ctx.fillStyle = theme.gladeWash;
    ctx.fill();
  } else if (glow === 2) {
    ctx.fillStyle = theme.beaconWash;
    ctx.fill();
  }
  strokeRim(ctx, sim, gx, gy, GROUND + hop, open, camX, camY, glow > 0);
  if (theme.style === "well") {
    const ring = Math.hypot(tx + 0.5 - boardC, ty + 0.5 - boardC);
    if (Math.abs(ring % 3) < 0.55) {
      ctx.strokeStyle = "rgba(190, 150, 255, 0.7)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  const speck = (Math.imul(tx, 13) + Math.imul(ty, 7)) >>> 0;
  if (speck % 3 === 0 && !theme.dark) {
    const [sx, sy] = proj(gx + 0.28 + (speck % 5) * 0.08, gy + 0.62, GROUND + 1 + hop, camX, camY);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = glow === 1 ? theme.edge : theme.wallRightAlt;
    ctx.fillRect(sx, sy, speck % 2 === 0 ? 3 : 2, 2);
    ctx.globalAlpha = 1;
  }
  if (theme.style === "code" && speck % 4 === 0) {
    const [sx, sy] = proj(gx + 0.5, gy + 0.5, GROUND + 2 + hop, camX, camY);
    ctx.font = "8px ui-monospace, monospace";
    ctx.fillStyle = glow > 0 ? "#eafff0" : "#1f9a4a";
    ctx.fillText(codeBit(tx, ty, 2), sx - 3, sy);
  }
  if (theme.style === "gear" && speck % 5 === 0) {
    const [sx, sy] = proj(gx + 0.5, gy + 0.5, GROUND + 2 + hop, camX, camY);
    ctx.fillStyle = "#e2b34a";
    drawGear(ctx, sx, sy, 7, 6, sim.time * ((tx + ty) % 2 === 0 ? -0.5 : 0.5));
  }
  if (blockedExit) {
    topAt(ctx, gx + 0.18, gy + 0.18, GROUND + 16 + hop, camX, camY);
    ctx.fillStyle = theme.wallTop;
    ctx.fill();
    ctx.strokeStyle = theme.void;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawGlass(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  camX: number,
  camY: number,
  bright: boolean,
) {
  const seed = (Math.imul(tx + 3, 0x9e3779b1) ^ Math.imul(ty + 11, 0x85ebca6b)) >>> 0;
  const count = (bright ? 3 : 1) + (seed % 2);
  for (let i = 0; i < count; i++) {
    const u = 0.18 + ((seed >> (i * 5)) % 64) / 100;
    const v = 0.18 + ((seed >> (i * 3 + 4)) % 64) / 100;
    const [sx, sy] = proj(tx + u, ty + v, GROUND - 10 - (seed % 6), camX, camY);
    ctx.fillStyle = bright && i === 0 ? "#fff4c4" : seed % 2 ? "#ffffff" : "#9fd4ff";
    const size = bright && i === 0 ? 3 : seed % 3 === 0 ? 2 : 1;
    ctx.fillRect(sx, sy, size, size);
  }
  topAt(ctx, tx, ty, GROUND, camX, camY);
  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(210, 244, 255, 0.45)";
  ctx.stroke();
}

function fireLit(sim: GladeSim) {
  if (!sim.running || sim.phase !== "night") return false;
  const tx = Math.floor(sim.x);
  const ty = Math.floor(sim.y);
  if (tx < 0 || ty < 0 || tx >= board || ty >= board) return false;
  return sim.maze.tiles[ty * board + tx] === GLADE;
}

function drawCoin(ctx: CanvasRenderingContext2D, time: number, camX: number, camY: number) {
  const bob = Math.sin(time * 2) * 3;
  const [sx, sy] = proj(boardC + 0.5, boardC + 0.5, GROUND + 10, camX, camY);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
  const rows = [
    ".....11111111111.....",
    "...1111111111111111..",
    "..111100000000001111.",
    ".11100............0011",
    ".1100..1111111111..011",
    "110...111111111111..11",
    "110..1111111111111..11",
    "110..1110011001111..11",
    "110..1110011001111..11",
    "110..1111100111111..11",
    "110..1111100111111..11",
    "110..1111111111111..11",
    "110....111111111....11",
    "110......1111.......11",
    "110......1111.......11",
    ".1100............0011.",
    ".1111000000000001111..",
    "..11111111111111111...",
    "...111111111111111....",
    ".....111111111111.....",
  ];
  const pixel = 5;
  const cols = Math.max(...rows.map((row) => row.length));
  const w = cols * pixel;
  const h = rows.length * pixel;
  const left = sx - w / 2;
  const top = sy - h - 6 + bob;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(sx - 18, sy - 2, 36, 5);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      if (cell === ".") continue;
      ctx.fillStyle = cell === "1" ? "#f4f4f4" : "#070707";
      ctx.fillRect(left + x * pixel, top + y * pixel, pixel, pixel);
    }
  });
  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(left + 19 * pixel, top + 4 * pixel, pixel, pixel * 2);
  ctx.fillRect(left + 20 * pixel, top + 7 * pixel, pixel, pixel * 2);
  ctx.fillRect(left + 19 * pixel, top + 12 * pixel, pixel, pixel);
}

let glyphTime = 0;

function codeBit(tx: number, ty: number, i: number) {
  const n = (Math.imul(tx + 3, 0x9e3779b1) ^ Math.imul(ty + 5, 0x85ebca6b) ^ Math.imul(i + 1 + (glyphTime * 3) | 0, 0xc2b2ae35)) >>> 0;
  return (n & 1) === 0 ? "0" : "1";
}

function drawGear(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, teeth: number, turn: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(turn);
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 0.28) / teeth) * Math.PI * 2;
    const a2 = ((i + 0.62) / teeth) * Math.PI * 2;
    const a3 = ((i + 1) / teeth) * Math.PI * 2;
    const inner = radius * 0.68;
    const outer = radius;
    if (i === 0) ctx.moveTo(Math.cos(a0) * inner, Math.sin(a0) * inner);
    else ctx.lineTo(Math.cos(a0) * inner, Math.sin(a0) * inner);
    ctx.lineTo(Math.cos(a1) * outer, Math.sin(a1) * outer);
    ctx.lineTo(Math.cos(a2) * outer, Math.sin(a2) * outer);
    ctx.lineTo(Math.cos(a3) * inner, Math.sin(a3) * inner);
  }
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1208";
  ctx.fill();
  ctx.restore();
}

function drawGearSky(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, reduced: boolean) {
  const spots = [
    [width * 0.16, height * 0.22, 54, 1],
    [width * 0.84, height * 0.3, 72, -1],
    [width * 0.7, height * 0.72, 40, 1],
  ];
  ctx.save();
  ctx.globalAlpha = 0.28;
  for (const [x, y, radius, dir] of spots) {
    ctx.fillStyle = "#e2b34a";
    drawGear(ctx, x, y, radius, 10, reduced ? 0 : time * 0.35 * dir);
  }
  ctx.restore();
}

function isGravDoor(tx: number, ty: number) {
  if (Math.abs(tx - boardC) <= 1 && (ty === 2 || ty === board - 3)) return true;
  if (Math.abs(ty - boardC) <= 1 && (tx === 2 || tx === board - 3)) return true;
  return false;
}

function drawGravDoor(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  camX: number,
  camY: number,
) {
  const [sx, sy] = proj(tx + 0.5, ty + 0.5, GROUND + 14, camX, camY);
  ctx.fillStyle = "#e2b34a";
  ctx.fillRect(sx - 7, sy - 16, 3, 14);
  ctx.fillRect(sx + 4, sy - 16, 3, 14);
  ctx.fillRect(sx - 7, sy - 16, 14, 3);
}

function drawRiftPad(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  index: number,
  time: number,
  camX: number,
  camY: number,
) {
  const [sx, sy] = proj(tx + 0.5, ty + 0.5, GROUND + 8, camX, camY);
  const hot = index % 2 === 0;
  const bob = Math.sin(time * 4 + index) * 3;
  ctx.fillStyle = hot ? "#ff4ad8" : "#3df0ff";
  ctx.fillRect(sx - 8, sy - 16 + bob, 16, 3);
  ctx.fillRect(sx - 2, sy - 22 + bob, 4, 14);
  ctx.fillStyle = hot ? "#3df0ff" : "#ff4ad8";
  ctx.fillRect(sx - 5, sy - 20 + bob, 10, 2);
}

function drawWell(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const cx = width * 0.5;
  const cy = height * 0.42;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(time * 0.15);
  ctx.strokeStyle = "rgba(180, 120, 255, 0.28)";
  ctx.lineWidth = 2;
  for (let i = 1; i <= 5; i++) {
    const r = i * 46 + Math.sin(time + i) * 6;
    ctx.strokeRect(-r, -r * 0.55, r * 2, r * 1.1);
  }
  ctx.restore();
}

function drawBats(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  reduced: boolean,
) {
  const count = reduced ? 4 : 10;
  ctx.fillStyle = "#07060c";
  for (let i = 0; i < count; i++) {
    const speed = 22 + (i % 5) * 9;
    const x = ((i * 90 + time * speed) % (width + 70)) - 30;
    const y = 28 + ((i * 47) % Math.max(40, height * 0.42)) + Math.sin(time * 1.6 + i) * 12;
    const flap = Math.sin(time * 10 + i * 1.3);
    ctx.fillRect(x, y, 3, 2);
    ctx.fillRect(x - 7, y + flap * 3, 7, 2);
    ctx.fillRect(x + 3, y - flap * 3, 7, 2);
  }
}

function drawSnow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  reduced: boolean,
) {
  const count = reduced ? 16 : 56;
  for (let i = 0; i < count; i++) {
    const column = (i * 97) % 1000;
    const x = (column / 1000) * width + Math.sin(time * 0.45 + i) * 14;
    const speed = reduced ? 0 : 26 + (i % 6) * 12;
    const y = ((i * 53 + time * speed) % (height + 24)) - 12;
    const size = i % 5 === 0 ? 3.5 : i % 2 === 0 ? 2.2 : 1.4;
    ctx.globalAlpha = i % 4 === 0 ? 0.45 : 0.85;
    ctx.fillStyle = "#f4fbff";
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;
}

function drawAsh(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  reduced: boolean,
) {
  const count = reduced ? 12 : 40;
  for (let i = 0; i < count; i++) {
    const x = ((i * 137) % 1000) / 1000 * width + Math.sin(time * 0.3 + i) * 18;
    const speed = reduced ? 0 : 14 + (i % 5) * 8;
    const y = ((i * 41 + time * speed) % (height + 20)) - 10;
    ctx.globalAlpha = i % 5 === 0 ? 0.9 : 0.45;
    ctx.fillStyle = i % 5 === 0 ? "#ffb060" : "#6a6a68";
    ctx.fillRect(x, y, i % 3 === 0 ? 3 : 2, i % 3 === 0 ? 2 : 3);
  }
  ctx.globalAlpha = 1;
}

function drawCodeRain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  reduced: boolean,
) {
  const columns = reduced ? 8 : 16;
  ctx.font = "12px ui-monospace, monospace";
  ctx.textAlign = "center";
  for (let i = 0; i < columns; i++) {
    const x = ((i + 0.5) / columns) * width;
    const speed = 40 + (i % 5) * 18;
    const head = (time * speed + i * 37) % (height + 80);
    const len = 8 + (i % 6);
    for (let k = 0; k < len; k++) {
      const y = head - k * 14;
      if (y < -10 || y > height + 10) continue;
      ctx.globalAlpha = k === 0 ? 0.85 : Math.max(0.1, 0.5 - k * 0.05);
      ctx.fillStyle = k === 0 ? "#eafff0" : "#3dff7a";
      ctx.fillText(codeBit(i, k, (time + k) | 0), x, y);
    }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

function drawWallBody(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  lift1: number,
  camX: number,
  camY: number,
  gate: boolean,
) {
  if (theme.style === "cube") {
    quad(ctx, tx + 1, ty, tx + 1, ty + 1, 0, lift1, camX, camY, "#101018");
    quad(ctx, tx, ty + 1, tx + 1, ty + 1, 0, lift1, camX, camY, "#07080e");
    return;
  }
  if (theme.style === "code") {
    quad(ctx, tx + 1, ty, tx + 1, ty + 1, 0, lift1, camX, camY, "#010a04");
    quad(ctx, tx, ty + 1, tx + 1, ty + 1, 0, lift1, camX, camY, "#021208");
    ctx.font = "8px ui-monospace, monospace";
    ctx.textAlign = "center";
    const rows = 9;
    for (let i = 0; i < rows; i++) {
      const lift = (lift1 * (rows - i)) / (rows + 0.4);
      const lead = i === ((glyphTime * 4 + tx) | 0) % rows;
      for (let c = 0; c < 2; c++) {
        const along = 0.28 + c * 0.44;
        ctx.fillStyle = lead && c === 0 ? "#eafff0" : (i + c) % 3 === 0 ? "#b6ffd0" : "#2ecf66";
        const [rx, ry] = proj(tx + 1, ty + along, lift, camX, camY);
        const [lx, ly] = proj(tx + along, ty + 1, lift, camX, camY);
        ctx.fillText(codeBit(tx, ty, i * 2 + c), rx, ry);
        ctx.fillText(codeBit(ty + 2, tx, i * 2 + c + 4), lx, ly);
      }
    }
    for (let c = 0; c < 3; c++) {
      const [sx, sy] = proj(tx + 0.25 + c * 0.25, ty + 0.55, lift1 + 2, camX, camY);
      ctx.fillStyle = c === 1 ? "#eafff0" : "#3dff7a";
      ctx.fillText(codeBit(tx, ty, 20 + c), sx, sy);
    }
    ctx.textAlign = "left";
    return;
  }
  if (theme.style === "rift") {
    const hot = (tx + ty) % 2 === 0;
    quad(ctx, tx + 1, ty, tx + 1, ty + 1, 0, lift1, camX, camY, hot ? "#3a1048" : "#102838");
    quad(ctx, tx, ty + 1, tx + 1, ty + 1, 0, lift1, camX, camY, hot ? "#220818" : "#081820");
    const band = lift1 * 0.55;
    quad(ctx, tx + 1, ty, tx + 1, ty + 1, band, band + 3, camX, camY, hot ? "#ff4ad8" : "#3df0ff");
    quad(ctx, tx + 0.2, ty + 1, tx + 0.34, ty + 1, lift1 * 0.2, lift1 * 0.9, camX, camY, hot ? "#3df0ff" : "#ff4ad8");
    return;
  }
  if (theme.style === "well") {
    for (let i = 0; i < 6; i++) {
      const a = (lift1 * i) / 6;
      const b = a + Math.max(2, lift1 * 0.07);
      const color = i % 2 === 0 ? "#1a0a28" : "#4a2080";
      quad(ctx, tx + 1, ty, tx + 1, ty + 1, a, b, camX, camY, color);
      quad(ctx, tx, ty + 1, tx + 1, ty + 1, a, b, camX, camY, i % 2 ? "#2a1248" : "#100616");
    }
    return;
  }
  if (theme.style === "ash") {
    quad(ctx, tx + 1, ty, tx + 1, ty + 1, 0, lift1, camX, camY, "#3a2014");
    quad(ctx, tx, ty + 1, tx + 1, ty + 1, 0, lift1, camX, camY, "#1c0e0a");
    const seam = lift1 * 0.45;
    quad(ctx, tx + 1, ty, tx + 1, ty + 1, seam, seam + 2.4, camX, camY, "#ff6a1a");
    quad(ctx, tx + 0.62, ty + 1, tx + 0.74, ty + 1, lift1 * 0.15, lift1 * 0.92, camX, camY, "#ffb060");
    return;
  }
  if (theme.style === "grav") {
    quad(ctx, tx + 1, ty, tx + 1, ty + 1, 0, lift1, camX, camY, "#241440");
    quad(ctx, tx, ty + 1, tx + 1, ty + 1, 0, lift1, camX, camY, "#140c28");
    const band = lift1 * 0.62;
    quad(ctx, tx + 1, ty, tx + 1, ty + 1, band, band + 3, camX, camY, "#e2b34a");
    return;
  }
  if (theme.style === "gear") {
    quad(ctx, tx + 1, ty, tx + 1, ty + 1, 0, lift1, camX, camY, "#5a4634");
    quad(ctx, tx, ty + 1, tx + 1, ty + 1, 0, lift1, camX, camY, "#2e2218");
    const teeth = 5;
    for (let i = 0; i < teeth; i++) {
      const a = (lift1 * i) / teeth;
      const b = a + Math.max(2, lift1 * 0.06);
      quad(ctx, tx + 1, ty, tx + 1, ty + 1, a, b, camX, camY, i % 2 ? "#e2b34a" : "#1a120c");
    }
    return;
  }
  if (theme.style === "pillars") {
    for (const start of [0, 0.36, 0.7]) {
      quad(ctx, tx + 1, ty + start, tx + 1, ty + start + 0.24, 0, lift1, camX, camY, theme.wallRight);
      quad(ctx, tx + start, ty + 1, tx + start + 0.24, ty + 1, 0, lift1, camX, camY, theme.wallLeft);
    }
    if (gate) quad(ctx, tx + 1, ty, tx + 1, ty + 1, lift1 - 4, lift1, camX, camY, theme.signal);
    return;
  }
  if (theme.style === "circuit") {
    quad(ctx, tx + 1, ty, tx + 1, ty + 1, 0, lift1, camX, camY, "#1c1c2a");
    quad(ctx, tx, ty + 1, tx + 1, ty + 1, 0, lift1, camX, camY, "#12121c");
    const trace = lift1 * 0.62;
    quad(ctx, tx + 1, ty, tx + 1, ty + 1, trace, trace + 2.2, camX, camY, theme.signal);
    quad(ctx, tx + 0.42, ty + 1, tx + 0.54, ty + 1, lift1 * 0.18, lift1 * 0.88, camX, camY, theme.signal);
    return;
  }
  const style = theme.style === "mint" ? "hedge" : theme.style;
  const bands = style === "brick" ? 8 : style === "ice" ? 2 : style === "stone" || style === "hedge" ? 3 : 6;
  const thick = style === "bars" || style === "brick" ? 0.48 : style === "ice" ? 0.9 : 0.72;
  for (let i = 0; i < bands; i++) {
    if (style === "bars" && i % 2 === 1) continue;
    const a = (lift1 * i) / bands;
    const b = (lift1 * (i + thick)) / bands;
    let left = i % 2 === 0 ? theme.wallLeft : theme.wallLeftAlt;
    let right = i % 2 === 0 ? theme.wallRight : theme.wallRightAlt;
    if (style === "hedge") {
      left = i === 1 ? theme.pine : theme.glade;
      right = i === 1 ? theme.pineAlt : theme.pine;
    } else if (style === "bloom" && i % 2 === 0) {
      right = theme.signal;
    } else if (style === "stone" && i === 1) {
      left = theme.wallLeftAlt;
      right = theme.wallRightAlt;
    }
    quad(ctx, tx + 1, ty, tx + 1, ty + 1, a, b, camX, camY, right);
    quad(ctx, tx, ty + 1, tx + 1, ty + 1, a, b, camX, camY, left);
  }
  if (gate) quad(ctx, tx + 1, ty, tx + 1, ty + 1, lift1 - 4, lift1, camX, camY, theme.signal);
}

function quad(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  liftA: number,
  liftB: number,
  camX: number,
  camY: number,
  color: string,
) {
  poly(ctx, [
    proj(x0, y0, liftB, camX, camY),
    proj(x1, y1, liftB, camX, camY),
    proj(x1, y1, liftA, camX, camY),
    proj(x0, y0, liftA, camX, camY),
  ]);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRim(
  ctx: CanvasRenderingContext2D,
  sim: GladeSim,
  tx: number,
  ty: number,
  lift: number,
  open: boolean,
  camX: number,
  camY: number,
  grid: boolean,
) {
  const edges: [number, number, number, number][] = [
    [tx, ty, tx + 1, ty],
    [tx + 1, ty, tx + 1, ty + 1],
    [tx + 1, ty + 1, tx, ty + 1],
    [tx, ty + 1, tx, ty],
  ];
  const neighbors: [number, number][] = [
    [tx, ty - 1],
    [tx + 1, ty],
    [tx, ty + 1],
    [tx - 1, ty],
  ];
  ctx.lineWidth = 1.15;
  for (let i = 0; i < 4; i++) {
    const [nx, ny] = neighbors[i];
    const nt = nx < 0 || ny < 0 || nx >= board || ny >= board ? WALL : sim.maze.tiles[ny * board + nx];
    const hard = nt === WALL || (nt === GATE && !open) || nt === -1;
    const [x0, y0, x1, y1] = edges[i];
    const a = proj(x0, y0, lift, camX, camY);
    const b = proj(x1, y1, lift, camX, camY);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    if (grid) {
      ctx.strokeStyle = theme.grid;
      ctx.stroke();
    }
    if (hard) {
      ctx.strokeStyle = theme.edge;
      ctx.stroke();
    }
  }
}

function drawProp(
  ctx: CanvasRenderingContext2D,
  prop: MazeProp,
  sim: GladeSim,
  assets: DrawAssets,
  camX: number,
  camY: number,
) {
  if (theme.dark) return;
  const [sx, sy] = proj(prop.x + 0.5, prop.y + 0.5, GROUND, camX, camY);
  if (theme.style === "code" && (prop.kind === "tree" || prop.kind === "pine")) {
    drawCodeTree(ctx, sx, sy, prop.x * 3 + prop.y, prop.kind === "pine");
    return;
  }
  if (prop.kind === "tree" && assets.tree) {
    const s = 0.34;
    ctx.drawImage(assets.tree, sx - 120 * s, sy - 180 * s, 240 * s, 240 * s);
    return;
  }
  if (prop.kind === "tree") drawCloud(ctx, sx, sy, prop.x * 3 + prop.y);
  else if (prop.kind === "stone") {
    ctx.fillStyle = theme.wallLeft;
    ctx.fillRect(sx - 5, sy - 4, 10, 5);
    ctx.fillStyle = theme.wallRight;
    ctx.fillRect(sx - 3, sy - 7, 6, 4);
  } else if (prop.kind === "lamp") {
    ctx.fillStyle = theme.wallRight;
    ctx.fillRect(sx - 1, sy - 16, 2, 16);
    ctx.fillStyle = theme.signal;
    ctx.fillRect(sx - 3, sy - 22, 6, 6);
  } else drawPine(ctx, sx, sy, prop.x * 5 + prop.y);
}

function drawCodeTree(ctx: CanvasRenderingContext2D, sx: number, sy: number, seed: number, tall: boolean) {
  ctx.font = "9px ui-monospace, monospace";
  ctx.textAlign = "center";
  const canopy = tall
    ? [[0], [-1, 1], [-2, 0, 2], [-1, 1], [0], [-2, 0, 2], [-1, 1]]
    : [[0], [-1, 1], [-2, 0, 2], [-3, -1, 1, 3], [-2, 0, 2], [-1, 1]];
  canopy.forEach((cols, row) => {
    cols.forEach((col, index) => {
      ctx.fillStyle = row === 0 ? "#eafff0" : (row + index) % 3 === 0 ? "#b6ffd0" : "#2ecf66";
      ctx.fillText(codeBit(seed, col + 8, row), sx + col * 7, sy - 18 - (canopy.length - row) * 8);
    });
  });
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = "#146b32";
    ctx.fillText(codeBit(seed, 2, i + 9), sx, sy - 10 + i * 8);
  }
  ctx.textAlign = "left";
}

function drawCloud(ctx: CanvasRenderingContext2D, sx: number, sy: number, seed: number) {
  ctx.fillStyle = theme.trunk;
  ctx.fillRect(sx - 2, sy - 14, 4, 14);
  ctx.fillStyle = theme.tree;
  const blobs = [
    [0, -28, 12, 9],
    [-10, -22, 8, 7],
    [9, -21, 8, 6],
    [0, -18, 11, 7],
    [-4, -34, 6, 5],
  ];
  for (const [dx, dy, w, h] of blobs) ctx.fillRect(sx + dx - w, sy + dy, w * 2, h);
  ctx.fillStyle = theme.void;
  ctx.fillRect(sx - 8 + (seed % 3), sy - 30, 3, 3);
  ctx.fillRect(sx + 3, sy - 24, 3, 3);
}

function drawPine(ctx: CanvasRenderingContext2D, sx: number, sy: number, seed: number) {
  const h = 28 + (seed % 4) * 4;
  ctx.lineJoin = "miter";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    const y = sy - i * (h * 0.2);
    const w = h * 0.42 * (1 - i * 0.16);
    ctx.beginPath();
    ctx.moveTo(sx, y - h * 0.32);
    ctx.lineTo(sx + w, y);
    ctx.lineTo(sx - w, y);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? theme.pineAlt : theme.pine;
    ctx.fill();
    ctx.strokeStyle = theme.void;
    ctx.stroke();
  }
}

function drawBeacon(
  ctx: CanvasRenderingContext2D,
  sim: GladeSim,
  index: number,
  camX: number,
  camY: number,
) {
  if (theme.dark) {
    drawPlanet(ctx, sim, index, camX, camY);
    return;
  }
  const [bx, by] = sim.maze.beacons?.[index] ?? BEACONS[index];
  const bob = sim.reduced ? 0 : Math.sin(sim.time * 3 + index) * 2;
  const [sx, sy] = proj(bx + 0.5, by + 0.5, GROUND + bob, camX, camY);
  ctx.fillStyle = theme.wallRight;
  ctx.fillRect(sx - 1, sy - 18, 2, 18);
  const hot = sim.charted[index];
  const pulse = hot ? 1 : 0.55 + 0.45 * Math.sin(sim.time * 5 + index);
  ctx.globalAlpha = pulse;
  ctx.fillStyle = hot ? theme.ink : theme.signal;
  ctx.fillRect(sx - 6, sy - 30, 12, 12);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = theme.void;
  ctx.lineWidth = 1;
  ctx.strokeRect(sx - 6, sy - 30, 12, 12);
  if (sim.linkAt === index && !hot) {
    ctx.beginPath();
    ctx.arc(sx, sy - 24, 12, -Math.PI / 2, -Math.PI / 2 + sim.link * Math.PI * 2);
    ctx.strokeStyle = theme.signal;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawPlanet(
  ctx: CanvasRenderingContext2D,
  sim: GladeSim,
  index: number,
  camX: number,
  camY: number,
) {
  const [bx, by] = sim.maze.beacons?.[index] ?? BEACONS[index];
  const bob = sim.reduced ? 0 : Math.sin(sim.time * 2 + index) * 2;
  const [sx, sy] = proj(bx + 0.5, by + 0.5, GROUND + 16 + bob, camX, camY);
  const bodies = ["#c4552a", "#d8c07a", "#3a7ad4", "#e8e4dc", "#c43a6a", "#e0b040", "#3ec8a8", "#9060d8"];
  const shades = ["#7a2810", "#8a6830", "#1a4088", "#9a968e", "#701830", "#8a6418", "#146858", "#402068"];
  const lights = ["#f0b080", "#fff0c0", "#d8f4ff", "#ffffff", "#f8c0d8", "#fff0a8", "#d8fff4", "#e4d4ff"];
  const body = bodies[index % 8];
  const shade = shades[index % 8];
  const light = lights[index % 8];
  const hot = sim.charted[index];
  if (hot) {
    ctx.save();
    ctx.shadowColor = light;
    ctx.shadowBlur = sim.reduced ? 0 : 18;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = light;
    ctx.fillRect(sx - 11, sy - 24, 22, 24);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  if (index % 2 === 1) {
    ctx.fillStyle = light;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(sx - 14, sy - 8, 28, 2);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = body;
  ctx.fillRect(sx - 7, sy - 16, 14, 10);
  ctx.fillRect(sx - 5, sy - 20, 10, 4);
  ctx.fillRect(sx - 5, sy - 6, 10, 2);
  ctx.fillStyle = shade;
  ctx.fillRect(sx - 7, sy - 12, 5, 4);
  ctx.fillStyle = light;
  ctx.fillRect(sx + 2, sy - 18, 3, 3);
  if (sim.linkAt === index && !hot) {
    ctx.strokeStyle = theme.signal;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - 9, sy - 22, 18 * sim.link, 2);
  }
}

function drawExit(
  ctx: CanvasRenderingContext2D,
  sim: GladeSim,
  camX: number,
  camY: number,
) {
  if (theme.dark) return;
  const open = sim.exitOpen();
  const pulse = 0.65 + 0.35 * Math.sin(sim.time * 6);
  const [ex, ey] = theme.style === "cube" ? cubePoint(sim.maze.exitX + 0.5, sim.maze.exitY + 0.5, sim.twist) : [sim.maze.exitX + 0.5, sim.maze.exitY + 0.5];
  const [sx, sy] = proj(ex, ey, GROUND + 20, camX, camY);
  ctx.globalAlpha = open ? pulse : 0.85;
  ctx.fillStyle = open ? theme.signal : theme.wallLeft;
  ctx.fillRect(sx - 8, sy - 18, 16, 16);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = theme.void;
  ctx.strokeRect(sx - 8, sy - 18, 16, 16);
  if (open) {
    ctx.fillStyle = theme.void;
    ctx.fillRect(sx - 3, sy - 13, 6, 6);
  }
}

function drawLurker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
  camX: number,
  camY: number,
  dx: number,
  dy: number,
  assets: DrawAssets,
  disguised = false,
) {
  const art = assets.player ?? assets.roster[0];
  if (!art) return;
  const facing: Facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  if (disguised) {
    const [sx, sy] = proj(x, y, GROUND, camX, camY);
    if (Number.isFinite(sx) && Number.isFinite(sy)) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(sx - 8, sy - 2, 16, 4);
    }
    blit(ctx, frameOf(art, facing, true, time), x, y, camX, camY);
    return;
  }
  const frame = frameOf(art, facing, true, time);
  if (!frame || frame.width < 1) return;
  const [sx, sy] = proj(x, y, GROUND, camX, camY);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
  const w = frame.width * 1.25;
  const h = frame.height * 1.25;
  const left = sx - w / 2;
  const top = sy - h + 3;
  const blink = Math.sin(time * 7) > 0.9;
  ctx.save();
  try {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(sx - 10, sy - 2, 20, 4);
    ctx.globalAlpha = 0.65;
    ctx.drawImage(frame, left + 4, top + 2, w, h);
    ctx.globalAlpha = 1;
    ctx.drawImage(frame, left, top, w, h);
    const rows = spriteFrame(art.art, facing, true, Math.floor(time * 10) & 7, facing === "left" ? "left" : "right");
    ctx.globalAlpha = 0.75;
    drawFrame(ctx, rows, left + 5, top - 1, 3.75, theme.signal);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#070707";
    ctx.fillRect(sx - 8, top + h * 0.55, 16, 3);
    if (!blink) {
      ctx.fillStyle = theme.signal;
      ctx.fillRect(sx - 2, top + 14, 5, 5);
    }
    if (theme.style === "cowl") {
      ctx.fillStyle = "#f4efe4";
      ctx.fillRect(sx - 7, top + 6, 14, 10);
      ctx.fillStyle = "#111";
      ctx.fillRect(sx - 5, top + 8, 3, 2);
      ctx.fillRect(sx + 2, top + 8, 3, 2);
      ctx.fillStyle = "#d40000";
      ctx.fillRect(sx - 6, top + 12, 12, 3);
      ctx.fillStyle = "#148a32";
      ctx.fillRect(sx - 6, top + 2, 3, 5);
      ctx.fillRect(sx - 1, top + 1, 3, 5);
      ctx.fillRect(sx + 4, top + 2, 3, 5);
    }
  } finally {
    ctx.restore();
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  sim: GladeSim,
  assets: DrawAssets,
  camX: number,
  camY: number,
) {
  if (!Number.isFinite(sim.x) || !Number.isFinite(sim.y)) return;
  const [px, py] = theme.style === "cube" ? cubePoint(sim.x, sim.y, sim.twist) : [sim.x, sim.y];
  const [sx, sy] = proj(px, py, GROUND, camX, camY);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(sx - 8, sy - 2, 16, 4);
  const art = assets.player ?? assets.roster[0];
  if (!art) return;
  blit(
    ctx,
    frameOf(art, sim.facing, sim.moving, sim.time),
    px,
    py,
    camX,
    camY,
    sim.wearing ? sim.outfit : "",
    sim.facing,
    sim.time,
  );
}

const outfit = typeof document === "undefined" ? null : document.createElement("canvas");

function blit(
  ctx: CanvasRenderingContext2D,
  frame: HTMLCanvasElement | undefined,
  x: number,
  y: number,
  camX: number,
  camY: number,
  dressed = "",
  facing: Facing = "down",
  time = 0,
) {
  if (!frame || frame.width < 1 || frame.height < 1) return;
  const [sx, sy] = proj(x, y, GROUND, camX, camY);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
  const source = dressed && outfit ? dress(frame, dressed, facing, time) : frame;
  ctx.drawImage(source, sx - frame.width / 2, sy - frame.height + 3);
}

function dress(frame: HTMLCanvasElement, id: string, facing: Facing, time = 0) {
  if (!outfit) return frame;
  const item = outfitById(id);
  if (!item) return frame;
  if (outfit.width !== frame.width || outfit.height !== frame.height) {
    outfit.width = frame.width;
    outfit.height = frame.height;
  }
  const coat = outfit.getContext("2d");
  if (!coat) return frame;
  coat.clearRect(0, 0, outfit.width, outfit.height);
  coat.drawImage(frame, 0, 0);
  coat.save();
  coat.globalCompositeOperation = "source-atop";
  paintMask(coat, outfit.width, outfit.height, item.cut, facing, time);
  coat.restore();
  return outfit;
}

function paintMask(coat: CanvasRenderingContext2D, w: number, h: number, cut: string, facing: Facing, time = 0) {
  const back = facing === "up";
  const side = facing === "left" ? -1 : facing === "right" ? 1 : 0;
  const span = w * 0.56;
  const left = (w - span) / 2;
  const top = h * 0.08;
  const cx = w * 0.5;
  if (cut === "cowl") {
    coat.fillStyle = "#070707";
    coat.fillRect(left, top, span, back ? h * 0.16 : h * 0.28);
    if (!back) {
      coat.fillStyle = "#f7f7f7";
      const eye = span * 0.22;
      const near = side === 0 ? left + span * 0.18 : left + span * (side < 0 ? 0.12 : 0.58);
      const far = side === 0 ? left + span * 0.6 : left + span * (side < 0 ? 0.48 : 0.22);
      coat.fillRect(near, top + h * 0.08, eye, 4);
      coat.fillRect(far, top + h * 0.1, eye * 0.7, 3);
    }
    coat.globalCompositeOperation = "source-over";
    coat.fillStyle = "#070707";
    const ear = w * 0.12;
    coat.fillRect(left - ear * 0.2, top - h * 0.06, ear, h * 0.12);
    coat.fillRect(left + span - ear * 0.6, top - h * 0.06, ear, h * 0.12);
    if (side !== 0) coat.fillRect(cx + side * span * 0.2, top - h * 0.1, ear * 0.45, h * 0.14);
    return;
  }
  if (cut === "grin") {
    coat.fillStyle = "#f4efe4";
    coat.fillRect(left, top, span, back ? h * 0.14 : h * 0.26);
    if (!back) {
      coat.fillStyle = "#111";
      coat.fillRect(left + span * (side < 0 ? 0.12 : 0.55), top + h * 0.06, span * 0.16, h * 0.05);
      coat.fillRect(left + span * 0.38, top + h * 0.07, span * 0.12, h * 0.04);
      coat.fillStyle = "#d40000";
      const smileW = side === 0 ? span * 0.7 : span * 0.4;
      const smileX = side === 0 ? left + span * 0.15 : cx + side * span * 0.05;
      coat.fillRect(smileX, top + h * 0.16, smileW, h * 0.06);
    }
    coat.globalCompositeOperation = "source-over";
    coat.fillStyle = "#148a32";
    coat.fillRect(left, top - h * 0.08, span * 0.22, h * 0.12);
    coat.fillRect(left + span * 0.28, top - h * 0.1, span * 0.18, h * 0.12);
    coat.fillRect(left + span * 0.55, top - h * 0.06, span * 0.2, h * 0.1);
    return;
  }
  if (cut === "skull") {
    coat.fillStyle = "#f4f4f4";
    coat.fillRect(left, top, span, back ? h * 0.16 : h * 0.28);
    if (!back) {
      coat.fillStyle = "#070707";
      coat.fillRect(left + span * (side <= 0 ? 0.16 : 0.55), top + h * 0.07, span * 0.18, h * 0.07);
      coat.fillRect(left + span * 0.4, top + h * 0.08, span * 0.14, h * 0.05);
      coat.fillRect(left + span * 0.28, top + h * 0.18, span * 0.44, h * 0.04);
    }
    return;
  }
  if (cut === "wrap") {
    coat.fillStyle = "#f3efe6";
    coat.fillRect(left, top, span, back ? h * 0.14 : h * 0.26);
    coat.fillStyle = "#d9d2c3";
    coat.fillRect(left, top + h * 0.06, span, h * 0.04);
    coat.fillRect(left, top + h * 0.14, span, h * 0.035);
    if (!back) {
      coat.fillStyle = "#1a1a1a";
      coat.fillRect(left + span * (side < 0 ? 0.1 : 0.52), top + h * 0.05, span * 0.22, h * 0.05);
      coat.fillRect(left + span * 0.34, top + h * 0.06, span * 0.16, h * 0.04);
    }
    return;
  }
  if (cut === "beak") {
    coat.fillStyle = "#e7d7b0";
    coat.fillRect(left, top, span, back ? h * 0.12 : h * 0.18);
    if (!back) {
      coat.fillStyle = "#1c2428";
      const eye = span * 0.14;
      coat.fillRect(left + span * (side === 0 ? 0.18 : side < 0 ? 0.1 : 0.62), top + h * 0.04, eye, eye);
      coat.fillRect(left + span * 0.42, top + h * 0.05, eye * 0.7, eye * 0.7);
      coat.globalCompositeOperation = "source-over";
      coat.fillStyle = "#c9a36a";
      const beakW = side === 0 ? span * 0.22 : span * 0.34;
      const beakX = side === 0 ? cx - beakW / 2 : cx + side * span * 0.08;
      coat.fillRect(beakX, top + h * 0.12, beakW, h * 0.16);
      coat.fillRect(beakX + beakW * 0.2, top + h * 0.24, beakW * 0.6, h * 0.06);
    }
    return;
  }
  if (cut === "horns") {
    coat.fillStyle = "#241018";
    coat.fillRect(left, top, span, back ? h * 0.14 : h * 0.24);
    if (!back) {
      coat.fillStyle = "#ff3b3b";
      coat.fillRect(left + span * (side < 0 ? 0.12 : 0.55), top + h * 0.07, span * 0.16, h * 0.04);
      coat.fillRect(left + span * 0.38, top + h * 0.08, span * 0.12, h * 0.03);
    }
    coat.globalCompositeOperation = "source-over";
    coat.fillStyle = "#f2f2f2";
    coat.fillRect(left + span * 0.08, top - h * 0.12, span * 0.12, h * 0.16);
    coat.fillRect(left + span * 0.78, top - h * 0.12, span * 0.12, h * 0.16);
    if (side !== 0) coat.fillRect(cx + side * span * 0.28, top - h * 0.16, span * 0.1, h * 0.18);
    return;
  }
  coat.fillStyle = "#e6c15a";
  coat.fillRect(left, top, span, back ? h * 0.14 : h * 0.24);
  if (!back) {
    coat.fillStyle = "#070707";
    const slit = side === 0 ? span * 0.72 : span * 0.36;
    coat.fillRect(side === 0 ? left + span * 0.14 : cx + Math.min(0, side) * slit, top + h * 0.08, slit, h * 0.05);
  }
}

const STICK = ["#e23d32", "#2f6fe8", "#3aaa40", "#f4f4f4", "#f2c230", "#f08a22"];

function sticker(tx: number, ty: number, turn: number) {
  const n = (Math.imul(tx + 3, 0x45d9f3b) ^ Math.imul(ty + 9, 0x119de1f3) ^ Math.imul(turn + 1, 0x9e3779b9)) >>> 0;
  return STICK[n % STICK.length];
}

function cubePoint(x: number, y: number, p: number): [number, number] {
  if (p <= 0) return [x, y];
  const nx = y;
  const ny = board - x;
  return [x + (nx - x) * p, y + (ny - y) * p];
}

function cubeOrigin(tx: number, ty: number, p: number): [number, number] {
  const [cx, cy] = cubePoint(tx + 0.5, ty + 0.5, p);
  return [cx - 0.5, cy - 0.5];
}

export function frameOf(baked: Baked, facing: Facing, walking: boolean, time: number) {
  const fi = facing === "down" ? 0 : facing === "up" ? 1 : facing === "left" ? 2 : 3;
  const frame = Math.floor(time * (walking ? 10 : 2.5)) & 7;
  return baked.frames[(walking ? 32 : 0) + fi * 8 + frame];
}

function smooth(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}
