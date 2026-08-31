# 🏆 Fantasy MEV League — Complete Step-by-Step Guide

This guide details the complete end-to-end workflow to start, play, simulate, and verify the **Fantasy MEV League** (from Anvil node startup to drafting, MEV attack simulation, points relayer scoring, season settlement, and reward claims).

---

## 📋 Table of Contents
1. [Architecture & Workflow Overview](#1-architecture--workflow-overview)
2. [Step-by-Step Execution Sequence](#2-step-by-step-execution-sequence)
   - [Step 1: Start Local Anvil Blockchain](#step-1-start-local-anvil-blockchain)
   - [Step 2: Deploy Full System Contracts](#step-2-deploy-full-system-contracts)
   - [Step 3: Start Season & Draft MEV Searchers](#step-3-start-season--draft-mev-searchers)
   - [Step 4: Start the Points Relayer Daemon](#step-4-start-the-points-relayer-daemon)
   - [Step 5: Simulate Suspicious MEV Swaps](#step-5-simulate-suspicious-mev-swaps)
   - [Step 6: Settle Season & Claim MRLV Rewards](#step-6-settle-season--claim-mrlv-rewards)
3. [Verification & Health Checks](#3-verification--health-checks)
   - [A. Run Automated Foundry Tests](#a-run-automated-foundry-tests)
   - [B. Run End-to-End Automated Script Verification](#b-run-end-to-end-automated-script-verification)
   - [C. Interactive Web UI Testing](#c-interactive-web-ui-testing)
4. [Searcher Bot Registry (Draft Roster)](#4-searcher-bot-registry-draft-roster)
5. [Summary of Scripts & Commands](#5-summary-of-scripts--commands)

---

## 1. Architecture & Workflow Overview

```mermaid
flowchart TD
    subgraph 1. Setup & Deployment
        A1[Start Anvil Node with extended code-size] --> A2[Deploy DeployFullSystem.s.sol]
    end

    subgraph 2. Drafting Phase (Status: DRAFTING)
        B1[Admin calls startSeason] --> B2[LPs approve MRLV]
        B2 --> B3[LPs call stakePick on Searchers 5-9]
        B3 --> B4[Admin calls lockSeason -> Status: ACTIVE]
    end

    subgraph 3. Live Scoring Phase (Status: ACTIVE)
        C1[Start Points Relayer Daemon]
        C2[Run SimulateMultiSearchers] --> C3[MRLV Hook catches MEV & emits MEVDetected]
        C3 --> C1
        C1 --> C4[Relayer calls ScoutPointsOracle.reportDetection]
        C4 --> C5[ScoutRoster credits points to drafted LPs]
    end

    subgraph 4. Settlement & Payouts (Status: SETTLED)
        D1[Admin calls settleSeason] --> D2[Pro-rata Prize Pool Distributed]
        D2 --> D3[LPs call claimRewards to withdraw MRLV]
    end

    A2 --> B1
    B4 --> C1
    C5 --> D1
```

---

## 2. Step-by-Step Execution Sequence

### Step 1: Start Local Anvil Blockchain
Open **Terminal 1** in the root directory `v4-template`:

```bash
anvil --code-size-limit 100000
```
> [!IMPORTANT]
> The Uniswap v4 & MRLV contracts require extended bytecode limits. Keep this terminal open and running.

---

### Step 2: Deploy Full System Contracts
Open **Terminal 2** and deploy the Uniswap v4 core, MRLV hook, reward vaults, and all Fantasy League contracts:

```bash
forge script script/DeployFullSystem.s.sol:DeployFullSystem --rpc-url http://127.0.0.1:8545 --broadcast
```

*What happens in this step:*
- Deploys `PoolManager`, `MRLVHook`, `RewardVault`, and `AnalyticsEmitter`.
- Deploys `ScoutRoster`, `MEVScoutLeague`, and `ScoutPointsOracle`.
- Initializes the token pool (`TK0/TK1`) with dynamic fee flags and seeds initial liquidity.
- Output logs will show all deployed contract addresses.

---

### Step 3: Start Season & Draft MEV Searchers
You can manage the season via scripts or frontend. To do this programmatically:

Run the automated onboarding & drafting script:
```bash
node scripts/test-league-flow.js
```

*What happens in this step:*
1. Checks that `ScoutPointsOracle` is linked in `ScoutRoster`.
2. Calls `league.startSeason()` (Season #1 enters `DRAFTING` state).
3. Mints MRLV tokens to LP Account #1 (`0x70997970C51812dc3A010C7d01b50e0d17dc79C8`).
4. Approves MRLV and drafts **Account #5 (Jared Sandwich Bot)** with a 50 MRLV stake.
5. Calls `league.lockSeason()` (Season #1 enters `ACTIVE` state so live scoring starts).

---

### Step 4: Start the Points Relayer Daemon
In **Terminal 3** (or background process), start the event listener:

```bash
node src/fantasy-league/relayer/index.js
```

*What happens in this step:*
- Subscribes to `AnalyticsEmitter.MEVDetected` events.
- Watches transactions executed on the Uniswap v4 pool in real time.
- When an MEV bot triggers a surcharge, the relayer queries all active season participants and sends on-chain points via `ScoutPointsOracle.reportDetection(...)`.

---

### Step 5: Simulate Suspicious MEV Swaps
In **Terminal 2**, trigger MEV attacks from local searcher accounts #5 through #9:

```bash
forge script script/SimulateMultiSearchers.s.sol:SimulateMultiSearchers --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

*What happens in this step:*
- **Account #5 (Jared Sandwich Bot)** executes a frontrun + immediate reversal trade.
- **Account #6 (Wintermute Fast Arb)** executes rapid opposite-direction arbitrage trades.
- **Account #7 (Flashbots Backrunner)** executes large single-block price impact swaps.
- **Account #8 (Atomic Liquidation Bot)** executes heavy liquidation sandwich swaps.
- **Account #9 (Toxic Flow Sniper)** executes rapid reversals.
- The relayer in Terminal 3 will instantly catch these events and credit points to the drafted scouts.

---

### Step 6: Settle Season & Claim MRLV Rewards
Once round trading is complete, settle the season to calculate pro-rata shares and claim winnings:

```bash
node scripts/test-league-settlement.js
```

*What happens in this step:*
1. Calls `league.settleSeason()`.
2. Computes total season points and allocates the total prize pool (staked MRLV + topups) proportionally to winning LPs.
3. Calls `league.claimRewards()` from LP Account #1.
4. Checks the final MRLV balance to confirm rewards landed in the LP wallet.

---

## 3. Verification & Health Checks

### A. Run Automated Foundry Tests
To verify all smart contract rules (draft limits, only-league permissions, scoring weights, prize pool math, zero-point rollover):

```bash
forge test --match-contract FantasyLeagueTest -vv
```
**Expected Output:** `5 passed, 0 failed`.

---

### B. Run End-to-End Automated Script Verification
To check on-chain scores at any time without settling:

```bash
node scripts/check-points.js
```

**Expected Output:**
```text
==========================================
  CHECKING ON-CHAIN LP FANTASY POINTS     
==========================================
LP Address: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
All-Time Scout Score: 50 pts

Season #1 Drafted Picks:
- Pick #1: Trader = 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc
  Staked: 50.0 MRLV
  Points: 50 pts
  Flagged: true
```

---

### C. Interactive Web UI Testing
To view and interact with the Fantasy League in your browser:

1. Navigate to the frontend directory and start the dev server:
   ```bash
   cd frontend
   npm run dev
   ```
2. Open `http://localhost:5173/fantasy-league` in your browser.
3. Connect your wallet (Anvil Account #0 or #1).
4. Features available in the UI:
   - **Active Searchers Draft Board**: Select bots #5–#9 and stake MRLV.
   - **Live MEV Feed**: Real-time ticker showing incoming sandwich & reversal flags.
   - **Season Leaderboard**: Live ranking, points scored, and estimated MRLV payout share.
   - **Admin Season Control**: One-click buttons to `Open Drafting`, `Lock (Activate)`, and `Settle Season`.
   - **Claim Rewards**: Withdraw earned prize pool MRLV tokens.

---

## 4. Searcher Bot Registry (Draft Roster)

| Bot Name | Archetype | Anvil Address | Scoring Pattern |
|---|---|---|---|
| **Jared Sandwich Bot** | Sandwich Extractor | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` (Acc #5) | Frontrun + immediate reversal backrun (+50 pts) |
| **Wintermute Fast Arb** | Arbitrageur | `0xC179fE958d6E80eA39968d2C5D6C7AE3AA02295C` (Acc #6) | Rapid opposite-direction reversal trades (+30 pts) |
| **Flashbots Backrunner** | Backrun Specialist | `0x79F1126dFf473ccf886a3d19958E1f6306B6738d` (Acc #7) | Heavy single-flow trades (>80 tokens, +20 pts) |
| **Atomic Liquidation Bot**| Liquidation Sniper | `0x4Cbf94708205d80438a778C9D472b25B316c8a93` (Acc #8) | High-volume sandwich attacks (+50 pts) |
| **Toxic Flow Sniper** | Cross-DEX Arbitrage | `0xa0Ee7A142d267C1f36714E4a8F75612F20a79720` (Acc #9) | High-frequency toxic flow reversals (+30 pts) |

---

## 5. Summary of Scripts & Commands

| Workflow Step | Command | Description |
|---|---|---|
| **1. Start Chain** | `anvil --code-size-limit 100000` | Starts local node with extended code limit |
| **2. Deploy** | `forge script script/DeployFullSystem.s.sol:DeployFullSystem --rpc-url http://127.0.0.1:8545 --broadcast` | Deploys all V4, MRLV & League contracts |
| **3. Draft & Setup** | `node scripts/test-league-flow.js` | Starts season, funds LP, drafts Acc #5, locks season |
| **4. Relayer** | `node src/fantasy-league/relayer/index.js` | Real-time MEV event listener & points reporter |
| **5. Attack Sim** | `forge script script/SimulateMultiSearchers.s.sol:SimulateMultiSearchers --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` | Executes MEV swaps from searcher accounts 5–9 |
| **6. Check Points** | `node scripts/check-points.js` | Inspects current drafted points & all-time scores |
| **7. Settle & Claim** | `node scripts/test-league-settlement.js` | Settles round and claims MRLV rewards |
| **8. Run Tests** | `forge test --match-contract FantasyLeagueTest -vv` | Runs complete contract unit test suite |
| **9. Web UI** | `cd frontend && npm run dev` | Launches frontend at `localhost:5173/fantasy-league` |
