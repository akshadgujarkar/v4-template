const path = require("path");

// Load .env from frontend/.env and root .env
try {
    require("dotenv").config({ path: path.join(__dirname, "../../../frontend/.env") });
    require("dotenv").config();
} catch (e) {
    console.warn("⚠️ Dotenv load warning:", e.message);
}

let ethers;
try {
    ethers = require("ethers");
} catch (e) {
    ethers = require(
        path.join(__dirname, "../../../frontend/node_modules/ethers")
    );
}

// =========================================================
// CONFIGURATION
// =========================================================

const RPC_URL =
    process.env.VITE_RPC_URL ||
    process.env.RPC_URL ||
    "http://127.0.0.1:8545";

const PRIVATE_KEY =
    process.env.PRIVATE_KEY ||
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const ANALYTICS_EMITTER_ADDRESS =
    process.env.VITE_CONTRACT_ADDRESS_ANALYTICS_EMITTER ||
    process.env.ANALYTICS_EMITTER_ADDRESS ||
    "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318";

const SCOUT_POINTS_ORACLE_ADDRESS =
    process.env.VITE_CONTRACT_ADDRESS_SCOUT_POINTS_ORACLE ||
    process.env.SCOUT_POINTS_ORACLE_ADDRESS ||
    "0xc5a5C42992dECbae36851359345FE25997F5C42d";

const MEV_SCOUT_LEAGUE_ADDRESS =
    process.env.VITE_CONTRACT_ADDRESS_FANTASY_LEAGUE ||
    process.env.MEV_SCOUT_LEAGUE_ADDRESS ||
    "0x09635F643e140090A9A8Dcd712eD6285858ceBef";

// =========================================================
// ABIs
// =========================================================

const ANALYTICS_EMITTER_ABI = [
    "event MEVDetected(bytes32 indexed poolId, address indexed trader, uint256 riskScore, uint24 feeSurcharge)"
];

const SCOUT_POINTS_ORACLE_ABI = [
    "function reportDetection(address trader, uint256 seasonId, bytes32 signalType, address[] calldata lps) external"
];

const MEV_SCOUT_LEAGUE_ABI = [
    "function currentSeasonId() external view returns (uint256)",
    "function getSeasonParticipants(uint256 seasonId) external view returns (address[] memory)"
];

// =========================================================
// EVENT / TRANSACTION QUEUE STATE
// =========================================================

const eventQueue = [];
let isProcessing = false;
let historicalScanComplete = false;
let eventSequence = 0;
let lastPolledBlock = 0;

// =========================================================
// HELPERS
// =========================================================

function getEventKey(log) {
    return `${log.transactionHash}:${log.index}`;
}

function enqueueMEVEvent(
    oracle,
    league,
    wallet,
    trader,
    riskScore,
    feeSurcharge,
    eventKey
) {
    eventSequence++;
    const dispatchKey = `${eventKey || "live"}-seq${eventSequence}`;

    eventQueue.push({
        oracle,
        league,
        wallet,
        trader,
        riskScore,
        feeSurcharge,
        eventKey: dispatchKey
    });

    console.log(
        `📥 Event queued [${dispatchKey}] | Trader: ${trader} | RiskScore: ${riskScore} | Queue size: ${eventQueue.length}`
    );

    processQueue().catch((error) => {
        console.error(
            "❌ Queue worker error:",
            error.message || error
        );
    });
}

// =========================================================
// SERIALIZED TRANSACTION QUEUE
// =========================================================

async function processQueue() {
    if (isProcessing || eventQueue.length === 0) {
        return;
    }

    isProcessing = true;

    try {
        while (eventQueue.length > 0) {
            const item = eventQueue.shift();

            try {
                await handleMEVEvent(item);
            } catch (error) {
                console.error(
                    `❌ Queue item failed [${item.eventKey}]:`,
                    error.message || error
                );
            }
        }
    } finally {
        isProcessing = false;

        if (eventQueue.length > 0) {
            processQueue().catch((error) => {
                console.error(
                    "❌ Queue restart error:",
                    error.message || error
                );
            });
        }
    }
}

