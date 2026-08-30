// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {Vm} from "forge-std/Vm.sol";

import {MRLVHook} from "../src/MRLVHook.sol";
import {MEVDetector} from "../src/MEVDetector.sol";
import {DynamicFeeManager} from "../src/DynamicFeeManager.sol";
import {AnalyticsEmitter} from "../src/AnalyticsEmitter.sol";

// ==========================================
// Minimal ERC20 for Testing
// ==========================================
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        if (allowance[from][msg.sender] != type(uint256).max) {
            require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

// ==========================================
// Demo Helpers (Resolves Anvil Broadcast Issues)
// ==========================================
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
}

contract AttackerHelper {
    function attack(
        PoolSwapTest swapRouter, 
        PoolKey calldata key, 
        SwapParams calldata swap1, 
        SwapParams calldata swap2, 
        MockERC20 token0, 
        MockERC20 token1
    ) external {
        token0.transferFrom(msg.sender, address(this), 10000 ether);
        token1.transferFrom(msg.sender, address(this), 10000 ether);
        token0.approve(address(swapRouter), type(uint256).max);
        token1.approve(address(swapRouter), type(uint256).max);
        
        swapRouter.swap(key, swap1, PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}), "");
        swapRouter.swap(key, swap2, PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}), "");
    }
}

// ==========================================
// Local Demo Script
// ==========================================
/*
 * @title LocalDemo
 * @notice Single-file Foundry script to deploy MRLV on a local Anvil node and demonstrate MEV detection.
 * @dev Usage:
 *      1. Start anvil in a separate terminal: `anvil`
 *      2. Run this script: `forge script script/LocalDemo.s.sol --rpc-url http://127.0.0.1:8545 --broadcast`
 *
 * This script uses Foundry's default Anvil keys:
 *  - Account 0: Deployer & LP (provides initial liquidity)
 *  - Account 1: Normal Trader (executes normal swap)
 *  - Account 2: Attacker (executes same-block reversal)
 */
