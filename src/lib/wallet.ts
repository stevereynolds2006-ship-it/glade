import { FAMILY_NAMES, type FriendArt } from "@rarefriends/friendsdk";
import { createPublicClient, defineChain, encodeFunctionData, http, parseAbi, parseUnits } from "viem";

const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
});

const GENERATIONS = "0x14C49e6118F46525dE9ab41a51cBAA3c6EBF181D";
const FAMILIES = "0x246E3E9730A7Eade94c79be0Fd78d210f89AEb8D";
const CUSTODY = "0x37702f6b25217e5eF34F6b3aF589476CEa35Be3a";
const RF = "0x0779369854d3EcdEA927206718FFD7730C67B71f";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const PAYEE = "0xb7823b2e28484382AA70952a7818712E8Ac42a72";

export type PayCoin = "RF" | "USDG";

const TOKENS: Record<PayCoin, { address: `0x${string}`; decimals: number }> = {
  RF: { address: RF, decimals: 18 },
  USDG: { address: USDG, decimals: 6 },
};

const rfAbi = parseAbi([
  "function transfer(address to, uint256 value) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
]);

const generationsAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
]);
const familiesAbi = parseAbi([
  "function familyOf(uint256 tokenId) pure returns (uint8)",
  "function seedOf(uint256 tokenId) pure returns (uint32)",
  "function frames(uint8 id, uint32 seed) view returns (uint256[64])",
]);
const custodyAbi = parseAbi(["function beneficiary(uint256 tokenId) view returns (address)"]);

const client = createPublicClient({ chain: robinhood, transport: http() });

type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  providers?: Provider[];
};

function pickProvider(eth: Provider | undefined): Provider | null {
  if (!eth) return null;
  const injected = eth.providers?.find((item) => item.isMetaMask);
  if (injected) return injected;
  return eth;
}

function readProvider(): Provider | null {
  const eth = (window as unknown as { ethereum?: Provider }).ethereum;
  return pickProvider(eth);
}

function waitForProvider(ms = 600): Promise<Provider | null> {
  const ready = readProvider();
  if (ready) return Promise.resolve(ready);
  return new Promise((resolve) => {
    const finish = () => resolve(readProvider());
    window.addEventListener("ethereum#initialized", finish, { once: true });
    window.setTimeout(() => {
      window.removeEventListener("ethereum#initialized", finish);
      finish();
    }, ms);
  });
}

export function hasWallet() {
  return waitForProvider().then((provider) => provider != null);
}

export function openInMetaMask(nft?: string) {
  const url = new URL(window.location.href);
  if (nft && /^\d+$/.test(nft)) url.searchParams.set("nft", nft);
  const target = `https://metamask.app.link/dapp/${url.host}${url.pathname}${url.search}`;
  window.location.assign(target);
}

async function account(): Promise<string> {
  const eth = await waitForProvider();
  if (!eth) {
    throw new Error("NO_WALLET");
  }
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts[0];
  if (!address) throw new Error("The wallet did not share an account.");
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1237" }] });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) throw new Error("Switch MetaMask to Robinhood Chain.");
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0x1237",
          chainName: "Robinhood Chain",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
          blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
        },
      ],
    });
  }
  return address;
}

function same(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

export async function listFriends(address: string) {
  const res = await fetch(`https://api.hoodexplorer.io/api/address/${address}/nfts`);
  if (!res.ok) throw new Error("Could not list the Friends in this wallet.");
  const json = (await res.json()) as { nfts?: { token?: string; token_id?: string }[] };
  const ids = (json.nfts ?? [])
    .filter(
      (item) =>
        (item.token ?? "").toLowerCase() === GENERATIONS.toLowerCase() && /^\d+$/.test(item.token_id ?? ""),
    )
    .map((item) => item.token_id as string);
  return [...new Set(ids)].slice(0, 40);
}

export async function connectAccount() {
  return account();
}

export async function payRare(units: string, coin: PayCoin = "RF") {
  const address = await account();
  const token = TOKENS[coin];
  const value = parseUnits(units, token.decimals);
  const balance = await client.readContract({
    address: token.address,
    abi: rfAbi,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
  });
  if (balance < value) throw new Error(`Not enough ${coin}. This costs ${units} ${coin}.`);
  const data = encodeFunctionData({
    abi: rfAbi,
    functionName: "transfer",
    args: [PAYEE, value],
  });
  const eth = await waitForProvider();
  if (!eth) throw new Error("NO_WALLET");
  let hash: string;
  try {
    hash = (await eth.request({
      method: "eth_sendTransaction",
      params: [{ from: address, to: token.address, data, value: "0x0" }],
    })) as string;
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 4001) throw new Error("You cancelled the transaction.");
    throw new Error(error instanceof Error ? error.message : "MetaMask did not send the payment.");
  }
  const receipt = await client.waitForTransactionReceipt({ hash: hash as `0x${string}` });
  if (receipt.status !== "success") throw new Error("The payment failed.");
}

export async function connectFriend(tokenId: string): Promise<{ address: string; art: FriendArt; tokenId: string }> {
  if (!/^\d+$/.test(tokenId) || tokenId === "0") throw new Error("Enter your NFT number first.");
  const address = await account();
  const id = BigInt(tokenId);
  let owner = "";
  try {
    owner = await client.readContract({
      address: GENERATIONS,
      abi: generationsAbi,
      functionName: "ownerOf",
      args: [id],
    });
  } catch {
    throw new Error("That Friend number is not on Robinhood Chain.");
  }
  let allowed = same(owner, address);
  if (!allowed) {
    try {
      const beneficiary = await client.readContract({
        address: CUSTODY,
        abi: custodyAbi,
        functionName: "beneficiary",
        args: [id],
      });
      allowed = same(beneficiary, address);
    } catch {
      allowed = false;
    }
  }
  if (!allowed) throw new Error("That NFT is not in this wallet.");
  const familyId = await client.readContract({
    address: FAMILIES,
    abi: familiesAbi,
    functionName: "familyOf",
    args: [id],
  });
  const seed = await client.readContract({
    address: FAMILIES,
    abi: familiesAbi,
    functionName: "seedOf",
    args: [id],
  });
  const frames = await client.readContract({
    address: FAMILIES,
    abi: familiesAbi,
    functionName: "frames",
    args: [familyId, seed],
  });
  const art: FriendArt = {
    familyId,
    familyName: FAMILY_NAMES[familyId] ?? "Friend",
    seed,
    frames: frames.map((frame) => `0x${frame.toString(16)}`),
  };
  return { address, art, tokenId };
}
