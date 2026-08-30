# MRLV Local Anvil Deployment Guide

This guide covers how to run the MRLV hook project on a local Anvil instance from scratch.

## Prerequisites

1. Ensure you have [Foundry](https://book.getfoundry.sh/) installed.
2. Open two separate terminal windows inside your `v4-template` directory.

---

## Step 1: Clean and Build

In your **first terminal**, compile the project to ensure everything is up to date.

```bash
# Clean any stale artifacts
forge clean

# Install dependencies if necessary
forge install

# Build the project (will take a minute on the first run due to via_ir optimization)
forge build
```

*(Optional)* Run the tests to ensure all logic is intact:
```bash
forge test
```

---

## Step 2: Start the Local Anvil Node

Still in your **first terminal** (or a new one if you prefer to keep one for commands), start the Anvil node. 

> [!IMPORTANT]
> The MRLV contracts are complex and exceed the default Ethereum contract size limit. You **must** start Anvil with an extended code size limit.

```bash
anvil --code-size-limit 100000
```

Leave this terminal running. It will output blockchain logs as transactions occur.

---

## Step 3: Run the Deployment Script

Open your **second terminal** (make sure you are in the `v4-template` directory). Run the Foundry script that will deploy the Pool Manager, your MRLV Hook, initialize a pool, add liquidity, and perform test swaps.

```bash
forge script script/DeployMRLV.s.sol:DeployMRLV --rpc-url http://127.0.0.1:8545 --broadcast
```

## Step 4: Review the Output

After the script finishes, scroll through the output in your second terminal. You will see the `SwapProcessed` events printed directly to the console.

**Expected Output:**
```text
  Initial liquidity added (Workaround applied).
  Normal Swap (Account 1)
    -> Risk Score:  0
    -> Applied Fee: 3000
  ------------------------------------------
  Attacker Sequence (Account 2)
    -> Risk Score:  30
    -> Applied Fee: 6000
  ------------------------------------------
  ==========================================
  Demo Completed Successfully!
```

> [!NOTE]
> You may see an error at the very end of the `forge script` output complaining about `Unknown0` being above the contract size limit. This is completely safe to ignore since Anvil was already started with the bypassed code size limits and the transactions successfully landed on your local chain.
