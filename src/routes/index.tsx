import { createFileRoute } from "@tanstack/react-router";
import { GladeRun } from "@/game/GladeRun";
import { connectFriend, payRare } from "@/lib/wallet";
import { chargeUnits } from "@/lib/price";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <GladeRun
      connectWallet={connectFriend}
      spend={async (action, coin) => {
        await payRare(await chargeUnits(action, coin), coin);
        return "now";
      }}
    />
  );
}
