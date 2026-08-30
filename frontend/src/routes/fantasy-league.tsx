import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Users, Trophy, Activity, Sparkles, Shield, AlertCircle, PlusCircle, CheckCircle, Flame } from "lucide-react";
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
  FANTASY_LEAGUE_ADDRESS,
  SCOUT_ROSTER_ADDRESS,
} from "@/lib/web3/contracts";
import { TransactionButton } from "@/components/web3/TransactionButton";
import { parseUnits, formatUnits, formatEther, parseEther } from "ethers";
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

const FEATURED_SEARCHERS = [
  {
    address: "0x00000000003b3cc22af3ae1eac0440bcee416b40",
    name: "jaredfromsubway.eth",
    archetype: "Sandwich Leader",
    reputation: "High Frequency",
  },
  {
    address: "0x6b75d8af000000e20b7a7ddf000ba900b4009a80",
    name: "Wintermute MEV Bot",
    archetype: "Arbitrageur",
    reputation: "Institutional",
  },
  {
    address: "0x98c3d3183c4b8a650614ad179a1a98be0a0d6b2e",
    name: "Flashbots Searcher 0x98",
    archetype: "Backrun Specialist",
    reputation: "Stealth",
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
      const mrlv = getMRLVToken(provider);

      // Current season
      let currentId = 1;
      try {
        const id = await league.currentSeasonId();
        currentId = Number(id);
        if (currentId === 0) currentId = 1;
        setSeasonId(currentId);

        const season = await league.seasons(currentId);
        setSeasonStatus(Number(season.status));
        setPrizePool(Number(formatUnits(season.prizePool, 18)).toFixed(2));
        setTotalPoints(Number(season.totalPoints));
      } catch (e) {
        console.warn("Season data read:", e);
      }

      // Check owner
      try {
        const ownerAddr = await league.owner();
        if (address && ownerAddr.toLowerCase() === address.toLowerCase()) {
          setIsOwner(true);
        }
      } catch (e) {}

      if (address) {
        // User claimable & wallet balance
        const [claimable, bal] = await Promise.all([
          league.claimable(address),
          mrlv.balanceOf(address),
        ]);
        setClaimableRewards(Number(formatUnits(claimable, 18)).toFixed(2));
        setMrlvBalance(Number(formatUnits(bal, 18)).toFixed(2));

        // User roster
        try {
          const picks = await rosterContract.getRoster(address, currentId);
          const formattedPicks: ScoutPick[] = picks.map((p: any) => ({
            trader: p.trader,
            mrlvStaked: formatUnits(p.mrlvStaked, 18),
            points: Number(p.points),
            flagged: Boolean(p.flagged),
          }));
          setUserRoster(formattedPicks);
        } catch (e) {
          console.warn("Roster read:", e);
        }
      }
    } catch (e) {
      console.error("Fantasy league fetch error:", e);
    } finally {
      setIsLoading(false);
    }
  }, [provider, address]);

  React.useEffect(() => {
    fetchLeagueData();
    if (provider) {
      provider.on("block", fetchLeagueData);
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
    const currentAllowance = await mrlvToken.allowance(address, FANTASY_LEAGUE_ADDRESS);
    if (currentAllowance < amount) {
      const approveTx = await mrlvToken.approve(FANTASY_LEAGUE_ADDRESS, parseUnits("1000000", 18));
      await approveTx.wait();
    }

    toast.loading("Drafting searcher and staking MRLV...", { id: "draft" });
    const draftTx = await league.stakePick(searcherAddr, amount);
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

      const allowance = await mrlv.allowance(address, FANTASY_LEAGUE_ADDRESS);
      if (allowance < amount) {
        const txA = await mrlv.approve(FANTASY_LEAGUE_ADDRESS, parseUnits("1000000", 18));
        await txA.wait();
      }

      const tx = await league.topUpPrizePool(amount);
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
    const tx = await league.claimRewards();
    await tx.wait();
    await fetchLeagueData();
  };

  // Admin Season Phase Controls
  const handleStartSeason = async () => {
    if (!signer) return;
    toast.loading("Starting new season...", { id: "season" });
    try {
      const league = getFantasyLeague(signer);
      const tx = await league.startSeason();
      await tx.wait();
      toast.success("Season drafting phase is now open!", { id: "season" });
      await fetchLeagueData();
    } catch (e: any) {
      toast.error(parseContractError(e), { id: "season" });
    }
  };

  const handleLockSeason = async () => {
    if (!signer) return;
    toast.loading("Locking season...", { id: "season" });
    try {
      const league = getFantasyLeague(signer);
      const tx = await league.lockSeason();
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
      const tx = await league.settleSeason();
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
              <span className="size-2 rounded-full bg-primary animate-pulse" />
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
              Total Points Scored
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

        {/* Admin Controls */}
        {isOwner && (
          <div className="mt-6 pt-4 border-t border-border flex flex-wrap items-center gap-3">
            <span className="text-xs font-mono uppercase text-muted-foreground font-semibold">
              Admin Season Controls:
            </span>
            <Button size="sm" variant="outline" onClick={handleStartSeason}>
              Open Drafting
            </Button>
            <Button size="sm" variant="secondary" onClick={handleLockSeason}>
              Lock (Activate)
            </Button>
            <Button size="sm" variant="default" onClick={handleSettleSeason}>
              Settle Season
            </Button>
          </div>
        )}
      </motion.div>

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
                You haven't drafted any searchers for this season yet. Pick up to 3 below!
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
                        {pick.flagged ? "Flagged MEV" : "Listening"}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>

          {/* Draft Board / Featured Searchers */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-semibold flex items-center gap-2">
                  <Flame className="size-6 text-amber-500" />
                  Draft Board — Featured Searchers
                </h2>
                <p className="text-sm text-muted-foreground">
                  Select a known MEV searcher to stake and add to your active squad.
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
                          : `Draft & Stake ${stakeAmount} MRLV`}
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </section>

          {/* Custom Searcher Address Draft & Top-up */}
          <section className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-md">
              <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                <PlusCircle className="size-5 text-primary" />
                Draft Custom Searcher Address
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Have an alpha bot or MEV searcher address? Stake on any address.
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
        </div>
      )}
    </div>
  );
}
