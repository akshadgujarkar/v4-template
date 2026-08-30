import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Lock, LockOpen, Sparkles, Coins, RefreshCw, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/mrvl/section-label";
import { PositionCard, type PositionData } from "@/components/mrvl/position-card";
import { WalletConnectButton } from "@/components/layout/wallet-connect-button";
import { fadeInUp, stagger, viewportOnce } from "@/lib/motion";
import { TIER_MULTIPLIER, formatNumber, isEarlyExit, tierForAge, type Tier } from "@/lib/blockMath";
import { useWeb3 } from "@/lib/web3/Web3Context";
import {
  getLoyaltyManager,
  getRewardVault,
  getMRLVToken,
  getMRLVHook,
  getMEVDetector,
  POOL_ID,
  getModifyLiquidityRouter,
  TOKEN0_ADDRESS,
  TOKEN1_ADDRESS,
  MRLV_HOOK_ADDRESS,
  type PendingPosData,
} from "@/lib/web3/contracts";
import { TransactionButton } from "@/components/web3/TransactionButton";
import { useEffect, useState, useCallback } from "react";
import { ethers, formatUnits, formatEther, parseUnits, AbiCoder } from "ethers";
import { parseContractError } from "@/lib/web3/ContractError";
import { toast } from "sonner";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio — your MRVL positions and loyalty tiers" },
      {
        name: "description",
        content:
          "Track each LP position's age, loyalty tier, multiplier and claimable MRVL, with early-exit penalty warnings before you withdraw.",
      },
    ],
  }),
  component: PortfolioPage,
});

const DEFAULT_POOL_ID = POOL_ID;

