import { useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { displayAmount } from "@rarefriends/friendsdk";
import { FriendSession, messageOf, usePayments, type Ready } from "@rarefriends/friendsdk/react";
import { GladeRun } from "../../src/game/GladeRun";
import { OUTFITS } from "../../src/game/outfits";
import type { GladeSim } from "../../src/game/sim";

function HostedGlade({ ready, paused }: { ready: Ready<unknown>; paused: boolean }) {
  const simRef = useRef<GladeSim | null>(null);
  const bindSim = useCallback((sim: GladeSim) => {
    simRef.current = sim;
  }, []);
  const payments = usePayments(ready.game, {
    pending() {},
    settled(results) {
      for (const result of results) {
        if (result.status !== "settled") continue;
        if (result.action === "buyFlare") simRef.current?.grantFlare();
        if (result.action === "holdMaze") simRef.current?.holdMaze();
        if (result.action === "buyQuiet") simRef.current?.grantQuiet();
        if (result.action === "buyScout") simRef.current?.grantScout();
        if (result.action === "buyChance") simRef.current?.grantChance();
        const clothes = OUTFITS.find((item) => item.action === result.action);
        if (clothes) simRef.current?.grantOutfit(clothes.id);
      }
    },
    failed(result) {
      simRef.current?.say(result.error ?? "The Rare coin payment failed.");
    },
    async refresh() {},
    busy: () => false,
  });
  const currency = ready.holdings.currency;
  const balance = currency ? `${displayAmount(currency.balance, currency.decimals, 2)} RF` : null;
  return (
    <GladeRun
      hosted
      paused={paused}
      mode={ready.game.mode}
      friendId={ready.game.friend.id}
      art={ready.game.art}
      balance={balance}
      wallet={ready.game.friend.wallet}
      bindSim={bindSim}
      spend={async (action) => {
        try {
          const paid = await payments.pay(action);
          if (paid.outcome === "cancelled") return "no";
          if (paid.outcome === "waiting") return "later";
          return "now";
        } catch (error) {
          simRef.current?.say(messageOf(error, "Could not spend RF."));
          return "no";
        }
      }}
    />
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <FriendSession title="GLADE" loading="Loading your Friend…" closed="This session ended.">
      {(ready, paused) => <HostedGlade ready={ready} paused={paused} />}
    </FriendSession>,
  );
}
