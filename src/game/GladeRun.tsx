import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createAudio } from "./audio";
import { drawMap, drawWorld, type DrawAssets } from "./draw";
import { bakedFriends, bakeArt, loadLiveFriend, loadTreeImage, rosterEntries, type Baked } from "./friends";
import type { FriendArt } from "@rarefriends/friendsdk";
import { GladeSim, screenToWorld, viewZoom } from "./sim";
import { OUTFITS, type Outfit } from "./outfits";
import { THEMES } from "./themes";
import { connectAccount, hasWallet, listFriends, openInMetaMask, type PayCoin } from "@/lib/wallet";
import { dollarsOf, rareUsd, rfForDollars } from "@/lib/price";
import "./glade.css";

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys?: (codes: string[]) => void;
    };
  }
}

const BOARD_PRICE = dollarsOf("buyBoard") ?? 0.99;

function readBoards() {
  try {
    const raw = localStorage.getItem("glade-boards");
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

function freeBoard(level: number, opened: number[]) {
  return level === 0 || opened.includes(level);
}

function shortWallet(wallet: string) {
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function clock(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function inkOn(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r + g + b > 380 ? "#141414" : "#f4fff6";
}

function LevelPick(props: { sim: GladeSim; level: number; opened: number[] }) {
  return (
    <div className="levels" role="listbox" aria-label="Levels">
      {THEMES.map((level, index) => (
        <button
          key={level.name}
          type="button"
          className={index === props.level ? "on" : ""}
          aria-pressed={index === props.level}
          style={{ background: level.wallTop, color: inkOn(level.wallTop), borderColor: level.signal }}
          onClick={() => props.sim.pickLevel(index)}
        >
          {freeBoard(index, props.opened) ? level.name : `${level.name} · $${BOARD_PRICE}`}
        </button>
      ))}
    </div>
  );
}

export function GladeRun(props: {
  friendId?: string;
  art?: FriendArt | null;
  mode?: "dev" | "live";
  paused?: boolean;
  hosted?: boolean;
  balance?: string | null;
  wallet?: string | null;
  connectWallet?: (tokenId: string) => Promise<{ address: string; art: FriendArt; tokenId: string }>;
  bindSim?: (sim: GladeSim) => void;
  spend?: (
    action: Outfit["action"] | "buyFlare" | "holdMaze" | "buyQuiet" | "buyScout" | "buyChance" | "buyBoard",
    coin: PayCoin,
  ) => Promise<"now" | "later" | "no">;
} = {}) {
  const [sim] = useState(() => new GladeSim());
  const subscribe = useMemo(() => (fn: () => void) => sim.subscribe(fn), [sim]);
  const getHud = useMemo(() => () => sim.getHud(), [sim]);
  const hud = useSyncExternalStore(subscribe, getHud, getHud);
  const worldRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef(createAudio());
  const assets = useRef<DrawAssets>({ player: null, roster: [], tree: null });
  const pausedRef = useRef(props.paused);
  pausedRef.current = props.paused;
  const [baked, setBaked] = useState<Baked[]>([]);
  const [roster, setRoster] = useState<{ tokenId: string; familyName: string }[]>([]);
  const [slot, setSlot] = useState(0);
  const [note, setNote] = useState("Loading Friend art");
  const [customId, setCustomId] = useState(() => {
    if (typeof window === "undefined") return "";
    const nft = new URLSearchParams(window.location.search).get("nft") ?? "";
    return /^\d+$/.test(nft) ? nft : "";
  });
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [coin, setCoin] = useState<PayCoin>("RF");
  const [rfUsd, setRfUsd] = useState(0.000825);
  const [menu, setMenu] = useState(false);
  const [signedIn, setSignedIn] = useState(Boolean(props.hosted));
  const [linked, setLinked] = useState<string | null>(props.wallet ?? null);
  const [owned, setOwned] = useState<string[]>([]);
  const [opened, setOpened] = useState<number[]>([]);
  const [best, setBest] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [modeLabel, setModeLabel] = useState("Simulated");
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const stick = useRef<{ ox: number; oy: number } | null>(null);

  useEffect(() => {
    try {
      sim.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const friends = bakedFriends();
      assets.current.roster = friends;
      assets.current.player = friends[0] ?? null;
      setBaked(friends);
      setRoster(rosterEntries());
      if (friends[0]) setNote(`${friends[0].familyName} #${friends[0].tokenId}`);
      else setNote("Maze ready");
    } catch {
      setNote("Maze ready");
    }
    void loadTreeImage().then((img) => {
      assets.current.tree = img;
    });
    void rareUsd().then(setRfUsd);
    try {
      const raw = localStorage.getItem("glade-best");
      if (raw) setBest(Number(raw));
      setOpened(readBoards());
    } catch {
      /* private mode */
    }
  }, [sim]);

  useEffect(() => {
    if (!props.hosted) return;
    if (props.mode) setModeLabel(props.mode === "live" ? "Live" : "Dev");
    if (!props.art) return;
    const bakedArt = bakeArt(props.art, props.friendId ?? "");
    if (!bakedArt) return;
    assets.current.player = bakedArt;
    setSignedIn(true);
    setNote(`${bakedArt.familyName} #${props.friendId ?? ""}`);
  }, [props.art, props.friendId, props.hosted, props.mode]);

  useEffect(() => {
    const pick = baked[slot];
    if (!pick || props.hosted) return;
    assets.current.player = pick;
    setNote(`${pick.familyName} #${pick.tokenId}`);
  }, [baked, props.hosted, slot]);

  useEffect(() => {
    props.bindSim?.(sim);
  }, [props.bindSim, sim]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const fit = () => {
      const view = window.visualViewport;
      const height = view?.height ?? window.innerHeight;
      const width = view?.width ?? window.innerWidth;
      shell.style.height = `${height}px`;
      shell.style.width = `${width}px`;
      shell.style.top = `${view?.offsetTop ?? 0}px`;
      shell.style.left = `${view?.offsetLeft ?? 0}px`;
    };
    fit();
    window.visualViewport?.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("scroll", fit);
    window.addEventListener("resize", fit);
    return () => {
      window.visualViewport?.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
    };
  }, []);

  useEffect(() => {
    if (props.hosted) return;
    setModeLabel("Simulated");
  }, [props.hosted]);

  useEffect(() => {
    if (hud.outcome !== "win") return;
    setBest((prev) => {
      const next = prev == null ? hud.elapsed : Math.min(prev, hud.elapsed);
      try {
        localStorage.setItem("glade-best", String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [hud.elapsed, hud.outcome]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      try {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        acc += dt;
        sim.hold = Boolean(pausedRef.current);
        let steps = 0;
        while (acc >= 1 / 60 && steps < 5) {
          sim.step(1 / 60);
          acc -= 1 / 60;
          steps++;
        }
        const world = worldRef.current;
        if (world) drawWorld(world, sim, assets.current);
        const map = mapRef.current;
        if (map) drawMap(map, sim);
        if (!sim.reduced) {
          for (const name of sim.drainSounds()) audioRef.current.play(name);
        } else sim.drainSounds();
      } catch {
        /* one bad frame should not stop the maze */
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sim]);

  useEffect(() => {
    const block = new Set([
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Space",
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
    ]);
    const down = (event: KeyboardEvent) => {
      if (block.has(event.code)) event.preventDefault();
      if (event.repeat) {
        sim.input.keys.add(event.code);
        return;
      }
      if (event.code === "Escape") sim.togglePause();
      sim.input.keys.add(event.code);
    };
    const up = (event: KeyboardEvent) => sim.input.keys.delete(event.code);
    const blur = () => {
      sim.input.keys.clear();
      sim.input.stickX = 0;
      sim.input.stickY = 0;
    };
    const vis = () => {
      sim.hidden = document.hidden;
      if (document.hidden) blur();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    window.__controlsTest = {
      getYaw: () => sim.yaw,
      getSpeed: () => sim.speed,
      setKeys: (codes) => {
        sim.input.forced = new Set(codes);
      },
    };
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
      delete window.__controlsTest;
    };
  }, [sim]);

  const buy = (action: Outfit["action"] | "buyFlare" | "holdMaze" | "buyQuiet" | "buyScout" | "buyChance") => {
    audioRef.current.unlock();
    const apply = () => {
      const clothes = OUTFITS.find((item) => item.action === action);
      if (clothes) sim.grantOutfit(clothes.id);
      else if (action === "buyFlare") sim.grantFlare();
      else if (action === "holdMaze") sim.holdMaze();
      else if (action === "buyQuiet") sim.grantQuiet();
      else if (action === "buyScout") sim.grantScout();
      else sim.grantChance();
    };
    if ((sim.parked ? sim.pending : sim.theme) === 0) {
      apply();
      setNote("Free on the first level, so you can see it. Later levels charge RF or USDG.");
      return;
    }
    if (!props.spend) {
      setNote("This level needs a wallet payment.");
      return;
    }
    setPaying(true);
    setNote(`Confirm the ${coin} payment in your wallet.`);
    void props
      .spend(action, coin)
      .then((result) => {
        setPaying(false);
        if (result === "now") apply();
        else if (result === "later") setNote("Waiting on the Rare coin.");
        else setNote("Not bought.");
      })
      .catch((error: unknown) => {
        setPaying(false);
        const message = error instanceof Error ? error.message : "The payment failed.";
        if (message === "NO_WALLET") {
          setNote("Opening MetaMask so the payment can go through.");
          openInMetaMask(customId);
          return;
        }
        setNote(message);
      });
  };

  const start = () => {
    audioRef.current.unlock();
    const level = hud.parked ? hud.pick : hud.level;
    const go = () => {
      setMenu(false);
      sim.startRun();
    };
    if (freeBoard(level, opened) || !props.spend) {
      go();
      return;
    }
    setPaying(true);
    setNote(
      coin === "USDG"
        ? `This board is $${BOARD_PRICE} USDG.`
        : `This board is $${BOARD_PRICE}, about ${rfForDollars(BOARD_PRICE, rfUsd)} RF.`,
    );
    void props
      .spend("buyBoard", coin)
      .then((result) => {
        setPaying(false);
        if (result === "now") {
          setOpened((prev) => {
            const next = prev.includes(level) ? prev : [...prev, level];
            try {
              localStorage.setItem("glade-boards", JSON.stringify(next));
            } catch {
              /* private mode */
            }
            return next;
          });
          go();
        } else if (result === "later") setNote("Waiting on the payment.");
        else setNote("The board was not paid.");
      })
      .catch((error: unknown) => {
        setPaying(false);
        const message = error instanceof Error ? error.message : "The payment failed.";
        if (message === "NO_WALLET") {
          setNote("Opening MetaMask so the board can be paid.");
          openInMetaMask(customId);
          return;
        }
        setNote(message);
      });
  };

  const connect = () => {
    if (!props.connectWallet) return;
    setBusy(true);
    setNote("Waiting on the wallet…");
    void hasWallet()
      .then((ready) => {
        if (!ready) {
          setNote("No wallet in this browser. Use Open in MetaMask, then connect again.");
          openInMetaMask(customId);
          return;
        }
        return connectAccount().then(async (address) => {
          setLinked(address);
          setNote("Looking up your Friends…");
          const ids = await listFriends(address).catch(() => [] as string[]);
          setOwned(ids);
          setNote(
            ids.length
              ? "Pick a Friend from this wallet."
              : "No Friends showed up. Type a number if this wallet has one.",
          );
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "The wallet did not connect.";
        if (message === "NO_WALLET") {
          setNote("No wallet in this browser. Use Open in MetaMask, then connect again.");
          openInMetaMask(customId);
          return;
        }
        setNote(message);
      })
      .finally(() => setBusy(false));
  };

  const chooseFriend = (id = customId) => {
    if (!props.connectWallet) {
      onLoad({ preventDefault() {} } as FormEvent);
      return;
    }
    if (!linked) {
      setNote("Connect the wallet first, then choose a Friend.");
      return;
    }
    if (!/^\d+$/.test(id)) {
      setNote("Enter the Friend number from that wallet.");
      return;
    }
    setCustomId(id);
    setBusy(true);
    setNote("Checking that Friend…");
    void props
      .connectWallet(id)
      .then((result) => {
        const art = bakeArt(result.art, result.tokenId);
        if (!art) {
          setNote("That Friend did not draw.");
          return;
        }
        assets.current.player = art;
        setLinked(result.address);
        setSignedIn(true);
        setNote(`${art.familyName} #${art.tokenId}`);
      })
      .catch((error: unknown) => {
        setNote(error instanceof Error ? error.message : "That Friend is not in this wallet.");
      })
      .finally(() => setBusy(false));
  };

  const onLoad = (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d+$/.test(customId)) {
      setNote("Enter a Friend number, 1 or higher.");
      return;
    }
    const id = BigInt(customId);
    if (id < 1n) return;
    setBusy(true);
    setNote("Reading chain art…");
    void loadLiveFriend(id).then((art) => {
      setBusy(false);
      if (!art) {
        setNote("Chain art did not answer. The roster still runs.");
        return;
      }
      assets.current.player = art;
      setSignedIn(true);
      setNote(`${art.familyName} #${art.tokenId}`);
    });
  };

  const moveStick = (clientX: number, clientY: number) => {
    const origin = stick.current;
    if (!origin) return;
    let x = (clientX - origin.ox) / 64;
    let y = (clientY - origin.oy) / 64;
    const m = Math.hypot(x, y);
    const dz = 0.18;
    if (m < dz) {
      x = 0;
      y = 0;
    } else {
      const scale = (m > 1 ? 1 : (m - dz) / (1 - dz)) / m;
      x *= scale;
      y *= scale;
    }
    sim.input.stickX = x;
    sim.input.stickY = y;
    setKnob({ x: x * 48, y: y * 48 });
  };

  const playing = hud.running && hud.outcome === "none";

  return (
    <div
      ref={shellRef}
      className="glade"
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, input, form, .stick, .sheet, .end, .tools")) return;
        if (!playing) return;
        const canvas = worldRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        sim.input.dest = screenToWorld(
          event.clientX,
          event.clientY,
          rect,
          viewZoom(rect.width, rect.height, false, sim.theme),
          sim.camX,
          sim.camY,
        );
      }}
    >
      <canvas ref={worldRef} className="world" />
      <header className="top">
        <div className="brand">
          <h1>GLADE</h1>
          <p className="phase">
            {hud.running ? `${hud.theme} · ${hud.phase}` : "The maze is awake"}
          </p>
          <p className="muted">
            {note} · {modeLabel}
          </p>
        </div>
        {hud.running ? (
          <div className="status">
            <canvas ref={mapRef} className="map" aria-label="Maze chart" />
            <div className="bar" aria-hidden="true">
              <span style={{ transform: `scaleX(${hud.ratio})` }} />
            </div>
            <p className="muted">
              {hud.held ? "walls held" : `${hud.shift}s walls`} · {hud.charts}/{hud.goal} · {clock(hud.elapsed)}
              {props.balance ? ` · ${props.balance}` : ""}
            </p>
          </div>
        ) : null}
      </header>
      {!hud.paused && (hud.banner || (playing && hud.hint)) ? (
        <div className="ticker" aria-hidden="true">
          <p key={hud.banner || hud.hint}>{hud.banner || hud.hint}</p>
        </div>
      ) : null}
      {hud.paused && playing && !menu ? (
        <section className="end">
          <h2>Paused</h2>
          <p className="muted">The maze is holding still.</p>
          <button type="button" onClick={() => sim.togglePause()}>
            Resume
          </button>
          <button type="button" className="ghost" onClick={() => sim.quitToMenu()}>
            Main menu
          </button>
        </section>
      ) : null}
      {playing ? (
        <div
          className="stick"
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            const rect = event.currentTarget.getBoundingClientRect();
            stick.current = {
              ox: rect.left + rect.width / 2,
              oy: rect.top + rect.height / 2,
            };
            moveStick(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (!stick.current) return;
            moveStick(event.clientX, event.clientY);
          }}
          onPointerUp={() => {
            stick.current = null;
            sim.input.stickX = 0;
            sim.input.stickY = 0;
            setKnob({ x: 0, y: 0 });
          }}
          onPointerCancel={() => {
            stick.current = null;
            sim.input.stickX = 0;
            sim.input.stickY = 0;
            setKnob({ x: 0, y: 0 });
          }}
          role="presentation"
        >
          <div className="knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
      ) : null}
      {!hud.running ? (
        <section className="sheet">
          {props.hosted || signedIn ? (
            <>
              <h2>Run the shifting maze</h2>
              <p className="muted">
                Signed in as {note}
                {(linked ?? props.wallet) ? ` · ${shortWallet(linked ?? props.wallet ?? "")}` : ""}. You play as this NFT.
              </p>
              <p className="muted">
                Every maze is a Friend that forgot its shape. Run it until it remembers, or until the copy of you does.
              </p>
              <p className="muted">{THEMES[hud.pick]?.lore}</p>
              <p className="muted">Move with the stick, WASD, or arrows. A is left, D is right. Tap a tile to run there.</p>
              <LevelPick sim={sim} level={hud.pick} opened={opened} />
              {hud.parked ? <p className="muted">Continue this run, or pick a new level.</p> : null}
              {freeBoard(hud.parked ? hud.pick : hud.level, opened) ? null : (
                <p className="muted">
                  This board is locked. ${BOARD_PRICE}
                  {coin === "USDG" ? " USDG" : `, about ${rfForDollars(BOARD_PRICE, rfUsd)} RF`}, opens it.
                </p>
              )}
              <p className="muted">Pay with</p>
              <div className="row">
                <button type="button" className={coin === "RF" ? "" : "ghost"} onClick={() => setCoin("RF")}>
                  RF
                </button>
                <button type="button" className={coin === "USDG" ? "" : "ghost"} onClick={() => setCoin("USDG")}>
                  USDG
                </button>
              </div>
              <p className="muted">Masks</p>
              <div className="clothes">
                {OUTFITS.map((item) => {
                  const [have, equipped] = hud.outfit.split(":");
                  const owned = have.split(",").includes(item.id);
                  const on = hud.wearing && equipped === item.id;
                  const label = on
                    ? `${item.name} on`
                    : owned
                      ? `Wear ${item.name}`
                      : hud.pick === 0
                        ? `${item.name} · free`
                        : coin === "USDG"
                          ? `${item.name} · $1`
                          : `${item.name} · $1 · ${rfForDollars(1, rfUsd)} RF`;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={on ? "" : "ghost"}
                      disabled={paying || on}
                      onClick={() => (owned && !on ? sim.wear(item.id) : buy(item.action))}
                    >
                      {paying ? "Paying…" : label}
                    </button>
                  );
                })}
              </div>
              {props.hosted ? null : (
                <button type="button" className="ghost" onClick={() => setSignedIn(false)}>
                  Switch NFT
                </button>
              )}
              {hud.parked ? (
                <button type="button" onClick={() => sim.resumeRun()}>
                  Continue
                </button>
              ) : null}
              <button type="button" className={hud.parked ? "ghost" : ""} onClick={start}>
                {hud.parked ? `Play ${THEMES[hud.pick].name}` : "Start"}
              </button>
              {best != null ? <p className="muted">Best escape {clock(best)}</p> : null}
            </>
          ) : (
            <>
              <h2>Sign in</h2>
              <p className="muted">
                {linked
                  ? owned.length
                    ? `Wallet ${shortWallet(linked)}. Pick one of your Friends.`
                    : `Wallet ${shortWallet(linked)}. Type a Friend number, or play a sample below.`
                  : "Connect the wallet, then pick one of your Friends. Or play a sample below."}
              </p>
              {owned.length ? (
                <div className="levels" role="listbox" aria-label="Your Friends">
                  {owned.map((id) => (
                    <button key={id} type="button" disabled={busy} onClick={() => chooseFriend(id)}>
                      #{id}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="friends" role="listbox" aria-label="Choose a Friend">
                {roster.map((friend, index) => (
                  <button
                    key={friend.tokenId}
                    type="button"
                    className={index === slot ? "on" : ""}
                    aria-pressed={index === slot}
                    onClick={() => setSlot(index)}
                  >
                    <FriendFace art={baked[index]} />
                    <span className="sr">{friend.familyName}</span>
                  </button>
                ))}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (props.connectWallet) chooseFriend();
                  else onLoad(event);
                }}
              >
                <input
                  inputMode="numeric"
                  aria-label="Friend number"
                  placeholder="Your NFT number"
                  value={customId}
                  onChange={(event) => setCustomId(event.target.value)}
                />
                {props.connectWallet ? (
                  <button type="submit" disabled={busy || !linked}>
                    {busy ? "Waiting…" : "Choose this Friend"}
                  </button>
                ) : (
                  <button className="ghost" type="submit" disabled={busy}>
                    {busy ? "Reading…" : "Load NFT"}
                  </button>
                )}
              </form>
              {props.connectWallet ? (
                <div className="row">
                  <button type="button" disabled={busy || Boolean(linked)} onClick={connect}>
                    {linked ? "Wallet connected" : busy ? "Waiting…" : "Connect wallet"}
                  </button>
                  <button type="button" className="ghost" onClick={() => openInMetaMask(customId)}>
                    Open in MetaMask
                  </button>
                </div>
              ) : null}
              <button type="button" onClick={() => setSignedIn(true)} disabled={baked.length === 0}>
                Play as this NFT
              </button>
            </>
          )}
        </section>
      ) : null}
      {hud.outcome !== "none" ? (
        <section className="end">
          <h2>{hud.outcome === "win" ? "Out of the maze" : "A corrupted Friend got you"}</h2>
          <p className="muted">
            {clock(hud.elapsed)} on day {hud.night}. {hud.charts} sections charted.
            {best != null ? ` Best ${clock(best)}.` : ""}
          </p>
          <LevelPick sim={sim} level={hud.level} opened={opened} />
          <button type="button" onClick={start}>
            Start
          </button>
        </section>
      ) : null}
      {playing ? (
        <div className="tools">
          {menu ? (
            <div className="menu-pop" role="menu">
              <p className="muted">Paused · pay with {coin}</p>
              <div className="row">
                <button type="button" className={coin === "RF" ? "" : "ghost"} onClick={() => setCoin("RF")}>
                  RF
                </button>
                <button type="button" className={coin === "USDG" ? "" : "ghost"} onClick={() => setCoin("USDG")}>
                  USDG
                </button>
              </div>
              <button type="button" disabled={paying || hud.pulse >= 5} onClick={() => buy("buyFlare")}>
                {paying ? "Paying…" : hud.level === 0 ? "Flare · free" : `Flare · 5 ${coin}`}
              </button>
              <button type="button" className="ghost" disabled={paying || hud.held} onClick={() => buy("holdMaze")}>
                {hud.held ? "Maze held" : hud.level === 0 ? "Hold maze · free" : `Hold maze · 10 ${coin}`}
              </button>
              <button type="button" className="ghost" disabled={paying || hud.quiet} onClick={() => buy("buyQuiet")}>
                {hud.quiet ? "Quiet" : hud.level === 0 ? "Quiet · free" : `Quiet · 8 ${coin}`}
              </button>
              <button type="button" className="ghost" disabled={paying || hud.scouted} onClick={() => buy("buyScout")}>
                {hud.scouted ? "Scouted" : hud.level === 0 ? "Scout · free" : `Scout · 6 ${coin}`}
              </button>
              <button type="button" className="ghost" disabled={paying || hud.chance !== "buy"} onClick={() => buy("buyChance")}>
                {hud.chance === "kept"
                  ? "Chance kept"
                  : hud.chance === "spent"
                    ? "Chance spent"
                    : hud.level === 0
                      ? "Chance · free"
                      : `Chance · 15 ${coin}`}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  audioRef.current.unlock();
                  setMuted(audioRef.current.toggle());
                }}
              >
                {muted ? "Sound on" : "Sound off"}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setMenu(false);
                  sim.quitToMenu();
                }}
              >
                Main menu
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  sim.togglePause();
                }}
              >
                Resume
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="ghost"
            onClick={() => {
              if (menu) {
                setMenu(false);
                sim.togglePause();
                return;
              }
              sim.pause();
              setMenu(true);
            }}
          >
            Menu
          </button>
        </div>
      ) : null}
      <p className="sr" role="status">
        {hud.banner || hud.hint}
      </p>
    </div>
  );
}

function FriendFace({ art }: { art?: Baked }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const frame = art?.frames[0];
    if (!canvas || !frame) return;
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 48, 48);
    ctx.drawImage(frame, 6, 4, frame.width * 1.2, frame.height * 1.2);
  }, [art]);
  return <canvas ref={ref} width={48} height={48} />;
}
