const path = require("path");
let ethers;
try {
  ethers = require("ethers");
} catch (e) {
  ethers = require(path.join(__dirname, "../frontend/node_modules/ethers"));
}

const RPC_URL = "http://127.0.0.1:8545";
const LP_ADDR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ROSTER_ADDR = "0xc0F115A19107322cFBf1cDBC7ea011C19EbDB4F8";
const ORACLE_ADDR = "0x34B40BA116d5Dec75548a9e9A8f15411461E8c70";

const ROSTER_ABI = [
  "function getRoster(address lp, uint256 seasonId) view returns (tuple(address trader, uint256 mrlvStaked, uint256 points, bool flagged)[])"
];

const ORACLE_ABI = [
  "function allTimeScoutScore(address lp) view returns (uint256)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const roster = new ethers.Contract(ROSTER_ADDR, ROSTER_ABI, provider);
  const oracle = new ethers.Contract(ORACLE_ADDR, ORACLE_ABI, provider);

  const picks = await roster.getRoster(LP_ADDR, 1);
  const allTime = await oracle.allTimeScoutScore(LP_ADDR);

  console.log("==========================================");
  console.log("  CHECKING ON-CHAIN LP FANTASY POINTS     ");
  console.log("==========================================");
  console.log("LP Address:", LP_ADDR);
  console.log("All-Time Scout Score:", allTime.toString(), "pts");
  console.log("\nSeason #1 Drafted Picks:");
  picks.forEach((p, i) => {
    console.log(`- Pick #${i + 1}: Trader = ${p.trader}`);
    console.log(`  Staked: ${ethers.formatUnits(p.mrlvStaked, 18)} MRLV`);
    console.log(`  Points: ${p.points.toString()} pts`);
    console.log(`  Flagged: ${p.flagged}`);
  });
}

main().catch(console.error);
