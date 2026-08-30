import { motion } from "motion/react";

/**
 * Abstract generative composition for the dashboard hero: rotating dashed ring,
 * two floating cards on staggered sine bobs, dot grid, and a solid accent block.
 */
export function HeroGraphic() {
  return (
    <div className="relative hidden aspect-square w-full max-w-[30rem] lg:block" aria-hidden="true">
      <div className="glow-brand absolute inset-10 rounded-full" />

      <motion.div
        className="absolute inset-4 rounded-full border border-dashed border-primary/30"
        animate={{ rotate: 360 }}
        transition={{ duration: 60, ease: "linear", repeat: Infinity }}
      />
      <div className="absolute inset-16 rounded-full border border-border bg-card/60 backdrop-blur-sm" />

      <motion.div
        className="absolute left-2 top-20 w-52 rounded-2xl border border-border bg-card p-4 shadow-xl"
        animate={{ y: [-10, 10, -10] }}
        transition={{ duration: 5, ease: "easeInOut", repeat: Infinity }}
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-destructive">
          MEV detected
        </div>
        <div className="mt-2 font-display text-2xl">0.45%</div>
        <div className="mt-1 text-xs text-muted-foreground">Surcharge on toxic flow</div>
      </motion.div>

      <motion.div
        className="absolute bottom-16 right-0 w-56 rounded-2xl border border-border bg-card p-4 shadow-xl"
        animate={{ y: [10, -10, 10] }}
        transition={{ duration: 4, ease: "easeInOut", repeat: Infinity }}
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary">
          LP reward
        </div>
        <div className="mt-2 font-display text-2xl text-gradient">+612 MRVL</div>
        <div className="mt-1 text-xs text-muted-foreground">Distributed to loyal LPs</div>
      </motion.div>

      <div className="absolute right-16 top-8 grid grid-cols-3 gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} className="size-1.5 rounded-full bg-primary/40" />
        ))}
      </div>

      <div className="bg-brand-gradient shadow-brand-lg absolute bottom-4 left-16 size-16 rounded-2xl" />
    </div>
  );
}
