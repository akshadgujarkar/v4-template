export const BLOCK_TIME_SECONDS = 2; // Base-style L2 assumption

export const EARLY_WITHDRAW_WINDOW = 302_400; // ~7 days
export const SILVER_THRESHOLD_BLOCKS = 1_296_000; // ~30 days
export const GOLD_THRESHOLD_BLOCKS = 3_888_000; // ~90 days

export type Tier = "Bronze" | "Silver" | "Gold";

export const TIER_MULTIPLIER: Record<Tier, number> = {
  Bronze: 1,
  Silver: 2,
  Gold: 3,
};

export function blocksToDays(blocks: number): number {
  return (blocks * BLOCK_TIME_SECONDS) / 86_400;
}

export function tierForAge(ageBlocks: number): Tier {
  if (ageBlocks >= GOLD_THRESHOLD_BLOCKS) return "Gold";
  if (ageBlocks >= SILVER_THRESHOLD_BLOCKS) return "Silver";
  return "Bronze";
}

export function nextTier(tier: Tier): Tier | null {
  if (tier === "Bronze") return "Silver";
  if (tier === "Silver") return "Gold";
  return null;
}

/** Progress (0-1) toward the next tier threshold. Gold returns 1. */
export function tierProgress(ageBlocks: number): number {
  const tier = tierForAge(ageBlocks);
  if (tier === "Gold") return 1;
  const target = tier === "Bronze" ? SILVER_THRESHOLD_BLOCKS : GOLD_THRESHOLD_BLOCKS;
  const floor = tier === "Bronze" ? 0 : SILVER_THRESHOLD_BLOCKS;
  return Math.min(1, Math.max(0, (ageBlocks - floor) / (target - floor)));
}

export function isEarlyExit(ageBlocks: number): boolean {
  return ageBlocks < EARLY_WITHDRAW_WINDOW;
}

export function formatDuration(blocks: number): string {
  const days = blocksToDays(blocks);
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  if (days < 60) return `${days.toFixed(days < 10 ? 1 : 0)}d`;
  return `${(days / 30).toFixed(1)}mo`;
}

export function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatCompactUsd(value: number): string {
  return `$${value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })}`;
}
