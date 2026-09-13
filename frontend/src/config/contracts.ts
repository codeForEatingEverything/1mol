import type { Address } from 'viem';

/**
 * Addresses come from NEXT_PUBLIC_* env vars, which `contracts/scripts/deploy.ts`
 * writes into frontend/.env.local. The defaults are the deterministic Hardhat
 * addresses for a fresh local deploy, so `hardhat node` + deploy + `next dev`
 * works with no manual wiring.
 */
const env = (key: string, fallback: string): Address =>
  ((process.env[key] as Address | undefined) ?? (fallback as Address));

/** True once a real deployment has been wired in for the active network. */
export const isConfigured = (addr: Address) =>
  addr !== '0x0000000000000000000000000000000000000000';

export const contracts = {
  vUSD: env('NEXT_PUBLIC_VUSD_ADDRESS', '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9'),
  stableVault: env('NEXT_PUBLIC_STABLE_VAULT_ADDRESS', '0x0165878A594ca255338adfa4d48449f69242Eb8F'),
  majorVault: env('NEXT_PUBLIC_MAJOR_VAULT_ADDRESS', '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6'),
  earnVault: env('NEXT_PUBLIC_EARN_VAULT_ADDRESS', '0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e'),
  molToken: env('NEXT_PUBLIC_MOL_TOKEN_ADDRESS', '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707'),
  loyaltyEngine: env('NEXT_PUBLIC_LOYALTY_ENGINE_ADDRESS', '0x0000000000000000000000000000000000000000'),
  safetyReserve: env('NEXT_PUBLIC_SAFETY_RESERVE_ADDRESS', '0x0000000000000000000000000000000000000000'),
  aquaStrategyManager: env('NEXT_PUBLIC_AQUA_MANAGER_ADDRESS', '0x0000000000000000000000000000000000000000'),
  tokens: {
    USDC: env('NEXT_PUBLIC_USDC_ADDRESS', '0x5FbDB2315678afecb367f032d93F642f64180aa3'),
    USDT: env('NEXT_PUBLIC_USDT_ADDRESS', '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'),
    WETH: env('NEXT_PUBLIC_WETH_ADDRESS', '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'),
    WBTC: env('NEXT_PUBLIC_WBTC_ADDRESS', '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9'),
  },
} as const;

export type StableSymbol = 'USDC' | 'USDT';
export type MajorSymbol = 'WETH' | 'WBTC';

export const erc20Abi = [
  { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

/** Shared by vUSD (Layer 1) and EarnVault (Layer 2) - both are OZ ERC-4626. */
export const erc4626Abi = [
  ...erc20Abi,
  { type: 'function', name: 'asset', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'totalAssets', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'convertToAssets', inputs: [{ name: 'shares', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'convertToShares', inputs: [{ name: 'assets', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'previewDeposit', inputs: [{ name: 'assets', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'previewRedeem', inputs: [{ name: 'shares', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'deposit', inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'redeem', inputs: [{ name: 'shares', type: 'uint256' }, { name: 'receiver', type: 'address' }, { name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
] as const;

export const stableVaultAbi = [
  { type: 'function', name: 'deposit', inputs: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'isSupportedToken', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
] as const;

export const majorVaultAbi = [
  { type: 'function', name: 'deposit', inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'withdraw', inputs: [{ name: 'asset', type: 'address' }, { name: 'shares', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  {
    type: 'function',
    name: 'supportedAssets',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'isSupported', type: 'bool' },
      { name: 'decimals', type: 'uint8' },
      { name: 'priceUSD', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
] as const;

export const earnVaultAbi = [
  ...erc4626Abi,
  { type: 'function', name: 'earned', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'rewardRate', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getReward', inputs: [], outputs: [], stateMutability: 'nonpayable' },
] as const;

/** 1inch Aqua registry - the same address on every supported mainnet. */
export const AQUA_REGISTRY = '0x1111113ccf1426a8e30e2bff5e005d929bf6a90a' as const;
export const SWAPVM_ROUTER = '0x111111338c5091e8440b67b168bae16a668ac0de' as const;

export const loyaltyEngineAbi = [
  { type: 'function', name: 'totalMultiplier', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'tenureMultiplier', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'riskWeightOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'emissionShareBps', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'loyaltyPowerOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalLoyaltyPower', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'restakeMultiplier', inputs: [], outputs: [{ type: 'uint64' }], stateMutability: 'view' },
  {
    type: 'function',
    name: 'positions',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'principal', type: 'uint256' },
      { name: 'tierMask', type: 'uint8' },
      { name: 'since', type: 'uint64' },
      { name: 'restaked', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tiers',
    inputs: [{ name: '', type: 'uint8' }],
    outputs: [
      { name: 'enabled', type: 'bool' },
      { name: 'riskWeight', type: 'uint64' },
    ],
    stateMutability: 'view',
  },
] as const;

export const safetyReserveAbi = [
  { type: 'function', name: 'available', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'coverageRatioBps', inputs: [{ name: 'vaultAssets', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalCovered', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

export const aquaManagerAbi = [
  { type: 'function', name: 'activeStrategyCount', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getStrategies', inputs: [], outputs: [{ type: 'address[]' }], stateMutability: 'view' },
  { type: 'function', name: 'globalCapBps', inputs: [], outputs: [{ type: 'uint16' }], stateMutability: 'view' },
] as const;

/**
 * Pool types a deposit can be delegated to. Both are optional and neither
 * comes before the other - they are different kinds of market, not tiers.
 *
 * Aqua does not split a delegated balance, so a balance allowed into more than
 * one pool quotes at full size in each of them. That is what the multi-pool
 * option below prices: more concurrent exposure on the same principal.
 */
export const POOLS = [
  { bit: 1, label: 'Stablecoin pool', detail: 'USDC / USDT pairs', weight: '1.0x' },
  { bit: 2, label: 'Major pool', detail: 'BTC / ETH pairs', weight: '1.8x' },
  { bit: 4, label: 'Long-tail pool', detail: 'Higher variance pairs', weight: '3.5x' },
] as const;
