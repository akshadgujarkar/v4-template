pragma solidity ^0.8.26;
import "forge-std/Script.sol";
import {MEVScoutLeague} from "../src/fantasy-league/MEVScoutLeague.sol";
import {ScoutRoster} from "../src/fantasy-league/ScoutRoster.sol";
import {MRLVToken} from "../src/MRLVToken.sol";
contract DebugLeague is Script {
    function run() external {
        uint256 pk = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        address deployer = vm.addr(pk);
        vm.startBroadcast(pk);
        MRLVToken mrlvToken = new MRLVToken(deployer);
        ScoutRoster roster = new ScoutRoster(deployer);
        console2.log("Deploying League...");
        new MEVScoutLeague(mrlvToken, roster);
        console2.log("League deployed successfully");
        vm.stopBroadcast();
    }
}
