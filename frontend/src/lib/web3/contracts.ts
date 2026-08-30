import { Contract, Provider, Signer } from "ethers";
import {
  MRLVTokenABI,
  LoyaltyManagerABI,
  RewardVaultABI,
  MRLVHookABI,
  MEVScoutLeagueABI,
  LoyaltyNFTABI,
  MEVDetectorABI,
  DynamicFeeManagerABI,
  AnalyticsEmitterABI,
  ScoutRosterABI,
  ScoutPointsOracleABI,
  MockERC20ABI
} from "./abis";

export const POOL_MANAGER_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS_POOL_MANAGER || "0x202CCe504e04bEd6fC0521238dDf04Bc9E8E15aB";
export const SWAP_ROUTER_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS_SWAP_ROUTER || "0xf4B146FbA71F41E0592668ffbF264F1D186b2Ca8";
export const MODIFY_LIQUIDITY_ROUTER_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS_MODIFY_LIQUIDITY_ROUTER || "0x172076E0166D1F9Cc711C77Adf8488051744980C";
export const TOKEN0_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS_TOKEN0 || "0x4EE6eCAD1c2Dae9f525404De8555724e3c35d07B";
export const TOKEN1_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS_TOKEN1 || "0xBEc49fA140aCaA83533fB00A2BB19bDdd0290f25";
export const MRLV_TOKEN_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS_MRLV_TOKEN || "0xfbC22278A96299D91d41C453234d97b4F5Eb9B2d";
export const LOYALTY_NFT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS_LOYALTY_NFT || "0x46b142DD1E924FAb83eCc3c08e4D46E82f005e0E";
export const ANALYTICS_EMITTER_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS_ANALYTICS_EMITTER || "0xC9a43158891282A2B1475592D5719c001986Aaec";
export const MEV_DETECTOR_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS_MEV_DETECTOR || "0x1c85638e118b37167e9298c2268758e058DdfDA0";
export const DYNAMIC_FEE_MANAGER_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS_DYNAMIC_FEE_MANAGER || "0x367761085BF3C12e5DA2Df99AC6E1a824612b8fb";
export const MRLV_HOOK_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS_MRLV_HOOK || "0xc18C86551F55bBB78F0Ae8Ca771aDc25386bBfC0";
export const LOYALTY_MANAGER_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS_LOYALTY_MANAGER || "0x86A2EE8FAf9A840F7a2c64CA3d51209F9A02081D";
export const REWARD_VAULT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS_REWARD_VAULT || "0xAA292E8611aDF267e563f334Ee42320aC96D0463";
export const SCOUT_ROSTER_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS_SCOUT_ROSTER || "0xCace1b78160AE76398F486c8a18044da0d66d86D";
export const FANTASY_LEAGUE_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS_FANTASY_LEAGUE || "0xD5ac451B0c50B9476107823Af206eD814a2e2580";
export const SCOUT_POINTS_ORACLE_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS_SCOUT_POINTS_ORACLE || "0xF8e31cb472bc70500f08Cd84917E5A1912Ec8397";
export const POOL_ID = import.meta.env.VITE_POOL_ID || "0xa1d334006db3fbef3a2c0c4bff5e0e002d702fba9b08a708c156a5f6da26fd47";

export function getMRLVToken(providerOrSigner: Provider | Signer) {
  return new Contract(MRLV_TOKEN_ADDRESS, MRLVTokenABI, providerOrSigner);
}

export function getLoyaltyManager(providerOrSigner: Provider | Signer) {
  return new Contract(LOYALTY_MANAGER_ADDRESS, LoyaltyManagerABI, providerOrSigner);
}

export function getRewardVault(providerOrSigner: Provider | Signer) {
  return new Contract(REWARD_VAULT_ADDRESS, RewardVaultABI, providerOrSigner);
}

export function getMRLVHook(providerOrSigner: Provider | Signer) {
  return new Contract(MRLV_HOOK_ADDRESS, MRLVHookABI, providerOrSigner);
}

export function getFantasyLeague(providerOrSigner: Provider | Signer) {
  return new Contract(FANTASY_LEAGUE_ADDRESS, MEVScoutLeagueABI, providerOrSigner);
}

export function getLoyaltyNFT(providerOrSigner: Provider | Signer) {
  return new Contract(LOYALTY_NFT_ADDRESS, LoyaltyNFTABI, providerOrSigner);
}

export function getMEVDetector(providerOrSigner: Provider | Signer) {
  return new Contract(MEV_DETECTOR_ADDRESS, MEVDetectorABI, providerOrSigner);
}

export function getDynamicFeeManager(providerOrSigner: Provider | Signer) {
  return new Contract(DYNAMIC_FEE_MANAGER_ADDRESS, DynamicFeeManagerABI, providerOrSigner);
}

export function getAnalyticsEmitter(providerOrSigner: Provider | Signer) {
  return new Contract(ANALYTICS_EMITTER_ADDRESS, AnalyticsEmitterABI, providerOrSigner);
}

export function getScoutRoster(providerOrSigner: Provider | Signer) {
  return new Contract(SCOUT_ROSTER_ADDRESS, ScoutRosterABI, providerOrSigner);
}

export function getScoutPointsOracle(providerOrSigner: Provider | Signer) {
  return new Contract(SCOUT_POINTS_ORACLE_ADDRESS, ScoutPointsOracleABI, providerOrSigner);
}

export function getToken0(providerOrSigner: Provider | Signer) {
  return new Contract(TOKEN0_ADDRESS, MockERC20ABI, providerOrSigner);
}

export function getToken1(providerOrSigner: Provider | Signer) {
  return new Contract(TOKEN1_ADDRESS, MockERC20ABI, providerOrSigner);
}

const PoolSwapTestABI = [
  "function swap(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, tuple(bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96) params, tuple(bool takeClaims, bool settleUsingBurn) testSettings, bytes hookData) external payable returns (int256 delta)"
];

export function getSwapRouter(providerOrSigner: Provider | Signer) {
  return new Contract(SWAP_ROUTER_ADDRESS, PoolSwapTestABI, providerOrSigner);
}

const PoolModifyLiquidityTestABI = [
  "function modifyLiquidity(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, tuple(int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt) params, bytes hookData) external payable returns (tuple(int128 amount0, int128 amount1) delta)"
];

export function getModifyLiquidityRouter(providerOrSigner: Provider | Signer) {
  return new Contract(MODIFY_LIQUIDITY_ROUTER_ADDRESS, PoolModifyLiquidityTestABI, providerOrSigner);
}

export interface PendingPosData {
  key: string;
  owner: string;
  amount0: string;
  amount1: string;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  blockNumber: number;
  blocksElapsed: number;
  isMature: boolean;
  activated: boolean;
  withdrawn: boolean;
}