// =========================================================
// PROCESS ONE MEV EVENT
// =========================================================

async function handleMEVEvent({
    oracle,
    league,
    wallet,
    trader,
    riskScore,
    feeSurcharge,
    eventKey
}) {
    console.log("\n---------------------------------------------------------");
    console.log("⚡ Processing MEV Detection");
    console.log(`Event ID: ${eventKey}`);
    console.log(`Trader / Searcher: ${trader}`);
    console.log(`Risk Score: ${riskScore.toString()}`);
    console.log(`Fee Surcharge: ${feeSurcharge.toString()}`);
    console.log(`Queue remaining: ${eventQueue.length}`);

    try {
        const currentSeasonId = await league.currentSeasonId();
        if (Number(currentSeasonId) === 0) {
            console.log(
                "ℹ️ Fantasy League Season #1 has not been started yet by the deployer. Skipping."
            );
            return;
        }

        const rawParticipants = await league.getSeasonParticipants(currentSeasonId);
        const participants = Array.from(rawParticipants);

        if (participants.length === 0) {
            console.log(
                `ℹ️ No participants in Season #${currentSeasonId} yet. Skipping.`
            );
            return;
        }

        let signalTypeStr = "PRICE_IMPACT";
        if (riskScore >= 30) {
            signalTypeStr = "REVERSAL";
        } else if (riskScore >= 25) {
            signalTypeStr = "PRIORITY_FEE";
        } else if (riskScore >= 20) {
            signalTypeStr = "PRICE_IMPACT";
        }

        const signalTypeHash = ethers.id(signalTypeStr);

        console.log(
            `Reporting to Oracle for Season #${currentSeasonId} (Signal: ${signalTypeStr})`
        );
        console.log(
            `Checking points for ${participants.length} season participant(s)...`
        );

        let pendingNonce;
        try {
            pendingNonce = await wallet.getNonce("pending");
            console.log(`🔢 Pending relayer nonce: ${pendingNonce}`);
        } catch (nonceError) {
            console.warn(
                "⚠️ Could not read pending nonce:",
                nonceError.message || nonceError
            );
        }

        const tx = await oracle.reportDetection(
            trader,
            currentSeasonId,
            signalTypeHash,
            participants,
            {
                gasLimit: 3000000
            }
        );

        console.log(`📤 Tx broadcasted: ${tx.hash} (Nonce: ${tx.nonce})`);

        const receipt = await tx.wait();
        console.log(
            `✅ Transaction confirmed in block ${receipt.blockNumber}!`
        );
        console.log(
            `🎉 Success! Points credited on-chain to LPs who drafted ${trader}!`
        );
    } catch (error) {
        console.error(`❌ Error reporting event [${eventKey}]:`, error.message || error);
    }
}

