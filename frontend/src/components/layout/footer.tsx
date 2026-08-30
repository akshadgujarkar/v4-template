export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="bg-brand-gradient size-6 rounded-md" />
          <span className="font-display text-base">MRVL Liquidity Vault</span>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Uniswap v4 hook · demo data
        </p>
      </div>
    </footer>
  );
}
