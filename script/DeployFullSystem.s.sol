// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";


import {MockERC20} from "../src/MockERC20.sol";
import {MRLVToken} from "../src/MRLVToken.sol";
import {LoyaltyNFT} from "../src/LoyaltyNFT.sol";
import {AnalyticsEmitter} from "../src/AnalyticsEmitter.sol";
import {MEVDetector} from "../src/MEVDetector.sol";
import {DynamicFeeManager} from "../src/DynamicFeeManager.sol";
import {MRLVHook} from "../src/MRLVHook.sol";
import {LoyaltyManager} from "../src/LoyaltyManager.sol";
import {RewardVault, IMRLVToken} from "../src/RewardVault.sol";

import {ScoutRoster} from "../src/fantasy-league/ScoutRoster.sol";
import {MEVScoutLeague} from "../src/fantasy-league/MEVScoutLeague.sol";
import {ScoutPointsOracle} from "../src/fantasy-league/ScoutPointsOracle.sol";

// Helper to bundle deposit and activation in one transaction
contract LiquiditySetupHelper {
    function setup(
        MRLVHook hook, 
        PoolKey calldata key, 
        ModifyLiquidityParams calldata lpParams, 
        uint256 amount0, 
        uint256 amount1, 
        MockERC20 token0, 
        MockERC20 token1
    ) external {
        token0.transferFrom(msg.sender, address(this), amount0);
        token1.transferFrom(msg.sender, address(this), amount1);
        token0.approve(address(hook), amount0);
        token1.approve(address(hook), amount1);
        
        bytes32 posKey = hook.depositPendingLiquidity(key, lpParams, amount0, amount1);
        hook.activateLiquidity(posKey);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}

contract DeployFullSystem is Script {
    function run() external {
        // Use anvil default address or env var
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("Starting full system deployment with deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Core Uniswap v4
        PoolManager poolManager = new PoolManager(deployer);
        PoolSwapTest swapRouter = new PoolSwapTest(poolManager);
        PoolModifyLiquidityTest modifyLiquidityRouter = new PoolModifyLiquidityTest(poolManager);
        
        console2.log("PoolManager:", address(poolManager));
        console2.log("SwapRouter:", address(swapRouter));
        console2.log("ModifyLiquidityRouter:", address(modifyLiquidityRouter));

        // 2. Mock Tokens for local testing (mint a lot to deployer for frontend usage)
        MockERC20 token0 = new MockERC20("Token 0", "TK0");
        MockERC20 token1 = new MockERC20("Token 1", "TK1");
        
        // Ensure token0 < token1 for pool sorting
        if (address(token0) > address(token1)) {
            (token0, token1) = (token1, token0);
        }
        
        token0.mint(deployer, 1_000_000_000 ether);
        token1.mint(deployer, 1_000_000_000 ether);

        console2.log("Token0:", address(token0));
        console2.log("Token1:", address(token1));

        // 3. Independent Modules
        MRLVToken mrlvToken = new MRLVToken(deployer);
        LoyaltyNFT loyaltyNFT = new LoyaltyNFT(deployer);
        AnalyticsEmitter analytics = new AnalyticsEmitter(deployer);

        console2.log("MRLVToken:", address(mrlvToken));
        console2.log("LoyaltyNFT:", address(loyaltyNFT));
        console2.log("AnalyticsEmitter:", address(analytics));

        // 4. Hook Dependent Modules (hook address = 0 for now)
        // Oracle relayer is set to deployer for local devnet testing
        MEVDetector detector = new MEVDetector(deployer, address(0), deployer);
        DynamicFeeManager feeManager = new DynamicFeeManager(deployer, address(0));

        console2.log("MEVDetector:", address(detector));
        console2.log("DynamicFeeManager:", address(feeManager));

        // 5. Deploy MRLVHook with HookMiner
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG |
            Hooks.AFTER_INITIALIZE_FLAG |
            Hooks.BEFORE_ADD_LIQUIDITY_FLAG |
            Hooks.AFTER_ADD_LIQUIDITY_FLAG |
            Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG |
            Hooks.AFTER_REMOVE_LIQUIDITY_FLAG |
            Hooks.BEFORE_SWAP_FLAG |
            Hooks.AFTER_SWAP_FLAG
        );

        bytes memory constructorArgs = abi.encode(
            poolManager,
            detector,
            feeManager,
            analytics,
            deployer
        );

        (address hookAddr, bytes32 salt) = HookMiner.find(
            0x4e59b44847b379578588920cA78FbF26c0B4956C,
            flags,
            type(MRLVHook).creationCode,
            constructorArgs
        );

        MRLVHook hook = new MRLVHook{salt: salt}(
            poolManager,
            detector,
            feeManager,
            analytics,
            deployer
        );

        require(address(hook) == hookAddr, "Hook address mismatch");
        console2.log("MRLVHook:", address(hook));

        // 6. Connect hook back to modules
        detector.setHook(address(hook));
        feeManager.setHook(address(hook));
        analytics.setHook(address(hook));
        
        console2.log("Hook injected into Detector, FeeManager, and Analytics.");

        // 7. Loyalty Manager and Reward Vault (now we have hook address)
        LoyaltyManager loyaltyManager = new LoyaltyManager(deployer, address(hook));
        loyaltyManager.setLoyaltyNFT(address(loyaltyNFT));
        // Set deployer as oracle relayer for consistency scores
        loyaltyManager.setOracleRelayer(deployer);

        RewardVault rewardVault = new RewardVault(deployer, address(hook), IMRLVToken(address(mrlvToken)));
        rewardVault.setLoyaltyManager(address(loyaltyManager));

        loyaltyManager.setRewardVault(address(rewardVault));

        // Connect Hook to LoyaltyManager and RewardVault
        hook.setLoyaltyManager(loyaltyManager);
        hook.setRewardVault(rewardVault);

        // Give RewardVault permission to mint MRLVToken
        mrlvToken.setRewardVault(address(rewardVault));
        
        // Give LoyaltyManager permission to mint LoyaltyNFT
        loyaltyNFT.setLoyaltyManager(address(loyaltyManager));

        console2.log("LoyaltyManager:", address(loyaltyManager));
        console2.log("RewardVault:", address(rewardVault));

        // 8. Fantasy League Components
        // We use address prediction to resolve the circular dependency between ScoutRoster and MEVScoutLeague
        uint256 nonce = vm.getNonce(deployer);
        address predictedLeague = vm.computeCreateAddress(deployer, nonce + 1); // Roster deployed next, then League

        ScoutRoster roster = new ScoutRoster(predictedLeague);
        MEVScoutLeague league = new MEVScoutLeague(mrlvToken, roster);
        require(address(league) == predictedLeague, "League address prediction failed");

        ScoutPointsOracle oracle = new ScoutPointsOracle(deployer, roster);

        console2.log("ScoutRoster:", address(roster));
        console2.log("MEVScoutLeague:", address(league));
        console2.log("ScoutPointsOracle:", address(oracle));

        // 9. Initialize Pool and Add Initial Liquidity
        token0.approve(address(modifyLiquidityRouter), type(uint256).max);
        token1.approve(address(modifyLiquidityRouter), type(uint256).max);

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token1)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        
        PoolId poolId = key.toId();
        
        console2.log("PoolKey:");
        console2.log("  currency0:", Currency.unwrap(key.currency0));
        console2.log("  currency1:", Currency.unwrap(key.currency1));
        console2.log("  fee: %d", key.fee);
        console2.log("  tickSpacing: %d", key.tickSpacing);
        console2.log("  hooks:", address(key.hooks));
        
        console2.log("Computed PoolId:");
        console2.logBytes32(PoolId.unwrap(poolId));

        uint160 startingPrice = TickMath.getSqrtPriceAtTick(0);
        poolManager.initialize(key, startingPrice);
        
        console2.log("Initialized PoolId:");
        console2.logBytes32(PoolId.unwrap(poolId));

        // Add some initial liquidity
        detector.setLiquidityMaturityBlocks(0); // Bypass maturity for initial liquidity

        ModifyLiquidityParams memory lpParams = ModifyLiquidityParams({
            tickLower: -600,
            tickUpper: 600,
            liquidityDelta: 100_000 ether,
            salt: bytes32(0)
        });

        // Add liquidity through LiquiditySetupHelper to avoid posKey mismatch across broadcast transactions
        LiquiditySetupHelper lpHelper = new LiquiditySetupHelper();
        token0.approve(address(lpHelper), type(uint256).max);
        token1.approve(address(lpHelper), type(uint256).max);
        
        lpHelper.setup(
            hook, 
            key, 
            lpParams, 
            100_000 ether, 
            100_000 ether, 
            token0, 
            token1
        );
        
        require(PoolId.unwrap(poolId) == PoolId.unwrap(key.toId()), "PoolId mismatch");
        
        console2.log("Activating liquidity for PoolId:");
        console2.logBytes32(PoolId.unwrap(poolId));
        
        // Restore maturity blocks back to 5
        detector.setLiquidityMaturityBlocks(5);

        console2.log("Initial Liquidity Added!");

        vm.stopBroadcast();
        
        console2.log("Deployment Complete! All frontend endpoints deployed.");
    }
}
