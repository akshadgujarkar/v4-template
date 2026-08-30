import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";

declare global {
  interface Window {
    ethereum?: any;
  }
}

interface Web3ContextState {
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  address: string | null;
  chainId: number | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToAnvil: () => Promise<void>;
  isConnecting: boolean;
  isAnvil: boolean;
  error: string | null;
}

const Web3Context = createContext<Web3ContextState | undefined>(undefined);

export function Web3Provider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initProvider = useCallback(async (ethProvider: any, requestAccount = false) => {
    try {
      const browserProvider = new BrowserProvider(ethProvider);
      const accounts = requestAccount
        ? await browserProvider.send("eth_requestAccounts", [])
        : await browserProvider.send("eth_accounts", []);

      if (accounts && accounts.length > 0) {
        const jsonRpcSigner = await browserProvider.getSigner();
        const network = await browserProvider.getNetwork();

        setProvider(browserProvider);
        setSigner(jsonRpcSigner);
        setAddress(accounts[0]);
        setChainId(Number(network.chainId));
        setError(null);
      }
    } catch (err: any) {
      console.error("Web3 init error:", err);
      if (requestAccount) {
        setError(err.message || "Failed to connect wallet");
      }
    }
  }, []);

  useEffect(() => {
    if (window.ethereum) {
      // Auto-connect if already authorized
      initProvider(window.ethereum, false);

      const handleChainChanged = () => window.location.reload();
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          initProvider(window.ethereum, false);
        } else {
          disconnect();
        }
      };

      window.ethereum.on?.("chainChanged", handleChainChanged);
      window.ethereum.on?.("accountsChanged", handleAccountsChanged);

      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener("chainChanged", handleChainChanged);
          window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        }
      };
    }
  }, [initProvider]);

  const connect = async () => {
    if (!window.ethereum) {
      setError("Please install an injected wallet like MetaMask.");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      await initProvider(window.ethereum, true);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setProvider(null);
    setSigner(null);
    setAddress(null);
    setChainId(null);
    setError(null);
  };

  const switchToAnvil = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x7a69" }], // 31337 in hex
      });
    } catch (switchError: any) {
      // If the chain hasn't been added to MetaMask
      if (switchError.code === 4902 || switchError.message?.includes("Unrecognized chain")) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x7a69",
                chainName: "Anvil Localnet",
                rpcUrls: ["http://127.0.0.1:8545"],
                nativeCurrency: {
                  name: "Ethereum",
                  symbol: "ETH",
                  decimals: 18,
                },
              },
            ],
          });
        } catch (addError) {
          console.error("Failed to add Anvil network:", addError);
        }
      }
    }
  };

  const isAnvil = chainId === 31337;

  return (
    <Web3Context.Provider
      value={{
        provider,
        signer,
        address,
        chainId,
        connect,
        disconnect,
        switchToAnvil,
        isConnecting,
        isAnvil,
        error,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}
