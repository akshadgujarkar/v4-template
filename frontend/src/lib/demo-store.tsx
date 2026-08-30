import * as React from "react";
import { toast } from "sonner";
import {
  EARLY_WITHDRAW_WINDOW,
  GOLD_THRESHOLD_BLOCKS,
  SILVER_THRESHOLD_BLOCKS,
  TIER_MULTIPLIER,
  isEarlyExit,
  tierForAge,
  type Tier,
} from "./blockMath";

/**
 * Mock protocol state. This mirrors the shape of the real contract reads
 * (LoyaltyManager.userPositions, RewardVault.claimable, decoded hook events)
 * so swapping in wagmi later is a hook-level change, not a UI rewrite.
 */

export type Position = {
  id: number;
  pool: string;
  liquidityUsd: number;
  startBlock: number;
};

export type HookEventKind = "info" | "mev" | "reward" | "tier" | "penalty";

export type HookEvent = {
  id: number;
  block: number;
  kind: HookEventKind;
  label: string;
  detail: string;
};

export type SwapKind = "standard" | "sandwich" | "jit";

type DemoState = {
  connected: boolean;
  address: string;
  currentBlock: number;
  positions: Position[];
  claimableMrvl: number;
  totalMevCapturedUsd: number;
  mevEventsToday: number;
  events: HookEvent[];
};

const GENESIS_BLOCK = 24_120_000;

const initialState: DemoState = {
  connected: false,
  address: "",
  currentBlock: 0,
  positions: [],
  claimableMrvl: 0,
  totalMevCapturedUsd: 0,
  mevEventsToday: 0,
  events: [],
};

type Ctx = DemoState & {
  connect: () => void;
  disconnect: () => void;
  addLiquidity: (pool: string, amountUsd: number) => void;
  removeLiquidity: (id: number) => void;
  claim: () => void;
  runSwap: (kind: SwapKind) => void;
  timeTravel: (blocks: number) => void;
  reset: () => void;
};