contract DeployMRLV is Script {
    using PoolIdLibrary for PoolKey;

    function run() public {
        console2.log("==========================================");
        console2.log("Starting MRLV Demo Deployment");
        console2.log("==========================================");

        // === STEP 3: Setup Demo Accounts ===
        // WARNING: These are well-known, publicly documented Anvil test keys.
        // They are safe ONLY for local/ephemeral chains and MUST NEVER be used on mainnet.
        string memory mnemonic = "test test test test test test test test test test test junk";
        
        uint256 lpKey = vm.deriveKey(mnemonic, 0);
        address lp = vm.addr(lpKey);

        uint256 traderKey = vm.deriveKey(mnemonic, 1);
        address trader = vm.addr(traderKey);

        uint256 attackerKey = vm.deriveKey(mnemonic, 2);
        address attacker = vm.addr(attackerKey);

        console2.log("Assigned Roles:");
        console2.log(" - LP/Deployer   (Account 0):", lp);
        console2.log(" - Normal Trader (Account 1):", trader);
        console2.log(" - Attacker      (Account 2):", attacker);
        console2.log("------------------------------------------");

        // === STEP 1: Deploy Core Infrastructure ===
        vm.startBroadcast(lpKey);
        
        IPoolManager poolManager;
        try new PoolManager(address(0)) returns (PoolManager pm) {
            poolManager = IPoolManager(address(pm));
        } catch {
            poolManager = IPoolManager(address(new PoolManager(address(0))));
        }
        console2.log("PoolManager deployed at:      ", address(poolManager));

        PoolSwapTest swapRouter = new PoolSwapTest(poolManager);
        console2.log("PoolSwapTest deployed at:     ", address(swapRouter));

        PoolModifyLiquidityTest modifyLiquidityRouter = new PoolModifyLiquidityTest(poolManager);
        console2.log("PoolModifyLiquidity deployed: ", address(modifyLiquidityRouter));

        address governance = lp;
        address oracleRelayer = lp;

        MEVDetector detector = new MEVDetector(governance, address(0), oracleRelayer);
        DynamicFeeManager feeManager = new DynamicFeeManager(governance, address(0));
        AnalyticsEmitter analytics = new AnalyticsEmitter(governance);

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
            governance
        );
        require(address(hook) == hookAddr, "Hook address mismatch");
        console2.log("MRLVHook deployed at:         ", address(hook));

        detector.setHook(address(hook));
        feeManager.setHook(address(hook));
        analytics.setHook(address(hook));
        console2.log("------------------------------------------");

        // === STEP 2: Deploy test tokens ===
        MockERC20 tokenA = new MockERC20("Token A", "TKNA");
        MockERC20 tokenB = new MockERC20("Token B", "TKNB");
        
        // V4 requires token0 < token1
        (MockERC20 token0, MockERC20 token1) = address(tokenA) < address(tokenB) 
            ? (tokenA, tokenB) 
            : (tokenB, tokenA);

        console2.log("Token0 (TKNA/B) deployed at:  ", address(token0));
        console2.log("Token1 (TKNA/B) deployed at:  ", address(token1));

        // === STEP 3 (cont): Mint Tokens ===
        token0.mint(lp, 1_000_000 ether);
        token1.mint(lp, 1_000_000 ether);

        token0.mint(trader, 10_000 ether);
        token1.mint(trader, 10_000 ether);

        token0.mint(attacker, 100_000 ether);
        token1.mint(attacker, 100_000 ether);

        // === STEP 4: Approve tokens ===
        // LP Approvals
        token0.approve(address(hook), type(uint256).max);
        token1.approve(address(hook), type(uint256).max);
        token0.approve(address(swapRouter), type(uint256).max);
        token1.approve(address(swapRouter), type(uint256).max);
        token0.approve(address(modifyLiquidityRouter), type(uint256).max);
        token1.approve(address(modifyLiquidityRouter), type(uint256).max);

        // === STEP 5: Initialize the Pool ===
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token1)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        bytes32 poolId = PoolId.unwrap(key.toId());
        
        uint160 startingPrice = TickMath.getSqrtPriceAtTick(0);
        poolManager.initialize(key, startingPrice);
        console2.log("Pool Initialized. PoolId:");
        console2.logBytes32(poolId);
        console2.log("------------------------------------------");

        // === STEP 6: Add Initial Liquidity ===
        // WORKAROUND: In a live network / Anvil script, block progression works differently than 
        // tests using `vm.roll`. We temporarily set liquidity maturity to 0 to bypass the 
        // 5-block escrow delay for this initial setup liquidity.
        detector.setLiquidityMaturityBlocks(0);

        ModifyLiquidityParams memory lpParams = ModifyLiquidityParams({
            tickLower: -6000,
            tickUpper: 6000,
            liquidityDelta: 100000 ether,
            salt: 0
        });

        LiquiditySetupHelper lpHelper = new LiquiditySetupHelper();
        token0.approve(address(lpHelper), type(uint256).max);
        token1.approve(address(lpHelper), type(uint256).max);
        
        lpHelper.setup(hook, key, lpParams, 100000 ether, 100000 ether, token0, token1);

        detector.setLiquidityMaturityBlocks(5); // Restore
        console2.log("Initial liquidity added (Workaround applied via helper).");
        vm.stopBroadcast();


        // We will enable log recording to parse the AnalyticsEmitter events
        vm.recordLogs();

        // === STEP 7: Normal Swap ===
        vm.startBroadcast(traderKey);
        token0.approve(address(swapRouter), type(uint256).max);
        token1.approve(address(swapRouter), type(uint256).max);

        SwapParams memory normalSwapParams = SwapParams({
            zeroForOne: true,
            amountSpecified: -1 ether,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        
        swapRouter.swap(key, normalSwapParams, PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}), "");
        vm.stopBroadcast();
        
        _printLastSwapLog("Normal Swap (Account 1)");

        // === STEP 8: Attacker Reversal Swap ===
        vm.startBroadcast(attackerKey);
        
        SwapParams memory attackSwap1 = SwapParams({
            zeroForOne: true,
            amountSpecified: -1 ether,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        
        // This second swap in the opposite direction from the same account triggers the reversal penalty
        SwapParams memory attackSwap2 = SwapParams({
            zeroForOne: false,
            amountSpecified: -1 ether,
            sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1
        });
        
        AttackerHelper attackHelper = new AttackerHelper();
        token0.approve(address(attackHelper), type(uint256).max);
        token1.approve(address(attackHelper), type(uint256).max);
        
        attackHelper.attack(swapRouter, key, attackSwap1, attackSwap2, token0, token1);
        vm.stopBroadcast();

        _printLastSwapLog("Attacker Sequence (Account 2)");
        
        console2.log("==========================================");
        console2.log("Demo Completed Successfully!");
        console2.log("==========================================");
    }

    // Helper to extract and print the SwapProcessed event from the recorded logs
    function _printLastSwapLog(string memory label) internal {
        Vm.Log[] memory entries = vm.getRecordedLogs();
        
        // SwapProcessed signature:
        // event SwapProcessed(bytes32 indexed poolId, address indexed trader, uint24 appliedFee, uint256 riskScore);
        bytes32 targetTopic = keccak256("SwapProcessed(bytes32,address,uint24,uint256)");
        
        for (uint i = entries.length; i > 0; i--) {
            if (entries[i-1].topics.length > 0 && entries[i-1].topics[0] == targetTopic) {
                (uint24 appliedFee, uint256 riskScore) = abi.decode(entries[i-1].data, (uint24, uint256));
                
                console2.log(label);
                console2.log("  -> Risk Score: ", riskScore);
                console2.log("  -> Applied Fee:", appliedFee);
                console2.log("------------------------------------------");
                return;
            }
        }
        
        console2.log(label);
        console2.log("  -> [Could not find SwapProcessed event in logs]");
        console2.log("------------------------------------------");
    }
}
