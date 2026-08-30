import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWeb3 } from "@/lib/web3/Web3Context";

export function WalletConnectButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const { address, isConnecting, connect, disconnect } = useWeb3();

  if (address) {
    const formattedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return (
      <Button variant="outline" size={size} onClick={disconnect}>
        <span className="pulse-dot size-1.5 rounded-full bg-primary" />
        <span className="font-mono text-xs">{formattedAddress}</span>
      </Button>
    );
  }

  return (
    <Button size={size} onClick={connect} disabled={isConnecting}>
      <Wallet />
      {isConnecting ? "Connecting..." : "Connect wallet"}
    </Button>
  );
}
