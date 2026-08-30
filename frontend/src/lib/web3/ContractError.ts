export function parseContractError(error: any): string {
  if (typeof error === "string") return error;
  
  if (error?.info?.error?.message) {
      const msg = error.info.error.message;
      return mapRevertReason(msg);
  }

  if (error?.message) {
    if (error.message.includes("user rejected action")) {
      return "Transaction was rejected by the user.";
    }
    return mapRevertReason(error.message);
  }

  return "An unknown error occurred during the transaction.";
}

function mapRevertReason(reason: string): string {
    if (reason.includes("NotGovernance")) return "Unauthorized: Only governance can perform this action.";
    if (reason.includes("NotRewardVault")) return "Unauthorized: Action reserved for Reward Vault.";
    if (reason.includes("LockDurationZero")) return "Lock duration must be greater than zero.";
    if (reason.includes("LockAmountZero")) return "Lock amount must be greater than zero.";
    if (reason.includes("LockStillActive")) return "Your MRLV lock is still active.";
    if (reason.includes("NoActiveLock")) return "No active lock found for your address.";
    if (reason.includes("ZeroClaim")) return "You have no MRLV rewards to claim.";
    if (reason.includes("InsufficientLiquidity")) return "Insufficient liquidity to complete the request.";
    if (reason.includes("PositionNotMature")) return "This position has not reached maturity yet.";
    if (reason.includes("RosterFull")) return "Your fantasy league roster is full (max 3).";
    if (reason.includes("TraderAlreadyStaked")) return "You have already drafted this trader.";
    
    // Extract custom error name if present (e.g. "custom error NotGovernance()")
    const match = reason.match(/custom error '([A-Za-z0-9_]+)\(/);
    if (match && match[1]) {
        return `Contract Error: ${match[1]}`;
    }

    return reason;
}
