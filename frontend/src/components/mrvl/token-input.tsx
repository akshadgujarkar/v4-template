import { cn } from "@/lib/utils";

export function TokenInput({
  label,
  token,
  balance,
  value,
  onChange,
  readOnly = false,
  className,
}: {
  label: string;
  token: string;
  balance?: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  className?: string;
}) {
  const id = `token-input-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className={cn("rounded-xl border border-border bg-muted/40 p-4", className)}>
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground"
        >
          {label}
        </label>
        {balance ? <span className="text-xs text-muted-foreground">Balance {balance}</span> : null}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <input
          id={id}
          inputMode="decimal"
          readOnly={readOnly}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="0.0"
          className="h-12 w-full min-w-0 bg-transparent font-display text-3xl outline-none placeholder:text-muted-foreground/50 focus-visible:ring-0"
        />
        <span className="shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold">
          {token}
        </span>
      </div>
    </div>
  );
}
