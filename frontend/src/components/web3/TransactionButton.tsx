import { useState } from "react";
import { Button, ButtonProps } from "@/components/ui/button";
import { toast } from "sonner";
import { parseContractError } from "@/lib/web3/ContractError";

interface TransactionButtonProps extends ButtonProps {
  action: () => Promise<any>;
  onSuccess?: () => void;
  successMessage?: string;
  loadingMessage?: string;
}

export function TransactionButton({
  action,
  onSuccess,
  successMessage = "Transaction successful",
  loadingMessage = "Confirming transaction...",
  children,
  ...props
}: TransactionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    const toastId = toast.loading(loadingMessage);
    
    try {
      const tx = await action();
      if (tx && tx.wait) {
        toast.loading("Waiting for confirmation...", { id: toastId });
        await tx.wait();
      }
      
      toast.success(successMessage, { id: toastId });
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error(error);
      const message = parseContractError(error);
      toast.error(message, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button onClick={handleClick} disabled={isLoading || props.disabled} {...props}>
      {isLoading ? "Processing..." : children}
    </Button>
  );
}
