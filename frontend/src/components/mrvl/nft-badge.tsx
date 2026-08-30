import { cn } from "@/lib/utils";
import { TIER_MULTIPLIER, type Tier } from "@/lib/blockMath";

const tierStyles: Record<Tier, string> = {
  Bronze: "border-bronze/40 bg-bronze/10 text-bronze",
  Silver: "border-silver/50 bg-silver/15 text-muted-foreground",
  Gold: "border-gold/50 bg-gold/15 text-gold",
};

export function NftBadge({ tier, className }: { tier: Tier; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em]",
        tierStyles[tier],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {tier} · {TIER_MULTIPLIER[tier]}x
    </span>
  );
}

/** Larger soulbound NFT artwork placeholder for the portfolio grid. */
export function NftArtwork({ tier }: { tier: Tier }) {
  return (
    <div
      className={cn(
        "relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border",
        tierStyles[tier],
      )}
      aria-label={`${tier} loyalty NFT`}
    >
      <div className="absolute inset-0 opacity-40 bg-brand-gradient mix-blend-overlay" />
      <span className="relative font-display text-lg">{tier[0]}</span>
    </div>
  );
}
