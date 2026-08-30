import { cn } from "@/lib/utils";

export function SectionLabel({
  children,
  pulse = false,
  inverted = false,
  className,
}: {
  children: React.ReactNode;
  pulse?: boolean;
  inverted?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 rounded-full border px-5 py-2",
        inverted
          ? "border-background/20 bg-background/5"
          : "border-primary/30 bg-primary/5",
        className,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full bg-primary", pulse && "pulse-dot")} />
      <span
        className={cn(
          "font-mono text-xs uppercase tracking-[0.15em]",
          inverted ? "text-background/80" : "text-primary",
        )}
      >
        {children}
      </span>
    </div>
  );
}
