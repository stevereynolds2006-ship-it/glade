# GLADE

**Play it:** [https://swift-grove-cliff-slate.grok.me](https://swift-grove-cliff-slate.grok.me)

A Rare Friends maze runner. You play as your Generations NFT, chart beacons through a shifting maze, and spend RF or USDG to open later boards.

**Builder:** Steven Reynolds · [X @Sharpbigred](https://x.com/Sharpbigred)

**Category:** Character Spotlight. The selected Rare Friend is the runner. Corrupted copies of that same Friend hunt the halls. A mimic wears your face until you get close.

## Play

Open [https://swift-grove-cliff-slate.grok.me](https://swift-grove-cliff-slate.grok.me) on a phone or computer. Sign in with MetaMask on Robinhood Chain, or pick a sample Friend, then start a run.

The first board is free. Every other board is $0.99, paid in RF or USDG. Once a board is paid, it stays open on this device.

## How to play

Move with the stick, WASD, or the arrows. A is left, D is right. Tap a tile to run there.

- **Day.** Doors are open. Stand on a beacon until it charts.
- **Walls.** The maze rebuilds every 20 seconds. The first three boards stay wide. Later boards add more wall.
- **Dusk.** Get back to the center.
- **Night.** Corrupted Friends hunt, and a mimic may slip its face and lunge. A giant Rare coin rises in the center. Stay with it until day.
- Chart five beacons and the exit opens. Step on it.

Open the menu to pause. From the main menu you can continue the run or pick another level.

## Stack

FriendSDK from [rarefriends/friendsdk](https://github.com/rarefriends/friendsdk). React canvas game. Wallet play uses MetaMask on Robinhood Chain.

## Run from source

```bash
npm install github:rarefriends/friendsdk react react-dom
npx friendsdk dev games/glade-run
```
