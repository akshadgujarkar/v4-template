import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Lock, TrendingUp, Droplets, CheckCircle, Clock, Sliders, Layers, ArrowUpRight, XCircle, Info, RefreshCw } from "lucide-react";
import { SectionLabel } from "@/components/mrvl/section-label";
import { TokenInput } from "@/components/mrvl/token-input";
import { Button } from "@/components/ui/button";
import { fadeInUp, stagger, viewportOnce } from "@/lib/motion";
import { useWeb3 } from "@/lib/web3/Web3Context";
import { TransactionButton } from "@/components/web3/TransactionButton";
import { parseUnits, formatEther, parseEther } from "ethers";
import { maxLiquidityForAmounts } from "@/lib/web3/liquidityMath";
import {
  getMRLVHook,
  getToken0,
  getToken1,
  getMEVDetector,
  getLoyaltyManager,
  TOKEN0_ADDRESS,
  TOKEN1_ADDRESS,
  MRLV_HOOK_ADDRESS,
  POOL_MANAGER_ADDRESS,
  POOL_ID,
  type PendingPosData,
} from "@/lib/web3/contracts";
import { parseContractError } from "@/lib/web3/ContractError";
import { toast } from "sonner";

export const Route = createFileRoute("/liquidity")({
  head: () => ({
    meta: [
      { title: "Liquidity — MRVL hooked pools" },
      {
        name: "description",
        content:
          "Add liquidity to MRVL-hooked Uniswap v4 pools, configure tick ranges, earn MEV surcharge revenue as MRVL, and level up Bronze to Gold loyalty tiers.",
      },
    ],
  }),
  component: LiquidityPage,
});

const RANGE_PRESETS = [
  { label: "Concentrated (±600)", tickLower: -600, tickUpper: 600, desc: "Capital efficient · 0.94 - 1.06 price" },
  { label: "Wide (±6000)", tickLower: -6000, tickUpper: 6000, desc: "Lower maintenance · 0.55 - 1.82 price" },
  { label: "Full Range", tickLower: -887220, tickUpper: 887220, desc: "Never goes out of range" },
  { label: "Custom", tickLower: -600, tickUpper: 600, desc: "Specify custom tick boundaries" },
];

