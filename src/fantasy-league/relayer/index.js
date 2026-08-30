const path = require("path");
let ethers;
try {
    ethers = require("ethers");
} catch (e) {
    ethers = require(path.join(__dirname, "../../../frontend/node_modules/ethers"));
}

// Configuration - Defaults to local Anvil deployment
const RPC_URL = process.env.RPC_URL || process.env.VITE_RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; 

const ANALYTICS_EMITTER_ADDRESS = process.env.ANALYTICS_EMITTER_ADDRESS || process.env.VITE_CONTRACT_ADDRESS_ANALYTICS_EMITTER || "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318";
const SCOUT_POINTS_ORACLE_ADDRESS = process.env.SCOUT_POINTS_ORACLE_ADDRESS || process.env.VITE_CONTRACT_ADDRESS_SCOUT_POINTS_ORACLE || "0xc5a5C42992dECbae36851359345FE25997F5C42d";
const MEV_SCOUT_LEAGUE_ADDRESS = process.env.MEV_SCOUT_LEAGUE_ADDRESS || process.env.VITE_CONTRACT_ADDRESS_FANTASY_LEAGUE || "0x09635F643e140090A9A8Dcd712eD6285858ceBef";

// ABIs
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

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    const analyticsEmitter = new ethers.Contract(ANALYTICS_EMITTER_ADDRESS, ANALYTICS_EMITTER_ABI, provider);
    const oracle = new ethers.Contract(SCOUT_POINTS_ORACLE_ADDRESS, SCOUT_POINTS_ORACLE_ABI, wallet);
    const league = new ethers.Contract(MEV_SCOUT_LEAGUE_ADDRESS, MEV_SCOUT_LEAGUE_ABI, provider);

    console.log("=========================================================");
    console.log("     FANTASY MEV LEAGUE - OFF-CHAIN POINTS RELAYER       ");
    console.log("=========================================================");
    console.log("RPC URL:", RPC_URL);
    console.log("Relayer Wallet:", wallet.address);
    console.log("Listening to AnalyticsEmitter at:", ANALYTICS_EMITTER_ADDRESS);
    console.log("Reporting to ScoutPointsOracle at:", SCOUT_POINTS_ORACLE_ADDRESS);
    console.log("MEVScoutLeague at:", MEV_SCOUT_LEAGUE_ADDRESS);
    console.log("Ready and listening for MEVDetected events...\n");

    analyticsEmitter.on("MEVDetected", async (poolId, trader, riskScore, feeSurcharge, event) => {
        console.log(`\n---------------------------------------------------------`);
        console.log(`⚡ MEVDetected event intercepted!`);
        console.log(`Trader / Searcher: ${trader}`);
        console.log(`Risk Score: ${riskScore.toString()}`);
        console.log(`Fee Surcharge: ${feeSurcharge.toString()}`);

        try {
            // Get current active season
            const currentSeasonId = await league.currentSeasonId();

            let signalTypeStr = "UNKNOWN";
            if (riskScore >= 30) signalTypeStr = "REVERSAL";
            else if (riskScore >= 25) signalTypeStr = "PRIORITY_FEE";
            else if (riskScore >= 20) signalTypeStr = "PRICE_IMPACT";

            const signalTypeHash = ethers.id(signalTypeStr); // keccak256

            // Get participants to pass to Oracle
            const participants = await league.getSeasonParticipants(currentSeasonId);
            
            console.log(`Reporting to Oracle for Season #${currentSeasonId} with Signal Type: ${signalTypeStr}`);
            console.log(`Checking points for ${participants.length} season participant(s)...`);
            
            const tx = await oracle.reportDetection(trader, currentSeasonId, signalTypeHash, participants, { gasLimit: 2000000 });
            console.log(`Transaction broadcasted: ${tx.hash}`);
            await tx.wait();
            console.log(`Points credited on-chain to LPs who drafted ${trader}!`);
        } catch (error) {
            console.error("Error processing MEVDetected event:", error);
        }
    });
}

main().catch(console.error);
