# GLADE

A Rare Friends maze runner. You play as your Generations NFT, chart beacons through a shifting maze, and spend RF to survive the night.

Built for the [Rare Friends Vibeathon](https://github.com/spokesz/rarefriends-vibeathon). The submission window closed September 30, 2026, and winners are already posted, so this repository is the public source rather than a judged entry.

**Builder:** Steven Reynolds · [X @Sharpbigred](https://x.com/Sharpbigred)

**Category:** Character Spotlight. The selected Rare Friend is the runner. Corrupted copies of that same Friend hunt the halls.

**One sentence:** GLADE is an isometric maze where your Rare Friend charts beacons before night, hides beside a giant Rare coin, and spends RF on flares, holds, and masks.

## Stack

FriendSDK from [rarefriends/friendsdk](https://github.com/rarefriends/friendsdk). React canvas game. Wallet play uses MetaMask on Robinhood Chain. The first level shows purchases for free so you can see them. Later levels charge RF.

## Run

```bash
npm install github:rarefriends/friendsdk react react-dom
npx friendsdk dev games/glade-run
```

You need a wallet holding a Generations NFT, generation 1 or higher, on Robinhood mainnet.

## How to play

Move with the stick, WASD, or the arrows. A is left, D is right. Tap a tile to run there.

- **Day.** Doors are open. Stand on a beacon until it charts. The first day lasts about 108 seconds and later levels are shorter.
- **Walls.** The maze rebuilds every 20 seconds.
- **Dusk.** Get back to the Glade.
- **Night.** Corrupted Friends hunt. A giant Rare coin rises in the Glade. Stay with it until day.
- Chart five beacons and the exit opens. Step on it.
- If a corrupted Friend catches you, the run ends unless you bought a second chance.

Open the menu to pause. From the main menu you can continue the run or pick another level.

## RF spends

| Action | RF |
|---|---|
| Flare | 5 |
| Hold this maze | 10 |
| Quiet | 8 |
| Scout | 6 |
| Night Cowl | 4 |
| Red Grin | 6 |
| Skull | 8 |
| Visor | 10 |
| Second chance | 15 |

The first level grants these without a transaction so you can see them. Every other level asks the wallet to burn that much RF.

## Checks

`tsc --noEmit` is clean on the game sources. Known limits: the playable host is the FriendSDK page, not a separate static GitHub Pages build. Purchases on levels after the first are real RF burns, not a simulated ledger.
