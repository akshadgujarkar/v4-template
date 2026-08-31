const path = require("path");
let ethers;
try {
  ethers = require("ethers");
} catch (e) {
  ethers = require(path.join(__dirname, "../frontend/node_modules/ethers"));
}

const RPC_URL = "http://127.0.0.1:8545";
const DEPLOYER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const LP_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // Account #1

const LEAGUE_ADDR = "0xc96304e3c037f81dA488ed9dEa1D8F2a48278a75";
const ROSTER_ADDR = "0xc0F115A19107322cFBf1cDBC7ea011C19EbDB4F8";
const ORACLE_ADDR = "0x34B40BA116d5Dec75548a9e9A8f15411461E8c70";
const MRLV_ADDR = "0x1c85638e118b37167e9298c2268758e058DdfDA0";
const REWARD_VAULT_ADDR = "0xe8D2A1E88c91DCd5433208d4152Cc4F399a7e91d";

// Searcher Account #5: Jared Sandwich Bot
const SEARCHER_5_ADDR = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";

const LEAGUE_ABI = [
  "function currentSeasonId() view returns (uint256)",
  "function seasons(uint256) view returns (uint256 id, uint8 status, uint256 prizePool, uint256 totalPoints)",
  "function startSeason() external",
  "function lockSeason() external",
  "function settleSeason() external",
  "function stakePick(address trader, uint256 amount) external",
  "function claimable(address) view returns (uint256)",
  "function getSeasonParticipants(uint256) view returns (address[])"
];

const ROSTER_ABI = [
  "function pointsOracle() view returns (address)",
  "function getRoster(address lp, uint256 seasonId) view returns (tuple(address trader, uint256 mrlvStaked, uint256 points, bool flagged)[])"
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount) returns (bool)",
  "function setRewardVault(address) external"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const deployer = new ethers.Wallet(DEPLOYER_PK, provider);
  const lp = new ethers.Wallet(LP_PK, provider);

  console.log("==================================================");
  console.log("  VERIFYING FANTASY MEV LEAGUE INTEGRATION FLOW   ");
  console.log("==================================================");

  const league = new ethers.Contract(LEAGUE_ADDR, LEAGUE_ABI, deployer);
  const roster = new ethers.Contract(ROSTER_ADDR, ROSTER_ABI, provider);
  const mrlv = new ethers.Contract(MRLV_ADDR, ERC20_ABI, deployer);

  // 1. Check pointsOracle configuration in ScoutRoster
  const currentOracle = await roster.pointsOracle();
  console.log("Roster configured PointsOracle:", currentOracle);
  console.log("Expected PointsOracle:", ORACLE_ADDR);
  if (currentOracle.toLowerCase() !== ORACLE_ADDR.toLowerCase()) {
    console.error("❌ Oracle mismatch in ScoutRoster!");
  } else {
    console.log("✅ PointsOracle is correctly set in ScoutRoster!");
  }

  // 2. Open Season #1 if needed
  let seasonId = Number(await league.currentSeasonId());
  if (seasonId === 0) {
    console.log("Starting Season #1...");
    let dNonce = await provider.getTransactionCount(deployer.address, "latest");
    const tx = await league.startSeason({ nonce: dNonce });
    await tx.wait();
    seasonId = 1;
  }
  console.log("Current Season ID:", seasonId);

  // 3. Fund LP with MRLV tokens if needed
  const lpBal = await mrlv.balanceOf(lp.address);
  console.log("LP MRLV Balance:", ethers.formatUnits(lpBal, 18));
  if (lpBal < ethers.parseUnits("100", 18)) {
    console.log("Minting 1000 MRLV for LP...");
    let dNonce = await provider.getTransactionCount(deployer.address, "latest");
    const mrlvAsDeployer = new ethers.Contract(MRLV_ADDR, ["function setRewardVault(address) external", "function mint(address,uint256) external"], deployer);
    await (await mrlvAsDeployer.setRewardVault(deployer.address, { nonce: dNonce++ })).wait();
    await (await mrlvAsDeployer.mint(lp.address, ethers.parseUnits("1000", 18), { nonce: dNonce++ })).wait();
    await (await mrlvAsDeployer.setRewardVault(REWARD_VAULT_ADDR, { nonce: dNonce++ })).wait();
    console.log("LP funded with 1000 MRLV.");
  }

  // 4. LP approves and stakes on Account #5 (Jared Sandwich Bot)
  const lpLeague = new ethers.Contract(LEAGUE_ADDR, LEAGUE_ABI, lp);
  const lpMRLV = new ethers.Contract(MRLV_ADDR, ERC20_ABI, lp);
  
  const currentRoster = await roster.getRoster(lp.address, seasonId);
  const hasDrafted5 = currentRoster.some(p => p.trader.toLowerCase() === SEARCHER_5_ADDR.toLowerCase());

  let lpNonce = await provider.getTransactionCount(lp.address, "latest");
  if (!hasDrafted5) {
    console.log(`Drafting Account #5 (${SEARCHER_5_ADDR}) with 50 MRLV stake...`);
    await (await lpMRLV.approve(LEAGUE_ADDR, ethers.parseUnits("1000", 18), { nonce: lpNonce++ })).wait();
    await (await lpLeague.stakePick(SEARCHER_5_ADDR, ethers.parseUnits("50", 18), { nonce: lpNonce++ })).wait();
    console.log("✅ Successfully drafted Jared Sandwich Bot!");
  } else {
    console.log("LP has already drafted Account #5 in this season.");
  }

  // 5. Lock Season to start active scoring
  const seasonData = await league.seasons(seasonId);
  if (Number(seasonData.status) === 0) {
    console.log("Locking Season #1 to activate scoring...");
    let dNonce = await provider.getTransactionCount(deployer.address, "latest");
    await (await league.lockSeason({ nonce: dNonce })).wait();
    console.log("✅ Season locked and Active!");
  }

  console.log("\nSetup complete! Now running SimulateMultiSearchers & Points Relayer to verify scoring.");
}

main().catch(console.error);
