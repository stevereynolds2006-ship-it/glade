import { FACINGS, spriteFrame, type Facing, type FriendArt } from "@rarefriends/friendsdk";
import rosterJson from "./roster.json";

export type Baked = {
  tokenId: string;
  familyName: string;
  frames: HTMLCanvasElement[];
  art: FriendArt;
};

type RosterEntry = FriendArt & { tokenId: string };

const roster = rosterJson as RosterEntry[];

let bakedRoster: Baked[] | null = null;

export function rosterEntries() {
  return roster.map((entry) => ({ tokenId: entry.tokenId, familyName: entry.familyName }));
}

export function bakedFriends(): Baked[] {
  if (bakedRoster) return bakedRoster;
  if (typeof document === "undefined") return [];
  bakedRoster = roster.flatMap((entry) => {
    const baked = bakeArt(entry, entry.tokenId);
    return baked ? [baked] : [];
  });
  return bakedRoster;
}

export function bakeArt(art: FriendArt, tokenId: string): Baked | null {
  if (typeof document === "undefined") return null;
  const frames: HTMLCanvasElement[] = [];
  for (const walking of [false, true]) {
    for (const facing of FACINGS) {
      for (let frame = 0; frame < 8; frame++) {
        frames.push(raster(spriteFrame(art, facing as Facing, walking, frame)));
      }
    }
  }
  return { tokenId, familyName: art.familyName, frames, art };
}

export function loadLiveFriend(id: bigint): Promise<Baked | null> {
  const entry = roster.find((item) => item.tokenId === id.toString());
  if (!entry) return Promise.resolve(null);
  return Promise.resolve(bakeArt(entry, entry.tokenId));
}

export function loadTreeImage(): Promise<HTMLImageElement | null> {
  return Promise.resolve(null);
}

function raster(rows: readonly string[]) {
  const scale = 3;
  const pad = 1;
  const canvas = document.createElement("canvas");
  canvas.width = 16 * scale + pad * 2;
  canvas.height = 16 * scale + pad * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const stamp = (color: string, ox: number, oy: number) => {
    ctx.fillStyle = color;
    for (let y = 0; y < 16; y++) {
      const row = rows[y] ?? "";
      for (let x = 0; x < 16; x++) {
        if (row[x] === "#") ctx.fillRect(pad + ox + x * scale, pad + oy + y * scale, scale, scale);
      }
    }
  };
  stamp("#ffffff", -1, 0);
  stamp("#ffffff", 1, 0);
  stamp("#ffffff", 0, -1);
  stamp("#ffffff", 0, 1);
  stamp("#070707", 0, 0);
  return canvas;
}
