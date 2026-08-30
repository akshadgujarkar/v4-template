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


export const POOL_MANAGER_ADDRESS =
  import.meta.env["VITE_CONTRACT_ADDRESS_POOL_MANAGER"];

export const SWAP_ROUTER_ADDRESS =
  import.meta.env["VITE_CONTRACT_ADDRESS_SWAP_ROUTER"];

export const MODIFY_LIQUIDITY_ROUTER_ADDRESS =
  import.meta.env["VITE_CONTRACT_ADDRESS_MODIFY_LIQUIDITY_ROUTER"];

export const TOKEN0_ADDRESS =
  import.meta.env["VITE_CONTRACT_ADDRESS_TOKEN0"];

export const TOKEN1_ADDRESS =
  import.meta.env["VITE_CONTRACT_ADDRESS_TOKEN1"];

export const MRLV_TOKEN_ADDRESS =
  import.meta.env["VITE_CONTRACT_ADDRESS_MRLV_TOKEN"];

export const LOYALTY_NFT_ADDRESS =
  import.meta.env["VITE_CONTRACT_ADDRESS_LOYALTY_NFT"];

export const ANALYTICS_EMITTER_ADDRESS =
  import.meta.env["VITE_CONTRACT_ADDRESS_ANALYTICS_EMITTER"];

export const MEV_DETECTOR_ADDRESS =
  import.meta.env["VITE_CONTRACT_ADDRESS_MEV_DETECTOR"];

export const DYNAMIC_FEE_MANAGER_ADDRESS =
  import.meta.env["VITE_CONTRACT_ADDRESS_DYNAMIC_FEE_MANAGER"];

export const MRLV_HOOK_ADDRESS =
  import.meta.env["VITE_CONTRACT_ADDRESS_MRLV_HOOK"];

export const LOYALTY_MANAGER_ADDRESS =
  import.meta.env["VITE_CONTRACT_ADDRESS_LOYALTY_MANAGER"];

export const REWARD_VAULT_ADDRESS =
  import.meta.env["VITE_CONTRACT_ADDRESS_REWARD_VAULT"];

export const SCOUT_ROSTER_ADDRESS =
  import.meta.env["VITE_CONTRACT_ADDRESS_SCOUT_ROSTER"];

export const FANTASY_LEAGUE_ADDRESS =
  import.meta.env["VITE_CONTRACT_ADDRESS_FANTASY_LEAGUE"];

export const SCOUT_POINTS_ORACLE_ADDRESS =
  import.meta.env["VITE_CONTRACT_ADDRESS_SCOUT_POINTS_ORACLE"];

export const POOL_ID =
  import.meta.env["VITE_POOL_ID"];

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
