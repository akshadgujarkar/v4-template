/**
 * Node.js script to simulate suspicious MEV swaps on the Uniswap v4 pool.
 * 
 * Uses Anvil's primary deployer account (Account #0) to execute rapid,
 * large price-impact reversals that trigger MEVDetector and DynamicFeeManager.
 * 
 * Surcharges are automatically deposited into RewardVault, generating MRVL
 * rewards for LPs to claim on the Portfolio page.
 * 
 * Usage:
 *   node scripts/simulate-swaps.js [optional_lp_address]
 */

const path = require("path");
let ethers;
try {
  ethers = require("ethers");
} catch (e) {
  ethers = require(path.join(__dirname, "../frontend/node_modules/ethers"));
}

const RPC_URL = process.env.VITE_RPC_URL || "http://127.0.0.1:8545";
const DEPLOYER_PK = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Contract Addresses
const TOKEN0_ADDRESS = process.env.VITE_CONTRACT_ADDRESS_TOKEN0 || "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
const TOKEN1_ADDRESS = process.env.VITE_CONTRACT_ADDRESS_TOKEN1 || "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";
const SWAP_ROUTER_ADDRESS = process.env.VITE_CONTRACT_ADDRESS_SWAP_ROUTER || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const MRLV_HOOK_ADDRESS = process.env.VITE_CONTRACT_ADDRESS_MRLV_HOOK || "0xF88CBd007Ea5DEc6BfD336519b51b0eC4a7F3FC0";
const REWARD_VAULT_ADDRESS = process.env.VITE_CONTRACT_ADDRESS_REWARD_VAULT || "0x3Aa5ebB10DC797CAC828524e59A333d0A371443c";
const POOL_ID = process.env.VITE_POOL_ID || "0xd1d1f26a6fa8c355f79d2f7fed64748588a8302b5e74aed5691d1280949cfc4e";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount) returns (bool)"
];

const SWAP_ROUTER_ABI = [
  "function swap(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, tuple(bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96) params, tuple(bool takeClaims, bool settleUsingBurn) testSettings, bytes hookData) external payable returns (int256 delta)"
];

