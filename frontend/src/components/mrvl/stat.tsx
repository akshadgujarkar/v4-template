import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  hint,
  inverted = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  inverted?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("px-2", className)}>
      <div
        className={cn(
          "font-mono text-[11px] uppercase tracking-[0.15em]",
          inverted ? "text-background/60" : "text-muted-foreground",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "mt-3 font-display text-3xl sm:text-4xl",
          inverted ? "text-background" : "text-foreground",
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className={cn("mt-2 text-sm", inverted ? "text-background/60" : "text-muted-foreground")}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
