import { motion } from "motion/react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NftArtwork, NftBadge } from "@/components/mrvl/nft-badge";
import {
  EARLY_WITHDRAW_WINDOW,
  formatDuration,
  isEarlyExit,
  nextTier,
  tierForAge,
  tierProgress,
  type Tier,
} from "@/lib/blockMath";
import { fadeInUp } from "@/lib/motion";

export interface PositionData {
  id: number;
  pool: string;
  liquidityUsd: number;
  startBlock: number;
  tier?: number | Tier;
  amount?: string;
  tickLower?: number;
  tickUpper?: number;
}

export function PositionCard({
  position,
  currentBlock,
  onRemove,
  onRefreshTier,
}: {
  position: PositionData;
  currentBlock: number;
  onRemove: (id: number) => void;
  onRefreshTier?: (id: number) => void;
}) {
  const age = Math.max(0, currentBlock - position.startBlock);
  
  // Resolve tier either from age or on-chain tier
  let tier: Tier = "Bronze";
  if (typeof position.tier === "number") {
    if (position.tier === 2) tier = "Gold";
    else if (position.tier === 1) tier = "Silver";
    else tier = "Bronze";
  } else if (typeof position.tier === "string") {
    tier = position.tier as Tier;
  } else {
    tier = tierForAge(age);
  }

  const calculatedTier = tierForAge(age);
  const canUpgrade = calculatedTier !== tier;
  const upcoming = nextTier(tier);
  const progress = tierProgress(age);
  const early = isEarlyExit(age);

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-md transition-shadow duration-300 hover:shadow-xl"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.04] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="relative flex items-start gap-4">
        <NftArtwork tier={tier} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-sans text-lg font-semibold tracking-[-0.01em]">{position.pool}</h3>
            <NftBadge tier={tier} />
            {canUpgrade && (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-mono animate-pulse">
                Ready for {calculatedTier}!
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            Position #{position.id} · age {formatDuration(age)} ({age.toLocaleString()} blocks)
          </p>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl">
            {position.amount ? `${Number(position.amount).toFixed(2)} LP` : `$${position.liquidityUsd.toLocaleString("en-US")}`}
          </div>
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            staked liquidity
          </div>
        </div>
      </div>

      <div className="relative mt-6">
        <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          <span>{upcoming ? `Progress to ${upcoming}` : "Max tier reached"}</span>
          <span className="text-primary">{Math.round(progress * 100)}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="bg-brand-gradient h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>

      {early ? (
        <div className="relative mt-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <AlertTriangle className="mt-0.5 size-4 text-destructive shrink-0" />
          <p className="text-sm text-muted-foreground">
            Exiting now slashes <strong className="text-destructive">50% of accrued MRVL</strong> —{" "}
            {formatDuration(EARLY_WITHDRAW_WINDOW - age)} remaining in the 7-day penalty window.
          </p>
        </div>
      ) : null}

      <div className="relative mt-6 flex flex-wrap gap-3">
        <Button variant="outline" className="flex-1" onClick={() => onRemove(position.id)}>
          Remove liquidity
        </Button>
        {onRefreshTier && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onRefreshTier(position.id)}
            className="gap-1.5"
            title="Update on-chain NFT and multiplier"
          >
            <Sparkles className="size-3.5 text-primary" />
            Refresh Tier
          </Button>
        )}
      </div>
    </motion.article>
  );
}
