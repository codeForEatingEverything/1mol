'use client';

import React from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits, type Address } from 'viem';
import { contracts, loyaltyEngineAbi, TIERS } from '../config/contracts';
import { StatRow } from './StatRow';

const W = 10n ** 18n;

function mul(v: bigint | undefined): string {
  if (v === undefined || v === 0n) return '--';
  return `${(Number(formatUnits(v, 18))).toFixed(2)}x`;
}

/**
 * Shows what the depositor's loyalty curve currently is, and what raises it.
 *
 * Delegating across more pools than the base pool raises return sub-linearly
 * while raising ruin probability faster, so flat pro-rata rewards would
 * underpay whoever accepts that exposure. The curve is how that risk gets
 * priced: every figure here is read from LoyaltyEngine on chain.
 */
export const LoyaltyPanel: React.FC<{
  selectedMask: number;
  onSelect: (mask: number) => void;
}> = ({ selectedMask, onSelect }) => {
  const { address, isConnected } = useAccount();
  const user = address as Address | undefined;
  const configured = contracts.loyaltyEngine !== '0x0000000000000000000000000000000000000000';

  const { data: totalMultiplier } = useReadContract({
    address: contracts.loyaltyEngine,
    abi: loyaltyEngineAbi,
    functionName: 'totalMultiplier',
    args: [user ?? '0x0'],
    query: { enabled: configured && Boolean(user) },
  });

  const { data: tenure } = useReadContract({
    address: contracts.loyaltyEngine,
    abi: loyaltyEngineAbi,
    functionName: 'tenureMultiplier',
    args: [user ?? '0x0'],
    query: { enabled: configured && Boolean(user) },
  });

  const { data: emissionShare } = useReadContract({
    address: contracts.loyaltyEngine,
    abi: loyaltyEngineAbi,
    functionName: 'emissionShareBps',
    args: [user ?? '0x0'],
    query: { enabled: configured && Boolean(user) },
  });

  const { data: position } = useReadContract({
    address: contracts.loyaltyEngine,
    abi: loyaltyEngineAbi,
    functionName: 'positions',
    args: [user ?? '0x0'],
    query: { enabled: configured && Boolean(user) },
  });

  const restaked = position?.[3] ?? false;

  // Projected curve for the tiers currently ticked, so the effect of a change
  // is visible before committing capital to it.
  const projected = React.useMemo(() => {
    const weights: Record<number, number> = { 1: 1.0, 2: 1.8, 4: 3.5 };
    const risk = TIERS.reduce((sum, t) => (selectedMask & t.bit ? sum + weights[t.bit] : sum), 0);
    const tenureFactor = tenure ? Number(formatUnits(tenure, 18)) : 1;
    return risk * tenureFactor * (restaked ? 1.4 : 1);
  }, [selectedMask, tenure, restaked]);

  return (
    <div className="panel p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Loyalty curve
        </h3>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Rewards are split by the risk you accept, not by deposit size. Opting into more
          pools than the base pool raises your curve, and so does restaking into Earn.
        </p>
      </div>

      <div className="space-y-2">
        {TIERS.map((tier) => {
          const on = (selectedMask & tier.bit) !== 0;
          const isBase = tier.bit === 1;
          return (
            <button
              key={tier.bit}
              type="button"
              // The base pool is always part of the mandate; the optional tiers
              // are what the depositor is actually choosing to take on.
              onClick={() => !isBase && onSelect(selectedMask ^ tier.bit)}
              disabled={isBase}
              className="panel-inset flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors"
              style={{
                borderColor: on ? 'var(--border-strong)' : 'var(--border)',
                opacity: isBase ? 0.75 : 1,
                cursor: isBase ? 'default' : 'pointer',
              }}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-[4px] text-[10px] font-bold"
                  style={{
                    background: on ? 'var(--cream)' : 'transparent',
                    border: on ? 'none' : '1px solid var(--border-strong)',
                    color: '#2a1d12',
                  }}
                >
                  {on ? '✓' : ''}
                </span>
                <span>
                  <span className="block text-xs font-semibold" style={{ color: 'var(--text)' }}>
                    {tier.label}
                    {isBase && (
                      <span className="ml-1.5 font-normal" style={{ color: 'var(--text-dim)' }}>
                        base
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px]" style={{ color: 'var(--text-dim)' }}>
                    {tier.detail}
                  </span>
                </span>
              </span>
              <span className="tnum text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                {tier.weight}
              </span>
            </button>
          );
        })}
      </div>

      <div className="divider my-4" />

      <StatRow
        label="Projected curve"
        value={`${projected.toFixed(2)}x`}
        hint="Risk accepted x tenure x restaking"
      />
      <StatRow
        label="Your curve on chain"
        value={isConnected ? mul(totalMultiplier as bigint | undefined) : '--'}
      />
      <StatRow
        label="Tenure"
        value={isConnected ? mul(tenure as bigint | undefined) : '--'}
        hint="1.2x past 30 days, 1.5x past 90; resets if you raise your risk"
      />
      <StatRow
        label="Restaked into Earn"
        value={restaked ? '1.4x applied' : 'Not yet'}
        tone={restaked ? 'positive' : 'muted'}
      />
      <StatRow
        label="Your share of rewards"
        value={
          isConnected && emissionShare !== undefined
            ? `${(Number(emissionShare) / 100).toFixed(2)}%`
            : '--'
        }
        hint="Risk-weighted, not pro-rata by deposit"
      />

      {!configured && (
        <p className="mt-3 text-[11px]" style={{ color: 'var(--text-dim)' }}>
          LoyaltyEngine address not set for this network.
        </p>
      )}
    </div>
  );
};
