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
import {MRLVHook} from "../src/MRLVHook.sol";
import {RewardVault} from "../src/RewardVault.sol";

/// @title SimulateMultiSearchers
/// @notice Simulates suspicious MEV swaps from local Anvil accounts #5 to #9.
///         Executes sandwich attacks, rapid reversals, and large price impacts
///         from distinct searcher addresses so players can draft these accounts
///         and stake MRLV in the Fantasy MEV League.
contract SimulateMultiSearchers is Script {
    using PoolIdLibrary for PoolKey;

    function run() external {
        uint256 deployerPk = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        address token0Addr = vm.envOr("VITE_CONTRACT_ADDRESS_TOKEN0", address(0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9));
        address token1Addr = vm.envOr("VITE_CONTRACT_ADDRESS_TOKEN1", address(0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9));
        address swapRouterAddr = vm.envOr("VITE_CONTRACT_ADDRESS_SWAP_ROUTER", address(0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512));
        address hookAddr = vm.envOr("VITE_CONTRACT_ADDRESS_MRLV_HOOK", address(0xc2F0938d7121DEc68e9210Ac714561C6a1733Fc0));
        address rewardVaultAddr = vm.envOr("VITE_CONTRACT_ADDRESS_REWARD_VAULT", address(0x3Aa5ebB10DC797CAC828524e59A333d0A371443c));

        MockERC20 token0 = MockERC20(token0Addr);
        MockERC20 token1 = MockERC20(token1Addr);
        PoolSwapTest swapRouter = PoolSwapTest(swapRouterAddr);
        MRLVHook hook = MRLVHook(payable(hookAddr));
        RewardVault rewardVault = RewardVault(rewardVaultAddr);

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token1)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        bytes32 poolId = PoolId.unwrap(key.toId());

        console2.log("===============================================================");
        console2.log("  SIMULATING MULTI-ACCOUNT SUSPICIOUS MEV SWAPS (ACCOUNTS 5-9) ");
        console2.log("===============================================================");
        console2.log("Pool ID:", vm.toString(poolId));

        uint256[5] memory searcherPks = [
            uint256(0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba), // Acc 5
            uint256(0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b05210385), // Acc 6
            uint256(0x4bbbf856000e800f569172dd9e00c2ea29873d8a7f8cb8705c06bed300d096a6), // Acc 7
            uint256(0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0c7c5c388b97743), // Acc 8
            uint256(0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6)  // Acc 9
        ];

        string[5] memory names = [
            "Account #5 [Jared Sandwich Bot]",
            "Account #6 [Wintermute Fast Arb]",
            "Account #7 [Flashbots Backrunner]",
            "Account #8 [Atomic Liquidation Bot]",
            "Account #9 [Toxic Flow Sniper]"
        ];

        // 1. Deployer funds searcher accounts with ETH for gas and test tokens
        vm.startBroadcast(deployerPk);
        console2.log("\n1. Funding searcher accounts with ETH and tokens...");
        for (uint256 i = 0; i < 5; i++) {
            address sAddr = vm.addr(searcherPks[i]);
            
            // Transfer 10 ETH for gas if low
            if (sAddr.balance < 2 ether) {
                payable(sAddr).transfer(10 ether);
            }

            // Mint test tokens
            if (token0.balanceOf(sAddr) < 1000 ether) {
                token0.mint(sAddr, 100_000 ether);
            }
            if (token1.balanceOf(sAddr) < 1000 ether) {
                token1.mint(sAddr, 100_000 ether);
            }
        }
        vm.stopBroadcast();
        console2.log("   Searcher accounts funded with ETH and tokens.");

        PoolSwapTest.TestSettings memory testSettings = PoolSwapTest.TestSettings({
            takeClaims: false,
            settleUsingBurn: false
        });

        // 2. Execute unique suspicious trading patterns for each account
        for (uint256 i = 0; i < 5; i++) {
            uint256 sPk = searcherPks[i];
            address sAddr = vm.addr(sPk);

            console2.log("\n---------------------------------------------------------------");
            console2.log(names[i]);
            console2.log("Address:", sAddr);

            vm.startBroadcast(sPk);

            // Approve router
            token0.approve(address(swapRouter), type(uint256).max);
            token1.approve(address(swapRouter), type(uint256).max);

            if (i == 0 || i == 3) {
                // Sandwich Pattern: Heavy buy followed by immediate reversal backrun
                console2.log("   Pattern: Sandwich Extractor (60 tokens)");
                SwapParams memory legA = SwapParams({
                    zeroForOne: true,
                    amountSpecified: -60 ether,
                    sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
                });
                swapRouter.swap(key, legA, testSettings, "");
                console2.log("   -> Leg 1: Frontrun swap confirmed (Price Impact +20)");

                SwapParams memory legB = SwapParams({
                    zeroForOne: false,
                    amountSpecified: -60 ether,
                    sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
                });
                swapRouter.swap(key, legB, testSettings, "");
                console2.log("   -> Leg 2: Reversal swap confirmed (Reversal +30 & Price Impact +20 = Score 50!)");
            } else if (i == 1 || i == 4) {
                // Reversal Pattern: Fast opposite-direction trade
                console2.log("   Pattern: Fast Arbitrage Reversal (40 tokens)");
                SwapParams memory legA = SwapParams({
                    zeroForOne: false,
                    amountSpecified: -40 ether,
                    sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
                });
                swapRouter.swap(key, legA, testSettings, "");
                console2.log("   -> Leg 1: Initial trade confirmed");

                SwapParams memory legB = SwapParams({
                    zeroForOne: true,
                    amountSpecified: -40 ether,
                    sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
                });
                swapRouter.swap(key, legB, testSettings, "");
                console2.log("   -> Leg 2: Opposite-direction trade confirmed (Reversal Detected)");
            } else {
                // Large Price Impact trade
                console2.log("   Pattern: Heavy Single Flow Trade (80 tokens)");
                SwapParams memory leg = SwapParams({
                    zeroForOne: true,
                    amountSpecified: -80 ether,
                    sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
                });
                swapRouter.swap(key, leg, testSettings, "");
                console2.log("   -> Heavy swap confirmed (Large Price Impact Detected)");
            }

            vm.stopBroadcast();
        }

        // 3. Output captured stats
        uint256 totalCaptured = rewardVault.totalCaptured();
        uint256 poolDistributable = rewardVault.poolDistributable(poolId);

        console2.log("===============================================================");
        console2.log("  SIMULATION COMPLETE - 5 SEARCHERS ACTIVE ON-CHAIN            ");
        console2.log("===============================================================");
        console2.log("RewardVault Total Surcharge (ether):", totalCaptured / 1e18);
        console2.log("Pool Distributable (ether):", poolDistributable / 1e18);
        console2.log("\nYou can now draft Accounts 5-9 in the Fantasy MEV League!");
    }
}
