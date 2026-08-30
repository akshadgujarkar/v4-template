// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {MRLVToken} from "../src/MRLVToken.sol";
import {ScoutRoster} from "../src/fantasy-league/ScoutRoster.sol";
import {ScoutPointsOracle} from "../src/fantasy-league/ScoutPointsOracle.sol";
import {MEVScoutLeague} from "../src/fantasy-league/MEVScoutLeague.sol";

contract DeployFantasyLeague is Script {
    function run() external {
        // Default to Anvil's first account if no PRIVATE_KEY is provided
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployerAddress = vm.addr(deployerPrivateKey);

        console2.log("Deploying contracts with address:", deployerAddress);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy MRLV Token
        MRLVToken mrlv = new MRLVToken(deployerAddress);
        console2.log("MRLVToken deployed to:", address(mrlv));

        // 2. Predict MEVScoutLeague address to set it as owner of ScoutRoster
        uint256 nonce = vm.getNonce(deployerAddress);
        // Next nonce is for ScoutRoster, nonce + 1 is for MEVScoutLeague (assuming no other TXs in between)
        address predictedLeague = vm.computeCreateAddress(deployerAddress, nonce + 1);

        // 3. Deploy ScoutRoster
        ScoutRoster roster = new ScoutRoster(predictedLeague);
        console2.log("ScoutRoster deployed to:", address(roster));

        // 4. Deploy MEVScoutLeague
        MEVScoutLeague league = new MEVScoutLeague(mrlv, roster);
        console2.log("MEVScoutLeague deployed to:", address(league));

        require(address(league) == predictedLeague, "Address prediction failed");

        // 5. Deploy Oracle
        // We will use the deployer as the relayer for local testing
        ScoutPointsOracle oracle = new ScoutPointsOracle(deployerAddress, roster);
        console2.log("ScoutPointsOracle deployed to:", address(oracle));

        vm.stopBroadcast();

        // 6. Set Oracle in Roster (requires prank since onlyLeague can set it)
        // Note: For an actual live network deployment, MEVScoutLeague would need a method to call this,
        // or ScoutRoster would need to temporarily allow the deployer to set it.
        // For Anvil local testing, vm.prank works fine to configure the local state.
        vm.prank(address(league));
        roster.setPointsOracle(address(oracle));
        console2.log("Oracle configured in ScoutRoster (via vm.prank for Anvil environment)");
    }
}
