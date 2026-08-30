import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Users, Trophy, Activity, Sparkles, Shield, AlertCircle, PlusCircle, CheckCircle, Flame, Radio, Zap, Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/mrvl/section-label";
import { WalletConnectButton } from "@/components/layout/wallet-connect-button";
import { fadeInUp, stagger, viewportOnce } from "@/lib/motion";
import { useWeb3 } from "@/lib/web3/Web3Context";
import {
  getFantasyLeague,
  getScoutRoster,
  getMRLVToken,
  getScoutPointsOracle,
  getAnalyticsEmitter,
  FANTASY_LEAGUE_ADDRESS,
  SCOUT_ROSTER_ADDRESS,
} from "@/lib/web3/contracts";
import { TransactionButton } from "@/components/web3/TransactionButton";
import { parseUnits, formatUnits } from "ethers";
import { parseContractError } from "@/lib/web3/ContractError";
import { toast } from "sonner";

export const Route = createFileRoute("/fantasy-league")({
  head: () => ({
    meta: [
      { title: "Fantasy MEV League — Draft Top Extractors" },
      {
        name: "description",
        content: "Draft top MEV searchers and earn MRLV rewards based on their detected performance.",
      },
    ],
  }),
  component: FantasyLeaguePage,
});

interface ScoutPick {
  trader: string;
  mrlvStaked: string;
  points: number;
  flagged: boolean;
}

interface LeaderboardEntry {
  address: string;
  picksCount: number;
  seasonPoints: number;
  allTimeScore: number;
  estimatedPayout: string;
}

interface LiveDetection {
  trader: string;
  riskScore: number;
  feeSurcharge: number;
  timestamp: string;
}

// Searchers available on local Anvil (Accounts 5 to 9 & Account 0)
const FEATURED_SEARCHERS = [
  {
    address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
    name: "Jared Sandwich Bot",
    archetype: "Sandwich Extractor",
    reputation: "Anvil Account #5",
    description: "Executes rapid frontrun-backrun sandwich sequences around pool swaps."
  },
  {
    address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
    name: "Wintermute Fast Arb",
    archetype: "Arbitrageur",
    reputation: "Anvil Account #6",
    description: "Rapid opposite-direction reversal trades exploiting tick mispricings."
  },
  {
    address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
    name: "Flashbots Backrunner",
    archetype: "Backrun Specialist",
    reputation: "Anvil Account #7",
    description: "Heavy single-flow transactions generating massive price impacts."
  },
  {
    address: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
    name: "Atomic Liquidation Bot",
    archetype: "Liquidation Sniper",
    reputation: "Anvil Account #8",
    description: "High-volume sandwich attacks capturing liquidation margins."
  },
  {
    address: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
    name: "Toxic Flow Sniper",
    archetype: "Cross-DEX Arbitrageur",
    reputation: "Anvil Account #9",
    description: "High-frequency reversal flows routing toxic flow into the pool."
  },
  {
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    name: "Primary Deployer Searcher",
    archetype: "Multi-Strategy Attacker",
    reputation: "Anvil Account #0",
    description: "Primary Anvil test account executing heavy simulation swaps."
  },
];

const STATUS_LABELS = ["Drafting Open", "Active Round", "Season Settled"];