function PortfolioPage() {
  const { provider, signer, address } = useWeb3();

  const [positions, setPositions] = useState<PositionData[]>([]);
  const [pendingPositions, setPendingPositions] = useState<PendingPosData[]>([]);
  const [claimableMrvl, setClaimableMrvl] = useState<number>(0);
  const [mrlvWalletBalance, setMrlvWalletBalance] = useState<string>("0");
  const [currentBlock, setCurrentBlock] = useState<number>(0);
  const [maturityBlocks, setMaturityBlocks] = useState<number>(5);
  const [isLoading, setIsLoading] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [poolDistributable, setPoolDistributable] = useState<string>("0");

  const fetchData = useCallback(async () => {
    if (!provider || !address) return;
    setIsLoading(true);
    try {
      const block = await provider.getBlockNumber();
      setCurrentBlock(block);

      const loyaltyManager = getLoyaltyManager(provider);
      const rewardVault = getRewardVault(provider);
      const mrlvToken = getMRLVToken(provider);
      const hook = getMRLVHook(provider);
      const detector = getMEVDetector(provider);

      const matBlocks = await detector.liquidityMaturityBlocks();
      setMaturityBlocks(Number(matBlocks));

      // 1. Fetch active user positions from LoyaltyManager
      const posArray: PositionData[] = [];
      let idx = 0;
      while (true) {
        try {
          const pos = await loyaltyManager.userPositions(address, DEFAULT_POOL_ID, idx);
          if (!pos || pos.id === 0n) break;
          const amountFormatted = formatUnits(pos.amount, 18);
          posArray.push({
            id: Number(pos.id),
            pool: "TK0 / TK1",
            liquidityUsd: Number(amountFormatted) * 2,
            startBlock: Number(pos.startBlock),
            tier: Number(pos.tier),
            amount: amountFormatted,
          });
          idx++;
        } catch (e) {
          break;
        }
      }
      setPositions(posArray);

      // 2. Fetch pending escrow positions from MRLVHook
      try {
        const nonce = await hook.pendingNonce();
        const pendingArr: PendingPosData[] = [];
        for (let i = 0; i < Number(nonce); i++) {
          const pKey = await hook.poolPendingPosKeys(DEFAULT_POOL_ID, i);
          const pos = await hook.pendingPositions(pKey);
          if (pos.owner.toLowerCase() === address.toLowerCase() && !pos.activated && !pos.withdrawn) {
            const elapsed = Math.max(0, block - Number(pos.blockNumber));
            pendingArr.push({
              key: pKey,
              owner: pos.owner,
              amount0: Number(formatEther(pos.amount0)).toFixed(2),
              amount1: Number(formatEther(pos.amount1)).toFixed(2),
              tickLower: Number(pos.tickLower),
              tickUpper: Number(pos.tickUpper),
              liquidity: Number(formatEther(pos.liquidity)).toFixed(2),
              blockNumber: Number(pos.blockNumber),
              blocksElapsed: elapsed,
              isMature: elapsed >= Number(matBlocks),
              activated: pos.activated,
              withdrawn: pos.withdrawn,
            });
          }
        }
        setPendingPositions(pendingArr);
      } catch (e) {
        console.warn("Pending positions fetch error:", e);
      }

      // 3. Fetch claimable & wallet MRLV
      const [claimable, walletBal, distributable] = await Promise.all([
        rewardVault.claimable(address),
        mrlvToken.balanceOf(address),
        rewardVault.poolDistributable(DEFAULT_POOL_ID),
      ]);
      setClaimableMrvl(Number(formatUnits(claimable, 18)));
      setMrlvWalletBalance(Number(formatUnits(walletBal, 18)).toFixed(2));
      setPoolDistributable(Number(formatUnits(distributable, 18)).toFixed(2));
    } catch (e) {
      console.error("Error fetching portfolio:", e);
    } finally {
      setIsLoading(false);
    }
  }, [provider, address]);

  useEffect(() => {
    fetchData();
    if (provider) {
      provider.on("block", fetchData);
      return () => {
        provider.off("block", fetchData);
      };
    }
  }, [fetchData, provider]);

  const claimRewards = async () => {
    if (!signer) throw new Error("No signer available");
    const rewardVault = getRewardVault(signer);
    return await rewardVault.claim();
  };

  const handleRefreshTier = async (_id: number) => {
    if (!signer || !address) return;
    toast.loading("Upgrading tier on-chain...", { id: "tier" });
    try {
      const loyaltyManager = getLoyaltyManager(signer);
      const tx = await loyaltyManager.refreshTiers(address, DEFAULT_POOL_ID);
      await tx.wait();
      toast.success("Loyalty tier & NFT badge refreshed!", { id: "tier" });
      await fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error(parseContractError(e), { id: "tier" });
    }
  };

  const handleActivateMaturePositions = async () => {
    if (!signer) return;
    setIsActivating(true);
    toast.loading("Activating mature positions into Uniswap v4 pool...", { id: "act" });
    try {
      const hook = getMRLVHook(signer);
      const tx = await hook.activateLiquidity(DEFAULT_POOL_ID);
      await tx.wait();
      toast.success("Positions activated! Staked LP registered & Loyalty NFT minted.", { id: "act" });
      await fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error(parseContractError(e), { id: "act" });
    } finally {
      setIsActivating(false);
    }
  };

  const handleWithdrawPending = async (posKey: string) => {
    if (!signer) return;
    toast.loading("Refunding pending escrow tokens...", { id: "with" });
    try {
      const hook = getMRLVHook(signer);
      const poolKey = {
        currency0: TOKEN0_ADDRESS,
        currency1: TOKEN1_ADDRESS,
        fee: 8388608,
        tickSpacing: 60,
        hooks: MRLV_HOOK_ADDRESS,
      };
      const tx = await hook.withdrawPendingLiquidity(posKey, poolKey);
      await tx.wait();
      toast.success("Escrow tokens returned to wallet!", { id: "with" });
      await fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error(parseContractError(e), { id: "with" });
    }
  };

  const handleDistributePoolRewards = async () => {
    if (!signer || !address) return;
    setIsDistributing(true);
    toast.loading("Distributing captured MEV to active LPs...", { id: "dist" });
    try {
      const rewardVault = getRewardVault(signer);
      const tx = await rewardVault.distribute(DEFAULT_POOL_ID, [address]);
      await tx.wait();
      toast.success("MEV Rewards distributed to LPs successfully!", { id: "dist" });
      await fetchData();
    } catch (e: any) {
      console.error(e);
      toast.error(parseContractError(e), { id: "dist" });
    } finally {
      setIsDistributing(false);
    }
  };

  const handleRemoveLiquidity = async (id: number) => {
    if (!signer || !address) throw new Error("Wallet not connected");
    const position = positions.find((p) => p.id === id);
    if (!position) throw new Error("Position not found");

    toast.loading("Removing liquidity from pool...", { id: "removeLiq" });
    try {
      const hook = getMRLVHook(signer);

      const poolKey = {
        currency0: TOKEN0_ADDRESS,
        currency1: TOKEN1_ADDRESS,
        fee: 8388608,
        tickSpacing: 60,
        hooks: MRLV_HOOK_ADDRESS,
      };

      const rawAmount = parseUnits(position.amount || "0", 18);

      const tx = await hook.removeActiveLiquidity(poolKey, -600, 600, rawAmount);
      await tx.wait();
      toast.success("Liquidity removed successfully!", { id: "removeLiq" });
      await fetchData();
    } catch (e: any) {
      console.error(e);
      const parsed = parseContractError(e);
      toast.error(`Failed to remove liquidity: ${parsed}`, { id: "removeLiq" });
    }
  };

  const totalLiquidityUnits = positions.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const anyLocked = positions.some((p) => isEarlyExit(currentBlock - p.startBlock));
  const maxTier: Tier = positions.length
    ? positions
      .map((p) => {
        if (p.tier === 2) return "Gold";
        if (p.tier === 1) return "Silver";
        return tierForAge(currentBlock - p.startBlock);
      })
      .sort((a, b) => TIER_MULTIPLIER[b] - TIER_MULTIPLIER[a])[0]
    : "Bronze";

  if (!address) {
    return (
      <div className="mx-auto grid max-w-6xl place-items-center px-5 py-32 text-center">
        <SectionLabel>Portfolio</SectionLabel>
        <h1 className="mt-6 max-w-xl text-4xl leading-[1.1] lg:text-5xl">
          Connect to see your <span className="text-gradient">loyalty tiers</span>
        </h1>
        <p className="mt-4 max-w-md text-muted-foreground">
          Positions, soulbound NFTs, tier progress and claimable MRVL load straight from the hook.
        </p>
        <div className="mt-8">
          <WalletConnectButton size="default" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <motion.div variants={fadeInUp}>
              <SectionLabel pulse>My positions</SectionLabel>
            </motion.div>
            <motion.h1 variants={fadeInUp} className="mt-6 text-4xl leading-[1.1] lg:text-6xl">
              Loyalty, <span className="text-gradient">compounded</span>
            </motion.h1>
          </div>
          <motion.div variants={fadeInUp} className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={isLoading}
              className="gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </motion.div>
        </div>
      </motion.div>

      <div className="mt-14 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          {/* Pending Escrow Section */}
          {pendingPositions.length > 0 && (
            <div className="rounded-2xl border border-warning/40 bg-warning/5 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-base flex items-center gap-2 text-warning">
                  <Clock className="size-4" />
                  Pending Escrow Deposits ({pendingPositions.length})
                </h3>
                <span className="text-xs font-mono text-muted-foreground">
                  Block {currentBlock}
                </span>
              </div>

              <div className="space-y-3">
                {pendingPositions.map((pos) => (
                  <div
                    key={pos.key}
                    className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card text-sm"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {pos.amount0} TK0 + {pos.amount1} TK1
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">
                          (Ticks: {pos.tickLower} to {pos.tickUpper})
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 font-mono">
                        Maturity: {pos.blocksElapsed} / {maturityBlocks} blocks elapsed
                        {pos.isMature ? " · ✅ Mature & Ready" : " · ⏳ In Escrow"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleWithdrawPending(pos.key)}
                        className="text-xs"
                      >
                        <XCircle className="size-3.5 mr-1" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant={pos.isMature ? "default" : "secondary"}
                        disabled={!pos.isMature || isActivating}
                        onClick={handleActivateMaturePositions}
                        className="text-xs gap-1"
                      >
                        <CheckCircle2 className="size-3.5" />
                        {pos.isMature ? "Activate Now" : "Waiting for Maturity"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Staked Positions */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Active Staked Positions ({positions.length})</h2>
            {positions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground space-y-3">
                <p className="text-lg">No active positions in the TK0 / TK1 pool.</p>
                <p className="text-sm text-muted-foreground/70">
                  Deposit liquidity on the Liquidity tab to begin earning MEV distributions!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {positions.map((p) => (
                  <PositionCard
                    key={p.id}
                    position={p}
                    currentBlock={currentBlock}
                    onRemove={handleRemoveLiquidity}
                    onRefreshTier={handleRefreshTier}
                  />
                ))}
              </div>
            )}
          </div>

          {Number(poolDistributable) > 0 && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-foreground">Pending MEV Distribution</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  ${poolDistributable} MRLV in RewardVault ready to be allocated to LPs.
                </p>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={handleDistributePoolRewards}
                disabled={isDistributing}
              >
                {isDistributing ? "Distributing..." : "Trigger Distribution"}
              </Button>
            </div>
          )}
        </div>

        <aside className="h-fit space-y-5 lg:sticky lg:top-24">
          <motion.div variants={fadeInUp} className="gradient-border shadow-brand-lg rounded-2xl">
            <div className="rounded-[calc(1rem-2px)] bg-card p-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                  Claimable MRVL
                </span>
                {anyLocked ? (
                  <Lock className="size-4 text-warning" aria-label="Penalty window active" />
                ) : (
                  <LockOpen className="size-4 text-success" aria-label="Unlocked" />
                )}
              </div>
              <div className="mt-3 font-display text-5xl text-gradient">
                {formatNumber(claimableMrvl)}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {anyLocked
                  ? "A position is still inside its 7-day window — exiting early slashes 50% of this accrued balance."
                  : "All positions are mature. Claim with no penalty."}
              </p>
              <TransactionButton
                action={claimRewards}
                onSuccess={fetchData}
                successMessage="Rewards claimed successfully"
                className="mt-6 w-full"
                size="lg"
                disabled={claimableMrvl <= 0}
              >
                <Sparkles />
                Claim {claimableMrvl.toFixed(2)} MRVL
              </TransactionButton>
            </div>
          </motion.div>

          <motion.div
            variants={fadeInUp}
            className="rounded-2xl border border-border bg-card p-6 shadow-md"
          >
            <h2 className="text-lg font-semibold tracking-[-0.01em]">LP Summary</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <SummaryRow
                label="Wallet MRVL Balance"
                value={`${mrlvWalletBalance} MRVL`}
              />
              <SummaryRow
                label="Active LP Units"
                value={`${totalLiquidityUnits.toFixed(2)} LP`}
              />
              <SummaryRow label="Open positions" value={positions.length.toString()} />
              <SummaryRow label="Pending escrow deposits" value={pendingPositions.length.toString()} />
              <SummaryRow label="Highest tier" value={`${maxTier} · ${TIER_MULTIPLIER[maxTier]}x`} />
              <SummaryRow label="Current block" value={currentBlock.toLocaleString()} />
            </dl>
          </motion.div>
        </aside>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
