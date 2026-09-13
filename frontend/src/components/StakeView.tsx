'use client';

import React, { useMemo, useState } from 'react';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { formatUnits, parseUnits, type Address } from 'viem';
import { AlertTriangle, ArrowDownUp, CheckCircle2, Coins, Loader2, Sparkles } from 'lucide-react';
import {
  contracts,
  erc20Abi,
  erc4626Abi,
  majorVaultAbi,
  stableVaultAbi,
  type MajorSymbol,
  type StableSymbol,
} from '../config/contracts';
import { useVaultAction } from '../hooks/useVaultAction';

/** Formats a raw on-chain amount for display without losing small balances. */
function display(value: bigint | undefined, decimals: number | undefined, digits = 4): string {
  if (value === undefined || decimals === undefined) return '--';
  const formatted = formatUnits(value, decimals);
  const n = Number(formatted);
  if (Number.isNaN(n)) return formatted;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export const StakeView: React.FC = () => {
  const { isConnected, address } = useAccount();

  const [stableToken, setStableToken] = useState<StableSymbol>('USDC');
  const [stableAmount, setStableAmount] = useState('');
  const [stableTab, setStableTab] = useState<'deposit' | 'withdraw'>('deposit');

  const [majorToken, setMajorToken] = useState<MajorSymbol>('WETH');
  const [majorAmount, setMajorAmount] = useState('');
  const [majorTab, setMajorTab] = useState<'deposit' | 'withdraw'>('deposit');

  const user = address as Address | undefined;
  const enabled = Boolean(user);

  // --- Layer 1 vault state, read straight from the ERC-4626 vault ---
  const { data: vaultData, refetch: refetchVault } = useReadContracts({
    contracts: [
      { address: contracts.vUSD, abi: erc4626Abi, functionName: 'totalAssets' },
      { address: contracts.vUSD, abi: erc4626Abi, functionName: 'decimals' },
      { address: contracts.vUSD, abi: erc4626Abi, functionName: 'asset' },
    ],
  });

  const vUsdTotalAssets = vaultData?.[0]?.result as bigint | undefined;
  const vUsdDecimals = vaultData?.[1]?.result as number | undefined;
  const underlyingAsset = vaultData?.[2]?.result as Address | undefined;

  const { data: underlyingDecimals } = useReadContract({
    address: underlyingAsset,
    abi: erc20Abi,
    functionName: 'decimals',
    query: { enabled: Boolean(underlyingAsset) },
  });

  // One whole share, used to show the live vUSD share price.
  const { data: sharePrice } = useReadContract({
    address: contracts.vUSD,
    abi: erc4626Abi,
    functionName: 'convertToAssets',
    args: [vUsdDecimals !== undefined ? 10n ** BigInt(vUsdDecimals) : 0n],
    query: { enabled: vUsdDecimals !== undefined },
  });

  // --- User balances ---
  const { data: userData, refetch: refetchUser } = useReadContracts({
    contracts: [
      { address: contracts.vUSD, abi: erc4626Abi, functionName: 'balanceOf', args: [user ?? '0x0'] },
      { address: contracts.tokens.USDC, abi: erc20Abi, functionName: 'balanceOf', args: [user ?? '0x0'] },
      { address: contracts.tokens.USDC, abi: erc20Abi, functionName: 'decimals' },
      { address: contracts.tokens.USDT, abi: erc20Abi, functionName: 'balanceOf', args: [user ?? '0x0'] },
      { address: contracts.tokens.USDT, abi: erc20Abi, functionName: 'decimals' },
      { address: contracts.tokens.WETH, abi: erc20Abi, functionName: 'balanceOf', args: [user ?? '0x0'] },
      { address: contracts.tokens.WETH, abi: erc20Abi, functionName: 'decimals' },
      { address: contracts.tokens.WBTC, abi: erc20Abi, functionName: 'balanceOf', args: [user ?? '0x0'] },
      { address: contracts.tokens.WBTC, abi: erc20Abi, functionName: 'decimals' },
    ],
    query: { enabled },
  });

  const vUsdBalance = userData?.[0]?.result as bigint | undefined;

  const tokenState = useMemo(
    () => ({
      USDC: { balance: userData?.[1]?.result as bigint | undefined, decimals: userData?.[2]?.result as number | undefined, address: contracts.tokens.USDC },
      USDT: { balance: userData?.[3]?.result as bigint | undefined, decimals: userData?.[4]?.result as number | undefined, address: contracts.tokens.USDT },
      WETH: { balance: userData?.[5]?.result as bigint | undefined, decimals: userData?.[6]?.result as number | undefined, address: contracts.tokens.WETH },
      WBTC: { balance: userData?.[7]?.result as bigint | undefined, decimals: userData?.[8]?.result as number | undefined, address: contracts.tokens.WBTC },
    }),
    [userData]
  );

  // Oracle price the MajorVault will actually use for the selected asset.
  const { data: majorConfig } = useReadContract({
    address: contracts.majorVault,
    abi: majorVaultAbi,
    functionName: 'supportedAssets',
    args: [tokenState[majorToken].address],
  });
  const majorPriceUSD = majorConfig?.[2] as bigint | undefined;

  const refetchAll = () => {
    void refetchVault();
    void refetchUser();
  };

  const stableAction = useVaultAction(refetchAll);
  const majorAction = useVaultAction(refetchAll);

  // --- Stablecoin vault submit ---
  const onStableSubmit = async () => {
    const token = tokenState[stableToken];
    if (!user || !stableAmount) return;

    if (stableTab === 'deposit') {
      if (token.decimals === undefined) return;
      const amount = parseUnits(stableAmount, token.decimals);
      const ok = await stableAction.execute(
        { address: contracts.stableVault, abi: stableVaultAbi, functionName: 'deposit', args: [token.address, amount] },
        { token: token.address, spender: contracts.stableVault, amount },
        `Deposited ${stableAmount} ${stableToken} and minted vUSD.`
      );
      if (ok) setStableAmount('');
    } else {
      if (vUsdDecimals === undefined) return;
      const shares = parseUnits(stableAmount, vUsdDecimals);
      // Redeem directly against the ERC-4626 vault: the user is both caller and
      // owner, so no allowance is needed and it returns the underlying asset.
      const ok = await stableAction.execute(
        { address: contracts.vUSD, abi: erc4626Abi, functionName: 'redeem', args: [shares, user, user] },
        undefined,
        `Redeemed ${stableAmount} vUSD for the underlying stablecoin.`
      );
      if (ok) setStableAmount('');
    }
  };

  // --- Major asset vault submit ---
  const onMajorSubmit = async () => {
    const token = tokenState[majorToken];
    if (!user || !majorAmount) return;

    if (majorTab === 'deposit') {
      if (token.decimals === undefined) return;
      const amount = parseUnits(majorAmount, token.decimals);
      const ok = await majorAction.execute(
        { address: contracts.majorVault, abi: majorVaultAbi, functionName: 'deposit', args: [token.address, amount] },
        { token: token.address, spender: contracts.majorVault, amount },
        `Deposited ${majorAmount} ${majorToken} and minted vUSD.`
      );
      if (ok) setMajorAmount('');
    } else {
      if (vUsdDecimals === undefined) return;
      const shares = parseUnits(majorAmount, vUsdDecimals);
      // MajorVault redeems on the user's behalf, so it needs a vUSD allowance.
      const ok = await majorAction.execute(
        { address: contracts.majorVault, abi: majorVaultAbi, functionName: 'withdraw', args: [token.address, shares] },
        { token: contracts.vUSD, spender: contracts.majorVault, amount: shares },
        `Redeemed ${majorAmount} vUSD for ${majorToken}.`
      );
      if (ok) setMajorAmount('');
    }
  };

  const expectedStableOut = () => {
    if (!stableAmount) return '0.00';
    return `${Number(stableAmount).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${
      stableTab === 'deposit' ? 'vUSD' : 'underlying'
    }`;
  };

  const expectedMajorOut = () => {
    if (!majorAmount || !majorPriceUSD) return '0.00';
    const price = Number(formatUnits(majorPriceUSD, 18));
    if (majorTab === 'deposit') {
      return `${(Number(majorAmount) * price).toLocaleString(undefined, { maximumFractionDigits: 2 })} vUSD`;
    }
    return `${(Number(majorAmount) / price).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${majorToken}`;
  };

  const statusBanner = (action: ReturnType<typeof useVaultAction>) => {
    if (!action.message) return null;
    const isError = action.status === 'error';
    return (
      <div
        className={`flex items-start gap-2 rounded-lg p-2.5 text-xs border ${
          isError
            ? 'bg-red-500/10 text-red-300 border-red-500/20'
            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
        }`}
      >
        {isError ? (
          <AlertTriangle className="h-4 w-4 shrink-0" />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        )}
        <span className="break-all">{action.message}</span>
      </div>
    );
  };

  const submitLabel = (action: ReturnType<typeof useVaultAction>, fallback: string) => {
    if (action.status === 'approving') return 'Approving token...';
    if (action.status === 'pending') return 'Confirming on chain...';
    return fallback;
  };

  return (
    <div className="space-y-8">
      {/* Layer 1 summary, all live values */}
      <div className="glass-panel relative overflow-hidden rounded-2xl p-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-molCream-100">
                Layer 1: Single-Asset Yield Staking
              </h2>
              <span className="rounded-md bg-molCream-400/20 px-2 py-0.5 text-xs font-semibold text-molCream-300">
                ERC-4626
              </span>
            </div>
            <p className="max-w-xl text-xs text-gray-300">
              Deposit collateral to mint <strong>vUSD</strong>. Yield accrues into the vault, so each
              share redeems for more of the underlying over time - your share count never changes.
            </p>
            <div className="pt-1 text-[11px] text-gray-400">
              Live vUSD share price:{' '}
              <span className="font-mono font-semibold text-molCream-200">
                {display(sharePrice as bigint | undefined, underlyingDecimals as number | undefined, 6)}
              </span>{' '}
              underlying per vUSD
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-xl border border-molCream-400/20 bg-molBrown-900/60 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-molCream-400 to-amber-600 shadow-inner">
              <Coins className="h-6 w-6 text-molBrown-900" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-gray-400">Your vUSD Balance</div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-black text-molCream-100">
                  {isConnected ? display(vUsdBalance, vUsdDecimals, 4) : '0.00'}
                </span>
                <span className="text-xs font-bold text-molCream-400">vUSD</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-emerald-400">
                <Sparkles className="h-2.5 w-2.5" />
                Yield accrues in the share price, not the balance
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 1. Stablecoin Vault */}
        <div className="glass-panel rounded-2xl p-6 transition-all hover:border-molCream-400/30">
          <div className="flex items-center justify-between border-b border-molCream-300/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/20 font-bold text-emerald-300">
                $
              </div>
              <div>
                <h3 className="text-lg font-bold text-molCream-100">Stablecoin Vault</h3>
                <p className="text-xs text-gray-400">USDC, USDT &middot; decimal-normalised</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">Vault TVL</div>
              <div className="font-mono text-lg font-black text-emerald-400">
                {display(vUsdTotalAssets, underlyingDecimals as number | undefined, 2)}
              </div>
            </div>
          </div>

          <div className="flex rounded-lg bg-black/40 p-1 my-4">
            {(['deposit', 'withdraw'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStableTab(tab)}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                  stableTab === tab ? 'tab-active' : 'tab-inactive'
                }`}
              >
                {tab === 'deposit' ? 'Deposit (Mint vUSD)' : 'Withdraw (Redeem)'}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {stableTab === 'deposit' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Select asset:</span>
                {(['USDC', 'USDT'] as const).map((tok) => (
                  <button
                    key={tok}
                    onClick={() => setStableToken(tok)}
                    className={`rounded-md border px-3 py-1 text-xs font-medium transition-all ${
                      stableToken === tok
                        ? 'border-molCream-400 bg-molCream-500/20 text-molCream-100'
                        : 'border-white/10 text-gray-400 hover:text-white'
                    }`}
                  >
                    {tok}
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-molCream-300/15 bg-black/40 p-3.5">
              <div className="mb-1.5 flex items-center justify-between text-xs text-gray-400">
                <span>{stableTab === 'deposit' ? `Deposit ${stableToken}` : 'Redeem vUSD'}</span>
                <span>
                  Balance:{' '}
                  {isConnected
                    ? stableTab === 'deposit'
                      ? display(tokenState[stableToken].balance, tokenState[stableToken].decimals)
                      : display(vUsdBalance, vUsdDecimals)
                    : '0.00'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <input
                  type="number"
                  placeholder="0.0"
                  value={stableAmount}
                  onChange={(e) => setStableAmount(e.target.value)}
                  className="w-full bg-transparent font-mono text-xl font-bold text-white outline-none placeholder-gray-600"
                />
                <button
                  onClick={() => {
                    const raw =
                      stableTab === 'deposit'
                        ? { v: tokenState[stableToken].balance, d: tokenState[stableToken].decimals }
                        : { v: vUsdBalance, d: vUsdDecimals };
                    if (raw.v !== undefined && raw.d !== undefined) setStableAmount(formatUnits(raw.v, raw.d));
                  }}
                  className="rounded bg-molCream-500/20 px-2 py-1 text-[10px] font-bold text-molCream-300 hover:bg-molCream-500/30"
                >
                  MAX
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-molCream-300/10 bg-molBrown-900/30 p-2.5 text-xs text-gray-300">
              <span className="flex items-center gap-1">
                <ArrowDownUp className="h-3.5 w-3.5 text-molCream-400" />
                You will receive:
              </span>
              <span className="font-mono font-bold text-molCream-200">{expectedStableOut()}</span>
            </div>

            {statusBanner(stableAction)}

            <button
              onClick={onStableSubmit}
              disabled={!isConnected || stableAction.isBusy || !stableAmount}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
                !isConnected || stableAction.isBusy || !stableAmount
                  ? 'cursor-not-allowed bg-gray-700/50 text-gray-500'
                  : 'bg-gradient-to-r from-molCream-300 via-molCream-500 to-molBrown-500 text-molBrown-900 shadow-goldGlow hover:opacity-95'
              }`}
            >
              {stableAction.isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {!isConnected
                ? 'Connect Wallet'
                : submitLabel(
                    stableAction,
                    stableTab === 'deposit' ? `Deposit ${stableToken} & Mint vUSD` : 'Redeem vUSD'
                  )}
            </button>
          </div>
        </div>

        {/* 2. Major Asset Vault */}
        <div className="glass-panel rounded-2xl p-6 transition-all hover:border-molCream-400/30">
          <div className="flex items-center justify-between border-b border-molCream-300/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/40 bg-indigo-500/20 font-bold text-indigo-300">
                Ξ
              </div>
              <div>
                <h3 className="text-lg font-bold text-molCream-100">Major Asset Vault</h3>
                <p className="text-xs text-gray-400">ETH, BTC &middot; priced in USD</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">Oracle price</div>
              <div className="font-mono text-lg font-black text-amber-400">
                {majorPriceUSD ? `$${display(majorPriceUSD, 18, 2)}` : '--'}
              </div>
            </div>
          </div>

          <div className="flex rounded-lg bg-black/40 p-1 my-4">
            {(['deposit', 'withdraw'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMajorTab(tab)}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                  majorTab === tab ? 'tab-active' : 'tab-inactive'
                }`}
              >
                {tab === 'deposit' ? 'Deposit (Mint vUSD)' : 'Withdraw (Redeem)'}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Select asset:</span>
              {(['WETH', 'WBTC'] as const).map((tok) => (
                <button
                  key={tok}
                  onClick={() => setMajorToken(tok)}
                  className={`rounded-md border px-3 py-1 text-xs font-medium transition-all ${
                    majorToken === tok
                      ? 'border-molCream-400 bg-molCream-500/20 text-molCream-100'
                      : 'border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  {tok}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-molCream-300/15 bg-black/40 p-3.5">
              <div className="mb-1.5 flex items-center justify-between text-xs text-gray-400">
                <span>{majorTab === 'deposit' ? `Deposit ${majorToken}` : 'Redeem vUSD for asset'}</span>
                <span>
                  Balance:{' '}
                  {isConnected
                    ? majorTab === 'deposit'
                      ? display(tokenState[majorToken].balance, tokenState[majorToken].decimals)
                      : display(vUsdBalance, vUsdDecimals)
                    : '0.00'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <input
                  type="number"
                  placeholder="0.0"
                  value={majorAmount}
                  onChange={(e) => setMajorAmount(e.target.value)}
                  className="w-full bg-transparent font-mono text-xl font-bold text-white outline-none placeholder-gray-600"
                />
                <button
                  onClick={() => {
                    const raw =
                      majorTab === 'deposit'
                        ? { v: tokenState[majorToken].balance, d: tokenState[majorToken].decimals }
                        : { v: vUsdBalance, d: vUsdDecimals };
                    if (raw.v !== undefined && raw.d !== undefined) setMajorAmount(formatUnits(raw.v, raw.d));
                  }}
                  className="rounded bg-molCream-500/20 px-2 py-1 text-[10px] font-bold text-molCream-300 hover:bg-molCream-500/30"
                >
                  MAX
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-molCream-300/10 bg-molBrown-900/30 p-2.5 text-xs text-gray-300">
              <span className="flex items-center gap-1">
                <ArrowDownUp className="h-3.5 w-3.5 text-molCream-400" />
                You will receive:
              </span>
              <span className="font-mono font-bold text-molCream-200">{expectedMajorOut()}</span>
            </div>

            {statusBanner(majorAction)}

            <button
              onClick={onMajorSubmit}
              disabled={!isConnected || majorAction.isBusy || !majorAmount}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
                !isConnected || majorAction.isBusy || !majorAmount
                  ? 'cursor-not-allowed bg-gray-700/50 text-gray-500'
                  : 'bg-gradient-to-r from-molCream-300 via-molCream-500 to-molBrown-500 text-molBrown-900 shadow-goldGlow hover:opacity-95'
              }`}
            >
              {majorAction.isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {!isConnected
                ? 'Connect Wallet'
                : submitLabel(
                    majorAction,
                    majorTab === 'deposit' ? `Deposit ${majorToken} & Mint vUSD` : `Redeem vUSD for ${majorToken}`
                  )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