const DemoContext = React.createContext<Ctx | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<DemoState>(initialState);
  const eventId = React.useRef(100);

  const pushEvent = React.useCallback((e: Omit<HookEvent, "id" | "block">, block: number) => {
    eventId.current += 1;
    setState((s) => ({
      ...s,
      events: [...s.events, { ...e, id: eventId.current, block }].slice(-40),
    }));
  }, []);

  const value = React.useMemo<Ctx>(() => {
    const requireWallet = () => {
      if (!state.connected) {
        toast.error("Connect a wallet first");
        return false;
      }
      return true;
    };

    return {
      ...state,
      connect: () => {
        setState((s) => ({ ...s, connected: true }));
        toast.success("Wallet connected", { description: initialState.address });
      },
      disconnect: () => setState((s) => ({ ...s, connected: false })),

      addLiquidity: (pool, amountUsd) => {
        if (!requireWallet()) return;
        setState((s) => {
          const id = Math.max(0, ...s.positions.map((p) => p.id)) + 1;
          return {
            ...s,
            currentBlock: s.currentBlock + 1,
            positions: [...s.positions, { id, pool, liquidityUsd: amountUsd, startBlock: s.currentBlock }],
          };
        });
        pushEvent(
          {
            kind: "tier",
            label: "LiquidityActivated · TierUpgraded",
            detail: `${pool} position opened · Bronze soulbound NFT minted (1x)`,
          },
          state.currentBlock + 1,
        );
        toast.success("Position opened — Bronze NFT minted", {
          description: "Hold 7 days to clear the 50% early-exit penalty window.",
        });
      },

      removeLiquidity: (id) => {
        if (!requireWallet()) return;
        const position = state.positions.find((p) => p.id === id);
        if (!position) return;
        const age = state.currentBlock - position.startBlock;
        const early = isEarlyExit(age);
        setState((s) => ({
          ...s,
          currentBlock: s.currentBlock + 1,
          positions: s.positions.filter((p) => p.id !== id),
          claimableMrvl: early ? s.claimableMrvl * 0.5 : s.claimableMrvl,
        }));
        pushEvent(
          {
            kind: early ? "penalty" : "info",
            label: early ? "ExitPenaltyApplied" : "ModifyLiquidity",
            detail: early
              ? `Position #${id} exited early · 50% of accrued MRVL slashed to vault`
              : `Position #${id} withdrawn with no penalty`,
          },
          state.currentBlock + 1,
        );
        if (early) {
          toast.error("Exit penalty applied", { description: "50% of accrued MRVL was slashed." });
        } else {
          toast.success("Liquidity removed", { description: "No penalty — position was mature." });
        }
      },

      claim: () => {
        if (!requireWallet()) return;
        if (state.claimableMrvl <= 0) {
          toast.error("Nothing to claim yet");
          return;
        }
        const amount = state.claimableMrvl;
        setState((s) => ({ ...s, claimableMrvl: 0, currentBlock: s.currentBlock + 1 }));
        pushEvent(
          { kind: "reward", label: "Claimed", detail: `${amount.toFixed(2)} MRVL transferred to LP` },
          state.currentBlock + 1,
        );
        toast.success(`Claimed ${amount.toFixed(2)} MRVL`);
      },

      runSwap: (kind) => {
        const block = state.currentBlock + 1;
        if (kind === "standard") {
          setState((s) => ({ ...s, currentBlock: block }));
          pushEvent(
            { kind: "info", label: "Standard swap", detail: "MEV score 0 → base fee 0.05%, no surcharge" },
            block,
          );
          return;
        }
        const isSandwich = kind === "sandwich";
        const captured = isSandwich ? 500 : 180;
        setState((s) => ({
          ...s,
          currentBlock: block,
          totalMevCapturedUsd: s.totalMevCapturedUsd + captured,
          mevEventsToday: s.mevEventsToday + 1,
          claimableMrvl: s.claimableMrvl + captured * 0.9,
        }));
        pushEvent(
          {
            kind: "mev",
            label: isSandwich ? "Sandwich detected" : "JIT liquidity detected",
            detail: `MEV score ${isSandwich ? 30 : 40} → surcharge applied → ${captured} USDC escrowed to RewardVault`,
          },
          block,
        );
        pushEvent(
          {
            kind: "reward",
            label: "Deposited · Distributed",
            detail: `${(captured * 0.9).toFixed(0)} MRVL minted and allocated to loyal LPs`,
          },
          block,
        );
        toast.error(`${isSandwich ? "Sandwich" : "JIT"} attack taxed — ${captured} USDC captured`, {
          description: "Surcharge escrowed to the RewardVault for LPs.",
        });
      },

      timeTravel: (blocks) => {
        const before = state.positions.map((p) => tierForAge(state.currentBlock - p.startBlock));
        const nextBlock = state.currentBlock + blocks;
        setState((s) => ({ ...s, currentBlock: nextBlock }));
        state.positions.forEach((p, i) => {
          const after = tierForAge(nextBlock - p.startBlock);
          if (after !== before[i]) {
            pushEvent(
              {
                kind: "tier",
                label: "TierUpgraded",
                detail: `Position #${p.id} → ${after} (${TIER_MULTIPLIER[after as Tier]}x multiplier)`,
              },
              nextBlock,
            );
            toast.success(`Position #${p.id} upgraded to ${after}`, {
              description: `Reward multiplier is now ${TIER_MULTIPLIER[after as Tier]}x.`,
            });
          }
        });
      },

      reset: () => setState(initialState),
    };
  }, [state, pushEvent]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const ctx = React.useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used within DemoProvider");
  return ctx;
}

export const THRESHOLDS = {
  EARLY_WITHDRAW_WINDOW,
  SILVER_THRESHOLD_BLOCKS,
  GOLD_THRESHOLD_BLOCKS,
};