// =========================================================
// MAIN
// =========================================================

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const baseWallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const wallet = new ethers.NonceManager(baseWallet);

    const analyticsEmitter = new ethers.Contract(
        ANALYTICS_EMITTER_ADDRESS,
        ANALYTICS_EMITTER_ABI,
        provider
    );

    const oracle = new ethers.Contract(
        SCOUT_POINTS_ORACLE_ADDRESS,
        SCOUT_POINTS_ORACLE_ABI,
        wallet
    );

    const league = new ethers.Contract(
        MEV_SCOUT_LEAGUE_ADDRESS,
        MEV_SCOUT_LEAGUE_ABI,
        provider
    );

    console.log("=========================================================");
    console.log("     FANTASY MEV LEAGUE - OFF-CHAIN POINTS RELAYER       ");
    console.log("=========================================================");
    console.log("RPC URL:", RPC_URL);
    console.log("Relayer Wallet:", baseWallet.address);
    console.log("Listening to AnalyticsEmitter at:", ANALYTICS_EMITTER_ADDRESS);
    console.log("Reporting to ScoutPointsOracle at:", SCOUT_POINTS_ORACLE_ADDRESS);
    console.log("MEVScoutLeague at:", MEV_SCOUT_LEAGUE_ADDRESS);

    // Initial check on current season
    try {
        const seasonId = await league.currentSeasonId();
        console.log(`\n🏆 Active Season ID on-chain: #${seasonId.toString()}`);
    } catch (e) {
        console.warn("⚠️ Could not read currentSeasonId:", e.message);
    }

    // 1. HISTORICAL EVENT SCAN
    console.log("\n1. Scanning recent blocks for historical MEV detections...");
    try {
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 2000);
        lastPolledBlock = currentBlock;
        console.log(`Scanning blocks ${fromBlock} → ${currentBlock}`);

        const filter = analyticsEmitter.filters.MEVDetected();
        const logs = await analyticsEmitter.queryFilter(
            filter,
            fromBlock,
            "latest"
        );

        console.log(`Found ${logs.length} past MEVDetected events.`);

        for (const log of logs) {
            try {
                const parsed = analyticsEmitter.interface.parseLog(log);
                if (!parsed) continue;

                const eventKey = getEventKey(log);
                enqueueMEVEvent(
                    oracle,
                    league,
                    wallet,
                    parsed.args.trader,
                    parsed.args.riskScore,
                    parsed.args.feeSurcharge,
                    eventKey
                );
            } catch (error) {
                console.error("❌ Error parsing historical event:", error.message || error);
            }
        }
    } catch (error) {
        console.warn("⚠️ Past event scan warning:", error.message || error);
    }

    historicalScanComplete = true;
    console.log("✅ Historical event scan complete.");

    // 2. REAL-TIME EVENT LISTENER
    console.log("\n2. Listening for real-time MEVDetected events...");
    analyticsEmitter.on(
        "MEVDetected",
        async (poolId, trader, riskScore, feeSurcharge, event) => {
            try {
                if (!event || !event.log) {
                    console.warn("⚠️ MEVDetected event missing log metadata.");
                    return;
                }

                const eventKey = getEventKey(event.log);
                console.log(`\n📡 Live MEVDetected received: ${eventKey}`);

                enqueueMEVEvent(
                    oracle,
                    league,
                    wallet,
                    trader,
                    riskScore,
                    feeSurcharge,
                    eventKey
                );
            } catch (error) {
                console.error("❌ Live event handling error:", error.message || error);
            }
        }
    );

    // 3. PERIODIC POLLING FALLBACK
    console.log("3. Polling fallback enabled: every 3 seconds.");
    setInterval(async () => {
        try {
            const currentBlock = await provider.getBlockNumber();
            if (currentBlock > lastPolledBlock) {
                const fromBlock = lastPolledBlock + 1;
                lastPolledBlock = currentBlock;

                const filter = analyticsEmitter.filters.MEVDetected();
                const logs = await analyticsEmitter.queryFilter(
                    filter,
                    fromBlock,
                    currentBlock
                );

                for (const log of logs) {
                    try {
                        const parsed = analyticsEmitter.interface.parseLog(log);
                        if (!parsed) continue;

                        const eventKey = getEventKey(log);
                        enqueueMEVEvent(
                            oracle,
                            league,
                            wallet,
                            parsed.args.trader,
                            parsed.args.riskScore,
                            parsed.args.feeSurcharge,
                            eventKey
                        );
                    } catch (error) {}
                }
            }
        } catch (error) {}
    }, 3000);

    provider.on("error", (error) => {
        console.error("❌ Provider error:", error.message || error);
    });

    process.on("unhandledRejection", (reason) => {
        console.error("❌ Unhandled promise rejection:", reason);
    });

    process.on("uncaughtException", (error) => {
        console.error("❌ Uncaught exception:", error);
    });

    console.log("\n=========================================================");
    console.log("                 RELAYER READY & ACTIVE                  ");
    console.log("=========================================================\n");
}

main().catch((error) => {
    console.error("❌ Fatal relayer error:", error);
    process.exit(1);
});
