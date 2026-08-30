import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Info, ShieldCheck, Sparkles, ArrowUpDown, Droplets, SlidersHorizontal, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/mrvl/section-label";
import { TokenInput } from "@/components/mrvl/token-input";
import { WalletConnectButton } from "@/components/layout/wallet-connect-button";
import { fadeInUp, stagger } from "@/lib/motion";
import { useWeb3 } from "@/lib/web3/Web3Context";
import { TransactionButton } from "@/components/web3/TransactionButton";
import { toast } from "sonner";
import { formatEther, parseEther } from "ethers";
import {
  getSwapRouter,
  getToken0,
  getToken1,
  getDynamicFeeManager,
  getRewardVault,
  getAnalyticsEmitter,
  TOKEN0_ADDRESS,
  TOKEN1_ADDRESS,
  MRLV_HOOK_ADDRESS,
  SWAP_ROUTER_ADDRESS,
  POOL_MANAGER_ADDRESS,
} from "@/lib/web3/contracts";
import { parseContractError } from "@/lib/web3/ContractError";

export const Route = createFileRoute("/trade")({
  head: () => ({
    meta: [
      { title: "Trade — MRVL protected TK0/TK1 pool" },
      {
        name: "description",
        content:
          "Swap through the MRVL-hooked Uniswap v4 pool with constant product pricing and dynamic pool-calibrated slippage.",
      },
    ],
  }),
  component: TradePage,
});

