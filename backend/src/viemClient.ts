import { createPublicClient, http, formatUnits, Address } from 'viem';
import { hardhat } from 'viem/chains';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Minimal ERC-4626 surface. Both vUSD (Layer 1) and EarnVault (Layer 2) are
 * standard OpenZeppelin ERC-4626 vaults, so a single ABI covers both.
 */
export const erc4626Abi = [
  { type: 'function', name: 'asset', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'totalAssets', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'convertToAssets', inputs: [{ name: 'shares', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
] as const;

/** EarnVault adds streaming 1MOL rewards on top of the ERC-4626 base. */
export const earnVaultAbi = [
  ...erc4626Abi,
  { type: 'function', name: 'earned', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'rewardRate', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'periodFinish', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

export const erc20Abi = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
] as const;

export const gatewayAbi = [
  { type: 'function', name: 'getSupportedTokens', inputs: [], outputs: [{ type: 'address[]' }], stateMutability: 'view' },
  { type: 'function', name: 'getSupportedAssets', inputs: [], outputs: [{ type: 'address[]' }], stateMutability: 'view' },
] as const;

const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';

export const publicClient = createPublicClient({
  chain: hardhat,
  transport: http(rpcUrl),
});

export interface Deployments {
  vUSD?: string;
  MolToken?: string;
  StableVault?: string;
  MajorVault?: string;
  EarnVault?: string;
  tokens?: Record<string, string>;
}

/**
 * Addresses are written by `contracts/scripts/deploy.ts`. When the file is
 * absent the service still answers, but reports `chainConnected: false` rather
 * than inventing numbers.
 */
export function loadDeployments(): Deployments {
  try {
    const p = path.resolve(__dirname, '../../contracts/deployments.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    /* fall through to empty deployments */
  }
  return {};
}

export const deployments = loadDeployments();

/** Underlying asset decimals for vUSD (USDC = 6). Cached after first read. */
let assetDecimalsCache: number | undefined;

async function getAssetDecimals(vault: Address): Promise<number> {
  if (assetDecimalsCache !== undefined) return assetDecimalsCache;
  const asset = await publicClient.readContract({ address: vault, abi: erc4626Abi, functionName: 'asset' });
  const decimals = await publicClient.readContract({ address: asset, abi: erc20Abi, functionName: 'decimals' });
  assetDecimalsCache = Number(decimals);
  return assetDecimalsCache;
}

export async function getVaultsOverview() {
  const d = loadDeployments();

  if (!d.vUSD || !d.EarnVault) {
    return {
      chainConnected: false,
      reason: 'contracts/deployments.json not found - run `npm run deploy` against a node first',
      stake: null,
      earn: null,
    };
  }

  try {
    const vUsdAddress = d.vUSD as Address;
    const earnAddress = d.EarnVault as Address;
    const assetDecimals = await getAssetDecimals(vUsdAddress);

    // Layer 1 TVL is the ERC-4626 vault's underlying holdings.
    const [layer1Assets, layer1Shares, layer2Assets, rewardRate] = await Promise.all([
      publicClient.readContract({ address: vUsdAddress, abi: erc4626Abi, functionName: 'totalAssets' }),
      publicClient.readContract({ address: vUsdAddress, abi: erc4626Abi, functionName: 'totalSupply' }),
      publicClient.readContract({ address: earnAddress, abi: erc4626Abi, functionName: 'totalAssets' }),
      publicClient.readContract({ address: earnAddress, abi: earnVaultAbi, functionName: 'rewardRate' }),
    ]);

    // Share price: assets returned for 1 whole vUSD share.
    const oneShare = 10n ** 18n;
    const sharePrice = await publicClient.readContract({
      address: vUsdAddress,
      abi: erc4626Abi,
      functionName: 'convertToAssets',
      args: [oneShare],
    });

    // Layer 2 holds vUSD shares; value them through the Layer 1 vault.
    const layer2UnderlyingValue = await publicClient.readContract({
      address: vUsdAddress,
      abi: erc4626Abi,
      functionName: 'convertToAssets',
      args: [layer2Assets],
    });

    return {
      chainConnected: true,
      stake: {
        stableVault: {
          name: '1mol Stablecoin Vault',
          supportedTokens: ['USDC', 'USDT'],
          tvlUSD: formatUnits(layer1Assets, assetDecimals),
          outputToken: 'vUSD',
          address: d.StableVault ?? null,
        },
        majorVault: {
          name: '1mol Major Asset Vault',
          supportedTokens: ['WETH', 'WBTC'],
          tvlUSD: formatUnits(layer1Assets, assetDecimals),
          outputToken: 'vUSD',
          address: d.MajorVault ?? null,
        },
      },
      earn: {
        boostedVault: {
          name: '1mol Layer 2 Boosted Strategy',
          stakedToken: 'vUSD',
          shareToken: 's1MOL',
          rewardToken: '1MOL',
          stakedShares: formatUnits(layer2Assets, 18),
          tvlUSD: formatUnits(layer2UnderlyingValue, assetDecimals),
          rewardRatePerSecond: formatUnits(rewardRate, 18),
          address: d.EarnVault,
        },
      },
      vUsd: {
        address: vUsdAddress,
        totalAssets: formatUnits(layer1Assets, assetDecimals),
        totalShares: formatUnits(layer1Shares, 18),
        sharePrice: formatUnits(sharePrice, assetDecimals),
      },
    };
  } catch (error: any) {
    return { chainConnected: false, reason: error.shortMessage ?? error.message, stake: null, earn: null };
  }
}

export async function getUserOverview(userAddress: Address) {
  const d = loadDeployments();

  if (!d.vUSD || !d.EarnVault) {
    return {
      userAddress,
      chainConnected: false,
      reason: 'contracts/deployments.json not found - run `npm run deploy` against a node first',
    };
  }

  try {
    const vUsdAddress = d.vUSD as Address;
    const earnAddress = d.EarnVault as Address;
    const assetDecimals = await getAssetDecimals(vUsdAddress);

    const [vUsdShares, earnShares, pendingReward] = await Promise.all([
      publicClient.readContract({ address: vUsdAddress, abi: erc4626Abi, functionName: 'balanceOf', args: [userAddress] }),
      publicClient.readContract({ address: earnAddress, abi: erc4626Abi, functionName: 'balanceOf', args: [userAddress] }),
      publicClient.readContract({ address: earnAddress, abi: earnVaultAbi, functionName: 'earned', args: [userAddress] }),
    ]);

    // Redeemable underlying for the user's Layer 1 shares.
    const vUsdValue = await publicClient.readContract({
      address: vUsdAddress,
      abi: erc4626Abi,
      functionName: 'convertToAssets',
      args: [vUsdShares],
    });

    // Layer 2 shares -> vUSD shares -> underlying USD.
    const earnVUsd = await publicClient.readContract({
      address: earnAddress,
      abi: erc4626Abi,
      functionName: 'convertToAssets',
      args: [earnShares],
    });
    const earnValue = await publicClient.readContract({
      address: vUsdAddress,
      abi: erc4626Abi,
      functionName: 'convertToAssets',
      args: [earnVUsd],
    });

    return {
      userAddress,
      chainConnected: true,
      vUsdBalance: formatUnits(vUsdShares, 18),
      vUsdValueUSD: formatUnits(vUsdValue, assetDecimals),
      earnStakedBalance: formatUnits(earnShares, 18),
      earnStakedValueUSD: formatUnits(earnValue, assetDecimals),
      pendingReward: formatUnits(pendingReward, 18),
    };
  } catch (error: any) {
    return { userAddress, chainConnected: false, reason: error.shortMessage ?? error.message };
  }
}
