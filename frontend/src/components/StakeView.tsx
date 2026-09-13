'use client';

import React, { useMemo, useState } from 'react';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { formatUnits, parseUnits, type Address } from 'viem';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  contracts,
  erc20Abi,
  erc4626Abi,
  majorVaultAbi,
  safetyReserveAbi,
  stableVaultAbi,
  aquaManagerAbi,
} from '../config/contracts';
import { useVaultAction } from '../hooks/useVaultAction';
import { AmountField } from './AmountField';
import { LoyaltyPanel } from './LoyaltyPanel';
import { StatRow } from './StatRow';

type Asset = 'USDC' | 'USDT' | 'WETH' | 'WBTC';

const STABLES: Asset[] = ['USDC', 'USDT'];
const MAJORS: Asset[] = ['WETH', 'WBTC'];
const ZERO = '0x0000000000000000000000000000000000000000';

function fmt(value: bigint | undefined, decimals: number | undefined, digits = 4): string {
  if (value === undefined || decimals === undefined) return '--';
  const n = Number(formatUnits(value, decimals));
  return Number.isNaN(n) ? '--' : n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export const StakeView: React.FC = () => {
  const { isConnected, address } = useAccount();
  const user = address as Address | undefined;
  const enabled = Boolean(user);

  const [asset, setAsset] = useState<Asset>('USDC');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  // Stable tier is always part of the mandate; the rest is the depositor's call.
  const [tierMask, setTierMask] = useState(1);

  const isStable = STABLES.includes(asset);

  // ---- Vault state ----
  const { data: vault, refetch: refetchVault } = useReadContracts({
    contracts: [
      { address: contracts.vUSD, abi: erc4626Abi, functionName: 'totalAssets' },
      { address: contracts.vUSD, abi: erc4626Abi, functionName: 'decimals' },
      { address: contracts.vUSD, abi: erc4626Abi, functionName: 'asset' },
      { address: contracts.vUSD, abi: erc4626Abi, functionName: 'totalSupply' },
    ],
  });

  const totalAssets = vault?.[0]?.result as bigint | undefined;
  const vDec = vault?.[1]?.result as number | undefined;
  const underlying = vault?.[2]?.result as Address | undefined;

  const { data: uDec } = useReadContract({
    address: underlying,
    abi: erc20Abi,
    functionName: 'decimals',
    query: { enabled: Boolean(underlying) },
  });

  const { data: sharePrice } = useReadContract({
    address: contracts.vUSD,
    abi: erc4626Abi,
    functionName: 'convertToAssets',
    args: [vDec !== undefined ? 10n ** BigInt(vDec) : 0n],
    query: { enabled: vDec !== undefined },
  });

  // ---- Protocol health ----
  const { data: reserve } = useReadContract({
    address: contracts.safetyReserve,
    abi: safetyReserveAbi,
    functionName: 'coverageRatioBps',
    args: [totalAssets ?? 0n],
    query: { enabled: contracts.safetyReserve !== ZERO && totalAssets !== undefined },
  });

  const { data: activeStrategies } = useReadContract({
    address: contracts.aquaStrategyManager,
    abi: aquaManagerAbi,
    functionName: 'activeStrategyCount',
    query: { enabled: contracts.aquaStrategyManager !== ZERO },
  });

  // ---- Balances ----
  const { data: balances, refetch: refetchUser } = useReadContracts({
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

  const vUsdBalance = balances?.[0]?.result as bigint | undefined;

  const tokens = useMemo(() => {
    const at = (i: number) => ({
      balance: balances?.[i]?.result as bigint | undefined,
      decimals: balances?.[i + 1]?.result as number | undefined,
    });
    return {
      USDC: { ...at(1), address: contracts.tokens.USDC },
      USDT: { ...at(3), address: contracts.tokens.USDT },
      WETH: { ...at(5), address: contracts.tokens.WETH },
      WBTC: { ...at(7), address: contracts.tokens.WBTC },
    } as Record<Asset, { balance?: bigint; decimals?: number; address: Address }>;
  }, [balances]);

  const { data: majorConfig } = useReadContract({
    address: contracts.majorVault,
    abi: majorVaultAbi,
    functionName: 'supportedAssets',
    args: [tokens[asset].address],
    query: { enabled: !isStable },
  });
  const price = majorConfig?.[2] as bigint | undefined;

  const refetchAll = () => {
    void refetchVault();
    void refetchUser();
  };
  const action = useVaultAction(refetchAll);

  // ---- Submit ----
  const submit = async () => {
    const token = tokens[asset];
    if (!user || !amount) return;

    if (mode === 'deposit') {
      if (token.decimals === undefined) return;
      const value = parseUnits(amount, token.decimals);
      const gateway = isStable ? contracts.stableVault : contracts.majorVault;
      const ok = await action.execute(
        {
          address: gateway,
          abi: isStable ? stableVaultAbi : majorVaultAbi,
          functionName: 'deposit',
          args: [token.address, value],
        },
        { token: token.address, spender: gateway, amount: value },
        `Staked ${amount} ${asset}. vUSD minted to your wallet.`
      );
      if (ok) setAmount('');
      return;
    }

    if (vDec === undefined) return;
    const shares = parseUnits(amount, vDec);

    if (isStable) {
      // Redeeming straight against the vault: caller is also owner, no allowance.
      const ok = await action.execute(
        { address: contracts.vUSD, abi: erc4626Abi, functionName: 'redeem', args: [shares, user, user] },
        undefined,
        `Redeemed ${amount} vUSD.`
      );
      if (ok) setAmount('');
    } else {
      // MajorVault redeems on the user's behalf, so it needs a vUSD allowance.
      const ok = await action.execute(
        { address: contracts.majorVault, abi: majorVaultAbi, functionName: 'withdraw', args: [tokens[asset].address, shares] },
        { token: contracts.vUSD, spender: contracts.majorVault, amount: shares },
        `Redeemed ${amount} vUSD for ${asset}.`
      );
      if (ok) setAmount('');
    }
  };

  const receive = () => {
    if (!amount || Number(amount) <= 0) return '0.00';
    if (mode === 'deposit') {
      if (isStable) return `${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} vUSD`;
      if (!price) return '--';
      return `${(Number(amount) * Number(formatUnits(price, 18))).toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })} vUSD`;
    }
    if (isStable) return `${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC`;
    if (!price) return '--';
    return `${(Number(amount) / Number(formatUnits(price, 18))).toLocaleString(undefined, {
      maximumFractionDigits: 6,
    })} ${asset}`;
  };

  const inputBalance =
    mode === 'deposit'
      ? fmt(tokens[asset].balance, tokens[asset].decimals)
      : fmt(vUsdBalance, vDec);

  const label = () => {
    if (!isConnected) return 'Connect wallet';
    if (action.status === 'approving') return `Approving ${mode === 'deposit' ? asset : 'vUSD'}...`;
    if (action.status === 'pending') return 'Confirming...';
    return mode === 'deposit' ? `Stake ${asset}` : 'Redeem vUSD';
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
      {/* Primary action column */}
      <div className="space-y-5">
        <div className="panel p-6">
          {/* One headline figure, the way a staking product should lead. */}
          <div className="mb-6">
            <div className="stat-label">vUSD share price</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="tnum text-4xl font-bold" style={{ color: 'var(--text)' }}>
                {fmt(sharePrice as bigint | undefined, uDec as number | undefined, 6)}
              </span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                underlying per vUSD
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Your vUSD balance never changes. Market-making profit accrues into the vault, so
              each share redeems for more over time - the same mechanism as wstETH.
            </p>
          </div>

          <div className="divider mb-5" />

          {/* Deposit / withdraw */}
          <div className="mb-4 inline-flex rounded-[10px] p-1" style={{ background: 'var(--surface-2)' }}>
            {(['deposit', 'withdraw'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setAmount('');
                }}
                className={`rounded-lg px-4 py-1.5 text-xs transition-colors ${
                  mode === m ? 'tab-active' : 'tab-inactive'
                }`}
              >
                {m === 'deposit' ? 'Stake' : 'Redeem'}
              </button>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {[...STABLES, ...MAJORS].map((a) => (
              <button
                key={a}
                onClick={() => {
                  setAsset(a);
                  setAmount('');
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: asset === a ? 'var(--surface-2)' : 'transparent',
                  border: `1px solid ${asset === a ? 'var(--border-strong)' : 'var(--border)'}`,
                  color: asset === a ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                {a}
              </button>
            ))}
          </div>

          <AmountField
            label={mode === 'deposit' ? `Stake ${asset}` : 'Redeem vUSD'}
            symbol={mode === 'deposit' ? asset : 'vUSD'}
            value={amount}
            onChange={setAmount}
            balance={inputBalance}
            disabled={action.isBusy}
            onMax={() => {
              const raw =
                mode === 'deposit'
                  ? { v: tokens[asset].balance, d: tokens[asset].decimals }
                  : { v: vUsdBalance, d: vDec };
              if (raw.v !== undefined && raw.d !== undefined) setAmount(formatUnits(raw.v, raw.d));
            }}
          />

          <div className="mt-4 space-y-1">
            <StatRow label="You receive" value={receive()} />
            {!isStable && (
              <StatRow
                label={`${asset} price used`}
                value={price ? `$${fmt(price, 18, 2)}` : '--'}
                tone="muted"
              />
            )}
          </div>

          {action.message && (
            <div
              className="mt-4 flex items-start gap-2 rounded-[10px] p-3 text-xs"
              style={{
                background: action.status === 'error' ? 'rgba(224,122,95,0.1)' : 'rgba(111,207,151,0.1)',
                border: `1px solid ${action.status === 'error' ? 'rgba(224,122,95,0.3)' : 'rgba(111,207,151,0.3)'}`,
                color: action.status === 'error' ? 'var(--negative)' : 'var(--positive)',
              }}
            >
              {action.status === 'error' ? (
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
              )}
              <span className="break-all">{action.message}</span>
            </div>
          )}

          <button
            onClick={submit}
            disabled={!isConnected || action.isBusy || !amount}
            className="btn-primary mt-5 flex w-full items-center justify-center gap-2 py-3 text-sm"
          >
            {action.isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            {label()}
          </button>
        </div>

        {/* Protocol figures, flat rows rather than decorated cards */}
        <div className="panel p-6">
          <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Vault
          </h3>
          <StatRow
            label="Total assets"
            value={fmt(totalAssets, uDec as number | undefined, 2)}
          />
          <StatRow label="vUSD supply" value={fmt(vault?.[3]?.result as bigint | undefined, vDec, 2)} />
          <StatRow
            label="Reserve coverage"
            value={reserve !== undefined ? `${(Number(reserve) / 100).toFixed(2)}%` : '--'}
            hint="First-loss capital as a share of vault assets"
          />
          <StatRow
            label="Live Aqua strategies"
            value={activeStrategies !== undefined ? String(activeStrategies) : '--'}
          />
          <StatRow label="Your vUSD" value={isConnected ? fmt(vUsdBalance, vDec) : '--'} />
        </div>
      </div>

      {/* Loyalty column */}
      <LoyaltyPanel selectedMask={tierMask} onSelect={setTierMask} />
    </div>
  );
};