function TradePage() {
  const { address, signer, provider } = useWeb3();
  const [amount, setAmount] = React.useState("1.0");
  const [isZeroForOne, setIsZeroForOne] = React.useState(true);

  const [bal0, setBal0] = React.useState<string>("0");
  const [bal1, setBal1] = React.useState<string>("0");

  // Pool reserves
  const [reserve0, setReserve0] = React.useState<number>(0);
  const [reserve1, setReserve1] = React.useState<number>(0);

  // Fee Manager stats
  const [baseFeeBps, setBaseFeeBps] = React.useState<number>(3000); // 0.30% = 3000
  const [hardCapBps, setHardCapBps] = React.useState<number>(30000); // 3.00% = 30000

  const [totalCapturedUsd, setTotalCapturedUsd] = React.useState<string>("0");
  const [attacksCount, setAttacksCount] = React.useState<number>(0);
  const [isMinting, setIsMinting] = React.useState(false);

  const fetchBalancesAndStats = React.useCallback(async () => {
    if (!provider) return;
    try {
      const t0 = getToken0(provider);
      const t1 = getToken1(provider);

      // 1. User wallet balances
      if (address) {
        const [b0, b1] = await Promise.all([t0.balanceOf(address), t1.balanceOf(address)]);
        setBal0(Number(formatEther(b0)).toFixed(2));
        setBal1(Number(formatEther(b1)).toFixed(2));
      }

      // 2. Pool Reserves in PoolManager
      const [r0, r1] = await Promise.all([
        t0.balanceOf(POOL_MANAGER_ADDRESS),
        t1.balanceOf(POOL_MANAGER_ADDRESS),
      ]);
      const res0 = Number(formatEther(r0));
      const res1 = Number(formatEther(r1));
      setReserve0(res0);
      setReserve1(res1);

      // 3. Dynamic Fee constants
      const feeManager = getDynamicFeeManager(provider);
      const [baseFee, hardCap] = await Promise.all([
        feeManager.BASE_FEE(),
        feeManager.HARD_CAP(),
      ]);
      setBaseFeeBps(Number(baseFee));
      setHardCapBps(Number(hardCap));

      // 4. Vault MEV capture stats
      const rewardVault = getRewardVault(provider);
      const captured = await rewardVault.totalCaptured();
      setTotalCapturedUsd(Number(formatEther(captured)).toFixed(2));

      // 5. Analytics MEV events
      const analytics = getAnalyticsEmitter(provider);
      const filter = analytics.filters.MEVDetected();
      const events = await analytics.queryFilter(filter, 0);
      setAttacksCount(events.length);
    } catch (e) {
      console.warn("Could not fetch trade page live stats:", e);
    }
  }, [provider, address]);

  React.useEffect(() => {
    fetchBalancesAndStats();
    if (provider) {
      provider.on("block", fetchBalancesAndStats);
      return () => {
        provider.off("block", fetchBalancesAndStats);
      };
    }
  }, [fetchBalancesAndStats, provider]);

  // Dynamic Uniswap Constant Product Quote (x * y = k)
  const parsedInput = Math.max(0, Number(amount) || 0);

  const Rin = isZeroForOne ? reserve0 : reserve1;
  const Rout = isZeroForOne ? reserve1 : reserve0;

  // Spot Rate: 1 In = (Rout / Rin) Out
  const spotRate = Rin > 0 && Rout > 0 ? Rout / Rin : 1;

  // Pool fee rate (3000 / 1,000,000 = 0.003 = 0.30%)
  const feeFraction = baseFeeBps / 1000000;
  const inputWithFee = parsedInput * (1 - feeFraction);

  // Constant Product Out: (Rout * inputWithFee) / (Rin + inputWithFee)
  const calculatedOutput =
    Rin > 0 && Rout > 0 && inputWithFee > 0
      ? (Rout * inputWithFee) / (Rin + inputWithFee)
      : parsedInput * spotRate;

  // Price Impact (%)
  const idealOutput = parsedInput * spotRate;
  const priceImpact =
    idealOutput > 0 && calculatedOutput > 0
      ? Math.max(0, ((idealOutput - calculatedOutput) / idealOutput) * 100)
      : 0;

  // DYNAMIC SLIPPAGE TOLERANCE (Auto-calibrated based on pool liquidity depth & price impact)
  const poolUtilizationRatio = Rin > 0 ? parsedInput / Rin : 0;
  const dynamicSlippage = Number(
    Math.min(5.0, Math.max(0.1, 0.1 + priceImpact * 0.5 + poolUtilizationRatio * 20)).toFixed(2)
  );

  // Minimum tokens received factoring in the dynamic pool slippage
  const minReceived = calculatedOutput * (1 - dynamicSlippage / 100);

  const baseFeePercent = (baseFeeBps / 10000).toFixed(2);
  const hardCapPercent = (hardCapBps / 10000).toFixed(2);

  const handleMintTestTokens = async () => {
    if (!signer || !address) return;
    setIsMinting(true);
    toast.loading("Minting 1,000 TK0 and 1,000 TK1...", { id: "mint" });
    try {
      const t0 = getToken0(signer);
      const t1 = getToken1(signer);
      const mintAmount = parseEther("1000");

      const tx0 = await t0.mint(address, mintAmount);
      await tx0.wait();

      const tx1 = await t1.mint(address, mintAmount);
      await tx1.wait();

      toast.success("Minted 1,000 TK0 & 1,000 TK1 successfully!", { id: "mint" });
      await fetchBalancesAndStats();
    } catch (err: any) {
      console.error(err);
      toast.error(parseContractError(err), { id: "mint" });
    } finally {
      setIsMinting(false);
    }
  };

  const handleSwap = async () => {
    if (!signer || !address) return;
    try {
      const parsedAmount = parseEther(amount || "0");
      if (parsedAmount <= 0n) throw new Error("Please enter a valid swap amount");

      const token = isZeroForOne ? getToken0(signer) : getToken1(signer);

      // Check current allowance; approve exact amount requested to avoid unlimited spend prompt
      const currentAllowance = await token.allowance(address, SWAP_ROUTER_ADDRESS);
      if (currentAllowance < parsedAmount) {
        toast.loading(`Approving ${amount} ${isZeroForOne ? "TK0" : "TK1"} for SwapRouter...`, { id: "swap" });
        const approveTx = await token.approve(SWAP_ROUTER_ADDRESS, parsedAmount);
        await approveTx.wait();
      }

      toast.loading("Executing protected swap through Uniswap v4 Hook...", { id: "swap" });
      const swapRouter = getSwapRouter(signer);

      const key = {
        currency0: TOKEN0_ADDRESS,
        currency1: TOKEN1_ADDRESS,
        fee: 8388608, // LPFeeLibrary.DYNAMIC_FEE_FLAG
        tickSpacing: 60,
        hooks: MRLV_HOOK_ADDRESS,
      };

      // In Uniswap v4 PoolSwapTest, exact-input specified is negative (-parsedAmount)
      const params = {
        zeroForOne: isZeroForOne,
        amountSpecified: -parsedAmount,
        sqrtPriceLimitX96: isZeroForOne
          ? 4295128739n + 1n // MIN_PRICE_LIMIT + 1
          : 1461446703485210103287273052203988822378723970342n - 1n, // MAX_PRICE_LIMIT - 1
      };

      const testSettings = {
        takeClaims: false,
        settleUsingBurn: false,
      };

      const swapTx = await swapRouter.swap(key, params, testSettings, "0x");
      await swapTx.wait();

      toast.success("Swap executed successfully! Honest base fee applied.", { id: "swap" });
      await fetchBalancesAndStats();
    } catch (err: any) {
      console.error("Swap error:", err);
      const parsedMsg = parseContractError(err);
      toast.error(parsedMsg || "Swap failed", { id: "swap" });
      throw err;
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <motion.div variants={fadeInUp}>
              <SectionLabel pulse>Protected swap</SectionLabel>
            </motion.div>
            <motion.h1 variants={fadeInUp} className="mt-6 text-4xl leading-[1.1] lg:text-6xl">
              Trade without <span className="text-gradient">funding the sandwich</span>
            </motion.h1>
          </div>
          {address && (
            <motion.div variants={fadeInUp}>
              <Button
                variant="outline"
                size="sm"
                onClick={handleMintTestTokens}
                disabled={isMinting}
                className="gap-2 border-primary/30 hover:border-primary"
              >
                <Droplets className="size-4 text-primary" />
                {isMinting ? "Minting..." : "Faucet: Mint 1,000 TK0 & TK1"}
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>

      <div className="mt-14 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        {/* Swap Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-lg space-y-4">
          <TokenInput
            label="You pay"
            token={isZeroForOne ? "TK0" : "TK1"}
            balance={isZeroForOne ? bal0 : bal1}
            value={amount}
            onChange={setAmount}
          />
          <div className="relative -my-2 flex justify-center">
            <button
              onClick={() => setIsZeroForOne(!isZeroForOne)}
              className="bg-brand-gradient shadow-brand hover:scale-105 transition-transform relative z-10 grid size-9 place-items-center rounded-xl cursor-pointer border-none"
              title="Switch tokens"
            >
              <ArrowUpDown className="size-4 text-primary-foreground" />
            </button>
          </div>
          <TokenInput
            label="You receive (constant-product quote)"
            token={isZeroForOne ? "TK1" : "TK0"}
            balance={isZeroForOne ? bal1 : bal0}
            readOnly
            value={calculatedOutput > 0 ? calculatedOutput.toFixed(4) : "0.0000"}
          />

          {/* Dynamic Slippage Tolerance Card */}
          <div className="mt-4 rounded-xl border border-border/80 bg-muted/30 p-3.5 space-y-2.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
              <SlidersHorizontal className="size-3 text-primary" />
              Dynamic Slippage Tolerance
            </span>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-primary/10 border border-primary/30">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Check className="size-3.5" />
                  Pool-Calibrated Dynamic Auto
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Auto-calibrated from {reserve0.toFixed(0)} TK0 depth & {priceImpact.toFixed(3)}% impact
                </div>
              </div>
              <div className="font-mono text-sm font-bold text-gradient">
                {dynamicSlippage}%
              </div>
            </div>
          </div>

          {/* Dynamic Pool Quote Breakdown */}
          <div className="mt-4 space-y-2.5 rounded-xl border border-border bg-muted/40 p-4 text-xs font-mono">
            <Row
              label="Pair Rate (Spot)"
              value={
                isZeroForOne
                  ? `1 TK0 ≈ ${spotRate.toFixed(4)} TK1`
                  : `1 TK1 ≈ ${spotRate.toFixed(4)} TK0`
              }
            />
            <Row
              label="Dynamic Fee Applied"
              value={`${baseFeePercent}% (honest base)`}
              accent
            />
            <Row
              label="Price Impact"
              value={`${priceImpact.toFixed(3)}%`}
            />
            <Row
              label="Dynamic Slippage"
              value={`${dynamicSlippage}% (auto)`}
            />
            <Row
              label="Minimum Received"
              value={`${minReceived.toFixed(4)} ${isZeroForOne ? "TK1" : "TK0"}`}
            />
            <Row
              label="Routing Formula"
              value="Uniswap v4 (x · y = k)"
            />
          </div>

          <div className="mt-6">
            {address ? (
              <TransactionButton
                className="w-full"
                size="lg"
                action={handleSwap}
                successMessage="Swap executed successfully"
              >
                <Sparkles className="size-4" />
                Swap {amount} {isZeroForOne ? "TK0" : "TK1"}
              </TransactionButton>
            ) : (
              <div className="[&>button]:w-full">
                <WalletConnectButton size="default" />
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Info & Surcharge Specs */}
        <div className="space-y-6">
          {/* Surcharge Explainer with Contract Formulas */}
          <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-6 space-y-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 text-primary shrink-0" />
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.01em]">
                  MEV Protected by Dynamic Fee Hook
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  The MRLV hook checks every trade against the <code className="text-foreground">MEVDetector</code>. Honest trades pay the standard <strong className="text-foreground">{baseFeePercent}%</strong> base fee. Searchers or sandwich bots face dynamic surcharges scaled up to <strong className="text-foreground">{hardCapPercent}%</strong> (contract hard cap), captured directly into the <code className="text-foreground">RewardVault</code> for LPs.
                </p>
              </div>
            </div>

            {/* Dynamic Fee Tiers Schedule */}
            <div className="pt-2 border-t border-primary/20 space-y-2">
              <span className="text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground block">
                Contract Dynamic Surcharge Schedule:
              </span>
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                <div className="p-2 rounded-lg bg-card border border-border">
                  <div className="text-[10px] text-emerald-400 font-semibold">Honest (0-29)</div>
                  <div className="text-sm font-display text-foreground mt-0.5">{baseFeePercent}%</div>
                  <div className="text-[9px] text-muted-foreground">Base Fee</div>
                </div>
                <div className="p-2 rounded-lg bg-card border border-border">
                  <div className="text-[10px] text-yellow-400 font-semibold">Medium (30-69)</div>
                  <div className="text-sm font-display text-foreground mt-0.5">0.60%</div>
                  <div className="text-[9px] text-muted-foreground">2x Surcharge</div>
                </div>
                <div className="p-2 rounded-lg bg-card border border-border">
                  <div className="text-[10px] text-red-400 font-semibold">MEV (70-100)</div>
                  <div className="text-sm font-display text-gradient mt-0.5">1.0% - {hardCapPercent}%</div>
                  <div className="text-[9px] text-muted-foreground">Hard Cap</div>
                </div>
              </div>
            </div>
          </div>

          {/* Live Pool Reserves & MEV Defenses */}
          <div className="texture-dots relative overflow-hidden rounded-2xl bg-foreground p-7 text-background">
            <div className="glow-brand pointer-events-none absolute -right-20 -top-20 size-72 rounded-full" />
            <div className="relative space-y-5">
              <div className="flex items-center justify-between">
                <SectionLabel inverted>Live Pool Defenses</SectionLabel>
                <span className="text-xs font-mono opacity-70">
                  Reserves: {reserve0.toFixed(0)} TK0 / {reserve1.toFixed(0)} TK1
                </span>
              </div>

              <div className="grid grid-cols-2 gap-6 pt-2">
                <div>
                  <div className="font-display text-4xl text-background">{attacksCount}</div>
                  <p className="mt-1 text-xs opacity-70 uppercase tracking-wider font-mono">Attacks detected</p>
                </div>
                <div>
                  <div className="font-display text-4xl text-gradient">
                    ${totalCapturedUsd}
                  </div>
                  <p className="mt-1 text-xs opacity-70 uppercase tracking-wider font-mono">Total MEV Captured</p>
                </div>
              </div>
            </div>
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              Hook: <span className="font-mono text-foreground/80 break-all">{MRLV_HOOK_ADDRESS}</span>
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={accent ? "font-medium text-primary" : "font-medium text-foreground"}>{value}</span>
    </div>
  );
}
