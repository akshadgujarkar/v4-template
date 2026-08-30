import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowRight, Coins, Gauge, ShieldCheck, Timer, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/mrvl/section-label";
import { Stat } from "@/components/mrvl/stat";
import { HeroGraphic } from "@/components/mrvl/hero-graphic";
import { fadeInUp, stagger, viewportOnce } from "@/lib/motion";
import { formatCompactUsd } from "@/lib/blockMath";
import { useDemo } from "@/lib/demo-store";
import { useWeb3 } from "@/lib/web3/Web3Context";
import {
  getLoyaltyManager,
  getRewardVault,
  getAnalyticsEmitter,
  POOL_ID,
} from "@/lib/web3/contracts";
import { formatEther } from "ethers";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MRVL Vault — MEV taxed, LPs paid" },
      {
        name: "description",
        content:
          "Live protocol metrics for the MRVL Uniswap v4 hook: TVL, MEV captured from toxic flow, and MRVL distributed to loyal liquidity providers.",
      },
      { property: "og:title", content: "MRVL Vault — MEV taxed, LPs paid" },
      {
        property: "og:description",
        content: "TVL, MEV captured, and MRVL distributed to loyal LPs — live from the hook.",
      },
    ],
  }),
  component: Dashboard,
});

const features = [
  {
    icon: ShieldCheck,
    title: "MEV detection at the hook",
    body: "beforeSwap scores every trade for sandwich and JIT patterns before it touches the pool.",
  },
  {
    icon: Gauge,
    title: "Dynamic fee surcharge",
    body: "Toxic flow pays up to 0.45% extra. Honest swaps keep the 0.05% base fee, untouched.",
  },
  {
    icon: Coins,
    title: "Captured, not leaked",
    body: "The surcharge is escrowed in the RewardVault and minted into MRVL instead of leaving the pool.",
  },
  {
    icon: Timer,
    title: "Loyalty compounds",
    body: "Bronze to Silver to Gold soulbound NFTs multiply an LP's share of every distribution.",
  },
];

function Dashboard() {
  const { provider } = useWeb3();
  const { totalMevCapturedUsd: demoCaptured, mevEventsToday: demoEvents } = useDemo();

  const [tvlUsd, setTvlUsd] = React.useState<number>(100_000);
  const [capturedUsd, setCapturedUsd] = React.useState<number>(0);
  const [attacksCount, setAttacksCount] = React.useState<number>(0);

  const fetchStats = React.useCallback(async () => {
    if (!provider) return;
    try {
      const loyalty = getLoyaltyManager(provider);
      const reward = getRewardVault(provider);
      const analytics = getAnalyticsEmitter(provider);

      const [poolLiq, cap] = await Promise.all([
        loyalty.poolLiquidity(POOL_ID),
        reward.totalCaptured(),
      ]);

      const poolVal = Number(formatEther(poolLiq));
      if (poolVal > 0) setTvlUsd(poolVal * 2);

      const capVal = Number(formatEther(cap));
      setCapturedUsd(capVal);

      const filter = analytics.filters.MEVDetected();
      const events = await analytics.queryFilter(filter, 0);
      setAttacksCount(events.length);
    } catch (e) {
      console.warn("Dashboard stats error:", e);
    }
  }, [provider]);

  React.useEffect(() => {
    fetchStats();
    if (provider) {
      provider.on("block", fetchStats);
      return () => {
        provider.off("block", fetchStats);
      };
    }
  }, [fetchStats, provider]);

  const displayCaptured = capturedUsd > 0 ? capturedUsd : demoCaptured;
  const displayAttacks = attacksCount > 0 ? attacksCount : demoEvents;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="glow-brand pointer-events-none absolute -left-40 -top-40 size-[36rem] rounded-full" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 lg:grid-cols-[1.1fr_0.9fr] lg:py-36">
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.div variants={fadeInUp}>
              <SectionLabel pulse>Uniswap v4 hook · live</SectionLabel>
            </motion.div>
            <motion.h1
              variants={fadeInUp}
              className="mt-7 text-[2.75rem] leading-[1.05] tracking-[-0.02em] sm:text-6xl lg:text-[5.25rem]"
            >
              MEV pays the{" "}
              <span className="relative inline-block">
                <span className="text-gradient">LPs</span>
                <span className="absolute -bottom-1 left-0 h-3 w-full rounded-sm bg-gradient-to-r from-primary/15 to-brand-2/10 md:-bottom-2 md:h-4" />
              </span>
            </motion.h1>
            <motion.p
              variants={fadeInUp}
              className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground"
            >
              MRVL detects sandwich attacks and JIT liquidity inside the swap itself, taxes them with
              a dynamic fee, and redistributes every captured dollar to the passive LPs who normally
              eat the loss.
            </motion.p>
            <motion.div variants={fadeInUp} className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link to="/liquidity">
                  Provide liquidity
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                <Link to="/trade">Protected Swap</Link>
              </Button>
            </motion.div>
          </motion.div>

          <HeroGraphic />
        </div>
      </section>

      {/* Inverted stats band */}
      <section className="texture-dots relative overflow-hidden bg-foreground">
        <div className="glow-brand pointer-events-none absolute -right-32 bottom-0 size-[28rem] rounded-full" />
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="relative mx-auto grid max-w-6xl grid-cols-2 gap-y-12 px-5 py-24 lg:grid-cols-4 lg:divide-x lg:divide-background/10"
        >
          {[
            {
              label: "Total value locked",
              value: formatCompactUsd(tvlUsd),
              hint: "Active on Uniswap v4 pool",
            },
            {
              label: "MEV captured",
              value: formatCompactUsd(displayCaptured),
              hint: "Surcharge revenue in RewardVault",
            },
            { label: "Protocol APY", value: "18.4%", hint: "Base yield + MRVL rewards" },
            {
              label: "Attacks taxed",
              value: displayAttacks.toString(),
              hint: "Sandwich + JIT flagged",
            },
          ].map((s) => (
            <motion.div key={s.label} variants={fadeInUp}>
              <Stat inverted label={s.label} value={s.value} hint={s.hint} />
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-5 py-28 lg:py-36">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={stagger}>
          <motion.div variants={fadeInUp}>
            <SectionLabel>How the hook works</SectionLabel>
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="mt-6 max-w-2xl text-3xl leading-[1.15] lg:text-[3.25rem]"
          >
            Four interceptions between a <span className="text-gradient">toxic trade</span> and your
            yield
          </motion.h2>

          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <motion.article
                key={f.title}
                variants={fadeInUp}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-7 shadow-md transition-shadow duration-300 hover:shadow-xl"
              >
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.04] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="bg-brand-gradient shadow-brand relative grid size-11 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110">
                  <f.icon className="size-5 text-primary-foreground" />
                </div>
                <h3 className="relative mt-6 text-lg font-semibold tracking-[-0.01em]">{f.title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </motion.article>
            ))}
          </div>
        </motion.div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-28">
        <div className="gradient-border shadow-brand-lg rounded-3xl">
          <div className="rounded-[calc(1.5rem-2px)] bg-card px-8 py-14 text-center sm:px-16">
            <h2 className="mx-auto max-w-2xl text-3xl leading-[1.15] lg:text-[2.75rem]">
              Experience Uniswap v4 <span className="text-gradient">MEV defense</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-muted-foreground">
              Swap safely with dynamic MEV tax protection or provide liquidity and compound your loyalty multiplier.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link to="/trade">
                  Start Trading
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                <Link to="/portfolio">View LP Portfolio</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
