'use client';

import React, { useState } from 'react';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { formatUnits, parseUnits, type Address } from 'viem';
import { AlertTriangle, CheckCircle2, Gift, Layers, Loader2, TrendingUp, Zap } from 'lucide-react';
import { contracts, earnVaultAbi, erc20Abi, erc4626Abi } from '../config/contracts';
import { useVaultAction } from '../hooks/useVaultAction';

function display(value: bigint | undefined, decimals: number | undefined, digits = 4): string {
  if (value === undefined || decimals === undefined) return '--';
  const n = Number(formatUnits(value, decimals));
  if (Number.isNaN(n)) return formatUnits(value, decimals);
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export const EarnView: React.FC = () => {
  const { isConnected, address } = useAccount();
  const [amount, setAmount] = useState('');
  const [tab, setTab] = useState<'stake' | 'unstake'>('stake');

  const user = address as Address | undefined;
  const enabled = Boolean(user);

  // EarnVault is an ERC-4626 whose asset is vUSD and whose share is s1MOL.
  const { data: vaultData, refetch: refetchVault } = useReadContracts({
    contracts: [
      { address: contracts.earnVault, abi: erc4626Abi, functionName: 'totalAssets' },
      { address: contracts.earnVault, abi: erc4626Abi, functionName: 'decimals' },
      { address: contracts.earnVault, abi: earnVaultAbi, functionName: 'rewardRate' },
      { address: contracts.vUSD, abi: erc4626Abi, functionName: 'decimals' },
    ],
  });

  const totalStaked = vaultData?.[0]?.result as bigint | undefined;
  const shareDecimals = vaultData?.[1]?.result as number | undefined;
  const rewardRate = vaultData?.[2]?.result as bigint | undefined;
  const vUsdDecimals = vaultData?.[3]?.result as number | undefined;

  const { data: userData, refetch: refetchUser } = useReadContracts({
    contracts: [
      { address: contracts.vUSD, abi: erc4626Abi, functionName: 'balanceOf', args: [user ?? '0x0'] },
      { address: contracts.earnVault, abi: erc4626Abi, functionName: 'balanceOf', args: [user ?? '0x0'] },
      { address: contracts.earnVault, abi: earnVaultAbi, functionName: 'earned', args: [user ?? '0x0'] },
      { address: contracts.molToken, abi: erc20Abi, functionName: 'balanceOf', args: [user ?? '0x0'] },
    ],
    // Rewards stream per second, so poll rather than waiting for a tx.
    query: { enabled, refetchInterval: 10_000 },
  });

  const vUsdBalance = userData?.[0]?.result as bigint | undefined;
  const stakedShares = userData?.[1]?.result as bigint | undefined;
  const pendingReward = userData?.[2]?.result as bigint | undefined;
  const molBalance = userData?.[3]?.result as bigint | undefined;

  // What the user's s1MOL shares are currently worth in vUSD.
  const { data: stakedValue } = useReadContract({
    address: contracts.earnVault,
    abi: erc4626Abi,
    functionName: 'convertToAssets',
    args: [stakedShares ?? 0n],
    query: { enabled: stakedShares !== undefined },
  });

  const refetchAll = () => {
    void refetchVault();
    void refetchUser();
  };

  const action = useVaultAction(refetchAll);
  const claim = useVaultAction(refetchAll);

  const onSubmit = async () => {
    if (!user || !amount) return;

    if (tab === 'stake') {
      if (vUsdDecimals === undefined) return;
      const assets = parseUnits(amount, vUsdDecimals);
      const ok = await action.execute(
        { address: contracts.earnVault, abi: erc4626Abi, functionName: 'deposit', args: [assets, user] },
        { token: contracts.vUSD, spender: contracts.earnVault, amount: assets },
        `Staked ${amount} vUSD into the Layer 2 strategy.`
      );
      if (ok) setAmount('');
    } else {
      if (shareDecimals === undefined) return;
      const shares = parseUnits(amount, shareDecimals);
      // User is both caller and owner of the s1MOL shares, so no allowance.
      const ok = await action.execute(
        { address: contracts.earnVault, abi: erc4626Abi, functionName: 'redeem', args: [shares, user, user] },
        undefined,
        `Unstaked ${amount} s1MOL back to vUSD.`
      );
      if (ok) setAmount('');
    }
  };

  const onClaim = async () => {
    if (!user) return;
    await claim.execute(
      { address: contracts.earnVault, abi: earnVaultAbi, functionName: 'getReward', args: [] },
      undefined,
      'Claimed your accrued 1MOL rewards.'
    );
  };

  // Reward stream expressed per day, straight from the on-chain rate.
  const rewardsPerDay =
    rewardRate !== undefined ? Number(formatUnits(rewardRate, 18)) * 86_400 : undefined;

  const banner = (a: ReturnType<typeof useVaultAction>) => {
    if (!a.message) return null;
    const isError = a.status === 'error';
    return (
      <div
        className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${
          isError
            ? 'border-red-500/20 bg-red-500/10 text-red-300'
            : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
        }`}
      >
        {isError ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
        <span className="break-all">{a.message}</span>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Layer 2 header */}
      <div className="glass-panel relative overflow-hidden rounded-2xl p-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-molCream-400" />
              <h2 className="text-xl font-bold tracking-tight text-molCream-100">
                Layer 2: Boosted Restaking
              </h2>
              <span className="rounded-md bg-molCream-400/20 px-2 py-0.5 text-xs font-semibold text-molCream-300">
                Nested ERC-4626
              </span>
            </div>
            <p className="max-w-xl text-xs text-gray-300">
              Restake the <strong>vUSD</strong> you minted in Stake to receive <strong>s1MOL</strong>.
              You keep the Layer 1 share-price yield and additionally accrue streaming{' '}
              <strong>1MOL</strong> rewards.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-molCream-400/20 bg-molBrown-900/60 p-4">
              <div className="text-[11px] font-medium text-gray-400">Total Staked</div>
              <div className="font-mono text-xl font-black text-molCream-100">
                {display(totalStaked, vUsdDecimals, 2)}
              </div>
              <div className="text-[10px] text-gray-400">vUSD in strategy</div>
            </div>
            <div className="rounded-xl border border-molCream-400/20 bg-molBrown-900/60 p-4">
              <div className="text-[11px] font-medium text-gray-400">Reward Stream</div>
              <div className="font-mono text-xl font-black text-emerald-400">
                {rewardsPerDay !== undefined
                  ? rewardsPerDay.toLocaleString(undefined, { maximumFractionDigits: 2 })
                  : '--'}
              </div>
              <div className="text-[10px] text-gray-400">1MOL per day</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Stake / unstake panel */}
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-center justify-between border-b border-molCream-300/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-molCream-400/40 bg-molCream-500/20">
                <Zap className="h-5 w-5 text-molCream-300" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-molCream-100">Boosted Strategy</h3>
                <p className="text-xs text-gray-400">vUSD in &middot; s1MOL out</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">Your s1MOL</div>
              <div className="font-mono text-lg font-black text-molCream-200">
                {isConnected ? display(stakedShares, shareDecimals, 4) : '0.00'}
              </div>
            </div>
          </div>

          <div className="my-4 flex rounded-lg bg-black/40 p-1">
            {(['stake', 'unstake'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                  tab === t ? 'tab-active' : 'tab-inactive'
                }`}
              >
                {t === 'stake' ? 'Stake vUSD' : 'Unstake s1MOL'}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-molCream-300/15 bg-black/40 p-3.5">
              <div className="mb-1.5 flex items-center justify-between text-xs text-gray-400">
                <span>{tab === 'stake' ? 'Stake vUSD' : 'Unstake s1MOL'}</span>
                <span>
                  Balance:{' '}
                  {isConnected
                    ? tab === 'stake'
                      ? display(vUsdBalance, vUsdDecimals)
                      : display(stakedShares, shareDecimals)
                    : '0.00'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <input
                  type="number"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-transparent font-mono text-xl font-bold text-white outline-none placeholder-gray-600"
                />
                <button
                  onClick={() => {
                    const raw =
                      tab === 'stake'
                        ? { v: vUsdBalance, d: vUsdDecimals }
                        : { v: stakedShares, d: shareDecimals };
                    if (raw.v !== undefined && raw.d !== undefined) setAmount(formatUnits(raw.v, raw.d));
                  }}
                  className="rounded bg-molCream-500/20 px-2 py-1 text-[10px] font-bold text-molCream-300 hover:bg-molCream-500/30"
                >
                  MAX
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-molCream-300/10 bg-molBrown-900/30 p-2.5 text-xs text-gray-300">
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5 text-molCream-400" />
                Position value:
              </span>
              <span className="font-mono font-bold text-molCream-200">
                {display(stakedValue as bigint | undefined, vUsdDecimals, 4)} vUSD
              </span>
            </div>

            {banner(action)}

            <button
              onClick={onSubmit}
              disabled={!isConnected || action.isBusy || !amount}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
                !isConnected || action.isBusy || !amount
                  ? 'cursor-not-allowed bg-gray-700/50 text-gray-500'
                  : 'bg-gradient-to-r from-molCream-300 via-molCream-500 to-molBrown-500 text-molBrown-900 shadow-goldGlow hover:opacity-95'
              }`}
            >
              {action.isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {!isConnected
                ? 'Connect Wallet'
                : action.status === 'approving'
                ? 'Approving vUSD...'
                : action.status === 'pending'
                ? 'Confirming on chain...'
                : tab === 'stake'
                ? 'Stake vUSD & Mint s1MOL'
                : 'Unstake to vUSD'}
            </button>
          </div>
        </div>

        {/* Rewards panel */}
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-center justify-between border-b border-molCream-300/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/20">
                <Gift className="h-5 w-5 text-emerald-300" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-molCream-100">1MOL Rewards</h3>
                <p className="text-xs text-gray-400">Streaming, claim any time</p>
              </div>
            </div>
          </div>

          <div className="my-5 space-y-4">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="text-[11px] font-medium text-gray-400">Claimable now</div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-3xl font-black text-emerald-300">
                  {isConnected ? display(pendingReward, 18, 6) : '0.00'}
                </span>
                <span className="text-xs font-bold text-emerald-400">1MOL</span>
              </div>
              <div className="mt-1 text-[10px] text-gray-400">
                Accrues every second while your s1MOL is staked
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-black/30 p-4">
              <div className="text-[11px] font-medium text-gray-400">1MOL in wallet</div>
              <div className="font-mono text-xl font-black text-molCream-200">
                {isConnected ? display(molBalance, 18, 4) : '0.00'}
              </div>
            </div>

            {banner(claim)}

            <button
              onClick={onClaim}
              disabled={!isConnected || claim.isBusy || !pendingReward || pendingReward === 0n}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
                !isConnected || claim.isBusy || !pendingReward || pendingReward === 0n
                  ? 'cursor-not-allowed bg-gray-700/50 text-gray-500'
                  : 'bg-gradient-to-r from-emerald-400 to-emerald-600 text-emerald-950 hover:opacity-95'
              }`}
            >
              {claim.isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {!isConnected
                ? 'Connect Wallet'
                : claim.status === 'pending'
                ? 'Claiming...'
                : 'Claim 1MOL Rewards'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
