import type { PayCoin } from "./wallet";

const FALLBACK_USD = 0.000825;
const TOKEN = "0x0779369854d3ecdea927206718ffd7730c67b71f";

const DOLLARS: Record<string, number> = {
  buyBoard: 0.99,
  buyCowl: 1,
  buyGrin: 1,
  buySkull: 1,
  buyVisor: 1,
  buyWrap: 1,
  buyBeak: 1,
  buyHorns: 1,
};

const SHOP: Record<string, string> = {
  buyFlare: "5",
  holdMaze: "10",
  buyQuiet: "8",
  buyScout: "6",
  buyChance: "15",
};

let cached: { at: number; usd: number } | null = null;

export async function rareUsd() {
  if (cached && Date.now() - cached.at < 60_000) return cached.usd;
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/${TOKEN}`,
    );
    const json = (await res.json()) as { data?: { attributes?: { price_usd?: string } } };
    const usd = Number(json.data?.attributes?.price_usd);
    if (usd > 0 && Number.isFinite(usd)) {
      cached = { at: Date.now(), usd };
      return usd;
    }
  } catch {
    /* use the last price we have */
  }
  return cached?.usd ?? FALLBACK_USD;
}

export function rfForDollars(dollars: number, usd: number) {
  const tokens = Math.ceil((dollars / usd) * 100) / 100;
  return tokens.toFixed(2);
}

export function dollarsOf(action: string) {
  return DOLLARS[action] ?? null;
}

export async function chargeUnits(action: string, coin: PayCoin) {
  const dollars = DOLLARS[action];
  if (dollars == null) return SHOP[action] ?? "0";
  if (coin === "USDG") return dollars.toFixed(2);
  return rfForDollars(dollars, await rareUsd());
}
