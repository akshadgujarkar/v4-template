import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Building2, Shield, Settings, PauseCircle, PlayCircle, Lock, Gauge, Sparkles } from "lucide-react";
import { SectionLabel } from "@/components/mrvl/section-label";
import { Button } from "@/components/ui/button";
import { WalletConnectButton } from "@/components/layout/wallet-connect-button";
import { fadeInUp, stagger, viewportOnce } from "@/lib/motion";
import { useWeb3 } from "@/lib/web3/Web3Context";
import {
  getMRLVHook,
  getMRLVToken,
  getDynamicFeeManager,
  getMEVDetector,
  getRewardVault,
  MRLV_HOOK_ADDRESS,
} from "@/lib/web3/contracts";
import { formatUnits, formatEther } from "ethers";
import { parseContractError } from "@/lib/web3/ContractError";
import { toast } from "sonner";

export const Route = createFileRoute("/governance")({
  head: () => ({
    meta: [
      { title: "Governance — Protocol Parameters & Controls" },
      {
        name: "description",
        content: "Vote on protocol parameters, manage circuit breakers, and steer MRLV.",
      },
    ],
  }),
  component: GovernancePage,
});

function GovernancePage() {
  const { provider, signer, address } = useWeb3();

  const [mrlvBalance, setMrlvBalance] = React.useState<string>("0");
  const [isPaused, setIsPaused] = React.useState<boolean>(false);
  const [governanceAddr, setGovernanceAddr] = React.useState<string>("");
  const [baseFee, setBaseFee] = React.useState<string>("500");
  const [maxFee, setMaxFee] = React.useState<string>("5000");
  const [maturityBlocks, setMaturityBlocks] = React.useState<number>(5);
  const [reversalWindow, setReversalWindow] = React.useState<number>(10);
  const [insuranceBps, setInsuranceBps] = React.useState<number>(500);
  const [totalCaptured, setTotalCaptured] = React.useState<string>("0");
  const [isTogglingPause, setIsTogglingPause] = React.useState(false);

  const isGovernance =
    address && governanceAddr && address.toLowerCase() === governanceAddr.toLowerCase();

  const fetchGovData = React.useCallback(async () => {
    if (!provider) return;
    try {
      const hook = getMRLVHook(provider);
      const mrlv = getMRLVToken(provider);
      const feeManager = getDynamicFeeManager(provider);
      const detector = getMEVDetector(provider);
      const rewardVault = getRewardVault(provider);

      const [
        paused,
        gov,
        bFee,
        mFee,
        matBlocks,
        revWin,
        insBps,
        captured,
      ] = await Promise.all([
        hook.paused(),
        hook.governance(),
        feeManager.BASE_FEE(),
        feeManager.HARD_CAP(),
        detector.liquidityMaturityBlocks(),
        detector.reversalWindowBlocks(),
        rewardVault.insuranceBps(),
        rewardVault.totalCaptured(),
      ]);

      setIsPaused(Boolean(paused));
      setGovernanceAddr(gov);
      setBaseFee(bFee.toString());
      setMaxFee(mFee.toString());
      setMaturityBlocks(Number(matBlocks));
      setReversalWindow(Number(revWin));
      setInsuranceBps(Number(insBps));
      setTotalCaptured(Number(formatEther(captured)).toFixed(2));

      if (address) {
        const bal = await mrlv.balanceOf(address);
        setMrlvBalance(Number(formatUnits(bal, 18)).toFixed(2));
      }
    } catch (e) {
      console.warn("Gov fetch error:", e);
    }
  }, [provider, address]);

  React.useEffect(() => {
    fetchGovData();
    if (provider) {
      provider.on("block", fetchGovData);
      return () => {
        provider.off("block", fetchGovData);
      };
    }
  }, [fetchGovData, provider]);

  const handleTogglePause = async () => {
    if (!signer) return;
    setIsTogglingPause(true);
    const actionName = isPaused ? "Unpausing" : "Pausing";
    toast.loading(`${actionName} MRLV Hook...`, { id: "pause" });
    try {
      const hook = getMRLVHook(signer);
      const tx = isPaused ? await hook.unpause() : await hook.pause();
      await tx.wait();
      toast.success(`MRLV Hook ${isPaused ? "unpaused" : "paused"} successfully!`, { id: "pause" });
      await fetchGovData();
    } catch (e: any) {
      console.error(e);
      toast.error(parseContractError(e), { id: "pause" });
    } finally {
      setIsTogglingPause(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
      <motion.div initial="hidden" animate="visible" variants={stagger}>
        <motion.div variants={fadeInUp}>
          <SectionLabel pulse>Governance</SectionLabel>
        </motion.div>
        <motion.h1 variants={fadeInUp} className="mt-6 text-4xl leading-[1.1] lg:text-6xl">
          Steer the <span className="text-gradient">Protocol</span>
        </motion.h1>
        <motion.p variants={fadeInUp} className="mt-4 max-w-2xl text-muted-foreground text-lg">
          Manage dynamic fee boundaries, MEV detection thresholds, circuit breakers, and reward vault
          insurance cuts.
        </motion.p>
      </motion.div>

      {!address ? (
        <div className="mx-auto mt-14 grid place-items-center py-16 text-center rounded-2xl border border-dashed border-border p-12">
          <Building2 className="size-12 text-primary/80 mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Connect to view protocol governance</h2>
          <p className="text-muted-foreground max-w-md mb-6">
            View on-chain voting power, live circuit breaker status, and dynamic fee curve parameters.
          </p>
          <WalletConnectButton size="default" />
        </div>
      ) : (
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="mt-14 space-y-8"
        >
          {/* Status & Voting Power Cards */}
          <div className="grid md:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-md">
              <span className="font-mono text-xs uppercase text-muted-foreground tracking-wider">
                Your Voting Power
              </span>
              <div className="mt-2 font-display text-3xl text-gradient">
                {mrlvBalance} MRLV
              </div>
              <p className="text-xs text-muted-foreground mt-1">1 MRLV = 1 DAO Governance Vote</p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-md">
              <span className="font-mono text-xs uppercase text-muted-foreground tracking-wider">
                Hook Circuit Breaker
              </span>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`size-2.5 rounded-full ${isPaused ? "bg-amber-500" : "bg-emerald-500 animate-pulse"}`}
                />
                <span className="font-display text-2xl">
                  {isPaused ? "PAUSED" : "ACTIVE"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {isPaused
                  ? "Hook fallback: standard base fee"
                  : "MEV detection & dynamic surcharges online"}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-md">
              <span className="font-mono text-xs uppercase text-muted-foreground tracking-wider">
                Total MEV Captured
              </span>
              <div className="mt-2 font-display text-3xl text-foreground">
                ${totalCaptured}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Distributed to loyal LPs & insurance
              </p>
            </div>
          </div>

          {/* Circuit Breaker Control Card */}
          <div className="rounded-2xl border border-primary/30 bg-card p-6 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Shield className="size-5 text-primary" />
                  Emergency Circuit Breaker
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Controlled by Governance address ({governanceAddr.slice(0, 8)}...{governanceAddr.slice(-6)}).
                  {isGovernance && (
                    <span className="ml-2 text-emerald-400 font-mono text-xs font-semibold">
                      (You are Governance)
                    </span>
                  )}
                </p>
              </div>

              <Button
                variant={isPaused ? "default" : "destructive"}
                onClick={handleTogglePause}
                disabled={isTogglingPause || !isGovernance}
                className="gap-2"
                title={!isGovernance ? "Only the Governance address can toggle circuit breaker" : ""}
              >
                {isPaused ? <PlayCircle className="size-4" /> : <PauseCircle className="size-4" />}
                {isTogglingPause ? "Processing..." : isPaused ? "Unpause Hook" : "Emergency Pause"}
              </Button>
            </div>
          </div>

          {/* Protocol Parameter Grid */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-md">
            <h3 className="font-semibold text-lg flex items-center gap-2 mb-6">
              <Settings className="size-5 text-primary" />
              Live On-Chain Protocol Parameters
            </h3>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3 bg-muted/40 p-4 rounded-xl border border-border text-sm">
                <h4 className="font-semibold text-foreground flex items-center gap-2">
                  <Gauge className="size-4 text-primary" />
                  Dynamic Fee Curve
                </h4>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base Honest Fee:</span>
                  <span className="font-mono text-foreground">
                    {(Number(baseFee) / 10000).toFixed(2)}% ({baseFee} pips)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Surcharge Fee:</span>
                  <span className="font-mono text-foreground">
                    {(Number(maxFee) / 10000).toFixed(2)}% ({maxFee} pips)
                  </span>
                </div>
              </div>

              <div className="space-y-3 bg-muted/40 p-4 rounded-xl border border-border text-sm">
                <h4 className="font-semibold text-foreground flex items-center gap-2">
                  <Lock className="size-4 text-primary" />
                  MEV Detector & Escrow
                </h4>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Liquidity Maturity Window:</span>
                  <span className="font-mono text-foreground">{maturityBlocks} blocks</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reversal Detection Window:</span>
                  <span className="font-mono text-foreground">{reversalWindow} blocks</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Insurance Pool Cut:</span>
                  <span className="font-mono text-foreground">
                    {(insuranceBps / 100).toFixed(1)}% ({insuranceBps} bps)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
