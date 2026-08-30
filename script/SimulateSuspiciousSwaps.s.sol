// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

import {MockERC20} from "../src/MockERC20.sol";
import {MRLVToken} from "../src/MRLVToken.sol";
import {MRLVHook} from "../src/MRLVHook.sol";
import {MEVDetector} from "../src/MEVDetector.sol";
import {DynamicFeeManager} from "../src/DynamicFeeManager.sol";
import {RewardVault} from "../src/RewardVault.sol";
import {LoyaltyManager} from "../src/LoyaltyManager.sol";

/// @title SimulateSuspiciousSwaps
/// @notice Simulates suspicious MEV transaction patterns (rapid reversals & large price impacts)
///         to trigger MEV detection, dynamic fee surcharges, and generate MRVL rewards for LPs.
contract SimulateSuspiciousSwaps is Script {
    using PoolIdLibrary for PoolKey;

    function run() external {
        uint256 deployerPrivateKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(deployerPrivateKey);

        // Load addresses from env or fallback to deployed Anvil addresses
        address token0Addr = vm.envOr("VITE_CONTRACT_ADDRESS_TOKEN0", address(0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9));
        address token1Addr = vm.envOr("VITE_CONTRACT_ADDRESS_TOKEN1", address(0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9));
        address swapRouterAddr = vm.envOr("VITE_CONTRACT_ADDRESS_SWAP_ROUTER", address(0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512));
        address hookAddr = vm.envOr("VITE_CONTRACT_ADDRESS_MRLV_HOOK", address(0xF88CBd007Ea5DEc6BfD336519b51b0eC4a7F3FC0));
        address rewardVaultAddr = vm.envOr("VITE_CONTRACT_ADDRESS_REWARD_VAULT", address(0x3Aa5ebB10DC797CAC828524e59A333d0A371443c));
        address loyaltyManagerAddr = vm.envOr("VITE_CONTRACT_ADDRESS_LOYALTY_MANAGER", address(0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1));
        address mrlvTokenAddr = vm.envOr("VITE_CONTRACT_ADDRESS_MRLV_TOKEN", address(0xa513E6E4b8f2a923D98304ec87F64353C4D5C853));

        // Optional target LP address to auto-distribute to
        address targetLP = vm.envOr("LP_ADDRESS", address(0));

        MockERC20 token0 = MockERC20(token0Addr);
        MockERC20 token1 = MockERC20(token1Addr);
        PoolSwapTest swapRouter = PoolSwapTest(swapRouterAddr);
        MRLVHook hook = MRLVHook(payable(hookAddr));
        RewardVault rewardVault = RewardVault(rewardVaultAddr);
        LoyaltyManager loyaltyManager = LoyaltyManager(loyaltyManagerAddr);
        MRLVToken mrlvToken = MRLVToken(mrlvTokenAddr);

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token1)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        bytes32 poolId = PoolId.unwrap(key.toId());

        console2.log("=== SIMULATING SUSPICIOUS MEV SWAPS ===");
        console2.log("Attacker / Trader Address:", deployer);
        console2.log("Pool ID:", vm.toString(poolId));

        vm.startBroadcast(deployerPrivateKey);

        // 1. Ensure deployer has sufficient tokens and maximum approvals
        if (token0.balanceOf(deployer) < 10_000 ether) {
            token0.mint(deployer, 1_000_000 ether);
        }
        if (token1.balanceOf(deployer) < 10_000 ether) {
            token1.mint(deployer, 1_000_000 ether);
        }
        token0.approve(address(swapRouter), type(uint256).max);
        token1.approve(address(swapRouter), type(uint256).max);

        PoolSwapTest.TestSettings memory testSettings = PoolSwapTest.TestSettings({
            takeClaims: false,
            settleUsingBurn: false
        });

        // 2. Attack Leg 1: Heavy Frontrun buy (Large Price Impact > 10 ETH)
        console2.log("\n[1/4] Executing heavy zeroForOne swap (50 tokens)...");
        SwapParams memory leg1Params = SwapParams({
            zeroForOne: true,
            amountSpecified: -50 ether,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        swapRouter.swap(key, leg1Params, testSettings, "");
        console2.log("  -> Leg 1 executed (Triggers Large Price Impact Signal: +20 points)");

        // 3. Attack Leg 2: Immediate Reversal Backrun (Opposite direction swap within reversal window)
        console2.log("\n[2/4] Executing immediate reversal oneForZero swap (50 tokens)...");
        SwapParams memory leg2Params = SwapParams({
            zeroForOne: false,
            amountSpecified: -50 ether,
            sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
        });
        swapRouter.swap(key, leg2Params, testSettings, "");
        console2.log("  -> Leg 2 executed (Triggers Reversal Signal +30 & Price Impact +20 => Risk Score 50!)");
        console2.log("  -> Dynamic Surcharge Captured by MRLVHook!");

        // 4. Attack Leg 3: Second Heavy Frontrun
        console2.log("\n[3/4] Executing second rapid zeroForOne swap (100 tokens)...");
        SwapParams memory leg3Params = SwapParams({
            zeroForOne: true,
            amountSpecified: -100 ether,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        swapRouter.swap(key, leg3Params, testSettings, "");
        console2.log("  -> Leg 3 executed (High Risk Reversal + Heavy Volume)");

        // 5. Attack Leg 4: Second Rapid Reversal
        console2.log("\n[4/4] Executing second rapid reversal oneForZero swap (100 tokens)...");
        SwapParams memory leg4Params = SwapParams({
            zeroForOne: false,
            amountSpecified: -100 ether,
            sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
        });
        swapRouter.swap(key, leg4Params, testSettings, "");
        console2.log("  -> Leg 4 executed (High Surcharge Captured)");

        // 6. Inspect Captured MEV in RewardVault
        uint256 distributable = rewardVault.poolDistributable(poolId);
        uint256 totalCaptured = rewardVault.totalCaptured();
        console2.log("\n=== MEV SURCHARGE CAPTURED ===");
        console2.log("RewardVault Total Captured Surcharge (ether):", totalCaptured / 1e18);
        console2.log("Pool Distributable Surcharge (ether):", distributable / 1e18);

        // 7. Auto-distribute if target LP or LPs exist
        if (targetLP != address(0)) {
            console2.log("\nDistributing MEV surcharge to LP:", targetLP);
            address[] memory lps = new address[](1);
            lps[0] = targetLP;
            rewardVault.distribute(poolId, lps);
            uint256 claimable = rewardVault.claimable(targetLP);
            console2.log("  -> Success! Claimable MRVL for LP (ether):", claimable / 1e18);
        } else {
            console2.log("\nTip: LPs can now view the pending MEV distribution in the frontend");
            console2.log("and click 'Trigger Distribution' on the Portfolio page, or provide LP_ADDRESS env var.");
        }

        vm.stopBroadcast();
        console2.log("\n=== SIMULATION COMPLETE ===");
    }
}
