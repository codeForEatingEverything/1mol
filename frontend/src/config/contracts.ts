import type { Address } from 'viem';

/**
 * Addresses come from NEXT_PUBLIC_* env vars, which `contracts/scripts/deploy.ts`
 * writes into frontend/.env.local. The defaults are the deterministic Hardhat
 * addresses for a fresh local deploy, so `hardhat node` + deploy + `next dev`
 * works with no manual wiring.
 */
const env = (key: string, fallback: string): Address =>
  ((process.env[key] as Address | undefined) ?? (fallback as Address));

export const contracts = {
  vUSD: env('NEXT_PUBLIC_VUSD_ADDRESS', '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9'),
  stableVault: env('NEXT_PUBLIC_STABLE_VAULT_ADDRESS', '0x0165878A594ca255338adfa4d48449f69242Eb8F'),
  majorVault: env('NEXT_PUBLIC_MAJOR_VAULT_ADDRESS', '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6'),
  earnVault: env('NEXT_PUBLIC_EARN_VAULT_ADDRESS', '0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e'),
  molToken: env('NEXT_PUBLIC_MOL_TOKEN_ADDRESS', '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707'),
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