function LiquidityPage() {
  const { signer, provider, address } = useWeb3();
  const [amount0, setAmount0] = React.useState("10.0");
  const [amount1, setAmount1] = React.useState("10.0");
  const [bal0, setBal0] = React.useState("0");
  const [bal1, setBal1] = React.useState("0");

  // Pool state & remaining reserves
  const [pmReserve0, setPmReserve0] = React.useState<string>("0");
  const [pmReserve1, setPmReserve1] = React.useState<string>("0");
  const [escrowReserve0, setEscrowReserve0] = React.useState<string>("0");
  const [escrowReserve1, setEscrowReserve1] = React.useState<string>("0");
  const [poolTvl, setPoolTvl] = React.useState<string>("0");
  const [maturityBlocks, setMaturityBlocks] = React.useState<number>(5);
  const [currentBlock, setCurrentBlock] = React.useState<number>(0);

  // Range Configuration
  const [rangePreset, setRangePreset] = React.useState<number>(0);
  const [customTickLower, setCustomTickLower] = React.useState<number>(-600);
  const [customTickUpper, setCustomTickUpper] = React.useState<number>(600);
  const tickSpacing = 60;

  // Pending user positions in escrow
  const [userPendingPositions, setUserPendingPositions] = React.useState<PendingPosData[]>([]);

  const [isMinting, setIsMinting] = React.useState(false);
  const [isActivating, setIsActivating] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const fetchBalancesAndPool = React.useCallback(async () => {
    if (!provider) return;
    setIsLoading(true);
    try {
      const block = await provider.getBlockNumber();
      setCurrentBlock(block);

      const t0 = getToken0(provider);
      const t1 = getToken1(provider);
      const hook = getMRLVHook(provider);
      const detector = getMEVDetector(provider);
      const loyaltyManager = getLoyaltyManager(provider);

      // 1. User wallet balances
      if (address) {
        const [b0, b1] = await Promise.all([t0.balanceOf(address), t1.balanceOf(address)]);
        setBal0(Number(formatEther(b0)).toFixed(2));
        setBal1(Number(formatEther(b1)).toFixed(2));
      }

      // 2. Pool Reserves & Escrow Balances
      const [pm0, pm1, h0, h1, blocks, liq] = await Promise.all([
        t0.balanceOf(POOL_MANAGER_ADDRESS),
        t1.balanceOf(POOL_MANAGER_ADDRESS),
        t0.balanceOf(MRLV_HOOK_ADDRESS),
        t1.balanceOf(MRLV_HOOK_ADDRESS),
        detector.liquidityMaturityBlocks(),
        loyaltyManager.poolLiquidity(POOL_ID),
      ]);

      setPmReserve0(Number(formatEther(pm0)).toFixed(2));
      setPmReserve1(Number(formatEther(pm1)).toFixed(2));
      setEscrowReserve0(Number(formatEther(h0)).toFixed(2));
      setEscrowReserve1(Number(formatEther(h1)).toFixed(2));
      setMaturityBlocks(Number(blocks));
      setPoolTvl(Number(formatEther(liq)).toFixed(2));

      // 3. User Pending Positions on Hook Escrow
      try {
        const nonce = await hook.pendingNonce();
        const pendingArr: PendingPosData[] = [];
        for (let i = 0; i < Number(nonce); i++) {
          const pKey = await hook.poolPendingPosKeys(POOL_ID, i);
          const pos = await hook.pendingPositions(pKey);
          if (address && pos.owner.toLowerCase() === address.toLowerCase() && !pos.activated && !pos.withdrawn) {
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
              isMature: elapsed >= Number(blocks),
              activated: pos.activated,
              withdrawn: pos.withdrawn,
            });
          }
        }
        setUserPendingPositions(pendingArr);
      } catch (e) {
        console.warn("Pending positions fetch:", e);
      }
    } catch (e) {
      console.warn("Error fetching liquidity data:", e);
    } finally {
      setIsLoading(false);
    }
  }, [provider, address]);

  React.useEffect(() => {
    fetchBalancesAndPool();
    if (provider) {
      provider.on("block", fetchBalancesAndPool);
      return () => {
        provider.off("block", fetchBalancesAndPool);
      };
    }
  }, [fetchBalancesAndPool, provider]);

  const handleMintTokens = async () => {
    if (!signer || !address) return;
    setIsMinting(true);
    toast.loading("Minting test tokens...", { id: "mint" });
    try {
      const t0 = getToken0(signer);
      const t1 = getToken1(signer);
      const mintAmount = parseEther("1000");

      const tx0 = await t0.mint(address, mintAmount);
      await tx0.wait();
      const tx1 = await t1.mint(address, mintAmount);
      await tx1.wait();

      toast.success("Minted 1,000 TK0 & 1,000 TK1!", { id: "mint" });
      await fetchBalancesAndPool();
    } catch (e: any) {
      console.error(e);
      toast.error(parseContractError(e), { id: "mint" });
    } finally {
      setIsMinting(false);
    }
  };

  const handleAddLiquidity = async () => {
    if (!signer || !address) throw new Error("Wallet not connected");

    const parsedAmount0 = parseUnits(amount0 || "0", 18);
    const parsedAmount1 = parseUnits(amount1 || "0", 18);

    if (parsedAmount0 <= 0n && parsedAmount1 <= 0n) {
      throw new Error("Enter a deposit amount greater than zero");
    }

    const token0 = getToken0(signer);
    const token1 = getToken1(signer);

    // Exact approvals to avoid unlimited cap prompt
    const [allow0, allow1] = await Promise.all([
      token0.allowance(address, MRLV_HOOK_ADDRESS),
      token1.allowance(address, MRLV_HOOK_ADDRESS),
    ]);

    if (allow0 < parsedAmount0) {
      toast.loading(`Approving ${amount0} TK0 for hook escrow...`, { id: "liq" });
      const tx0 = await token0.approve(MRLV_HOOK_ADDRESS, parsedAmount0);
      await tx0.wait();
    }

    if (allow1 < parsedAmount1) {
      toast.loading(`Approving ${amount1} TK1 for hook escrow...`, { id: "liq" });
      const tx1 = await token1.approve(MRLV_HOOK_ADDRESS, parsedAmount1);
      await tx1.wait();
    }

    toast.loading("Depositing liquidity into MRLV escrow...", { id: "liq" });
    const hook = getMRLVHook(signer);

    const poolKey = {
      currency0: TOKEN0_ADDRESS,
      currency1: TOKEN1_ADDRESS,
      fee: 8388608,
      tickSpacing: 60,
      hooks: MRLV_HOOK_ADDRESS,
    };

    const activeTickLower = rangePreset === 3 ? customTickLower : RANGE_PRESETS[rangePreset].tickLower;
    const activeTickUpper = rangePreset === 3 ? customTickUpper : RANGE_PRESETS[rangePreset].tickUpper;

    // ── Correct Uniswap V4 liquidity math ──────────────────────────────
    // Query the pool's current sqrtPriceX96 from the on-chain state
    const hookRead = getMRLVHook(provider!);
    const slot0 = await hookRead.getPoolSlot0(POOL_ID);
    const sqrtPriceX96 = BigInt(slot0.sqrtPriceX96.toString());

    // Compute the maximum liquidity (L) that can be minted from our token amounts
    let liquidityDelta = maxLiquidityForAmounts(
      sqrtPriceX96,
      activeTickLower,
      activeTickUpper,
      parsedAmount0,
      parsedAmount1
    );

    // Apply a 0.1% safety haircut so the pool never asks for more tokens
    // than we escrowed (any excess is auto-refunded on activation)
    liquidityDelta = (liquidityDelta * 999n) / 1000n;
    if (liquidityDelta <= 0n) liquidityDelta = 1n;

    const params = {
      tickLower: activeTickLower,
      tickUpper: activeTickUpper,
      liquidityDelta,
      salt: "0x0000000000000000000000000000000000000000000000000000000000000000",
    };

    const depositTx = await hook.depositPendingLiquidity(
      poolKey,
      params,
      parsedAmount0,
      parsedAmount1,
      { gasLimit: 3000000 }
    );
    await depositTx.wait();

    toast.success("Liquidity deposited to escrow! Maturing in 5 blocks.", { id: "liq" });
    await fetchBalancesAndPool();
  };

  const handleActivateSinglePosition = async (posKey: string) => {
    if (!signer) return;
    setIsActivating(true);
    toast.loading("Activating position on-chain...", { id: "act" });
    try {
      const hook = getMRLVHook(signer);
      const tx = await hook.activateLiquidity(posKey, { gasLimit: 3000000 });
      await tx.wait();
      toast.success("Position successfully activated into Uniswap v4 pool and Loyalty NFT minted!", { id: "act" });
      await fetchBalancesAndPool();
    } catch (e: any) {
      console.error(e);
      toast.error(parseContractError(e), { id: "act" });
    } finally {
      setIsActivating(false);
    }
  };

  const handleBatchActivation = async () => {
    if (!signer) return;
    const maturePositions = userPendingPositions.filter((p) => p.isMature);
    if (maturePositions.length === 0) {
      toast.info("No mature positions to activate.");
      return;
    }
    setIsActivating(true);
    toast.loading(`Activating ${maturePositions.length} mature position(s)...`, { id: "act" });
    try {
      const hook = getMRLVHook(signer);
      for (const pos of maturePositions) {
        const tx = await hook.activateLiquidity(pos.key, { gasLimit: 3000000 });
        await tx.wait();
      }
      toast.success(`${maturePositions.length} position(s) activated into Uniswap v4 pool!`, { id: "act" });
      await fetchBalancesAndPool();
    } catch (e: any) {
      console.error(e);
      toast.error(parseContractError(e), { id: "act" });
    } finally {
      setIsActivating(false);
    }
  };

  const handleWithdrawPending = async (posKey: string) => {
    if (!signer) return;
    toast.loading("Withdrawing escrow tokens...", { id: "with" });
    try {
      const hook = getMRLVHook(signer);
      const poolKey = {
        currency0: TOKEN0_ADDRESS,
        currency1: TOKEN1_ADDRESS,
        fee: 8388608,
        tickSpacing: 60,
        hooks: MRLV_HOOK_ADDRESS,
      };
      const tx = await hook.withdrawPendingLiquidity(posKey, poolKey, { gasLimit: 3000000 });
      await tx.wait();
      toast.success("Pending position refunded back to your wallet!", { id: "with" });
      await fetchBalancesAndPool();
    } catch (e: any) {
      console.error(e);
      toast.error(parseContractError(e), { id: "with" });
    }
  };

  const estimatedUsd = (Number(amount0) || 0) + (Number(amount1) || 0);

  return (
    <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <motion.div variants={fadeInUp}>
              <SectionLabel>Hooked pools</SectionLabel>
            </motion.div>
            <motion.h1 variants={fadeInUp} className="mt-6 max-w-2xl text-4xl leading-[1.1] lg:text-6xl">
              Add Liquidity & <span className="text-gradient">Earn MEV</span>
            </motion.h1>
          </div>
          {address && (
            <motion.div variants={fadeInUp} className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleMintTokens}
                disabled={isMinting}
                className="gap-2 border-primary/30"
              >
                <Droplets className="size-4 text-primary" />
                {isMinting ? "Minting..." : "Faucet: Mint Test Tokens"}
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
        variants={stagger}
        className="mt-14 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"
      >
        <div className="space-y-6">
          {/* Pool Card with Detailed Remaining Reserves */}
          <motion.div
            variants={fadeInUp}
            className="block w-full rounded-2xl border border-primary/40 bg-card p-6 shadow-brand"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="font-sans text-xl font-semibold tracking-[-0.01em]">TK0 / TK1 Pool</h2>
                  <span className="bg-brand-gradient rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-primary-foreground">
                    MEV Protected
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  Tick Spacing: {tickSpacing} · Dynamic Fee Hook
                </p>
              </div>
              <div className="flex gap-6 text-right">
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    Base APY
                  </div>
                  <div className="mt-1 font-display text-2xl">4.2%</div>
                </div>
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    + MRVL MEV APY
                  </div>
                  <div className="mt-1 flex items-center gap-1 font-display text-2xl text-gradient">
                    18.4%
                    <TrendingUp className="size-4 text-primary" />
                  </div>
                </div>
              </div>
            </div>

            {/* Remaining Reserves Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-border bg-muted/30 p-4 rounded-xl text-xs font-mono">
              <div>
                <span className="text-muted-foreground block">Pool TK0 Reserve:</span>
                <span className="text-foreground font-semibold text-sm">{pmReserve0} TK0</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Pool TK1 Reserve:</span>
                <span className="text-foreground font-semibold text-sm">{pmReserve1} TK1</span>
              </div>
              <div>
                <span className="text-muted-foreground block">In Escrow (TK0/TK1):</span>
                <span className="text-foreground font-semibold text-sm">{escrowReserve0} / {escrowReserve1}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Active Staked LP:</span>
                <span className="text-primary font-semibold text-sm">{poolTvl} Units</span>
              </div>
            </div>
          </motion.div>

          {/* Pending Escrow Positions Section */}
          {userPendingPositions.length > 0 && (
            <motion.div
              variants={fadeInUp}
              className="rounded-2xl border border-warning/40 bg-warning/5 p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-base flex items-center gap-2 text-warning">
                  <Clock className="size-4" />
                  Your Pending Escrow Deposits ({userPendingPositions.length})
                </h3>
                <span className="text-xs font-mono text-muted-foreground">
                  Current Block: {currentBlock}
                </span>
              </div>

              <div className="space-y-3">
                {userPendingPositions.map((pos) => (
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
                        {pos.isMature ? " · ✅ Ready for Activation!" : " · ⏳ Maturing..."}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleWithdrawPending(pos.key)}
                        className="text-xs text-muted-foreground"
                      >
                        <XCircle className="size-3.5 mr-1" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant={pos.isMature ? "default" : "secondary"}
                        disabled={!pos.isMature || isActivating}
                        onClick={() => handleActivateSinglePosition(pos.key)}
                        className="text-xs gap-1"
                      >
                        <CheckCircle className="size-3.5" />
                        Activate
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Maturity Escrow Protection Explainer */}
          <motion.div
            variants={fadeInUp}
            className="rounded-2xl border border-border bg-card p-6 space-y-4"
          >
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Lock className="size-4 text-primary" />
              Maturity Escrow Protection (Defeating JIT Attacks)
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              When adding liquidity to an MRVL hook, tokens enter a <strong className="text-foreground">{maturityBlocks}-block pending escrow</strong> before activation. This mathematically prevents MEV searchers from executing Just-In-Time (JIT) liquidity attacks.
            </p>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchActivation}
                disabled={isActivating || !signer}
                className="gap-2"
              >
                <CheckCircle className="size-4 text-emerald-400" />
                {isActivating ? "Activating..." : "Trigger Batch Activation"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchBalancesAndPool}
                className="gap-1.5 text-muted-foreground"
              >
                <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </motion.div>
        </div>

        {/* Deposit Configuration Sidebar */}
        <motion.div
          variants={fadeInUp}
          className="h-fit rounded-2xl border border-border bg-card p-6 shadow-lg lg:sticky lg:top-24 space-y-5"
        >
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.01em]">Add Liquidity</h2>
            <p className="mt-1 font-mono text-xs text-muted-foreground">Pair: TK0 / TK1 · Tick Spacing: {tickSpacing}</p>
          </div>

          {/* Range Presets Selection */}
          <div className="space-y-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
              <Sliders className="size-3 text-primary" />
              Price Range Configuration
            </span>
            <div className="grid grid-cols-2 gap-2">
              {RANGE_PRESETS.map((preset, idx) => (
                <button
                  key={preset.label}
                  onClick={() => setRangePreset(idx)}
                  className={`text-left p-2.5 rounded-xl border text-xs transition-all ${
                    rangePreset === idx
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <div className="font-semibold text-foreground">{preset.label}</div>
                  <div className="text-[10px] text-muted-foreground/80 mt-0.5">{preset.desc}</div>
                </button>
              ))}
            </div>

            {/* Custom Range Inputs if selected */}
            {rangePreset === 3 && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase">Tick Lower (mult of 60)</label>
                  <input
                    type="number"
                    step="60"
                    value={customTickLower}
                    onChange={(e) => setCustomTickLower(Number(e.target.value))}
                    className="w-full mt-1 px-3 py-1.5 bg-muted rounded-lg border border-border text-sm font-mono text-foreground"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground uppercase">Tick Upper (mult of 60)</label>
                  <input
                    type="number"
                    step="60"
                    value={customTickUpper}
                    onChange={(e) => setCustomTickUpper(Number(e.target.value))}
                    className="w-full mt-1 px-3 py-1.5 bg-muted rounded-lg border border-border text-sm font-mono text-foreground"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Deposit Amounts Inputs */}
          <div className="space-y-3">
            <TokenInput
              label="Deposit TK0"
              token="TK0"
              balance={bal0}
              value={amount0}
              onChange={setAmount0}
            />
            <TokenInput
              label="Deposit TK1"
              token="TK1"
              balance={bal1}
              value={amount1}
              onChange={setAmount1}
            />
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 text-warning shrink-0" />
            <p>
              Holding for <strong className="text-foreground">7 days</strong> clears the 50% early withdrawal penalty. Your soulbound Loyalty NFT will be minted automatically on activation.
            </p>
          </div>

          <div>
            <TransactionButton
              className="w-full"
              size="lg"
              action={handleAddLiquidity}
              successMessage="Liquidity deposited to escrow!"
              disabled={!signer}
            >
              Deposit ~{estimatedUsd.toFixed(2)} Liquidity
            </TransactionButton>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
