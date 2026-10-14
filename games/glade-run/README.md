# GLADE

A Rare Friends maze runner. Shallow isometric halls, a signal-green Glade, and walls that rise and forget you.

FriendSDK **1.0.0** from [rarefriends/friendsdk](https://github.com/rarefriends/friendsdk). Your runner is the Friend the host selected. This preview also plays with cached sprites (Mask #1, Mask #64, Cellular #101). Nothing in this maze buys, stakes, or pays. Economy label: **simulated / none**.

## Play

Open the hosted page on a phone or computer. **Start**. Move with the stick, WASD, or arrows (A left, D right). Tap the ground to run there.

- **Day** — doors are open. Stand on a beacon until it charts.
- **Dusk** — get back to the Glade.
- **Night** — Lurkers hunt the halls. They cannot enter the Glade. Three pulse. A sting costs one.
- **Dawn** — the maze rebuilds and sunrise pulls you home. Charted sections stay charted. The exit corner does not move.
- Chart **5** sections. The exit burns green. Step on it.

## FriendSDK host

```bash
npm install github:rarefriends/friendsdk react react-dom
npx friendsdk dev games/glade-run
```

`games/glade-run/friendsdk.json` points the client at `index.tsx`. `FriendSession` connects to the host and passes that Friend's art into the maze. The game does not connect a wallet or send a transaction.

## Art

Friend pixels come from `@rarefriends/friendsdk` (`spriteFrame`). A few sprites are cached in `src/game/roster.json` so the preview does not wait on the host. Pines, halls, and the corrupted Friend are original drawings.
