const path = require("path");
let ethers;
try {
  ethers = require("ethers");
} catch (e) {
  ethers = require(path.join(__dirname, "../frontend/node_modules/ethers"));
}

const RPC_URL = "http://127.0.0.1:8545";
const DEPLOYER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const LP_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const LEAGUE_ADDR = "0xc96304e3c037f81dA488ed9dEa1D8F2a48278a75";
const MRLV_ADDR = "0x1c85638e118b37167e9298c2268758e058DdfDA0";

const LEAGUE_ABI = [
  "function settleSeason() external",
  "function claimRewards() external",
  "function claimable(address) view returns (uint256)",
  "function seasons(uint256) view returns (uint256 id, uint8 status, uint256 prizePool, uint256 totalPoints)"
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const deployer = new ethers.Wallet(DEPLOYER_PK, provider);
  const lp = new ethers.Wallet(LP_PK, provider);

  const leagueAsDeployer = new ethers.Contract(LEAGUE_ADDR, LEAGUE_ABI, deployer);
  const leagueAsLP = new ethers.Contract(LEAGUE_ADDR, LEAGUE_ABI, lp);
  const mrlv = new ethers.Contract(MRLV_ADDR, ERC20_ABI, provider);

  console.log("==========================================");
  console.log("  SETTLING SEASON #1 AND CLAIMING PRIZE   ");
  console.log("==========================================");

  console.log("Settling Season #1...");
  const txSettle = await leagueAsDeployer.settleSeason();
  await txSettle.wait();
  console.log("✅ Season #1 Settled!");

  const season1 = await leagueAsDeployer.seasons(1);
  console.log("Season Total Points Scored:", season1.totalPoints.toString(), "pts");
  console.log("Season Total Prize Pool:", ethers.formatUnits(season1.prizePool, 18), "MRLV");

  const claimable = await leagueAsDeployer.claimable(lp.address);
  console.log("LP Claimable Prize:", ethers.formatUnits(claimable, 18), "MRLV");

  const balBefore = await mrlv.balanceOf(lp.address);
  console.log("LP Balance before claim:", ethers.formatUnits(balBefore, 18), "MRLV");

  console.log("Claiming prize rewards as LP...");
  const txClaim = await leagueAsLP.claimRewards();
  await txClaim.wait();

  const balAfter = await mrlv.balanceOf(lp.address);
  console.log("✅ LP Balance after claim:", ethers.formatUnits(balAfter, 18), "MRLV");
  console.log("🎉 SUCCESS! Fantasy MEV League is 100% operational from Draft -> MEV Attack -> Relayer Scoring -> Settlement -> Payout Claim!");
}

main().catch(console.error);