function FantasyLeaguePage() {
  const { provider, signer, address } = useWeb3();

  const [seasonId, setSeasonId] = React.useState<number>(1);
  const [seasonStatus, setSeasonStatus] = React.useState<number>(0);
  const [prizePool, setPrizePool] = React.useState<string>("0");
  const [totalPoints, setTotalPoints] = React.useState<number>(0);
  const [claimableRewards, setClaimableRewards] = React.useState<string>("0");
  const [mrlvBalance, setMrlvBalance] = React.useState<string>("0");

  const [userRoster, setUserRoster] = React.useState<ScoutPick[]>([]);
  const [leaderboard, setLeaderboard] = React.useState<LeaderboardEntry[]>([]);
  const [liveDetections, setLiveDetections] = React.useState<LiveDetection[]>([]);

  const [stakeAmount, setStakeAmount] = React.useState("50.0");
  const [customSearcher, setCustomSearcher] = React.useState("");
  const [customStake, setCustomStake] = React.useState("25.0");
  const [topUpAmount, setTopUpAmount] = React.useState("100.0");
  const [isOwner, setIsOwner] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const fetchLeagueData = React.useCallback(async () => {
    if (!provider) return;
    setIsLoading(true);
    try {
      const league = getFantasyLeague(provider);
      const rosterContract = getScoutRoster(provider);
      const oracle = getScoutPointsOracle(provider);
      const mrlv = getMRLVToken(provider);

      // 1. Current Season Details
      let currentId = 1;
      let sPrizePool = 0n;
      let sTotalPoints = 0n;
      try {
        const id = await league["currentSeasonId"]();
        currentId = Number(id);
        if (currentId === 0) currentId = 1;
        setSeasonId(currentId);

        const season = await league["seasons"](currentId);
        setSeasonStatus(Number(season.status));
        sPrizePool = season.prizePool;
        sTotalPoints = season.totalPoints;
        setPrizePool(Number(formatUnits(season.prizePool, 18)).toFixed(2));
        setTotalPoints(Number(season.totalPoints));
      } catch (e) {
        console.warn("Season data read:", e);
      }

      // 2. Check Owner
      try {
        const ownerAddr = await league["owner"]();
        if (address && ownerAddr.toLowerCase() === address.toLowerCase()) {
          setIsOwner(true);
        }
      } catch (e) {}

      // 3. User Wallet Balance & Active Roster
      if (address) {
        try {
          const [claimable, bal] = await Promise.all([
            league["claimable"](address),
            mrlv["balanceOf"](address),
          ]);
          setClaimableRewards(Number(formatUnits(claimable, 18)).toFixed(2));
          setMrlvBalance(Number(formatUnits(bal, 18)).toFixed(2));
        } catch (e) {}

        try {
          const picks = await rosterContract["getRoster"](address, currentId);
          const formattedPicks: ScoutPick[] = picks.map((p: any) => ({
            trader: p.trader,
            mrlvStaked: Number(formatUnits(p.mrlvStaked, 18)).toFixed(1),
            points: Number(p.points),
            flagged: Boolean(p.flagged),
          }));
          setUserRoster(formattedPicks);
        } catch (e) {
          console.warn("Roster read:", e);
        }
      }

      // 4. Fetch Participants & Leaderboard Standings
      try {
        const participants: string[] = await league["getSeasonParticipants"](currentId);
        const entries: LeaderboardEntry[] = [];

        for (const lp of participants) {
          const [roster, allTime] = await Promise.all([
            rosterContract["getRoster"](lp, currentId),
            oracle["allTimeScoutScore"](lp).catch(() => 0n),
          ]);

          let lpSeasonPts = 0;
          for (const pick of roster) {
            lpSeasonPts += Number(pick.points);
          }

          let estPayout = "0.00";
          if (sTotalPoints > 0n && sPrizePool > 0n && lpSeasonPts > 0) {
            const share = (sPrizePool * BigInt(lpSeasonPts)) / sTotalPoints;
            estPayout = Number(formatUnits(share, 18)).toFixed(2);
          }

          entries.push({
            address: lp,
            picksCount: roster.length,
            seasonPoints: lpSeasonPts,
            allTimeScore: Number(allTime),
            estimatedPayout: estPayout,
          });
        }

        // Sort leaderboard by season points descending
        entries.sort((a, b) => b.seasonPoints - a.seasonPoints);
        setLeaderboard(entries);
      } catch (e) {
        console.warn("Leaderboard fetch:", e);
      }
    } catch (e) {
      console.error("Fantasy league fetch error:", e);
    } finally {
      setIsLoading(false);
    }
  }, [provider, address]);

  // Subscribe to live MEV Detected events
  React.useEffect(() => {
    fetchLeagueData();
    if (!provider) return;

    provider.on("block", fetchLeagueData);

    try {
      const analytics = getAnalyticsEmitter(provider);
      const onMEV = (poolId: string, trader: string, riskScore: bigint, feeSurcharge: bigint) => {
        const detection: LiveDetection = {
          trader,
          riskScore: Number(riskScore),
          feeSurcharge: Number(feeSurcharge),
          timestamp: new Date().toLocaleTimeString(),
        };
        setLiveDetections((prev) => [detection, ...prev.slice(0, 4)]);
        toast.info(`⚡ MEV Intercepted from ${trader.slice(0, 6)}...${trader.slice(-4)} (Score: ${riskScore})`);
      };

      analytics.on("MEVDetected", onMEV);
      return () => {
        provider.off("block", fetchLeagueData);
        analytics.off("MEVDetected", onMEV);
      };
    } catch (e) {
      return () => {
        provider.off("block", fetchLeagueData);
      };
    }
  }, [fetchLeagueData, provider]);

  const handleDraft = async (searcherAddr: string, amountToStake: string) => {
    if (!signer || !address) throw new Error("Wallet not connected");
    const amount = parseUnits(amountToStake || "10", 18);
    const mrlvToken = getMRLVToken(signer);
    const league = getFantasyLeague(signer);

    toast.loading("Approving MRLV tokens for League...", { id: "draft" });
    const currentAllowance = await mrlvToken["allowance"](address, FANTASY_LEAGUE_ADDRESS);
    if (currentAllowance < amount) {
      const approveTx = await mrlvToken["approve"](FANTASY_LEAGUE_ADDRESS, parseUnits("1000000", 18));
      await approveTx.wait();
    }

    toast.loading("Drafting searcher and staking MRLV...", { id: "draft" });
    const draftTx = await league["stakePick"](searcherAddr, amount);
    await draftTx.wait();

    toast.success("Successfully drafted searcher into roster!", { id: "draft" });
    await fetchLeagueData();
  };

  const handleTopUpPrizePool = async () => {
    if (!signer || !address) return;
    toast.loading("Topping up Season Prize Pool...", { id: "topup" });
    try {
      const amount = parseUnits(topUpAmount, 18);
      const mrlv = getMRLVToken(signer);
      const league = getFantasyLeague(signer);

      const allowance = await mrlv["allowance"](address, FANTASY_LEAGUE_ADDRESS);
      if (allowance < amount) {
        const txA = await mrlv["approve"](FANTASY_LEAGUE_ADDRESS, parseUnits("1000000", 18));
        await txA.wait();
      }

      const tx = await league["topUpPrizePool"](amount);
      await tx.wait();
      toast.success(`Added ${topUpAmount} MRLV to season prize pool!`, { id: "topup" });
      await fetchLeagueData();
    } catch (e: any) {
      console.error(e);
      toast.error(parseContractError(e), { id: "topup" });
    }
  };

  const handleClaimRewards = async () => {
    if (!signer) return;
    const league = getFantasyLeague(signer);
    const tx = await league["claimRewards"]();
    await tx.wait();
    await fetchLeagueData();
  };

  // Admin Season Controls
  const handleStartSeason = async () => {
    if (!signer) return;
    toast.loading("Starting new season drafting...", { id: "season" });
    try {
      const league = getFantasyLeague(signer);
      const tx = await league["startSeason"]();
      await tx.wait();
      toast.success("Season drafting phase is now open!", { id: "season" });
      await fetchLeagueData();
    } catch (e: any) {
      toast.error(parseContractError(e), { id: "season" });
    }
  };

  const handleLockSeason = async () => {
    if (!signer) return;
    toast.loading("Locking season (Scoring begins)...", { id: "season" });
    try {
      const league = getFantasyLeague(signer);
      const tx = await league["lockSeason"]();
      await tx.wait();
      toast.success("Season is now Active & Scoring!", { id: "season" });
      await fetchLeagueData();
    } catch (e: any) {
      toast.error(parseContractError(e), { id: "season" });
    }
  };

  const handleSettleSeason = async () => {
    if (!signer) return;
    toast.loading("Settling season payouts...", { id: "season" });
    try {
      const league = getFantasyLeague(signer);
      const tx = await league["settleSeason"]();
      await tx.wait();
      toast.success("Season settled! Rewards credited to winning LPs.", { id: "season" });
      await fetchLeagueData();
    } catch (e: any) {
      toast.error(parseContractError(e), { id: "season" });
    }
  };

  const isDrafting = seasonStatus === 0;

  return (
    <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        <motion.div variants={fadeInUp}>
          <SectionLabel pulse>Fantasy League</SectionLabel>
        </motion.div>
        <motion.h1 variants={fadeInUp} className="mt-6 text-4xl leading-[1.1] lg:text-6xl">
          Draft the <span className="text-gradient">Top Extractors</span>
        </motion.h1>
        <motion.p variants={fadeInUp} className="mt-4 max-w-2xl text-muted-foreground text-lg">
          Scout and draft MEV searchers. When the Uniswap v4 hook detects and taxes their transactions,
          you score points and earn a proportional share of the MRLV season prize pool!
        </motion.p>
      </motion.div>

      {/* Season Stats Banner */}
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
        variants={fadeInUp}
        className="mt-10 rounded-2xl border border-primary/30 bg-card p-6 shadow-md"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-center">
          <div>
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Season #{seasonId}
            </span>
            <div className="mt-1 flex items-center gap-2">
              <span className={`size-2 rounded-full ${seasonStatus === 1 ? "bg-emerald-500 animate-pulse" : "bg-primary"}`} />
              <span className="font-semibold text-lg">{STATUS_LABELS[seasonStatus] || "Drafting"}</span>
            </div>
          </div>

          <div>
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Season Prize Pool
            </span>
            <div className="mt-1 font-display text-2xl text-gradient">
              {prizePool} MRLV
            </div>
          </div>

          <div>
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Total Season Points
            </span>
            <div className="mt-1 font-display text-2xl text-foreground">
              {totalPoints.toLocaleString()} pts
            </div>
          </div>

          <div>
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Your MRLV Balance
            </span>
            <div className="mt-1 font-display text-xl text-foreground/90">
              {mrlvBalance} MRLV
            </div>
          </div>
        </div>

        {/* Admin Season Controls */}
        {isOwner && (
          <div className="mt-6 pt-4 border-t border-border flex flex-wrap items-center gap-3">
            <span className="text-xs font-mono uppercase text-muted-foreground font-semibold">
              Admin Season Controls:
            </span>
            <Button size="sm" variant="outline" onClick={handleStartSeason}>
              Open Drafting
            </Button>
            <Button size="sm" variant="secondary" onClick={handleLockSeason}>
              Lock (Activate Scoring)
            </Button>
            <Button size="sm" variant="default" onClick={handleSettleSeason}>
              Settle Season Payouts
            </Button>
          </div>
        )}
      </motion.div>

      {/* Live MEV Intercept Ticker */}
      {liveDetections.length > 0 && (
        <div className="mt-6 rounded-2xl border border-warning/30 bg-warning/5 p-4 flex flex-wrap items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2 text-warning font-semibold">
            <Zap className="size-4 animate-bounce" />
            <span>Live MEV Interceptions:</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
            {liveDetections.map((d, i) => (
              <span key={i} className="px-2.5 py-1 rounded-lg bg-card border border-border flex items-center gap-1.5">
                <span className="text-primary">{d.trader.slice(0, 6)}...{d.trader.slice(-4)}</span>
                <span className="text-muted-foreground">|</span>
                <span className="text-amber-400">Score: {d.riskScore}</span>
                <span className="text-muted-foreground">({d.timestamp})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {!address ? (
        <div className="mx-auto mt-14 grid place-items-center py-16 text-center rounded-2xl border border-dashed border-border p-12">
          <Trophy className="size-12 text-primary/80 mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Connect to view the draft board</h2>
          <p className="text-muted-foreground max-w-md mb-6">
            Connect your wallet to draft searchers, track flagged transactions, and claim prize rewards.
          </p>
          <WalletConnectButton size="default" />
        </div>
      ) : (
        <div className="mt-14 space-y-12">
          {/* User's Active Roster */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-semibold flex items-center gap-2">
                  <Users className="size-6 text-primary" />
                  Your Drafted Roster ({userRoster.length} / 3 max)
                </h2>
                <p className="text-sm text-muted-foreground">
                  Searchers you've staked on for Season #{seasonId}.
                </p>
              </div>

              {Number(claimableRewards) > 0 && (
                <TransactionButton
                  action={handleClaimRewards}
                  onSuccess={fetchLeagueData}
                  successMessage="Claimed fantasy league rewards!"
                  size="sm"
                >
                  <Sparkles className="size-4" />
                  Claim {claimableRewards} MRLV Rewards
                </TransactionButton>
              )}
            </div>

            {userRoster.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
                You haven't drafted any searchers for this season yet. Pick up to 3 below from the active draft board!
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {userRoster.map((pick, i) => (
                  <motion.div
                    key={i}
                    variants={fadeInUp}
                    className="rounded-2xl border border-border bg-card p-6 shadow-md relative overflow-hidden"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <Trophy className="text-primary size-5" />
                        <span className="font-semibold text-base">Pick #{i + 1}</span>
                      </div>
                      <span className="font-mono bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs font-semibold">
                        {pick.points} pts
                      </span>
                    </div>

                    <p className="font-mono text-xs text-muted-foreground break-all mb-4 bg-muted/40 p-2 rounded-lg">
                      {pick.trader}
                    </p>

                    <div className="flex justify-between text-sm pt-2 border-t border-border">
                      <span className="text-muted-foreground">Staked:</span>
                      <span className="font-medium text-foreground">{pick.mrlvStaked} MRLV</span>
                    </div>

                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-muted-foreground">Status:</span>
                      <span className={pick.flagged ? "text-emerald-400 font-medium flex items-center gap-1" : "text-muted-foreground"}>
                        {pick.flagged ? <CheckCircle className="size-3.5" /> : null}
                        {pick.flagged ? "⚡ Flagged MEV" : "Listening for swaps"}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>

          {/* Draft Board / Active Searchers */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-semibold flex items-center gap-2">
                  <Flame className="size-6 text-amber-500" />
                  Draft Board — Active Searcher Bots
                </h2>
                <p className="text-sm text-muted-foreground">
                  Draft active on-chain MEV searchers to stake MRLV and score points when they are detected.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground">Stake Amount:</span>
                <input
                  type="number"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  className="w-24 px-2 py-1 text-sm bg-muted rounded border border-border text-foreground font-mono"
                  placeholder="50.0"
                />
              </div>
            </div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={viewportOnce}
              variants={stagger}
              className="grid gap-6 md:grid-cols-3"
            >
              {FEATURED_SEARCHERS.map((searcher, i) => {
                const isDrafted = userRoster.some(
                  (p) => p.trader.toLowerCase() === searcher.address.toLowerCase()
                );
                return (
                  <motion.div
                    key={i}
                    variants={fadeInUp}
                    className="rounded-2xl border border-border bg-card p-6 shadow-md hover:border-primary/50 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {searcher.archetype}
                        </span>
                        <span className="text-xs font-mono text-primary font-medium">
                          {searcher.reputation}
                        </span>
                      </div>
                      <h3 className="font-semibold text-lg text-foreground mb-1">{searcher.name}</h3>
                      <p className="text-xs text-muted-foreground mb-3">{searcher.description}</p>
                      <p className="text-xs font-mono text-muted-foreground break-all bg-muted/30 p-2 rounded mb-4">
                        {searcher.address}
                      </p>
                    </div>

                    <div className="pt-4 border-t border-border">
                      <Button
                        onClick={() => handleDraft(searcher.address, stakeAmount)}
                        disabled={!isDrafting || isDrafted || userRoster.length >= 3}
                        className="w-full"
                        variant={isDrafted ? "secondary" : "default"}
                      >
                        {isDrafted
                          ? "Already Drafted"
                          : userRoster.length >= 3
                          ? "Roster Full (3/3)"
                          : !isDrafting
                          ? "Drafting Closed"
                          : `Draft & Stake ${stakeAmount} MRLV`}
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </section>

          {/* Custom Searcher & Boost Prize Pool */}
          <section className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-md">
              <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                <PlusCircle className="size-5 text-primary" />
                Draft Custom Searcher Address
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Have a specific MEV bot or trader address? Stake on any address.
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="0x... Searcher Address"
                  value={customSearcher}
                  onChange={(e) => setCustomSearcher(e.target.value)}
                  className="w-full px-3 py-2 bg-muted rounded-xl border border-border text-sm font-mono"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="MRLV Stake"
                    value={customStake}
                    onChange={(e) => setCustomStake(e.target.value)}
                    className="w-32 px-3 py-2 bg-muted rounded-xl border border-border text-sm font-mono"
                  />
                  <Button
                    onClick={() => handleDraft(customSearcher, customStake)}
                    disabled={!isDrafting || !customSearcher || userRoster.length >= 3}
                    className="flex-1"
                  >
                    Draft Searcher
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-md">
              <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                <Trophy className="size-5 text-amber-400" />
                Boost Prize Pool
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Permissionlessly add MRLV to the current season prize pool to boost player payouts.
              </p>
              <div className="flex gap-2 mt-4">
                <input
                  type="number"
                  placeholder="Amount"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  className="w-32 px-3 py-2 bg-muted rounded-xl border border-border text-sm font-mono"
                />
                <Button onClick={handleTopUpPrizePool} variant="secondary" className="flex-1">
                  Add {topUpAmount} MRLV to Pool
                </Button>
              </div>
            </div>
          </section>

          {/* Season Standings & Leaderboard Table */}
          <section className="rounded-2xl border border-border bg-card p-6 shadow-md">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-semibold flex items-center gap-2">
                  <Medal className="size-6 text-amber-400" />
                  Season #{seasonId} Leaderboard & Scout Standings
                </h2>
                <p className="text-sm text-muted-foreground">
                  Rankings based on detected MEV activity across all drafted rosters.
                </p>
              </div>
              <span className="text-xs font-mono px-3 py-1 bg-muted rounded-full text-muted-foreground">
                {leaderboard.length} Participant(s)
              </span>
            </div>

            {leaderboard.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
                No participants have drafted searchers in Season #{seasonId} yet. Be the first to draft above!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase font-mono text-muted-foreground text-left">
                      <th className="pb-3 pr-4">Rank</th>
                      <th className="pb-3 pr-4">Scout (LP Address)</th>
                      <th className="pb-3 pr-4">Picks</th>
                      <th className="pb-3 pr-4">Season Points</th>
                      <th className="pb-3 pr-4">All-Time Score</th>
                      <th className="pb-3 text-right">Est. Payout</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono text-xs">
                    {leaderboard.map((entry, idx) => (
                      <tr key={entry.address} className={entry.address.toLowerCase() === address?.toLowerCase() ? "bg-primary/5 font-semibold" : ""}>
                        <td className="py-3 pr-4 font-sans text-sm">
                          {idx === 0 ? "🥇 #1" : idx === 1 ? "🥈 #2" : idx === 2 ? "🥉 #3" : `#${idx + 1}`}
                        </td>
                        <td className="py-3 pr-4 text-foreground">
                          {entry.address.slice(0, 8)}...{entry.address.slice(-6)}
                          {entry.address.toLowerCase() === address?.toLowerCase() && (
                            <span className="ml-2 text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-sans">
                              YOU
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4">{entry.picksCount} / 3</td>
                        <td className="py-3 pr-4 font-semibold text-primary">{entry.seasonPoints} pts</td>
                        <td className="py-3 pr-4 text-muted-foreground">{entry.allTimeScore} pts</td>
                        <td className="py-3 text-right text-emerald-400 font-semibold">{entry.estimatedPayout} MRLV</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
