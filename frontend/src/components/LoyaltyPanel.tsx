'use client';

import React from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits, type Address } from 'viem';
import { contracts, loyaltyEngineAbi, POOLS } from '../config/contracts';
import { StatRow } from './StatRow';

const ZERO = '0x0000000000000000000000000000000000000000';

function mul(v: bigint | undefined): string {
  if (v === undefined || v === 0n) return '--';
  return `${Number(formatUnits(v, 18)).toFixed(2)}x`;
}

/**
 * Delegation controls and the resulting loyalty curve.
 *
 * Aqua does not split a delegated balance: allowing a deposit into more than
 * one pool means the same balance quotes at full size in each of them. Return
 * does not scale with the pool count, but exposure does, so the curve is what
 * pays for opting into it.
 */
export const LoyaltyPanel: React.FC<{
  selectedMask: number;
  onSelect: (mask: number) => void;
  multiPool: boolean;
  onMultiPoolChange: (value: boolean) => void;
}> = ({ selectedMask, onSelect, multiPool, onMultiPoolChange }) => {
  const { address, isConnected } = useAccount();
  const user = address as Address | undefined;
  const configured = contracts.loyaltyEngine !== ZERO;

  // Wallet state and contract reads only exist on the client, so anything
  // derived from them must not be rendered during SSR - a differing tree fails
  // hydration and takes the whole page's interactivity down with it.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const readEnabled = mounted && configured && Boolean(user);

  const { data: totalMultiplier } = useReadContract({
    address: contracts.loyaltyEngine,
    abi: loyaltyEngineAbi,
    functionName: 'totalMultiplier',
    args: [user ?? ZERO],
    query: { enabled: readEnabled },
  });

  const { data: tenure } = useReadContract({
    address: contracts.loyaltyEngine,
    abi: loyaltyEngineAbi,
    functionName: 'tenureMultiplier',
    args: [user ?? ZERO],
    query: { enabled: readEnabled },
  });

  const { data: emissionShare } = useReadContract({
    address: contracts.loyaltyEngine,
    abi: loyaltyEngineAbi,
    functionName: 'emissionShareBps',
    args: [user ?? ZERO],
    query: { enabled: readEnabled },
  });

  const { data: position } = useReadContract({
    address: contracts.loyaltyEngine,
    abi: loyaltyEngineAbi,
    functionName: 'positions',
    args: [user ?? ZERO],
    query: { enabled: readEnabled },
  });

  const restaked = mounted ? (position?.[3] ?? false) : false;
  const poolsBacked = POOLS.filter((p) => selectedMask & p.bit).length;

  // Curve for the current selection, shown before any capital is committed.
  const projected = React.useMemo(() => {
    const weights: Record<number, number> = { 1: 1.0, 2: 1.8, 4: 3.5 };
    const risk = POOLS.reduce((sum, p) => (selectedMask & p.bit ? sum + weights[p.bit] : sum), 0);
    const tenureFactor = tenure ? Number(formatUnits(tenure, 18)) : 1;
    // Multi-pool delegation is the separate opt-in that lifts the curve.
    return risk * tenureFactor * (multiPool ? 2 : 1) * (restaked ? 1.4 : 1);
  }, [selectedMask, tenure, restaked, multiPool]);

  return (
    <div className="panel p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Delegation &amp; loyalty
        </h3>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Pick the kind of market your deposit quotes on.
        </p>
      </div>

      <div className="space-y-2">
        {POOLS.map((pool) => {
          const on = (selectedMask & pool.bit) !== 0;
          const toggle = () => {
            const next = selectedMask ^ pool.bit;
            if (next === 0) return; // at least one pool type must stay selected
            onSelect(next);
          };
          return (
            <button
              key={pool.bit}
              type="button"
              onClick={toggle}
              className="panel-inset flex w-full cursor-pointer items-center justify-between px-3 py-2.5 text-left"
              style={{ borderColor: on ? 'var(--border-strong)' : 'var(--border)' }}
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
                    {pool.label}
                  </span>
                  <span className="block text-[11px]" style={{ color: 'var(--text-dim)' }}>
                    {pool.detail}
                  </span>
                </span>
              </span>
              <span className="tnum text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                {pool.weight}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onMultiPoolChange(!multiPool)}
        className="panel-inset mt-3 flex w-full cursor-pointer items-start gap-2.5 px-3 py-3 text-left"
        style={{ borderColor: multiPool ? 'var(--border-strong)' : 'var(--border)' }}
      >
        <span
          className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] text-[10px] font-bold"
          style={{
            background: multiPool ? 'var(--cream)' : 'transparent',
            border: multiPool ? 'none' : '1px solid var(--border-strong)',
            color: '#2a1d12',
          }}
        >
          {multiPool ? '✓' : ''}
        </span>
        <span>
          <span className="block text-xs font-semibold" style={{ color: 'var(--text)' }}>
            Delegate this deposit to multiple pools
          </span>
          <span className="mt-0.5 block text-[11px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
            A separate choice from the market type above - there are many pools within one
            type. Aqua does not split the balance, so it quotes at full size in each pool it
            backs. That is extra exposure on the same principal, and it raises your loyalty
            curve.
          </span>
        </span>
      </button>

      <div className="divider my-4" />

      <StatRow
        label="Market types"
        value={`${poolsBacked} of ${POOLS.length}`}
      />
      <StatRow
        label="Multi-pool delegation"
        value={multiPool ? '2.0x applied' : 'Off'}
        tone={multiPool ? 'positive' : 'muted'}
      />
      <StatRow
        label="Projected curve"
        value={`${projected.toFixed(2)}x`}
        hint="Market type x multi-pool x tenure x restaking"
      />
      <StatRow
        label="Your curve on chain"
        value={mounted && isConnected ? mul(totalMultiplier as bigint | undefined) : '--'}
      />
      <StatRow
        label="Tenure"
        value={mounted && isConnected ? mul(tenure as bigint | undefined) : '--'}
        hint="1.2x past 30 days, 1.5x past 90; resets if you add a pool"
      />
      <StatRow
        label="Restaked into Earn"
        value={restaked ? '1.4x applied' : 'Not yet'}
        tone={restaked ? 'positive' : 'muted'}
      />
      <StatRow
        label="Your share of rewards"
        value={
          mounted && isConnected && emissionShare !== undefined
            ? `${(Number(emissionShare) / 100).toFixed(2)}%`
            : '--'
        }
        hint="Weighted by pools backed, not deposit size"
      />
    </div>
  );
};
