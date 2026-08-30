import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { HookEvent, HookEventKind } from "@/lib/demo-store";

const kindStyles: Record<HookEventKind, string> = {
  info: "text-background/60",
  mev: "text-destructive",
  reward: "text-primary",
  tier: "text-gold",
  penalty: "text-destructive",
};

export function EventLogStream({ events }: { events: HookEvent[] }) {
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events.length]);

  return (
    <div className="texture-dots relative h-[30rem] overflow-hidden rounded-2xl bg-foreground">
      <div className="relative flex items-center justify-between border-b border-background/10 px-5 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-background/60">
          Hook event stream
        </span>
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] text-primary">
          <span className="pulse-dot size-1.5 rounded-full bg-primary" /> live
        </span>
      </div>

      <div className="relative h-[calc(30rem-3rem)] space-y-1 overflow-y-auto px-5 py-4 font-mono text-xs">
        <AnimatePresence initial={false}>
          {events.map((event) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="flex gap-3 py-1.5"
            >
              <span className="shrink-0 text-background/35">[{event.block.toLocaleString()}]</span>
              <span className="min-w-0">
                <span className={cn("font-medium", kindStyles[event.kind])}>{event.label}</span>{" "}
                <span className="text-background/60">— {event.detail}</span>
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={endRef} />
      </div>
    </div>
  );
}
