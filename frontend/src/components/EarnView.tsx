'use client';

import React, { useState } from 'react';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { formatUnits, parseUnits, type Address } from 'viem';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { contracts, earnVaultAbi, erc20Abi, erc4626Abi } from '../config/contracts';
import { useVaultAction } from '../hooks/useVaultAction';
import { AmountField } from './AmountField';
import { LoyaltyPanel } from './LoyaltyPanel';
import { StatRow } from './StatRow';

function fmt(value: bigint | undefined, decimals: number | undefined, digits = 4): string {
  if (value === undefined || decimals === undefined) return '--';
  const n = Number(formatUnits(value, decimals));
  return Number.isNaN(n) ? '--' : n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export const EarnView: React.FC = () => {
  const { isConnected, address } = useAccount();
  const user = address as Address | undefined;
  const enabled = Boolean(user);

  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'stake' | 'unstake'>('stake');
  const [tierMask, setTierMask] = useState(1);
  const [multiPool, setMultiPool] = useState(false);

  const { data: vault, refetch: refetchVault } = useReadContracts({
    contracts: [
      { address: contracts.earnVault, abi: erc4626Abi, functionName: 'totalAssets' },
      { address: contracts.earnVault, abi: erc4626Abi, functionName: 'decimals' },
      { address: contracts.earnVault, abi: erc20Abi, functionName: 'totalSupply' },
      { address: contracts.vUSD, abi: erc4626Abi, functionName: 'decimals' },
    ],
  });

  const totalStaked = vault?.[0]?.result as bigint | undefined;
  const stDec = vault?.[1]?.result as number | undefined;
  const stSupply = vault?.[2]?.result as bigint | undefined;
  const vDec = vault?.[3]?.result as number | undefined;

  const { data: user_, refetch: refetchUser } = useReadContracts({
    contracts: [
      { address: contracts.vUSD, abi: erc4626Abi, functionName: 'balanceOf', args: [user ?? '0x0'] },
      { address: contracts.earnVault, abi: erc4626Abi, functionName: 'balanceOf', args: [user ?? '0x0'] },
    ],
    query: { enabled },
  });

  const vUsdBalance = user_?.[0]?.result as bigint | undefined;
  const stvUsdBalance = user_?.[1]?.result as bigint | undefined;

  // stvUSD share price: what one whole share redeems for in vUSD.
  const { data: stSharePrice } = useReadContract({
    address: contracts.earnVault,
    abi: erc4626Abi,
    functionName: 'convertToAssets',
    args: [stDec !== undefined ? 10n ** BigInt(stDec) : 0n],
    query: { enabled: stDec !== undefined },
  });

  const { data: positionValue } = useReadContract({
    address: contracts.earnVault,
    abi: erc4626Abi,
    functionName: 'convertToAssets',
    args: [stvUsdBalance ?? 0n],
    query: { enabled: stvUsdBalance !== undefined },
  });

  const refetchAll = () => {
    void refetchVault();
    void refetchUser();
  };
  const action = useVaultAction(refetchAll);

  const submit = async () => {
    if (!user || !amount) return;

    if (mode === 'stake') {
      if (vDec === undefined) return;
      const assets = parseUnits(amount, vDec);
      const ok = await action.execute(
        { address: contracts.earnVault, abi: erc4626Abi, functionName: 'deposit', args: [assets, user] },
        { token: contracts.vUSD, spender: contracts.earnVault, amount: assets },
        `Staked ${amount} vUSD. stvUSD minted and your loyalty curve raised.`
      );
      if (ok) setAmount('');
      return;
    }

    if (stDec === undefined) return;
    const shares = parseUnits(amount, stDec);
    // The depositor owns the stvUSD shares, so no allowance is needed.
    const ok = await action.execute(
      { address: contracts.earnVault, abi: erc4626Abi, functionName: 'redeem', args: [shares, user, user] },
      undefined,
      `Unstaked ${amount} stvUSD back to vUSD.`
    );
    if (ok) setAmount('');
  };

  const label = () => {
    if (!isConnected) return 'Connect wallet';
    if (action.status === 'approving') return 'Approving vUSD...';
    if (action.status === 'pending') return 'Confirming...';
    return mode === 'stake' ? 'Stake vUSD' : 'Unstake stvUSD';
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <div className="panel p-6">
          <div className="mb-6">
            <div className="stat-label">stvUSD share price</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="tnum text-4xl font-bold" style={{ color: 'var(--text)' }}>
                {fmt(stSharePrice as bigint | undefined, vDec, 6)}
              </span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                vUSD per stvUSD
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Staking vUSD here mints stvUSD, which appreciates on top of the vUSD it holds.
              Restaked capital is committed for longer and deepens the liquidity the protocol
              can quote against, so it earns a higher loyalty curve.
            </p>
          </div>

          <div className="divider mb-5" />

          <div className="mb-4 inline-flex rounded-[10px] p-1" style={{ background: 'var(--surface-2)' }}>
            {(['stake', 'unstake'] as const).map((m) => (
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
                {m === 'stake' ? 'Stake' : 'Unstake'}
              </button>
            ))}
          </div>

          <AmountField
            label={mode === 'stake' ? 'Stake vUSD' : 'Unstake stvUSD'}
            symbol={mode === 'stake' ? 'vUSD' : 'stvUSD'}
            value={amount}
            onChange={setAmount}
            balance={mode === 'stake' ? fmt(vUsdBalance, vDec) : fmt(stvUsdBalance, stDec)}
            disabled={action.isBusy}
            onMax={() => {
              const raw =
                mode === 'stake'
                  ? { v: vUsdBalance, d: vDec }
                  : { v: stvUsdBalance, d: stDec };
              if (raw.v !== undefined && raw.d !== undefined) setAmount(formatUnits(raw.v, raw.d));
            }}
          />

          <div className="mt-4 space-y-1">
            <StatRow
              label="Your position value"
              value={`${fmt(positionValue as bigint | undefined, vDec, 4)} vUSD`}
            />
            <StatRow label="Loyalty effect" value="1.4x while restaked" tone="positive" />
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

        <div className="panel p-6">
          <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Earn campaign
          </h3>
          <StatRow label="vUSD staked" value={fmt(totalStaked, vDec, 2)} />
          <StatRow label="stvUSD supply" value={fmt(stSupply, stDec, 2)} />
          <StatRow label="Your stvUSD" value={isConnected ? fmt(stvUsdBalance, stDec) : '--'} />
        </div>
      </div>

      <LoyaltyPanel
        selectedMask={tierMask}
        onSelect={setTierMask}
        multiPool={multiPool}
        onMultiPoolChange={setMultiPool}
      />
    </div>
  );
};
