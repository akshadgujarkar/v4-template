// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import {BaseScript} from "./base/BaseScript.sol";

import {MRLVHook} from "../src/MRLVHook.sol";
import {MEVDetector} from "../src/MEVDetector.sol";
import {DynamicFeeManager} from "../src/DynamicFeeManager.sol";
import {AnalyticsEmitter} from "../src/AnalyticsEmitter.sol";

/// @notice Mines the address and deploys the MRLVHook.sol Hook contract
contract DeployHookScript is BaseScript {
    function run() public {
        // hook contracts must have specific flags encoded in the address
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

        vm.startBroadcast();
        address governance = msg.sender;
        address oracleRelayer = msg.sender;

        MEVDetector detector = new MEVDetector(governance, msg.sender, oracleRelayer);
        DynamicFeeManager feeManager = new DynamicFeeManager(governance, msg.sender);
        AnalyticsEmitter analytics = new AnalyticsEmitter(governance);
        vm.stopBroadcast();

        // Mine a salt that will produce a hook address with the correct flags
        bytes memory constructorArgs = abi.encode(poolManager, detector, feeManager, analytics, governance);
        (address hookAddress, bytes32 salt) =
            HookMiner.find(CREATE2_FACTORY, flags, type(MRLVHook).creationCode, constructorArgs);

        // Deploy the hook using CREATE2
        vm.startBroadcast();
        MRLVHook hook = new MRLVHook{salt: salt}(poolManager, detector, feeManager, analytics, governance);

        // Setup hook references
        detector.setHook(address(hook));
        feeManager.setHook(address(hook));
        analytics.setHook(address(hook));
        vm.stopBroadcast();

        require(address(hook) == hookAddress, "DeployHookScript: Hook Address Mismatch");
    }
}