const REWARD_VAULT_ABI = [
  "function totalCaptured() view returns (uint256)",
  "function poolDistributable(bytes32 poolId) view returns (uint256)",
  "function claimable(address lp) view returns (uint256)",
  "function distribute(bytes32 poolId, address[] lps) external"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(DEPLOYER_PK, provider);
  const targetLP = process.argv[2] || process.env.LP_ADDRESS;

  console.log("==================================================");
  console.log("  SIMULATING SUSPICIOUS MEV SWAPS (ANVIL DEPLOYER)");
  console.log("==================================================");
  console.log("Attacker / Deployer Address:", signer.address);
  console.log("Target Pool ID:", POOL_ID);

  const token0 = new ethers.Contract(TOKEN0_ADDRESS, ERC20_ABI, signer);
  const token1 = new ethers.Contract(TOKEN1_ADDRESS, ERC20_ABI, signer);
  const swapRouter = new ethers.Contract(SWAP_ROUTER_ADDRESS, SWAP_ROUTER_ABI, signer);
  const rewardVault = new ethers.Contract(REWARD_VAULT_ADDRESS, REWARD_VAULT_ABI, signer);

  let nonce = await provider.getTransactionCount(signer.address, "pending");

  // 1. Ensure token balances and approvals
  console.log("\n1. Verifying Token Balances & Approvals...");
  const [bal0, bal1, allow0, allow1] = await Promise.all([
    token0.balanceOf(signer.address),
    token1.balanceOf(signer.address),
    token0.allowance(signer.address, SWAP_ROUTER_ADDRESS),
    token1.allowance(signer.address, SWAP_ROUTER_ADDRESS),
  ]);

  if (bal0 < ethers.parseUnits("500", 18)) {
    console.log("   Minting Token0 to deployer...");
    const tx = await token0.mint(signer.address, ethers.parseUnits("100000", 18), { nonce: nonce++ });
    await tx.wait();
  }
  if (bal1 < ethers.parseUnits("500", 18)) {
    console.log("   Minting Token1 to deployer...");
    const tx = await token1.mint(signer.address, ethers.parseUnits("100000", 18), { nonce: nonce++ });
    await tx.wait();
  }

  if (allow0 < ethers.parseUnits("1000", 18)) {
    console.log("   Approving Token0 for SwapRouter...");
    const tx = await token0.approve(SWAP_ROUTER_ADDRESS, ethers.MaxUint256, { nonce: nonce++ });
    await tx.wait();
  }
  if (allow1 < ethers.parseUnits("1000", 18)) {
    console.log("   Approving Token1 for SwapRouter...");
    const tx = await token1.approve(SWAP_ROUTER_ADDRESS, ethers.MaxUint256, { nonce: nonce++ });
    await tx.wait();
  }
  console.log("   Tokens verified and approved.");

  const poolKey = {
    currency0: TOKEN0_ADDRESS,
    currency1: TOKEN1_ADDRESS,
    fee: 8388608,
    tickSpacing: 60,
    hooks: MRLV_HOOK_ADDRESS
  };

  const testSettings = {
    takeClaims: false,
    settleUsingBurn: false
  };

  // Re-fetch nonce directly from provider
  nonce = await provider.getTransactionCount(signer.address, "latest");

  // 2. Attack Leg 1: Frontrun Heavy Buy (50 TK0 -> TK1)
  console.log("\n2. [Leg 1] Executing Heavy Buy (50 TK0 -> TK1)...");
  const leg1Params = {
    zeroForOne: true,
    amountSpecified: -ethers.parseUnits("50", 18),
    sqrtPriceLimitX96: 4295128739n + 1n
  };
  const tx1 = await swapRouter.swap(poolKey, leg1Params, testSettings, "0x", { gasLimit: 3000000, nonce: nonce++ });
  await tx1.wait();
  console.log("   -> Leg 1 Executed (Triggers Large Price Impact Signal: +20 pts)");

  // 3. Attack Leg 2: Reversal Backrun (50 TK1 -> TK0)
  console.log("\n3. [Leg 2] Executing Rapid Reversal Backrun (50 TK1 -> TK0)...");
  const leg2Params = {
    zeroForOne: false,
    amountSpecified: -ethers.parseUnits("50", 18),
    sqrtPriceLimitX96: 1461446703485210103287273052203988822378723970342n - 1n
  };
  const tx2 = await swapRouter.swap(poolKey, leg2Params, testSettings, "0x", { gasLimit: 3000000, nonce: nonce++ });
  await tx2.wait();
  console.log("   -> Leg 2 Executed (Triggers Rapid Reversal +30 & Price Impact +20 => Risk Score 50!)");
  console.log("   -> Dynamic Surcharge Captured by MRLVHook into RewardVault!");

  // 4. Attack Leg 3: Heavy Buy (100 TK0 -> TK1)
  console.log("\n4. [Leg 3] Executing Second Heavy Buy (100 TK0 -> TK1)...");
  const leg3Params = {
    zeroForOne: true,
    amountSpecified: -ethers.parseUnits("100", 18),
    sqrtPriceLimitX96: 4295128739n + 1n
  };
  const tx3 = await swapRouter.swap(poolKey, leg3Params, testSettings, "0x", { gasLimit: 3000000, nonce: nonce++ });
  await tx3.wait();
  console.log("   -> Leg 3 Executed (High Surcharge Captured)");

  // 5. Attack Leg 4: Heavy Reversal (100 TK1 -> TK0)
  console.log("\n5. [Leg 4] Executing Second Heavy Reversal (100 TK1 -> TK0)...");
  const leg4Params = {
    zeroForOne: false,
    amountSpecified: -ethers.parseUnits("100", 18),
    sqrtPriceLimitX96: 1461446703485210103287273052203988822378723970342n - 1n
  };
  const tx4 = await swapRouter.swap(poolKey, leg4Params, testSettings, "0x", { gasLimit: 3000000, nonce: nonce++ });
  await tx4.wait();
  console.log("   -> Leg 4 Executed (High Surcharge Captured)");

  // 6. Check Captured Balances
  const totalCaptured = await rewardVault.totalCaptured();
  const distributable = await rewardVault.poolDistributable(POOL_ID);

  console.log("\n==================================================");
  console.log("  MEV SURCHARGE CAPTURED IN REWARDVAULT");
  console.log("==================================================");
  console.log("Total Captured MEV:", ethers.formatUnits(totalCaptured, 18), "tokens");
  console.log("Pool Distributable:", ethers.formatUnits(distributable, 18), "tokens");

  if (targetLP && ethers.isAddress(targetLP)) {
    console.log("\nDistributing MEV rewards to LP:", targetLP);
    const distTx = await rewardVault.distribute(POOL_ID, [targetLP], { nonce: nonce++ });
    await distTx.wait();
    const claimable = await rewardVault.claimable(targetLP);
    console.log("Claimable MRVL for LP:", ethers.formatUnits(claimable, 18), "MRVL");
    console.log("\nYou can now open the Portfolio page and click 'Claim MRVL'!");
  } else {
    console.log("\nTo distribute and claim these rewards:");
    console.log("1. Open the Portfolio page in the frontend.");
    console.log("2. Click 'Trigger Distribution' in the Pending MEV Distribution banner.");
    console.log("3. Click 'Claim MRVL' to receive your minted tokens!");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
