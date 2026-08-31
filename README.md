# 🦄 MRLV — MEV-Redistributive Liquidity Vault & Fantasy MEV League
### *A Next-Generation Uniswap v4 Hook Architecture for MEV Capture, Dynamic Protection & Gamified Scouting*

[![Uniswap v4](https://img.shields.io/badge/Uniswap-v4--Core-FF007A?logo=uniswap&logoColor=white)](https://github.com/uniswapfoundation/v4-core)
[![Foundry](https://img.shields.io/badge/Foundry-Framework-orange?logo=ethereum&logoColor=white)](https://getfoundry.sh/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.26-363636?logo=solidity&logoColor=white)](https://soliditylang.org/)
[![Vite](https://img.shields.io/badge/Frontend-React%20%7C%20TanStack%20%7C%20Tailwind-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 📌 Executive Summary

**MRLV (MEV-Redistributive Liquidity Vault)** is an advanced Uniswap v4 Hook system designed to defend passive Liquidity Providers (LPs) against adversarial MEV (Miner/Maximal Extractable Value) flows—such as sandwich attacks, Just-In-Time (JIT) liquidity extraction, rapid price reversals, and priority-fee sniping.

Instead of letting external searchers drain pool value at the expense of LPs (Loss-Versus-Rebalancing / LVR), **MRLV detects predatory patterns in real-time, dynamically penalizes toxic flow with fee surcharges, and redirects captured value into a dedicated LP Reward & Loyalty Vault**.

Complementing the core hook, the **Fantasy MEV League** turns MEV monitoring into an incentivized, gamified scouting platform where users scout, draft, and stake on active searchers to earn shares of seasonal prize pools.

---

## ⚡ The Problem & The MRLV Solution

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                Traditional AMMs (The Problem)                          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Toxic MEV Trader ────► Frontruns / Sandwiches / JIT Drains ────► Extracts LP Value    │
│  Passive LPs      ────► Bear 100% Inventory & Slippage Risk ────► Receive Static Fees  │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 MRLV on Uniswap v4 (The Solution)                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Toxic MEV Trader ────► Flagged by MEVDetector (Risk 0-100) ───► Dynamic Fee Surcharge │
│                                                                        │               │
│  Surplus Penalty Fees ─────────────────────────────────────────────────┘               │
│         │                                                                              │
│         ▼                                                                              │
│  RewardVault & LoyaltyManager ────► Distributed to Honest LPs (Yield & Tier Badges)    │
│         │                                                                              │
│         ▼                                                                              │
│  Off-chain Relayer ───────────────► Fantasy MEV League (LPs earn scouting rewards)     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| Challenge in Standard AMMs | How MRLV Solves It |
| :--- | :--- |
| **Sandwich & Backrun Exploits** | Multi-signal heuristic detection calculates real-time risk during `beforeSwap` and applies dynamic fee surcharges. |
| **JIT Liquidity Dilution** | Pending liquidity staging escrow (`depositPendingLiquidity`) enforces minimum maturity blocks before positions become active. |
| **Uncompensated LP Loss (LVR)** | Captured MEV surcharges are routed to `RewardVault` to boost yield for honest, long-term LPs. |
| **Searcher Opacity** | Emits rich on-chain analytics (`MEVDetected`, `SwapProcessed`) and feeds the **Fantasy MEV League** for decentralized bot tracking. |

---

## 🏛️ System Architecture

The project consists of three tightly integrated tiers:

```mermaid
flowchart TB
    subgraph Uniswap_v4_Core [Uniswap v4 Core]
        PoolManager[PoolManager]
    end

    subgraph MRLV_Hook_Core [MRLV Hook Core Engine]
        Hook[MRLVHook.sol]
        Detector[MEVDetector.sol]
        FeeMgr[DynamicFeeManager.sol]
        Analytics[AnalyticsEmitter.sol]
        Vault[RewardVault.sol]
        Loyalty[LoyaltyManager.sol]
        LoyaltyNFT[LoyaltyNFT.sol]
        MRLVToken[MRLVToken.sol]
    end

    subgraph Fantasy_League [Fantasy MEV League]
        Relayer[Off-chain Relayer (Ethers.js)]
        Oracle[ScoutPointsOracle.sol]
        Roster[ScoutRoster.sol]
        League[MEVScoutLeague.sol]
    end

    subgraph Frontend_App [Modern Web UI]
        SwapUI[Trade & Dynamic Swap]
        PoolUI[Liquidity Escrow Hub]
        PortfolioUI[Loyalty & Yield Claim]
        DraftUI[Fantasy Draft Board]
    end

    %% Hook Flow
    PoolManager <-->|beforeSwap / afterSwap| Hook
    Hook -->|1. Evaluate Heuristics| Detector
    Hook -->|2. Compute Dynamic Fee| FeeMgr
    Hook -->|3. Emit Risk & Logs| Analytics
    Hook -->|4. Route Surcharges| Vault
    Vault <-->|Loyalty Multipliers| Loyalty
    Loyalty -->|Tier Badges| LoyaltyNFT
    Vault -->|Yield Payouts| MRLVToken

    %% Fantasy League Flow
    Analytics -.->|Listens to MEVDetected| Relayer
    Relayer -->|reportDetection| Oracle
    Oracle -->|Award Points| Roster
    League <-->|Season Stakes & Payouts| Roster

    %% UI Connections
    Frontend_App --> Hook
    Frontend_App --> League
    Frontend_App --> Vault
```

---

## 🧩 Core Components & Modules

### 1. `MRLVHook.sol` (Uniswap v4 Hook)
* Dispatches execution during Uniswap v4 lifecycle hooks (`beforeSwap`, `afterSwap`, `beforeAddLiquidity`, `beforeRemoveLiquidity`).
* Enforces liquidity escrow and maturity verification to prevent flash-deposit JIT exploits.
* Overrides swap fee tier via `LPFeeLibrary.OVERRIDE_FEE_FLAG` when toxic flow is detected.

### 2. `MEVDetector.sol` (On-Chain Detection Engine)
Evaluates 4 independent on-chain heuristics to output an aggregate **Risk Score (0–100)**:
1. **Priority Fee Analysis:** Checks if `tx.gasprice` significantly deviates from the block baseline.
2. **Direction Flip / Price Reversal:** Flags back-and-forth direction reversals across adjacent blocks.
3. **Price Impact Sizing:** Measures swap size against available active liquidity.
4. **Maturity / JIT Verification:** Checks age of LP positions touching the active tick range.

### 3. `DynamicFeeManager.sol` (Fee Scaling Logic)
* Computes adaptive pool fees according to calculated risk score.
* Baseline fee (e.g. `3000` = 0.30%) scales non-linearly up to maximum penalty fees (e.g. `6000` - `10000` = 0.60% - 1.00%) for high-risk toxic flow.

### 4. `RewardVault.sol` & `LoyaltyManager.sol` (LP Value Redistribution)
* Collects captured surplus penalty fees.
* Manages continuous LP staking duration, awarding loyalty score tiers (Bronze 🥉, Silver 🥈, Gold 🥇, Platinum 💎).
* Generates on-chain Soulbound/Loyalty NFT credentials and pays boosted reward yields in `MRLVToken`.

### 5. `Fantasy MEV League` (`MEVScoutLeague`, `ScoutRoster`, `ScoutPointsOracle`)
* Isolated competitive league operating on top of core MRLV analytics.
* LPs stake tokens to draft up to 3 known searcher/trader addresses during the **Drafting Phase**.
* When drafted searchers trigger on-chain MEV detections, the off-chain relayer feeds points into the Oracle.
* When a season settles, the staked prize pool is distributed proportionally based on scout scores.

### 6. Full-Stack Web Interface (`frontend/`)
* **Trade / Swap:** Live Uniswap v4 swap simulation with real-time risk score feedback and dynamic fee indicators.
* **Liquidity Escrow Hub:** Deposit into pending staging, activate matured positions, and withdraw liquidity safely.
* **Portfolio & Rewards:** Real-time loyalty tier tracker, penalty fee yields, and MRLV token claims.
* **Fantasy League Board:** Active searcher roster selection, live season countdown, leaderboard rankings, and prize settlement claims.
* **Governance Console:** Parameter controls for risk weights and base fee configurations.

---

## 📂 Repository Structure

```
v4-template/
├── src/                                  # Smart Contracts
│   ├── MRLVHook.sol                      # Main Uniswap v4 Hook
│   ├── MEVDetector.sol                   # MEV Detection heuristics engine
│   ├── DynamicFeeManager.sol             # Dynamic fee calculation logic
│   ├── AnalyticsEmitter.sol              # Real-time event logger
│   ├── RewardVault.sol                   # LP Penalty fee redistribution vault
│   ├── LoyaltyManager.sol                # LP Loyalty scoring & tier manager
│   ├── LoyaltyNFT.sol                    # On-chain LP Loyalty badges
│   ├── MRLVToken.sol                     # Reward & Governance ERC-20 token
│   ├── MockERC20.sol                     # Test token pairs (e.g., MTK0 / MTK1)
│   └── fantasy-league/                   # Fantasy MEV League module
│       ├── MEVScoutLeague.sol            # Season lifecycle & prize pools
│       ├── ScoutRoster.sol               # LP trader draft roster storage
│       ├── ScoutPointsOracle.sol         # Verifiable points oracle
│       └── relayer/                      # Event relayer daemon
│           └── index.js                  # Ethers.js relayer script
├── script/                               # Foundry Deployment & Test Scripts
│   ├── DeployFullSystem.s.sol            # Full end-to-end deployment script
│   ├── DeployMRLV.s.sol                  # Standalone MRLV Hook deployer
│   ├── DeployFantasyLeague.s.sol         # Fantasy League deployer
│   ├── SimulateSuspiciousSwaps.s.sol     # Adversarial swap & attack simulator
│   └── SimulateMultiSearchers.s.sol      # Multi-bot searcher scenario simulator
├── scripts/                              # Node.js helper scripts
│   ├── simulate-swaps.js                 # Automated continuous swap generator
│   ├── test-league-flow.js               # League draft and scoring validator
│   └── test-league-settlement.js         # End-of-season settlement test
├── test/                                 # Solidity Test Suite (Foundry)
│   ├── MRLVHook.t.sol                    # Hook unit & integration tests
│   ├── MEVDetector.t.sol                 # Heuristic detection tests
│   ├── DynamicFeeManager.t.sol           # Fee curve unit tests
│   ├── MRLVRewards.t.sol                 # Vault yield & loyalty tests
│   └── FantasyLeague.t.sol               # Fantasy League season tests
├── frontend/                             # React & Vite Web Application
│   ├── src/
│   │   ├── routes/                       # Application pages (TanStack Router)
│   │   │   ├── index.tsx                 # Landing / Overview page
│   │   │   ├── trade.tsx                 # Token swap & dynamic fee preview
│   │   │   ├── liquidity.tsx             # LP deposit & escrow activation
│   │   │   ├── portfolio.tsx             # LP rewards & loyalty tier
│   │   │   ├── fantasy-league.tsx        # Fantasy draft board & leaderboard
│   │   │   └── governance.tsx            # Hook parameter management
│   │   ├── components/                   # UI components (Radix UI & Tailwind)
│   │   └── lib/                          # Web3 context, contract ABIs, and utils
│   └── package.json                      # Frontend dependencies
├── foundry.toml                          # Foundry configuration
└── RUNBOOK.md                            # Quickstart deployment runbook
```

---

## 🚀 Getting Started & Local Development

### 1. Prerequisites
* [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`, `anvil`)
* [Node.js](https://nodejs.org/) (v18 or higher) & `npm`
* Git

---

### 2. Installation

Clone the repository and install all dependencies:

```bash
# Clone the repository
git clone https://github.com/akshadgujarkar/v4-template.git
cd v4-template

# Install Foundry submodules & dependencies
forge install

# Build smart contracts
forge build
```

---

### 3. Running Test Suite

Execute comprehensive unit, fuzz, and integration tests with Foundry:

```bash
forge test -vvv
```

To run individual test files:
```bash
forge test --match-contract MRLVHookTest -vv
forge test --match-contract MEVDetectorTest -vv
forge test --match-contract FantasyLeagueTest -vv
```

---

### 4. Local Deployment Walkthrough (Anvil)

To test the entire system end-to-end (Contracts, Relayer, and Frontend) locally:

#### Step 1: Start Anvil Local Node
> **Note:** Because Uniswap v4 and the MRLV hook contain extensive logic, start Anvil with an increased code-size limit:

```bash
anvil --code-size-limit 100000
```

#### Step 2: Deploy Contracts & Initialize Pools
In a new terminal window, run the full deployment script:

```bash
forge script script/DeployFullSystem.s.sol:DeployFullSystem \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast
```

This deploys:
1. Uniswap v4 `PoolManager` and Periphery routers.
2. `MockERC20` test token pair (`MTK0` / `MTK1`).
3. `MRLVHook` (mined with valid v4 Hook flags), `MEVDetector`, and `DynamicFeeManager`.
4. `RewardVault`, `LoyaltyManager`, and `LoyaltyNFT`.
5. `MEVScoutLeague`, `ScoutRoster`, and `ScoutPointsOracle`.
6. Initializes the v4 pool and deposits initial liquidity.

#### Step 3: Run the Off-Chain Relayer
Start the relayer to listen for on-chain `MEVDetected` events:

```bash
node src/fantasy-league/relayer/index.js
```

#### Step 4: Simulate MEV Attacks (Optional)
In another terminal, trigger simulated MEV searcher swaps (high gas price, rapid reversal) to watch dynamic fee surcharges and relayer points in action:

```bash
forge script script/SimulateSuspiciousSwaps.s.sol:SimulateSuspiciousSwaps \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast
```

#### Step 5: Launch the Frontend UI
Navigate to the `frontend/` directory, install dependencies, and start the development server:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser to interact with the full dashboard.

---

## 🎮 How the Fantasy MEV League Works

```
  [Season 1: DRAFTING]
        │
        ▼ LPs stake MRLV tokens to draft up to 3 known MEV Searchers
  [Season 1: ACTIVE]
        │
        ▼ Normal Swaps + Searcher Attacks occur on Uniswap v4 pool
  [MEV Detected by Hook]
        │
        ▼ AnalyticsEmitter fires MEVDetected(poolId, trader, riskScore, surcharge)
  [Relayer catches Event]
        │
        ▼ Relayer calls ScoutPointsOracle.reportDetection(...)
  [Points Awarded to Scouts]
        │
        ▼ Season duration finishes
  [Season 1: SETTLED]
        │
        ▼ Scouts claim proportional shares of the prize pool!
```

---

## 🛡️ Security & Architecture Best Practices

* **Non-Custodial & Isolated:** The Fantasy League is an isolated module that reads core contract events without requiring privileged write access to pool reserves.
* **Reentrancy Protection:** All state-modifying hook callbacks utilize OpenZeppelin `ReentrancyGuard`.
* **Maturity Timelocks:** JIT liquidity mitigations enforce block-duration checks before newly deposited liquidity can participate in fee collection or exit.
* **Graceful Degradation:** Default fallback fees and circuit-breaker pause mechanisms guarantee continuous pool functionality even under extreme volatility.

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 👥 Contributors & Acknowledgements

* Built for the **Uniswap Hookathon**.
* Powered by [Uniswap v4 Core](https://github.com/uniswapfoundation/v4-core) & [Foundry](https://github.com/foundry-rs/foundry).
