// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
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
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import {MockERC20} from "../src/MockERC20.sol";
import {MRLVToken} from "../src/MRLVToken.sol";
import {LoyaltyNFT} from "../src/LoyaltyNFT.sol";
import {AnalyticsEmitter} from "../src/AnalyticsEmitter.sol";
import {MEVDetector} from "../src/MEVDetector.sol";
import {DynamicFeeManager} from "../src/DynamicFeeManager.sol";
import {MRLVHook} from "../src/MRLVHook.sol";
import {LoyaltyManager} from "../src/LoyaltyManager.sol";
import {RewardVault, IMRLVToken} from "../src/RewardVault.sol";

contract LiveSwapIntegrationTest is Test, IERC721Receiver {
    using PoolIdLibrary for PoolKey;

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    PoolManager poolManager;
    PoolSwapTest swapRouter;
    PoolModifyLiquidityTest modifyLiquidityRouter;

    MockERC20 token0;
    MockERC20 token1;

    MRLVHook hook;
    MEVDetector detector;
    DynamicFeeManager feeManager;
    AnalyticsEmitter analytics;
    MRLVToken mrlvToken;
    LoyaltyNFT loyaltyNFT;
    LoyaltyManager loyaltyManager;
    RewardVault rewardVault;

    address governance = address(0xBEEF);
    address alice = address(0xAA);
    address bob = address(0xBB);

    PoolKey poolKey;
    PoolId poolId;

    function setUp() public {
        poolManager = new PoolManager(address(this));
        swapRouter = new PoolSwapTest(poolManager);
        modifyLiquidityRouter = new PoolModifyLiquidityTest(poolManager);

        token0 = new MockERC20("Token 0", "TK0");
        token1 = new MockERC20("Token 1", "TK1");

        if (address(token0) > address(token1)) {
            (token0, token1) = (token1, token0);
        }

        detector = new MEVDetector(governance, address(this), governance);
        feeManager = new DynamicFeeManager(governance, address(this));
        analytics = new AnalyticsEmitter(governance);

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
            governance
        );

        (address hookAddr, bytes32 salt) = HookMiner.find(
            address(this),
            flags,
            type(MRLVHook).creationCode,
            constructorArgs
        );

        hook = new MRLVHook{salt: salt}(
            poolManager,
            detector,
            feeManager,
            analytics,
            governance
        );

        mrlvToken = new MRLVToken(governance);
        loyaltyNFT = new LoyaltyNFT(governance);
        loyaltyManager = new LoyaltyManager(governance, address(hook));
        rewardVault = new RewardVault(governance, address(hook), IMRLVToken(address(mrlvToken)));

        vm.startPrank(governance);
        detector.setHook(address(hook));
        feeManager.setHook(address(hook));
        analytics.setHook(address(hook));

        loyaltyManager.setLoyaltyNFT(address(loyaltyNFT));
        loyaltyManager.setRewardVault(address(rewardVault));
        rewardVault.setLoyaltyManager(address(loyaltyManager));
        mrlvToken.setRewardVault(address(rewardVault));
        loyaltyNFT.setLoyaltyManager(address(loyaltyManager));

        hook.setLoyaltyManager(loyaltyManager);
        hook.setRewardVault(rewardVault);
        vm.stopPrank();

        poolKey = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token1)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        poolId = poolKey.toId();

        uint160 startingPrice = TickMath.getSqrtPriceAtTick(0);
        poolManager.initialize(poolKey, startingPrice);

        // Add initial liquidity
        vm.prank(governance);
        detector.setLiquidityMaturityBlocks(0);

        token0.mint(address(this), 1_000_000 ether);
        token1.mint(address(this), 1_000_000 ether);
        token0.approve(address(hook), type(uint256).max);
        token1.approve(address(hook), type(uint256).max);

        ModifyLiquidityParams memory initLpParams = ModifyLiquidityParams({
            tickLower: -600,
            tickUpper: 600,
            liquidityDelta: 100_000 ether,
            salt: bytes32(0)
        });

        bytes32 posKeyInit = hook.depositPendingLiquidity(poolKey, initLpParams, 100_000 ether, 100_000 ether);
        hook.activateLiquidity(posKeyInit);

        vm.prank(governance);
        detector.setLiquidityMaturityBlocks(5);

        // Give Alice and Bob tokens
        token0.mint(alice, 1000 ether);
        token1.mint(alice, 1000 ether);
        token0.mint(bob, 1000 ether);
        token1.mint(bob, 1000 ether);
    }

    function test_autoActivateDuringSwap_Integration() public {
        // Alice deposits liquidity to escrow
        vm.startPrank(alice);
        token0.approve(address(hook), type(uint256).max);
        token1.approve(address(hook), type(uint256).max);

        ModifyLiquidityParams memory aliceParams = ModifyLiquidityParams({
            tickLower: -600,
            tickUpper: 600,
            liquidityDelta: 10 ether,
            salt: bytes32(0)
        });

        bytes32 posKey = hook.depositPendingLiquidity(poolKey, aliceParams, 10 ether, 10 ether);
        vm.stopPrank();

        // Advance 6 blocks
        vm.roll(block.number + 6);

        // Bob swaps token0 for token1
        vm.startPrank(bob);
        token0.approve(address(swapRouter), type(uint256).max);
        token1.approve(address(swapRouter), type(uint256).max);

        SwapParams memory swapParams = SwapParams({
            zeroForOne: true,
            amountSpecified: -1 ether,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });

        PoolSwapTest.TestSettings memory testSettings = PoolSwapTest.TestSettings({
            takeClaims: false,
            settleUsingBurn: false
        });

        swapRouter.swap(poolKey, swapParams, testSettings, "");
        vm.stopPrank();

        // Verify Alice's position is activated
        (bool isPending, bool isMature,,, address owner) = hook.getPendingPositionStatus(posKey);
        assertFalse(isPending, "Alice position should be activated");
        assertTrue(isMature, "Alice position is mature");
        assertEq(owner, alice);
    }

    function test_removeLiquidity_Integration() public {
        // Alice deposits liquidity to escrow
        vm.startPrank(alice);
        token0.approve(address(hook), type(uint256).max);
        token1.approve(address(hook), type(uint256).max);

        ModifyLiquidityParams memory aliceParams = ModifyLiquidityParams({
            tickLower: -600,
            tickUpper: 600,
            liquidityDelta: 10 ether,
            salt: bytes32(0)
        });

        bytes32 posKey = hook.depositPendingLiquidity(poolKey, aliceParams, 10 ether, 10 ether);
        
        // Roll 6 blocks and manually activate
        vm.roll(block.number + 6);
        hook.activateLiquidity(posKey);
        
        uint256 posLen = loyaltyManager.getUserPositionsLength(alice, PoolId.unwrap(poolId));
        assertEq(posLen, 1, "Alice should have 1 active position in LoyaltyManager");

        // Now Alice removes liquidity
        ModifyLiquidityParams memory removeParams = ModifyLiquidityParams({
            tickLower: -600,
            tickUpper: 600,
            liquidityDelta: -10 ether,
            salt: bytes32(0)
        });
        modifyLiquidityRouter.modifyLiquidity(poolKey, removeParams, "");

        uint256 posLenAfter = loyaltyManager.getUserPositionsLength(alice, PoolId.unwrap(poolId));
        assertEq(posLenAfter, 0, "Alice positions should be 0 after remove");
        vm.stopPrank();
    }
}
