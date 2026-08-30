import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WalletConnectButton } from "@/components/layout/wallet-connect-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useWeb3 } from "@/lib/web3/Web3Context";
import { useDemo } from "@/lib/demo-store";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/trade", label: "Trade" },
  { to: "/liquidity", label: "Liquidity" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/fantasy-league", label: "Fantasy League" },
  { to: "/governance", label: "Governance" },
] as const;

export function Navbar() {
  const [open, setOpen] = React.useState(false);
  const { provider, address, chainId, isAnvil, switchToAnvil } = useWeb3();
  const { currentBlock: demoBlock } = useDemo();
  const [liveBlock, setLiveBlock] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!provider) return;

    let mounted = true;
    provider.getBlockNumber().then((b) => {
      if (mounted) setLiveBlock(b);
    });

    const onBlock = (b: number) => {
      if (mounted) setLiveBlock(b);
    };

    provider.on("block", onBlock);
    return () => {
      mounted = false;
      provider.off("block", onBlock);
    };
  }, [provider]);

  const blockNumber = liveBlock ?? demoBlock;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Link to="/" className="flex items-center gap-2.5" aria-label="MRVL home">
          <span className="bg-brand-gradient shadow-brand size-7 rounded-lg" />
          <span className="font-display text-lg tracking-[-0.02em]">MRVL</span>
        </Link>

        <ul className="hidden flex-1 items-center gap-1 md:flex">
          {links.map((l) => (
            <li key={l.to}>
              <Link
                to={l.to}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                activeProps={{ className: "text-foreground font-medium bg-muted" }}
                activeOptions={{ exact: l.to === "/" }}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-3">
          {address && !isAnvil && chainId && (
            <Button
              variant="destructive"
              size="sm"
              className="hidden sm:flex text-xs h-7 gap-1"
              onClick={switchToAnvil}
            >
              <AlertCircle className="size-3.5" />
              Switch to Anvil (31337)
            </Button>
          )}

          {address && isAnvil && (
            <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[11px]">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Anvil 31337
            </span>
          )}

          <span className="hidden items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground lg:flex">
            <span className="pulse-dot size-1.5 rounded-full bg-primary" />
            block {blockNumber.toLocaleString()}
          </span>
          <ThemeToggle />
          <WalletConnectButton />
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </nav>

      <div className={cn("border-t border-border md:hidden", open ? "block" : "hidden")}>
        <ul className="mx-auto max-w-6xl px-5 py-3">
          {address && !isAnvil && chainId && (
            <li className="mb-2">
              <Button
                variant="destructive"
                size="sm"
                className="w-full text-xs gap-1"
                onClick={switchToAnvil}
              >
                <AlertCircle className="size-3.5" />
                Switch to Anvil (31337)
              </Button>
            </li>
          )}
          {links.map((l) => (
            <li key={l.to}>
              <Link
                to={l.to}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                activeProps={{ className: "text-foreground font-medium" }}
                activeOptions={{ exact: l.to === "/" }}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}
